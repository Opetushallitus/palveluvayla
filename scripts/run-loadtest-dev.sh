#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && cd .. && pwd)"
source "${repo}/scripts/lib/common-functions.sh"

function main {
  local -r env=$(parse_env_from_script_name)

  case "${env}" in
    "dev" )
      run_load_test "${env}"
      ;;
    *)
      fatal "Unknown env $env"
      ;;
  esac
}

function run_load_test {
  local -r env="$1"
  local -r loadtest_dir="${repo}/loadtest"
  local -r loadtest_report_dir="${loadtest_dir}/gatling_report"
  require_docker
  cd "${loadtest_dir}"
  docker build -t loadtest .
  if ! is_running_on_codebuild; then
    export_aws_credentials "$env"
  fi
  docker run \
      --env AWS_PROFILE \
      --volume "${HOME}/.aws:/root/.aws" \
      --volume "${loadtest_report_dir}:/app/target/gatling" \
      --rm \
      loadtest:latest
  echo "Check out loadtest report in ${loadtest_report_dir}"
}

main "$@"
