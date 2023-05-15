import * as cdk from "aws-cdk-lib";
import * as constructs from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

class CdkApp extends cdk.App {
  constructor(props: cdk.AppProps) {
    super(props);
    new XroadSecurityServerStack(this, "XroadSecurityServerStack", {});
  }
}

class XroadSecurityServerStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const inIpAddress = new ec2.CfnEIP(this, "InIpAddress", {});
    const outIpAddress = new ec2.CfnEIP(this, "OutIpAddress", {});
  }
}

const app = new CdkApp({});
app.synth();
