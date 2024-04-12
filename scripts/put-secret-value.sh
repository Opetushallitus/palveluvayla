#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail

readonly repo="$(cd "$(dirname "$0")/.." && pwd)"
source "${repo}/scripts/lib/common-functions.sh"

function main {
  local -r env=$(parse_env_from_script_name)

  if [ "$#" -ne 2 ]; then
      fatal "Usage: $0 <secret-id> <secret-string>"
  fi

  local -r SECRET_ID="$1"
  local -r SECRET_STRING="$2"

  info "Creating secret ${SECRET_ID} to [${env}]"
  export_aws_credentials "${env}"
  aws secretsmanager create-secret \
    --name "${SECRET_ID}" \
    --secret-string "${SECRET_STRING}"
}

main "$@"
