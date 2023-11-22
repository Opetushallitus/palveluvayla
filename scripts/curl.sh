#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && pwd)"
source "${repo}/scripts/lib/common-functions.sh"

function main {
  local -r env=$(parse_env_from_script_name)

  case "${env}" in
    "dev" | "qa" | "prod")
       curl_with_iam_role "${env}" "$@"
      ;;
    *)
      fatal "Unknown env $env"
      ;;
  esac
}

function curl_with_iam_role {
  local -r env="$1"
  shift
  local -r keyId=$(from_config_for_env "${env}" AccessKeyId)
  local -r secret=$(from_config_for_env "${env}" SecretAccessKey)
  local -r token=$(from_config_for_env "${env}" SessionToken)

  curl \
    --aws-sigv4 "aws:amz:eu-west-1:execute-api" \
    --header "x-amz-security-token: ${token}" \
    --user "${keyId}:${secret}" \
    "$@"

}

function from_config_for_env {
  local -r env="$1"
  local -r item="$2"
  aws configure \
    export-credentials \
    --profile "oph-palveluvayla-${env}" | grep "${item}" | cut -f 2 -d ':' | sed 's/ *"\([^"]*\).*/\1/g'
}

main "$@"