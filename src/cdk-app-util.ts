import * as codestarconnections from "aws-cdk-lib/aws-codestarconnections";
import * as cdk from "aws-cdk-lib";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as codepipeline_actions from "aws-cdk-lib/aws-codepipeline-actions";
import * as constructs from "constructs";

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
        owner: "Opetushallitus",
        repo: "palveluvayla",
        branch: "main",
        output: sourceOutput,
      });
    const sourceStage = pipeline.addStage({ stageName: "Source" });
    sourceStage.addAction(sourceAction);
    const buildAction = new codepipeline_actions.CodeBuildAction({
      actionName: "Deploy",
      input: sourceOutput,
      project: new codebuild.PipelineProject(this, "DeployDevProject", {
        projectName: "DeployDev",
        concurrentBuildLimit: 1,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
          computeType: codebuild.ComputeType.SMALL,
        },
      }),
    });
    const buildStage = pipeline.addStage({ stageName: "Deploy" });
    buildStage.addAction(buildAction);
  }
}

const app = new CdkAppUtil({});
app.synth();
