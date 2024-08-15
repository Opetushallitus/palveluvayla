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
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayv2_integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigatewayv2_authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as custom_resources from "aws-cdk-lib/custom-resources";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as events from "aws-cdk-lib/aws-events";
import * as event_targets from "aws-cdk-lib/aws-events-targets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import { EnvName, getConfig } from "./config";

const sharedLambdaDefaults = {
  runtime: lambda.Runtime.NODEJS_20_X,
  architecture: lambda.Architecture.ARM_64,
  timeout: cdk.Duration.seconds(30),
};

class CdkApp extends cdk.App {
  constructor() {
    super();
    const stackProps = {
      env: {
        account: process.env.CDK_DEPLOY_TARGET_ACCOUNT,
        region: process.env.CDK_DEPLOY_TARGET_REGION,
      },
    };

    const alarmStack = new AlarmStack(this, "AlarmStack", stackProps);
    new XroadSecurityServerStack(this, "XroadSecurityServerStack", {
      ...stackProps,
      alarmTopic: alarmStack.alarmTopic,
    });
  }
}

class AlarmStack extends cdk.Stack {
  public readonly alarmTopic;

  constructor(scope: constructs.Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const alarmsToSlackLambda = this.createAlarmsToSlackLambda();
    this.alarmTopic = this.createAlarmTopic();

    this.alarmTopic.addSubscription(
      new subscriptions.LambdaSubscription(alarmsToSlackLambda)
    );
  }

  createAlarmTopic() {
    return new sns.Topic(this, "AlarmTopic", {
      topicName: "alarm",
    });
  }

  createAlarmsToSlackLambda() {
    const alarmsToSlack = new nodejs.NodejsFunction(this, "AlarmsToSlack", {
      ...sharedLambdaDefaults,
      functionName: "alarms-to-slack",
      entry: path.join(
        __dirname,
        "../lambda/alarms-to-slack/alarms-to-slack.ts"
      ),
      bundling: { sourceMap: true },
    });

    addParametersAndSecretsExtension(this, alarmsToSlack)
    secretsmanager.Secret.fromSecretNameV2(
      this,
      "slack-webhook",
      "slack-webhook"
    ).grantRead(alarmsToSlack);

    return alarmsToSlack;
  }
}

interface XroadSecurityServerStackProps extends cdk.StackProps {
  alarmTopic: sns.ITopic;
}

class XroadSecurityServerStack extends cdk.Stack {
  private readonly ports = {
    adminUi: 4000,
    informationSystemAccessHttp: 8080,
    informationSystemAccessHttps: 8443,
    healthCheck: 5588,
    ssh: 22,
    alb: 443,
    messageExchange: 5500,
    ocspResponse: 5577,
  };

  private readonly privateDnsNamespace = "security-server";
  private readonly primaryNodeHostName = "primary-node";

  private readonly lbHealthCheck = {
    interval: cdk.Duration.seconds(60),
    timeout: cdk.Duration.seconds(5),
    unhealthyThresholdCount: 5,
    healthyThreshold: 5,
    healthyHttpCodes: "200",
    path: "/",
    protocol: elbv2.Protocol.HTTP,
    port: `${this.ports.healthCheck}`,
  };

  constructor(
    scope: constructs.Construct,
    id: string,
    props: XroadSecurityServerStackProps
  ) {
    super(scope, id, props);

    const inIpAddresses = this.createInIpAddresses();

    const env = ssm.StringParameter.valueFromLookup(
      this,
      "/env/name"
    ) as EnvName;
    const config = getConfig(env);
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
    const nlb = this.createIncomingProxyNlb(vpc, inIpAddresses, secondaryNodes);

    const proxyLambda = this.createOutgoingProxyLambda(vpc, zoneName);
    this.createApiGateway(
      vpc,
      alb.listeners[0],
      proxyLambda,
      zoneName,
      hostedZone,
      sslCertificate
    );
    const certificateValidityLambda =
      this.createCertificateValidityLeftInDaysLambda(vpc, props.alarmTopic);
    const primaryNodeService = this.createPrimaryNode(
      vpc,
      databaseCluster,
      bastionHost,
      ecsCluster,
      namespace,
      xroadAdminCredentials,
      xroadTokenPin,
      sshKeyPair,
      secondaryNodes,
      certificateValidityLambda,
    );
    const subsystems = new XroadSubsystems(this, "Subsystems", {
      vpc,
      primaryNodeService,
      primaryNodeHostName: this.primaryNodeHostName,
      privateDnsNamespace: this.privateDnsNamespace,
      adminUiPort: this.ports.adminUi,
    });
    const commonProps = {
      XroadInstance: config.xroadEnvironment,
      MemberClass: "GOV",
      MemberName: "OPH",
      MemberCode: "2769790-1",
      Registered: true,
    };
    subsystems.addSubsystem("TestClientSubsystem", {
      ...commonProps,
      SubsystemName: "test-client",
      WsdlServices: [],
    });
    subsystems.addSubsystem("TestServiceSubsystem", {
      ...commonProps,
      SubsystemName: "test-service",
      WsdlServices: config.testWsdlUrls.map((url) => ({ url })),
    });
  }

