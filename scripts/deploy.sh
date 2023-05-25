#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && pwd)"
readonly node_version=$(cat "$repo/.nvmrc")

function main {
  local -r env=$(parse_env_from_script_name)

  case "${env}" in
    "dev" | "qa" | "prod" | "util")
      deploy "${env}"
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

function deploy {
  local -r env="$1"
  require_docker
  init_nodejs
  npm_ci_if_package_lock_has_changed
  if [ "${env}" == "util" ]; then
    bootstrap_cdk
    export_aws_credentials "${env}"
    npx cdk --app "npx ts-node ${repo}/src/cdk-app-util.ts" deploy --require-approval never --all
  else
    export_aws_credentials "${env}"
    local -r accountId=$(get_aws_account_id)
    local -r region="eu-west-1"
    export CDK_DEFAULT_ACCOUNT=${accountId}
    export CDK_DEFAULT_REGION=${region}
    npx cdk --app "npx ts-node ${repo}/src/cdk-app.ts" deploy --require-approval never --all
  fi
}

function bootstrap_cdk {
  for e in util dev qa prod; do
    export_aws_credentials "${e}"
    accountId=$(get_aws_account_id)
    npx cdk bootstrap aws://${accountId}/eu-west-1
  done
}

function export_aws_credentials {
  local -r env=$1
  export AWS_PROFILE="oph-palveluvayla-${env}"

  info "Checking AWS credentials for env $env"
  if ! aws sts get-caller-identity >/dev/null; then
    fatal "AWS credentials are not configured env $env. Aborting."
  fi
}

function get_aws_account_id {
  aws sts get-caller-identity --query Account --output text
}

function aws {
  docker run \
    --platform linux/amd64 \
    --env AWS_PROFILE \
    --volume "${HOME}/.aws:/root/.aws" \
    --volume "$(pwd):/aws" \
    --rm \
    --interactive \
    amazon/aws-cli:2.10.0 "$@"
}

function npm_ci_if_package_lock_has_changed {
  info "Checking if npm ci needs to be run"
  require_command shasum
  local -r checksum_file=".package-lock.json.checksum"

  function run_npm_ci {
    npm ci
    shasum package-lock.json >"$checksum_file"
  }

  if [ ! -f "$checksum_file" ]; then
    echo "new package-lock.json; running npm ci"
    run_npm_ci
  elif ! shasum --check "$checksum_file"; then
    info "package-lock.json seems to have changed, running npm ci"
    run_npm_ci
  else
    info "package-lock.json doesn't seem to have changed, skipping npm ci"
  fi
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

function init_nodejs {
  export NVM_DIR="${NVM_DIR:-$HOME/.cache/nvm}"
  set +o errexit
  source "$repo/scripts/nvm.sh"
  nvm use "${node_version}" || nvm install "${node_version}"
  set -o errexit
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
