#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && cd ../.. && pwd )"
source "${repo}/scripts/lib/common-functions.sh"

function main {
  local -r env=$(parse_env_from_script_name)

  cd "$repo/scripts/ci"
  npm ci
  ENVIRONMENT_NAME=${env} npx ts-node publish-release-notes.ts
}

main "$@"
