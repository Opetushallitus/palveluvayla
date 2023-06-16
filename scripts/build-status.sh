#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")/.." && pwd)"
source "${repo}/scripts/lib/common-functions.sh"

function main {
  for env in Dev Qa Prod; do
    parts=$(aws --profile oph-palveluvayla-util \
      codepipeline get-pipeline-state \
      --name Deploy${env} \
      --query "stageStates[].latestExecution.status" \
      --output text)

    status="\033[32m Succeeded\033[0m"
    for s in $parts; do
      if [[ "$s" != "Succeeded" ]]; then
        if [[ "$s" == "InProgress" ]]; then
          status="\033[33m InProgress\033[0m"
          break
        else
          status="\033[31m Failed\033[0m"
          break
        fi
      fi
    done
    echo -n "Deploy${env}:"
    echo -e "$status"
  done
}

main "$@"
