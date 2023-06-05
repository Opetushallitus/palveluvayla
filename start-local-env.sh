#!/usr/bin/env bash
set -o nounset -o errexit

readonly repo=$( cd "$( dirname "$0" )" && pwd )
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
  chmod 600 ${tempdir}/id_rsa*
}

function start_system {
  info "starting system"
  ssh_key_dir=${tempdir} docker-compose --file ${repo}/docker-compose.yml down || true
  ssh_key_dir=${tempdir} docker-compose --file ${repo}/docker-compose.yml up --force-recreate
}

function require_docker {
  require_command docker
  docker ps > /dev/null 2>&1 || fatal "Running 'docker ps' failed. Is docker daemon running? Aborting."
}

function require_command {
  if ! command -v "$1" > /dev/null 2>&1; then
    fatal "I require $1 but it's not installed. Aborting."
  fi
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

  >&2 echo -e "${timestamp} ${level} ${message}"
}

main "$@"
