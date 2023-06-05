import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as rds from "aws-cdk-lib/aws-rds";

class CdkApp extends cdk.App {
  constructor() {
    super();
    const env = {
      account: process.env.CDK_DEPLOY_TARGET_ACCOUNT,
      region: process.env.CDK_DEPLOY_TARGET_REGION,
    };
    new XroadSecurityServerStack(this, "XroadSecurityServerStack", {
      env: env,
    });
  }
}

class XroadSecurityServerStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);
    const inIpAddress = new ec2.CfnEIP(this, "InIpAddress", {
      tags: [{ key: "Name", value: "InIpAddress" }],
    });
    const outIpAddress = new ec2.CfnEIP(this, "OutIpAddress", {
      tags: [{ key: "Name", value: "OutIpAddress" }],
    });

    const env = ssm.StringParameter.valueFromLookup(this, "/env/name");
    const domain = ssm.StringParameter.valueFromLookup(this, "/env/domain");
    const dbAdminName = ssm.StringParameter.valueFromLookup(this, "/db/admin");

    const hostedZone = new route53.HostedZone(this, "HostedZone", {
      zoneName: `${env}.${domain}`,
    });
    const securityServerNlbARecord = new route53.ARecord(
      this,
      "SecurityServerNLB",
      {
        recordName: this.hostName(env),
        zone: hostedZone,
        target: route53.RecordTarget.fromIpAddresses(inIpAddress.ref),
      }
    );
    const natProvider = ec2.NatProvider.gateway({
      eipAllocationIds: [outIpAddress.getAtt("AllocationId").toString()],
    });
    const vpc = new ec2.Vpc(this, "XroadSecurityServerVpc", {
      subnetConfiguration: [
        {
          name: "Ingress",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: "Application",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          name: "Database",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      maxAzs: 2,
      natGateways: 1,
      natGatewayProvider: natProvider,
    });
    const cluster = new rds.DatabaseCluster(
      this,
      "XroadSecurityServerDatabase",
      {
        credentials: rds.Credentials.fromGeneratedSecret(dbAdminName, {
          secretName: "XroadSecurityDatabaseAdminPassword",
        }),
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_12_14,
        }),
        instanceProps: {
          instanceType: ec2.InstanceType.of(
            ec2.InstanceClass.T4G,
            ec2.InstanceSize.MEDIUM
          ),
          vpc,
          vpcSubnets: {
            subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          },
        },
      }
    );
  }

  private hostName(env: string) {
    const part = env == "qa" ? "test" : env;
    return `oph${part}01`;
  }
}

const app = new CdkApp();
app.synth();
