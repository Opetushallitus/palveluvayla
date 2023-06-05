#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && pwd)"

function main {
  local -r env=$(parse_env_from_script_name)

  case "${env}" in
    "dev" | "qa" | "prod" | "util")
      start_ci "${env}"
      ;;
    *)
      fatal "Unknown env $env"
      ;;
  esac
}

function parse_env_from_script_name {
  local -r file_name="$(basename "$0")"
  if echo "${file_name}" | grep -E -q '.+-([^-]+)\.sh$'; then
    local -r env="$(echo "${file_name}" | sed -E -e 's|.+-([^-]+)\.sh$|\1|g')"
    info "Using env $env"
    echo $env
  else
    fatal "Don't call this script directly"
  fi
}

function start_ci {
  local -r env=$1
  require_docker
  export_aws_credentials "${env}"
  echo "Starting ci for $1"
  aws codepipeline start-pipeline-execution --name "Deploy$(capitalize "${env}")"
}

function capitalize {
  local -r string="$1"
  echo "$(tr '[:lower:]' '[:upper:]' <<<${string:0:1})${string:1}"
}

function export_aws_credentials {
  local -r env=$1
  export AWS_PROFILE="oph-palveluvayla-util"

  info "Checking AWS credentials for env util"
  if ! aws sts get-caller-identity >/dev/null; then
    fatal "AWS credentials are not configured env $env. Aborting."
  fi
}

function aws {
  docker run \
    --platform linux/amd64 \
    --env AWS_PROFILE \
    --env AWS_DEFAULT_REGION \
    --volume "${HOME}/.aws:/root/.aws" \
    --volume "$(pwd):/aws" \
    --rm \
    --interactive \
    amazon/aws-cli:2.10.0 "$@"
}

function require_docker {
  require_command docker
  docker ps >/dev/null 2>&1 || fatal "Running 'docker ps' failed. Is docker daemon running? Aborting."
}

function require_command {
  if ! command -v "$1" >/dev/null; then
    fatal "I require $1 but it's not installed. Aborting."
  fi
}

function fatal {
  log "ERROR" "$1"
  exit 1
}

function info {
  log "INFO" "$1"
}

function log {
  local -r level="$1"
  local -r message="$2"
  local -r timestamp=$(date +"%Y-%m-%d %H:%M:%S")

  echo >&2 -e "${timestamp} ${level} ${message}"
}

main "$@"