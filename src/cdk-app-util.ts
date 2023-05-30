import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";
import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as constructs from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";

class CdkAppUtil extends cdk.App {
  constructor(props: cdk.AppProps) {
    super(props);
  }
  deploymentstack = new DeploymentStack(this, "DeploymentStack");
}

class DeploymentStack extends cdk.Stack {
  constructor(scope: constructs.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const connection = new codestarconnections.CfnConnection(
      this,
      "GithubConnection",
      {
        connectionName: "GithubConnection",
        providerType: "GitHub",
      }
    );
    const pipeline = new codepipeline.Pipeline(this, "DeployDevPipeline", {
      pipelineName: "DeployDev",
    });
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction =
      new codepipeline_actions.CodeStarConnectionsSourceAction({
        actionName: "Source",
        connectionArn: connection.attrConnectionArn,
        codeBuildCloneOutput: true,
        owner: "Opetushallitus",
        repo: "palveluvayla",
        branch: "main",
        output: sourceOutput,
      });
    const sourceStage = pipeline.addStage({ stageName: "Source" });
    sourceStage.addAction(sourceAction);
    const deployProject = new codebuild.PipelineProject(
      this,
      "DeployDevProject",
      {
        projectName: "DeployDev",
        concurrentBuildLimit: 1,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
        },
        environmentVariables: {
          CDK_DEFAULT_ACCOUNT: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: "/env/dev/account_id",
          },
          CDK_DEFAULT_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: "/env/dev/region",
          },
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          phases: {
            build: {
              commands: ["./deploy-dev.sh"],
            },
          },
        }),
      }
    );

    deployProject.role?.attachInlinePolicy(
      new iam.Policy(this, "DeployDevPolicy", {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [`arn:aws:iam::*:role/cdk-*-lookup-role-*`],
          }),
        ],
      })
    );
    const deployAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Deploy",
      input: sourceOutput,
      project: deployProject,
    });
    const deployStage = pipeline.addStage({ stageName: "Deploy" });
    deployStage.addAction(deployAction);
  }
}

const app = new CdkAppUtil({});
app.synth();
