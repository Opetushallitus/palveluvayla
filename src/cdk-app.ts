import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as efs from "aws-cdk-lib/aws-efs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import * as apigatewayv2 from "@aws-cdk/aws-apigatewayv2-alpha";
import { CfnStage } from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2_integrations from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { HttpIamAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Duration } from "aws-cdk-lib";

type EnvName = "dev" | "qa" | "prod";

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

    const inIpAddresses = this.createInIpAddresses();

    const env = ssm.StringParameter.valueFromLookup(
      this,
      "/env/name"
    ) as EnvName;
    const domain = ssm.StringParameter.valueFromLookup(this, "/env/domain");
    const zoneName = `${env}.${domain}`;

    const hostedZone = new route53.HostedZone(this, "HostedZone", {
      zoneName,
    });
    new route53.ARecord(this, "SecurityServerNLB", {
      recordName: this.hostName(env),
      zone: hostedZone,
      target: route53.RecordTarget.fromIpAddresses(
        ...inIpAddresses.map((i) => i.ref)
      ),
    });
    const sslCertificate = new acm.Certificate(this, "SslCertificate", {
      domainName: `*.${zoneName}`,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
    const vpc = this.createVpc();
    const bastionHost = this.createBastionHost(vpc);
    const databaseCluster = this.createDatabaseCluster(vpc, bastionHost);
    const ecsCluster = this.createEcsCluster(vpc);
    const namespace = this.createNamespace(vpc);
    const sshKeyPair = this.lookupSshKeyPair();
    const xroadAdminCredentials = this.createXroadAdminCredentials();
    const xroadTokenPin = this.createXroadTokenPin();
    const secondaryNodes = this.createSecondaryNodes(
      vpc,
      databaseCluster,
      ecsCluster,
      xroadAdminCredentials,
      xroadTokenPin,
      sshKeyPair
    );
    const alb = this.createOutgoingProxyAlb(
      vpc,
      hostedZone,
      sslCertificate,
      secondaryNodes
    );
    const proxyLambda = this.createOutgoingProxyLambda(vpc, zoneName);
    this.createApiGateway(
      vpc,
      alb.listeners[0],
      proxyLambda,
      zoneName,
      hostedZone,
      sslCertificate
    );
    this.createPrimaryNode(
      vpc,
      databaseCluster,
      bastionHost,
      ecsCluster,
      namespace,
      xroadAdminCredentials,
      xroadTokenPin,
      sshKeyPair,
      secondaryNodes
    );
  }

  private createOutgoingProxyLambda(vpc: ec2.Vpc, zoneName: string) {
    return new lambda.Function(this, "MyFunction", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambda/apigateway-proxy")
      ),
      timeout: Duration.seconds(35),
      environment: {
        ALB_HOST_NAME: `internal-proxy.${zoneName}`,
      },
    });
  }

  private createInIpAddresses() {
    return ["InIpAddress", "InIpAddress2"].map((ip) =>
      this.createIpAddress(ip)
    );
  }

  private createIpAddress(id: string) {
    return new ec2.CfnEIP(this, id, {
      tags: [{ key: "Name", value: id }],
    });
  }

  private createXroadTokenPin() {
    return new secretsmanager.Secret(this, "XroadTokenPin", {
      secretName: "XroadTokenPin",
    });
  }

  private createXroadAdminCredentials() {
    return new secretsmanager.Secret(this, "XroadAdminCredentials", {
      secretName: "XroadSecurityServerAdminCredentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: ssm.StringParameter.valueFromLookup(this, "/xroad/admin"),
        }),
        generateStringKey: "password",
      },
    });
  }

  private createApiGateway(
    vpc: ec2.Vpc,
    proxyListener: elbv2.ApplicationListener,
    proxyLambda: lambda.Function,
    zoneName: string,
    hostedZone: route53.HostedZone,
    certificate: acm.Certificate
  ) {
    const vpcLinkSecurityGroup = new ec2.SecurityGroup(
      this,
      "OutgoingProxyVpcLinkSecurityGroup",
      { vpc, allowAllOutbound: true }
    );

    const proxyVpcLink = new apigatewayv2.VpcLink(
      this,
      "OutgoingProxyVpcLink",
      {
        vpc: vpc,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        securityGroups: [vpcLinkSecurityGroup],
      }
    );

    const proxyIntegration = new apigatewayv2_integrations.HttpAlbIntegration(
      "OutgoingProxyIntegration",
      proxyListener,
      {
        method: apigatewayv2.HttpMethod.ANY,
        vpcLink: proxyVpcLink,
        secureServerName: `proxy.${zoneName}`,
      }
    );

    const proxyLambdaIntegration =
      new apigatewayv2_integrations.HttpLambdaIntegration(
        "OugoingProxyTransformer",
        proxyLambda
      );

    const authorizer = new HttpIamAuthorizer();
    const dnsName = `proxy.${zoneName}`;
    const domainName = new apigatewayv2.DomainName(
      this,
      "OutgoingProxyDomain",
      {
        domainName: dnsName,
        certificate,
      }
    );

    const httpApi = new apigatewayv2.HttpApi(this, "PalveluvaylaApi", {
      defaultDomainMapping: {
        domainName,
      },
    });

    new route53.ARecord(this, "OutgointProxyARecord", {
      recordName: dnsName,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new targets.ApiGatewayv2DomainProperties(
          domainName.regionalDomainName,
          domainName.regionalHostedZoneId
        )
      ),
    });

    const httpRoute = new apigatewayv2.HttpRoute(this, "HttpRoute", {
      httpApi: httpApi,
      authorizer: authorizer,
      integration: proxyLambdaIntegration,
      routeKey: apigatewayv2.HttpRouteKey.with(
        "/{proxy+}",
        apigatewayv2.HttpMethod.ANY
      ),
    });
    const onrAccountId = ssm.StringParameter.valueFromLookup(
      this,
      "/env/onr-account-id"
    );
    const invokeRole = new iam.Role(this, "ApigwInvokeRole", {
      roleName: "ApigwInvokeRole",
      assumedBy: new iam.AccountPrincipal(onrAccountId),
    });
    httpRoute.grantInvoke(invokeRole);

    const stage = httpApi.defaultStage!.node.defaultChild as CfnStage;
    const logGroup = new logs.LogGroup(httpApi, "AccessLogs", {
      retention: 90,
    });
    stage.accessLogSettings = {
      destinationArn: logGroup.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        userAgent: "$context.identity.userAgent",
        sourceIp: "$context.identity.sourceIp",
        requestTime: "$context.requestTime",
        httpMethod: "$context.httpMethod",
        path: "$context.path",
        status: "$context.status",
        responseLength: "$context.responseLength",
        integrationError: "$context.integration.error",
        apiGatewayError: "$context.error.message",
        authorizerError: "$context.authorizer.error",
      }),
    };
    logGroup.grantWrite(new iam.ServicePrincipal("apigateway.amazonaws.com"));

    return httpApi;
  }

  private createOutgoingProxyAlb(
    vpc: ec2.Vpc,
    hostedZone: HostedZone,
    sslCertificate: acm.Certificate,
    service: ecs.FargateService
  ) {
    const albPort = 443;
    const proxyPort = 8080;
    const healthCheckPort = 5588;

    const alb = new elbv2.ApplicationLoadBalancer(this, "OutgoingProxy", {
      vpc,
      internetFacing: false,
    });
    new route53.ARecord(this, "OutgoingProxyInternal", {
      recordName: `internal-proxy.${hostedZone.zoneName}`,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget(alb)
      ),
      zone: hostedZone,
    });

    alb
      .addListener("OutgoingProxyHttp", {
        port: albPort,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [sslCertificate],
      })
      .addTargets("OutgoingProxyHttp", {
        port: proxyPort,
        targets: [service],
        healthCheck: {
          interval: cdk.Duration.seconds(60),
          timeout: cdk.Duration.seconds(5),
          protocol: elbv2.Protocol.HTTP,
          port: `${healthCheckPort}`,
        },
      });

    alb.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    service.connections.allowFrom(
      alb,
      ec2.Port.tcp(proxyPort),
      "Allow connections from alb to outgoing proxy port"
    );
    service.connections.allowFrom(
      alb,
      ec2.Port.tcp(healthCheckPort),
      "Allow connections from alb to health check port"
    );

    return alb;
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
    xroadAdminCredentials: secretsmanager.ISecret,
    xroadTokenPin: secretsmanager.ISecret,
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
    vpc: ec2.Vpc,
    databaseCluster: rds.DatabaseCluster,
    ecsCluster: ecs.Cluster,
    xroadAdminCredentials: secretsmanager.ISecret,
    xroadTokenPin: secretsmanager.ISecret,
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
        XROAD_ADMIN_USER: ecs.Secret.fromSecretsManager(
          xroadAdminCredentials,
          "username"
        ),
        XROAD_ADMIN_PASSWORD: ecs.Secret.fromSecretsManager(
          xroadAdminCredentials,
          "password"
        ),
        XROAD_TOKEN_PIN: ecs.Secret.fromSecretsManager(xroadTokenPin),
        SSH_PRIVATE_KEY_BASE64: ecs.Secret.fromSecretsManager(
          sshKeyPair,
          "private_key_base64"
        ),
      },
      portMappings: [
        {
          containerPort: 8080,
          hostPort: 8080,
        },
      ],
    });

    const service = new ecs.FargateService(this, "SecondaryNodeService", {
      cluster: ecsCluster,
      taskDefinition,
      desiredCount: 2,
      enableExecuteCommand: true,
    });
    databaseCluster.connections.allowDefaultPortFrom(service);
    service.connections.allowFrom(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(8443),
      "Allow access from the vpc to the outwards ssl proxy"
    );

    return service;
  }

  private createVpc() {
    const outIpAddresses = this.createOutIpAddresses();

    const natProvider = ec2.NatProvider.gateway({
      eipAllocationIds: outIpAddresses.map((ip) =>
        ip.getAtt("AllocationId").toString()
      ),
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
      natGateways: 2,
      natGatewayProvider: natProvider,
    });

    vpc.addInterfaceEndpoint("ApiGatewayEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
      privateDnsEnabled: true,
      open: true,
    });

    return vpc;
  }

  private createOutIpAddresses() {
    return ["OutIpAddress", "OutIpAddress2"].map((ip) =>
      this.createIpAddress(ip)
    );
  }

  private createDatabaseCluster(
    vpc: ec2.Vpc,
    bastionHost: ec2.BastionHostLinux
  ) {
    const dbAdminName = ssm.StringParameter.valueFromLookup(this, "/db/admin");
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
