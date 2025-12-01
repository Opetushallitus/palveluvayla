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
  env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  };
  deploymentstack = new DeploymentStack(this, "DeploymentStack", {
    env: this.env,
  });
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

    const devDeploymentPipeline = new DeploymentPipelineStack(
      this,
      "DevDeploymentPipeline",
      connection,
      "dev",
      { owner: "Opetushallitus", name: "palveluvayla", branch: "main" },
      props,
    );
    const qaDeploymentPipeline = new DeploymentPipelineStack(
      this,
      "QaDeploymentPipeline",
      connection,
      "qa",
      { owner: "Opetushallitus", name: "palveluvayla", branch: "x-road-7.7.0" },
      props,
    );
    const prodDeploymentPipeline = new DeploymentPipelineStack(
      this,
      "ProdDeploymentPipeline",
      connection,
      "prod",
      { owner: "Opetushallitus", name: "palveluvayla", branch: "green-dev" },
      props,
    );

    const radiatorAccountId = "905418271050"
    const radiatorReader = new iam.Role(this, "RadiatorReaderRole", {
      assumedBy: new iam.AccountPrincipal(radiatorAccountId),
      roleName: "RadiatorReader",
    })
    radiatorReader.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodePipeline_ReadOnlyAccess"))
  }
}

type Repository = {
  owner: string;
  name: string;
  branch: string;
};

class DeploymentPipelineStack extends cdk.Stack {
  constructor(
    scope: constructs.Construct,
    id: string,
    connection: codestarconnections.CfnConnection,
    env: string,
    repository: Repository,
    props?: cdk.StackProps,
  ) {
    super(scope, id, props);
    const capitalizedEnv = env.charAt(0).toUpperCase() + env.slice(1);
    const pipeline = new codepipeline.Pipeline(
      this,
      `Deploy${capitalizedEnv}Pipeline`,
      {
        pipelineName: `Deploy${capitalizedEnv}`,
        pipelineType: codepipeline.PipelineType.V1,
      },
    );
    cdk.Tags.of(pipeline).add(
      "Repository",
      `${repository.owner}/${repository.name}`,
      { includeResourceTypes: ["AWS::CodePipeline::Pipeline"] },
    );
    cdk.Tags.of(pipeline).add("FromBranch", repository.branch, {
      includeResourceTypes: ["AWS::CodePipeline::Pipeline"],
    });
    cdk.Tags.of(pipeline).add("ToBranch", `green-${env}`, {
      includeResourceTypes: ["AWS::CodePipeline::Pipeline"],
    });
    const sourceOutput = new codepipeline.Artifact();
    const sourceAction =
      new codepipeline_actions.CodeStarConnectionsSourceAction({
        actionName: "Source",
        connectionArn: connection.attrConnectionArn,
        codeBuildCloneOutput: true,
        owner: repository.owner,
        repo: repository.name,
        branch: repository.branch,
        output: sourceOutput,
        triggerOnPush: env === "dev" || env === "qa",
      });
    const sourceStage = pipeline.addStage({ stageName: "Source" });
    sourceStage.addAction(sourceAction);
    const deployProject = new codebuild.PipelineProject(
      this,
      `Deploy${capitalizedEnv}Project`,
      {
        projectName: `Deploy${capitalizedEnv}`,
        concurrentBuildLimit: 1,
        environment: {
          buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
          computeType: codebuild.ComputeType.SMALL,
          privileged: true,
        },
        environmentVariables: {
          CDK_DEPLOY_TARGET_ACCOUNT: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: `/env/${env}/account_id`,
          },
          CDK_DEPLOY_TARGET_REGION: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: `/env/${env}/region`,
          },
          SLACK_NOTIFICATIONS_CHANNEL_WEBHOOK_URL: {
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
            value: `/env/${env}/slack-notifications-channel-webhook`,
          },
          GITHUB_DEPLOYMENT_KEY: {
            type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
            value: "/github/deployment_key",
          },
          DOCKER_USERNAME: {
            type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
            value: `/docker/credentials/${env}:username`,
          },
          DOCKER_PASSWORD: {
            type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
            value: `/docker/credentials/${env}:password`,
          },
        },

        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          env: {
            "git-credential-helper": "yes",
          },
          phases: {
            install: {
              "runtime-versions": {
                nodejs: "22",
              },
            },
            pre_build: {
              commands: [
                "sudo yum install -y perl-Digest-SHA", // for shasum command
              ],
            },
            build: {
              commands: [
                `./deploy-${env}.sh && ./tag-green-build-${env}.sh && ./scripts/ci/publish-release-notes-${env}.sh`
              ],
            },
          },
        }),
      }
    );

    const deploymentTargetAccount = ssm.StringParameter.valueFromLookup(
      this,
      `/env/${env}/account_id`
    );
    const deploymentTargetRegion = ssm.StringParameter.valueFromLookup(
      this,
      `/env/${env}/region`
    );

    deployProject.role?.attachInlinePolicy(
      new iam.Policy(this, `Deploy${capitalizedEnv}Policy`, {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["sts:AssumeRole"],
            resources: [
              `arn:aws:iam::${deploymentTargetAccount}:role/cdk-hnb659fds-lookup-role-${deploymentTargetAccount}-${deploymentTargetRegion}`,
              `arn:aws:iam::${deploymentTargetAccount}:role/cdk-hnb659fds-file-publishing-role-${deploymentTargetAccount}-${deploymentTargetRegion}`,
              `arn:aws:iam::${deploymentTargetAccount}:role/cdk-hnb659fds-image-publishing-role-${deploymentTargetAccount}-${deploymentTargetRegion}`,
              `arn:aws:iam::${deploymentTargetAccount}:role/cdk-hnb659fds-deploy-role-${deploymentTargetAccount}-${deploymentTargetRegion}`,
            ],
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