  private createOutgoingProxyLambda(vpc: ec2.Vpc, zoneName: string) {
    return new nodejs.NodejsFunction(this, "MyFunction", {
      ...sharedLambdaDefaults,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      entry: path.join(__dirname, "../lambda/apigateway-proxy/index.ts"),
      bundling: { sourceMap: true },
      timeout: cdk.Duration.seconds(35),
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

    const authorizer = new apigatewayv2_authorizers.HttpIamAuthorizer();
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

    const stage = httpApi.defaultStage!.node
      .defaultChild as apigatewayv2.CfnStage;
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

  private createIncomingProxyNlb(
    vpc: ec2.Vpc,
    ipAddresses: Array<ec2.CfnEIP>,
    secondaryNodes: ecs.FargateService
  ) {
    const securityGroup = new ec2.SecurityGroup(
      this,
      "IncomingProxySecurityGroup",
      {
        vpc,
      }
    );
    const nlb = new elbv2.NetworkLoadBalancer(this, "IncomingProxy", {
      vpc,
      securityGroups: [securityGroup],
      internetFacing: true,
    });
    const cfnNlb = nlb.node.defaultChild as elbv2.CfnLoadBalancer;
    cfnNlb.addDeletionOverride("Properties.Subnets");
    cfnNlb.subnetMappings = [
      {
        allocationId: ipAddresses[0].attrAllocationId,
        subnetId: vpc.publicSubnets[0].subnetId,
      },
      {
        allocationId: ipAddresses[1].attrAllocationId,
        subnetId: vpc.publicSubnets[1].subnetId,
      },
    ];

    nlb
      .addListener("MessageExchangeListener", {
        port: this.ports.messageExchange,
      })
      .addTargets("MessageExchangeListenerTargets", {
        targetGroupName: "MessageExchangeListenerTargets",
        port: this.ports.messageExchange,
        targets: [
          secondaryNodes.loadBalancerTarget({
            containerName: "SecondaryNode",
            containerPort: this.ports.messageExchange,
          }),
        ],
        healthCheck: this.lbHealthCheck,
      });
    nlb.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(this.ports.messageExchange)
    );
    secondaryNodes.connections.allowFrom(
      nlb,
      ec2.Port.tcp(this.ports.messageExchange),
      "Allow connections from nlb to message exchange port"
    );

    nlb
      .addListener("OCSPResponderListener", {
        port: this.ports.ocspResponse,
      })
      .addTargets("OCSPResponderListenerTargets", {
        targetGroupName: "OCSPResponderListenerTargets",
        port: this.ports.ocspResponse,
        targets: [
          secondaryNodes.loadBalancerTarget({
            containerName: "SecondaryNode",
            containerPort: this.ports.ocspResponse,
          }),
        ],
        healthCheck: this.lbHealthCheck,
      });

    nlb.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(this.ports.ocspResponse)
    );
    secondaryNodes.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(this.ports.ocspResponse),
      "Allow connections from nlb to ocsp response port"
    );

    secondaryNodes.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(this.ports.healthCheck),
      "Allow connections from nlb to health check port"
    );

