#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." >/dev/null 2>&1 && pwd)"
source "${repo}/scripts/lib/common-functions.sh"

IMAGE_TAG="palveluvayla/aws-cli-ssm:local"

function main {
  require_command psql
  require_docker
  local env=$(parse_env_from_script_name)
  export_aws_credentials "$env"

  build_session_manager_cli_image
  start_tunnel_to_rds
  start_psql
}

function build_session_manager_cli_image {
  info "Building tunnel image"
  cd "$repo/scripts/bastion"
  docker build --tag $IMAGE_TAG . --build-arg system_arch=$(guess_the_system_arch)
}

function guess_the_system_arch {
  local arch_name="$(uname -m)"

  if [ "${arch_name}" = "x86_64" ]; then
    if is_running_under_rosetta2; then
      echo -n "arm64"
    else
      echo -n "64bit"
    fi
  elif [ "${arch_name}" = "arm64" ]; then
    echo -n "arm64"
  else
    fatal "Unknown architecture: ${arch_name}"
  fi
}

function is_running_under_rosetta2 {
  [ "$(sysctl -in sysctl.proc_translated)" = "1" ]
}

function is_container_healthy {
  local container_id="$1"
  local status="$(docker inspect --format='{{.State.Health.Status}}' $container_id)"
  if [[ "$status" == "healthy" ]]; then
    return 0
  else
    return 1
  fi
}

function run_tunnel_container {
  local container_id=$(
    docker run \
      --env AWS_PROFILE \
      --volume "${HOME}/.aws:/root/.aws" \
      --publish "127.0.0.1:2222:2222" \
      --publish "127.0.0.1:4000:4000" \
      --publish "127.0.0.1:8443:8443" \
      --publish "127.0.0.1:8080:8080" \
      --detach \
      --rm $IMAGE_TAG
  )

  trap "info 'Killing tunnel container' ; docker kill $container_id" EXIT

  info "Waiting until $container_id is healthy"
  while ! is_container_healthy $container_id; do
    sleep 1
  done
}

function start_tunnel_to_rds {
  info "Starting tunnel to RDS database cluster"
  run_tunnel_container
  info "Tunnel started, DB listening on port 2222"
}

function start_psql {
  local -r psqlrc="$repo/scripts/bastion/psqlrc"
  if [ ! -f "$psqlrc" ]; then
    fatal "psqlrc file was not found at $psqlrc; it should exist and turn disable autocommit"
  fi

  info "Connecting to localhost:2222"

  local pw="$(aws secretsmanager get-secret-value --secret-id XroadSecurityServerDatabaseCredentials --no-cli-pager --query SecretString --output text | jq '.password' --raw-output)"
  PSQLRC="$psqlrc" \
    PGPASSWORD=$pw psql "postgresql://postgres@localhost:2222?ssl=true"
}

main "$@"
