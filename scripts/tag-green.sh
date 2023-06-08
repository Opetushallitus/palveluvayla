#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && pwd)"
source "${repo}/scripts/lib/common-functions.sh"

function main {
  local -r env=$(parse_env_from_script_name)

  case "${env}" in
    "dev" | "qa" | "prod")
      local -r source_tag=$(source_tag "${env}")
      tag-green "${source_tag}" "${env}"
      ;;
    *)
      fatal "Unknown env $env"
      ;;
  esac
}

function tag-green {
  local -r source_tag="$1"
  local -r env="$2"
  local -r tmp_dir=$(mktemp -d)
  local -r key="${tmp_dir}/deployment.key"
  local -r clone_dir="${tmp_dir}/palveluvayla"
  trap "rm -rf ${tmp_dir}" EXIT

  echo -n ${GITHUB_DEPLOYMENT_KEY} | base64 -d >"${key}"
  chmod 600 "${key}"

  git clone -c "core.sshCommand=ssh -i ${key} -F /dev/null" git@github.com:Opetushallitus/palveluvayla.git "${clone_dir}"
  git checkout ${source_tag}
  force_push_tag "green-${env}-$(date +"%Y%m%d%H%M%S")"
  force_push_tag "green-${env}"
}

function source_tag {
  local -r env=$1

  case "${env}" in
    "dev")
      echo -n "main"
      ;;
    "qa")
      echo -n "green-dev"
      ;;
    "prod")
      echo -n "green-qa"
      ;;
  esac
}

function force_push_tag {
  local -r tag="$1"
  git tag --force "$tag"
  git push --force origin "refs/tags/$tag:refs/tags/$tag"
}

main "$@"
