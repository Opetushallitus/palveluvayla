#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && pwd)"
readonly node_version=$(cat "$repo/.nvmrc")

function main {
  local -r env=$(parse_env_from_script_name)

  case "${env}" in
    "dev" | "qa" | "prod")
      tag-green "${env}"
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

function tag-green {
  local -r env="$1"
  local -r tmp_dir=$(mktemp -d)
  local -r key="${tmp_dir}/deployment.key"
  local -r clone_dir="${tmp_dir}/palveluvayla
  trap "rm -rf ${tmp_dir}" EXIT

  echo -n ${GITHUB_DEPLOYMENT_KEY} | base64 -d >"${key}"
  chmod 600 "${key}"

  git clone -c "core.sshCommand=ssh -i ${key} -F /dev/null" git@github.com:opetushallitus/palveluvayla.git "${clone_dir}
  cd ${clone_dir}
  force_push_tag "green-${env}-$(date +"%Y%m%d%H%M%S")"
  force_push_tag "green-${env}"
}

function force_push_tag {
  local -r tag="$1"
  git tag --force "$tag"
  git push --force origin "refs/tags/$tag:refs/tags/$tag"
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
