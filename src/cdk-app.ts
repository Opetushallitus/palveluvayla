import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as efs from "aws-cdk-lib/aws-efs";
import * as path from "path";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";

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

    const env = ssm.StringParameter.valueFromLookup(this, "/env/name");
    const domain = ssm.StringParameter.valueFromLookup(this, "/env/domain");

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
    const vpc = this.createVpc();
    const bastionHost = this.createBastionHost(vpc);
    const databaseCluster = this.createDatabaseCluster(vpc, bastionHost);
    const ecsCluster = this.createEcsCluster(vpc);
    const namespace = this.createNamespace(vpc);
    this.createPrimaryNode(
      vpc,
      databaseCluster,
      bastionHost,
      ecsCluster,
      namespace
    );
  }

  private createEcsCluster(vpc: ec2.Vpc) {
    return new ecs.Cluster(this, "SecurityServer", {
      clusterName: "SecurityServer",
      vpc,
    });
  }

  private createNamespace(vpc: ec2.Vpc) {
    return new servicediscovery.PrivateDnsNamespace(
      this,
      "SecurityServerNamespace",
      {
        name: "security-server",
        vpc,
      }
    );
  }

  private createPrimaryNode(
    vpc: ec2.Vpc,
    databaseCluster: rds.DatabaseCluster,
    bastionHost: ec2.BastionHostLinux,
    ecsCluster: ecs.Cluster,
    namespace: servicediscovery.PrivateDnsNamespace
  ) {
    const asset = new ecr_assets.DockerImageAsset(this, "PrimaryNodeAsset", {
      directory: path.join(__dirname, "../security-server-nodes"),
      file: "Dockerfile.primary-node",
    });
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "PrimaryNodeTask",
      {
        cpu: 1024,
        memoryLimitMiB: 4096,
      }
    );
    const fileSystem = new efs.FileSystem(this, "PrimaryNodeFileSystem", {
      vpc,
      encrypted: true,
    });
    const volume = {
      name: "XroadConfiguration",
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        transitEncryption: "ENABLED",
      },
    };
    taskDefinition.addVolume(volume);

    const xroadAdminCredentials = new secretsmanager.Secret(
      this,
      "XroadAdminCredentials",
      {
        secretName: "XroadSecurityServerAdminCredentials",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: ssm.StringParameter.valueFromLookup(this, "/xroad/admin"),
          }),
          generateStringKey: "password",
        },
      }
    );
    const xroadTokenPin = new secretsmanager.Secret(this, "XroadTokenPin", {
      secretName: "XroadTokenPin",
    });
    const container = taskDefinition.addContainer("PrimaryNodeContainer", {
      image: ecs.ContainerImage.fromDockerImageAsset(asset),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "PrimaryNode" }),
      environment: {
        XROAD_LOG_LEVEL: "ALL",
        XROAD_DB_HOST: cdk.Token.asString(
          databaseCluster.clusterEndpoint.hostname
        ),
        XROAD_DB_PORT: cdk.Token.asString(databaseCluster.clusterEndpoint.port),
      },
      secrets: {
        XROAD_DB_PWD: ecs.Secret.fromSecretsManager(
          databaseCluster.secret!,
          "password"
        ),
        XROAD_ADMIN_USER: ecs.Secret.fromSecretsManager(
          xroadAdminCredentials,
          "username"
        ),
        XROAD_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(
          xroadAdminCredentials,
          "password"
        ),
        XROAD_TOKEN_PIN: ecs.Secret.fromSecretsManager(xroadTokenPin),
      },
      portMappings: [
        {
          containerPort: 4000,
          hostPort: 4000,
        },
      ],
    });
    container.addMountPoints({
      containerPath: "/etc/xroad",
      sourceVolume: volume.name,
      readOnly: false,
    });

    const ecsService = new ecs.FargateService(this, "PrimaryNodeService", {
      cluster: ecsCluster,
      taskDefinition,
      desiredCount: 1,
      enableExecuteCommand: true,
      cloudMapOptions: {
        name: "primary-node",
        cloudMapNamespace: namespace,
        dnsRecordType: servicediscovery.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(10),
      },
    });
    fileSystem.connections.allowDefaultPortFrom(ecsService);
    databaseCluster.connections.allowDefaultPortFrom(ecsService);
    ecsService.connections.allowFrom(
      bastionHost,
      ec2.Port.tcp(4000),
      "Allow access to admin web app"
    );
    ecsService.connections.allowFrom(
      bastionHost,
      ec2.Port.tcp(8443),
      "Allow access to the proxy"
    );
  }

  private createVpc() {
    const outIpAddress = new ec2.CfnEIP(this, "OutIpAddress", {
      tags: [{ key: "Name", value: "OutIpAddress" }],
    });

    const natProvider = ec2.NatProvider.gateway({
      eipAllocationIds: [outIpAddress.getAtt("AllocationId").toString()],
    });

    return new ec2.Vpc(this, "XroadSecurityServerVpc", {
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
  }

  private createDatabaseCluster(
    vpc: ec2.Vpc,
    bastionHost: ec2.BastionHostLinux
  ) {
    const dbAdminName = ssm.StringParameter.valueForStringParameter(
      this,
      "/db/admin"
    );
    const cluster = new rds.DatabaseCluster(
      this,
      "XroadSecurityServerDatabase",
      {
        credentials: rds.Credentials.fromGeneratedSecret(dbAdminName, {
          secretName: "XroadSecurityServerDatabaseCredentials",
        }),
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_12_14,
        }),
        cloudwatchLogsExports: ["postgresql"],
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
        storageEncrypted: true,
      }
    );
    cluster.connections.allowDefaultPortFrom(bastionHost);

    return cluster;
  }

  private createBastionHost(vpc: ec2.Vpc) {
    return new ec2.BastionHostLinux(this, "BastionHost", {
      vpc,
    });
  }

  private hostName(env: string) {
    const part = env == "qa" ? "test" : env;
    return `oph${part}01`;
  }
}

const app = new CdkApp();
app.synth();
