#!/usr/bin/env bash
set -o nounset -o errexit -o pipefail

function main {
  local instance_id="$(aws ec2 describe-instances --output text \
    --filter Name=tag:Name,Values=BastionHost --filter Name=instance-state-name,Values=running \
    --query 'Reservations[0].Instances[0].InstanceId')"

  local availability_zone="$(aws ec2 describe-instances --output text \
    --filter Name=tag:Name,Values=BastionHost \
    --query 'Reservations[0].Instances[0].Placement.AvailabilityZone')"

  local postgres_host="$(aws rds describe-db-clusters --output text --query "DBClusters[0].Endpoint")"

  local xroad_secondary_node="$(aws elbv2 describe-load-balancers --output text \
     --query "LoadBalancers[?Type== 'application'].DNSName")"

  local xroad_primary_node="primary-node.security-server"

  ssh-keygen -q -t rsa -f temporary_key -N ''

  aws ec2-instance-connect send-ssh-public-key \
    --instance-id $instance_id \
    --availability-zone $availability_zone \
    --instance-os-user ec2-user \
    --ssh-public-key file://temporary_key.pub

  echo "Starting tunnel to $instance_id"

  ssh \
    -i temporary_key \
    -o StrictHostKeyChecking=no \
    -o ProxyCommand="aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'" \
    -N \
    -L 0.0.0.0:2222:$postgres_host:5432 \
    -L 0.0.0.0:4000:$xroad_primary_node:4000 \
    -L 0.0.0.0:8443:$xroad_secondary_node:8443 \
    "ec2-user@${instance_id}"
}

main "$@"
