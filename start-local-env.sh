#!/usr/bin/env bash
set -o nounset -o errexit
readonly repo=$(cd "$(dirname "$0")" && pwd)
source "${repo}/scripts/lib/common-functions.sh"

readonly tempdir=$(mktemp -d)
trap "rm -rf ${tempdir}" EXIT

function main {
  check_requirements
  create_secrets
  start_system
}

function check_requirements {
  info "checking requirements"
  require_docker
  require_command tmux
}

function create_secrets {
  info "creating secrets"
  ssh-keygen -f ${tempdir}/id_rsa -t rsa -b 4096 -N '' -q
}

function start_system {
  info "starting system"
  local -r public=$(cat ${tempdir}/id_rsa.pub | base64)
  local -r private=$(cat ${tempdir}/id_rsa | base64)
  ssh_public_key=${public} ssh_private_key=${private} \
    docker compose --file ${repo}/docker-compose.yml down || true
  ssh_public_key=${public} ssh_private_key=${private} \
    docker compose --file ${repo}/docker-compose.yml up --force-recreate --build
}

main "$@"