    return nlb;
  }

  private createOutgoingProxyAlb(
    vpc: ec2.Vpc,
    hostedZone: route53.HostedZone,
    sslCertificate: acm.Certificate,
    service: ecs.FargateService
  ) {
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
        port: this.ports.alb,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [sslCertificate],
      })
      .addTargets("OutgoingProxyHttp", {
        port: this.ports.informationSystemAccessHttp,
        targets: [
          service.loadBalancerTarget({
            containerName: "SecondaryNode",
            containerPort: this.ports.informationSystemAccessHttp,
          }),
        ],
        healthCheck: this.lbHealthCheck,
      });

    alb.connections.allowFrom(ec2.Peer.anyIpv4(), ec2.Port.tcp(this.ports.alb));
    service.connections.allowFrom(
      alb,
      ec2.Port.tcp(this.ports.informationSystemAccessHttp),
      "Allow connections from alb to outgoing proxy port"
    );
    service.connections.allowFrom(
      alb,
      ec2.Port.tcp(this.ports.healthCheck),
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
        name: this.privateDnsNamespace,
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
    secondaryNodes: ecs.FargateService,
    certificateValidityLambda: lambda.Function
  ): ecs.FargateService {
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
          containerPort: this.ports.adminUi,
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
        name: this.primaryNodeHostName,
        cloudMapNamespace: namespace,
        dnsRecordType: servicediscovery.DnsRecordType.A,
        dnsTtl: cdk.Duration.seconds(10),
      },
    });
    fileSystem.connections.allowDefaultPortFrom(ecsService);
    databaseCluster.connections.allowDefaultPortFrom(ecsService);
    ecsService.connections.allowFrom(
      secondaryNodes,
      ec2.Port.tcp(this.ports.ssh),
      "Allow SSH access from secondary nodes for rsync"
    );
    ecsService.connections.allowFrom(
      bastionHost,
      ec2.Port.tcp(this.ports.adminUi),
      "Allow access to admin web app"
    );
    ecsService.connections.allowFrom(
      certificateValidityLambda,
      ec2.Port.tcp(this.ports.adminUi),
      "Allow access to maintenance API"
    );
    ecsService.connections.allowFrom(
      bastionHost,
      ec2.Port.tcp(this.ports.informationSystemAccessHttps),
      "Allow access to the proxy"
    );
    ecsService.connections.allowFrom(
      bastionHost,
      ec2.Port.tcp(this.ports.informationSystemAccessHttp),
      "Allow access to the proxy"
    );
    return ecsService
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
      containerName: "SecondaryNode",
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
          containerPort: this.ports.informationSystemAccessHttp,
        },
        {
          containerPort: this.ports.healthCheck,
        },
        {
          containerPort: this.ports.messageExchange,
        },
        {
          containerPort: this.ports.ocspResponse,
        },
      ],
    });

    const service = new ecs.FargateService(this, "SecondaryNodeService", {
      cluster: ecsCluster,
      taskDefinition,
      desiredCount: 2,
      enableExecuteCommand: true,
      healthCheckGracePeriod: cdk.Duration.minutes(3),
    });
    databaseCluster.connections.allowDefaultPortFrom(service);
    service.connections.allowFrom(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(this.ports.informationSystemAccessHttps),
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

  private createCertificateValidityLeftInDaysLambda(
    vpc: ec2.Vpc,
    alarmTopic: sns.ITopic
  ) {
    const l = new nodejs.NodejsFunction(this, "certificateValidityLeftInDays", {
      functionName: "certificate-validity-left-in-days",
      entry: path.join(
        __dirname,
        "../lambda/certificate-validity-left-in-days/index.ts"
      ),
      bundling: { sourceMap: true },
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      environment: {
        XROAD_API_HOST: `${this.primaryNodeHostName}.${this.privateDnsNamespace}`,
        XROAD_API_PORT: `${this.ports.adminUi}`,
        NODE_TLS_REJECT_UNAUTHORIZED: "0",
        NODE_OPTIONS: "--enable-source-maps",
      },
    });
    addParametersAndSecretsExtension(this, l);
    secretsmanager.Secret.fromSecretNameV2(
      this,
      "xroad-api-key",
      "xroad-api-key"
    ).grantRead(l);

    const rule = new events.Rule(
      this,
      "LogXroadCertificateValidityEveryFiveMinutes",
      {
        schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      }
    );
    rule.addTarget(new event_targets.LambdaFunction(l));

    const metricNamespace = "Xroad";
    const metricName = "cetificate-valid-days-left";

    const metricFilter = l.logGroup.addMetricFilter(
      "CertificateValidDaysLeft",
      {
        metricNamespace,
        metricName,
        filterPattern: logs.FilterPattern.exists("$.validDaysLeft"),
        metricValue: "$.validDaysLeft",
        dimensions: { label: "$.label", token: "$.token" },
      }
    );

    const authenticationCertificateAlarm = new cloudwatch.Alarm(
      this,
      "AuthenticationCertificateExpiringInLessThan30Days",
      {
        alarmName: "authentication-certificate-expiring-in-less-than-30-days",
        alarmDescription:
          "Liityntäpalvelimen tunnistus varmenne vanhenee alle 30 päivän päästä. Katso ohjeet https://palveluhallinta.suomi.fi/fi/tuki/artikkelit/592bd1c103f6d100018db5c7",
        metric: metricFilter.metric().with({
          statistic: "Minimum",
          period: cdk.Duration.minutes(10),
          dimensionsMap: {
            token: "softToken-0",
            label: "Server Authentication Key",
          },
        }),
        threshold: 30,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
        actionsEnabled: true,
      }
    );

    const signingCertificateAlarm = new cloudwatch.Alarm(
      this,
      "SigningCertificateExpiringInLessThan30Days",
      {
        alarmName: "signing-certificate-expiring-in-less-than-30-days",
        alarmDescription:
          "Liityntäpalvelimen allerkirjoitus varmenne vanhenee alle 30 päivän päästä. Katso ohjeet https://palveluhallinta.suomi.fi/fi/tuki/artikkelit/592bd1c103f6d100018db5c7",
        metric: metricFilter.metric().with({
          statistic: "Minimum",
          period: cdk.Duration.minutes(10),
          dimensionsMap: {
            token: "softToken-0",
            label: "Server Owner Signing Key",
          },
        }),
        threshold: 30,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
        actionsEnabled: true,
      }
    );

    [authenticationCertificateAlarm, signingCertificateAlarm].forEach(
      (alarm) => {
        alarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));
        alarm.addOkAction(new cloudwatch_actions.SnsAction(alarmTopic));
      }
    );

    return l;
  }
}

