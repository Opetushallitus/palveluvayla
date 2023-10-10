import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import * as apigatewayv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as apigatewayv2_authorizers from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";

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
    const serviceSecurityGroup = this.createServiceSecurityGroup(vpc);
    const vpcLink = this.createVpcLink(vpc, serviceSecurityGroup);
    const bastionHost = this.createBastionHost(vpc);
    const databaseCluster = this.createDatabaseCluster(vpc, bastionHost);
    const ecsCluster = this.createEcsCluster(vpc);
    const namespace = this.createNamespace(vpc);
    const sshKeyPair = this.lookupSshKeyPair();
    const apigwAuthorizer = this.createApiGatewayAuthorizer(props.env!);
    const secondaryNodes = this.createSecondaryNodes(
      databaseCluster,
      ecsCluster,
      serviceSecurityGroup,
      sshKeyPair
    );
    const { listener } = this.createApiGatewayNlb(vpc, secondaryNodes);
    this.createApiGateway(vpcLink, listener, apigwAuthorizer);
    this.createPrimaryNode(
      vpc,
      databaseCluster,
      bastionHost,
      ecsCluster,
      namespace,
      sshKeyPair,
      secondaryNodes
    );
  }

  private createApiGatewayNlb(vpc: ec2.Vpc, service: ecs.FargateService) {
    const apigwNlb = new elbv2.NetworkLoadBalancer(this, "ApiGatewayNlb", {
      vpc: vpc,
      internetFacing: false,
    });
    const listener = apigwNlb.addListener("ApiGatewayListener", {
      port: 8443,
    });
    listener.addTargets("ApiGatewayTarget", {
      port: 8443,
      targets: [service],
    });
    return { apigwNlb, listener };
  }

  private createApiGatewayAuthorizer(env: cdk.Environment) {
    const fn = new lambda.Function(this, "ApiGatewayAuthorizer", {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambda/apigw-authorizer-lambda")
      ),
    });
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        effect: iam.Effect.ALLOW,
        resources: [
          `arn:aws:ssm:${env.region}:${env.account}:parameter/lambda/*`,
        ],
      })
    );
    return fn;
  }

  private createServiceSecurityGroup(vpc: ec2.Vpc) {
    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      "PalveluvaylaServiceSecurityGroup",
      {
        vpc: vpc,
        allowAllOutbound: true,
        description: "Allow traffic to Palveluvayla HTTP API service.",
        securityGroupName: "PalveluvaylaServiceSecurityGroup",
      }
    );

    serviceSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(8443),
      "palveluvayla https proxy"
    );

    return serviceSecurityGroup;
  }

  private createApiGateway(
    vpcLink: apigatewayv2.VpcLink,
    listener: elbv2.NetworkListener,
    authorizer: lambda.Function
  ) {
    const defaultIntegration = new apigatewayv2_integrations.HttpNlbIntegration(
      "PalveluvaylaNlbIntegration",
      listener,
      {
        vpcLink: vpcLink,
      }
    );
    const defaultAuthorizer = new apigatewayv2_authorizers.HttpLambdaAuthorizer(
      "PalveluvaylaApiKeyAuthorizer",
      authorizer,
      {
        responseTypes: [apigatewayv2_authorizers.HttpLambdaResponseType.SIMPLE],
      }
    );
    const httpApi = new apigatewayv2.HttpApi(this, "PalveluvaylaApi", {
      defaultIntegration: defaultIntegration,
      defaultAuthorizer: defaultAuthorizer,
    });

    httpApi.addRoutes({
      path: "/r1/FI/GOV/0245437-2/VTJmutpa/VTJmutpa/api/v1/*",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: defaultIntegration,
    });

    return httpApi;
  }

  private lookupSshKeyPair() {
    return secretsmanager.Secret.fromSecretNameV2(
      this,
      "XroadSshKeyPair",
      "xroad_ssh_key_pair"
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
    namespace: servicediscovery.PrivateDnsNamespace,
    sshKeyPair: secretsmanager.ISecret,
    secondaryNodes: ecs.FargateService
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
        SSH_PUBLIC_KEY_BASE64: ecs.Secret.fromSecretsManager(
          sshKeyPair,
          "public_key_base64"
        ),
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
      secondaryNodes,
      ec2.Port.tcp(22),
      "Allow SSH access from secondary nodes for rsync"
    );
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
    ecsService.connections.allowFrom(
      bastionHost,
      ec2.Port.tcp(8080),
      "Allow access to the proxy"
    );
  }

  private createSecondaryNodes(
    databaseCluster: rds.DatabaseCluster,
    ecsCluster: ecs.Cluster,
    securityGroup: ec2.SecurityGroup,
    sshKeyPair: secretsmanager.ISecret
  ) {
    const asset = new ecr_assets.DockerImageAsset(this, "SecondaryNodeAsset", {
      directory: path.join(__dirname, "../security-server-nodes"),
      file: "Dockerfile.secondary-node",
    });
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "SecondaryNodeTask",
      {
        cpu: 1024,
        memoryLimitMiB: 4096,
      }
    );
    const container = taskDefinition.addContainer("SecondaryNodeContainer", {
      image: ecs.ContainerImage.fromDockerImageAsset(asset),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "SecondaryNode" }),
      environment: {
        XROAD_LOG_LEVEL: "ALL",
        XROAD_DB_HOST: cdk.Token.asString(
          databaseCluster.clusterEndpoint.hostname
        ),
        XROAD_DB_PORT: cdk.Token.asString(databaseCluster.clusterEndpoint.port),
        XROAD_PRIMARY_DNS: "primary-node.security-server",
      },
      secrets: {
        XROAD_DB_PWD: ecs.Secret.fromSecretsManager(
          databaseCluster.secret!,
          "password"
        ),
        SSH_PRIVATE_KEY_BASE64: ecs.Secret.fromSecretsManager(
          sshKeyPair,
          "private_key_base64"
        ),
      },
      portMappings: [
        {
          containerPort: 5500,
          hostPort: 5500,
        },
        {
          containerPort: 5577,
          hostPort: 5577,
        },
        {
          containerPort: 8443,
          hostPort: 8443,
        },
      ],
    });

    const service = new ecs.FargateService(this, "SecondaryNodeService", {
      cluster: ecsCluster,
      taskDefinition,
      desiredCount: 2,
      securityGroups: [securityGroup],
      enableExecuteCommand: true,
    });
    databaseCluster.connections.allowDefaultPortFrom(service);

    return service;
  }

  private createVpc() {
    const outIpAddress = new ec2.CfnEIP(this, "OutIpAddress", {
      tags: [{ key: "Name", value: "OutIpAddress" }],
    });

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

    vpc.addInterfaceEndpoint("ApiGatewayEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
      privateDnsEnabled: true,
      open: true,
    });

    return vpc;
  }

  private createVpcLink(vpc: ec2.Vpc, securityGroup: ec2.SecurityGroup) {
    return new apigatewayv2.VpcLink(this, "PalveluvaylaVpcLink", {
      vpc: vpc,
      subnets: { subnets: vpc.privateSubnets },
      securityGroups: [securityGroup],
    });
  }

  private createDatabaseCluster(
    vpc: ec2.Vpc,
    bastionHost: ec2.BastionHostLinux
  ) {
    const dbAdminName = ssm.StringParameter.valueFromLookup(
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
