#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")/.." && pwd)"
source "${repo}/scripts/lib/common-functions.sh"

function force_push_tag {
  local -r tag="$1"
  git tag --force "$tag"
  git push --force origin "refs/tags/$tag:refs/tags/$tag"
}

function main {
  local -r env=$(parse_env_from_script_name)
  force_push_tag "green-${env}"
  force_push_tag "green-${env}-$(date +%s)"
}

main "$@"