type XroadSubsystemsProps = {
  vpc: ec2.Vpc;
  primaryNodeService: ecs.FargateService;
  primaryNodeHostName: string;
  privateDnsNamespace: string;
  adminUiPort: number;
};

type SubsystemProps = {
  SubsystemName: string;
  XroadInstance: string;
  MemberClass: string;
  MemberName: string;
  MemberCode: string;
  Registered: boolean;
  WsdlServices: Array<{ url: string }>;
};

class XroadSubsystems extends constructs.Construct {
  private provider: custom_resources.Provider;

  constructor(
    scope: constructs.Construct,
    id: string,
    props: XroadSubsystemsProps,
  ) {
    super(scope, id);
    const handler = new nodejs.NodejsFunction(
      this,
      "XroadSubsystemCustomResourceHandler",
      {
        entry: path.join(
          __dirname,
          "../lambda/xroad-subsystem-custom-resource/index.ts",
        ),
        bundling: { sourceMap: true },
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.minutes(5),
        vpc: props.vpc,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        environment: {
          XROAD_API_HOST: `${props.primaryNodeHostName}.${props.privateDnsNamespace}`,
          XROAD_API_PORT: `${props.adminUiPort}`,
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
          NODE_OPTIONS: "--enable-source-maps",
        },
      },
    );
    addParametersAndSecretsExtension(this, handler);
    secretsmanager.Secret.fromSecretNameV2(
      this,
      "xroad-api-key",
      "xroad-api-key",
    ).grantRead(handler);
    props.primaryNodeService.connections.allowFrom(
      handler,
      ec2.Port.tcp(props.adminUiPort),
      "Allow access to maintenance API",
    );
    this.provider = new custom_resources.Provider(this, "XroadSubsystem", {
      onEventHandler: handler,
    });
    this.provider.node.addDependency(handler);
  }

  addSubsystem(id: string, properties: SubsystemProps) {
    const customResource = new cdk.CustomResource(this, id, {
      serviceToken: this.provider.serviceToken,
      properties: properties,
    });
    customResource.node.addDependency(this.provider);
  }
}

function addParametersAndSecretsExtension(
  scope: constructs.Construct,
  func: lambda.Function,
) {
  // https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html
  const parametersAndSecretsExtension = lambda.LayerVersion.fromLayerVersionArn(
    scope,
    "ParametersAndSecretsLambdaExtension",
    "arn:aws:lambda:eu-west-1:015030872274:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:11",
  );

  func.addLayers(parametersAndSecretsExtension);
}

const app = new CdkApp();
app.synth();
