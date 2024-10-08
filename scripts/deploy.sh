#!/usr/bin/env bash
set -o errexit -o nounset -o pipefail
readonly repo="$(cd "$(dirname "$0")" && pwd)"
source "${repo}/scripts/lib/common-functions.sh"
readonly nvmrc_node_version=$(cat "$repo/.nvmrc")

function main {
  local -r env=$(parse_env_from_script_name)

  case "${env}" in
    "dev" | "qa" | "prod" | "util")
      deploy "${env}"
      ;;
    *)
      fatal "Unknown env $env"
      ;;
  esac
}

function deploy {
  local -r env="$1"
  require_docker
  init_nodejs
  npm_ci_if_package_lock_has_changed
  if [ "${env}" == "util" ]; then
    deploy_util
  else
    deploy_env "${env}"
  fi
}

function deploy_util {
  bootstrap_cdk
  export_aws_credentials "util"
  npx cdk --app "npx ts-node ${repo}/src/cdk-app-util.ts" deploy --require-approval never --all
}

function deploy_env {
  local -r env="$1"

  if ! is_running_on_codebuild; then
    export_aws_credentials "util"
    local -r accountId=$(get_aws_account_id_of_env "${env}")
    local -r region=$(get_aws_region_of_env "${env}")
    export CDK_DEPLOY_TARGET_ACCOUNT=${accountId}
    export CDK_DEPLOY_TARGET_REGION=${region}
  fi
  login_to_docker_if_possible
  ENV="${env}" npx cdk --app "npx ts-node ${repo}/src/cdk-app.ts" deploy --require-approval never --all
}

function bootstrap_cdk {
  export_aws_credentials "util"
  util_account_id=$(get_aws_account_id_of_env "util")
  region=$(get_aws_region_of_env "util")
  info "Bootstrapping CDK for util account ${util_account_id}/${region}"
  npx cdk bootstrap aws://${util_account_id}/${region}

  for e in dev qa prod; do
    export_aws_credentials "util"
    account_id=$(get_aws_account_id_of_env ${e})
    region=$(get_aws_region_of_env ${e})
    export_aws_credentials "${e}"
    info "Setting up CDK deployment target policy for env ${e}"
    setup_cdk_deployment_target_policies
    info "Bootstrapping CDK for env ${e} at ${account_id}/${region}"
    npx cdk bootstrap aws://${account_id}/${region} \
      --trust ${util_account_id} \
      --trust-for-lookup ${util_account_id} \
      --cloudformation-execution-policies "arn:aws:iam::${account_id}:policy/CDKDeploymentTargetPermissions"
  done
}

function setup_cdk_deployment_target_policies {
  npx ts-node "${repo}/src/setup-cdk-deployment-target-policy.ts"
}

function get_aws_region_of_env {
  local -r env=$1
  get_env_specific_param ${env} region
}

function get_aws_account_id_of_env {
  local -r env=$1
  get_env_specific_param ${env} account_id
}

function get_env_specific_param {
  local -r env=$1
  local -r param=$2
  if ! is_running_on_codebuild; then
    export_aws_credentials "util"
  fi
  aws ssm get-parameter --name "/envs/${env}/${param}" --query Parameter.Value --output text
}

function get_aws_account_id {
  aws sts get-caller-identity --query Account --output text
}

function npm_ci_if_package_lock_has_changed {
  info "Checking if npm ci needs to be run"
  require_command shasum
  local -r checksum_file=".package-lock.json.checksum"

  function run_npm_ci {
    npm ci
    shasum package-lock.json >"$checksum_file"
  }
  function run_npm_install {
    npm install
    shasum package-lock.json >"$checksum_file"
  }

  if [ ! -f "package-lock.json" ]; then
    info "No package-lock.json found; running npm install"
    run_npm_install
  elif [ ! -f "$checksum_file" ]; then
    echo "new package-lock.json; running npm ci"
    run_npm_ci
  elif ! shasum --check "$checksum_file"; then
    info "package-lock.json seems to have changed, running npm ci"
    run_npm_ci
  else
    info "package-lock.json doesn't seem to have changed, skipping npm ci"
  fi
}

function init_nodejs {
  if node_is_installed; then
    local -r current_node_version=$(node -v)
    if major_and_minor_version_match "$nvmrc_node_version" "$current_node_version"; then
      info "Using installed node $current_node_version"
    else
      install_nodejs_via_nvm "$nvmrc_node_version"
    fi
  else
    install_nodejs_via_nvm "$nvmrc_node_version"
  fi
}

function node_is_installed {
  command -v node &> /dev/null
}

function major_and_minor_version_match {
  local -r left=$(major_and_minor_version_from "$1")
  local -r right=$(major_and_minor_version_from "$2")
  [ "$left" == "$right" ]
}

function major_and_minor_version_from {
  local -r version="$1"
  echo -n "$version" | cut -f 1-2 -d '.'
}

function install_nodejs_via_nvm {
  info "Using node ${nvmrc_node_version} via nvm"
  export NVM_DIR="${NVM_DIR:-$HOME/.cache/nvm}"
  set +o errexit
  source "$repo/scripts/nvm.sh"
  nvm use "${nvmrc_node_version}" || nvm install "${nvmrc_node_version}"
  set -o errexit
}

main "$@"
