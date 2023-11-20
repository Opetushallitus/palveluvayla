import {
  IAMClient,
  Policy,
  GetPolicyCommand,
  CreatePolicyCommand,
  ListPolicyVersionsCommand,
  CreatePolicyVersionCommand,
  DeletePolicyVersionCommand,
} from "@aws-sdk/client-iam";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

const PolicyName = "CDKDeploymentTargetPermissions";
const PolicyDocument = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: ["ec2:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["ecs:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["logs:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["rds:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["ssm:GetParameter", "ssm:GetParameters"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["secretsmanager:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["elasticloadbalancing:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["apigateway:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["acm:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["route53:*"],
      Resource: "*",
    },
    {
      Effect: "Allow",
      Action: ["iam:GetRole", "iam:PassRole"],
      Resource: "*",
    },
  ],
});

function main() {
  buildPolicyArn().then(updatePolicy);
}
function buildPolicyArn() {
  return new STSClient({})
    .send(new GetCallerIdentityCommand({}))
    .then((_) => `arn:aws:iam::${_.Account}:policy/${PolicyName}`);
}
function updatePolicy(PolicyArn: string) {
  const iamClient = new IAMClient({});
  return getOrCreatePolicy(iamClient, PolicyArn)
    .then(deleteUnusedPolicyVersions(iamClient, PolicyArn))
    .then(createNewDefaultPolicyVersion(iamClient, PolicyArn));
}

function getOrCreatePolicy(iamClient: IAMClient, PolicyArn: string) {
  console.log(`Getting policy ${PolicyArn}`);
  return iamClient
    .send(
      new GetPolicyCommand({
        PolicyArn,
      })
    )
    .then((_) => {
      console.log(`Found policy ${PolicyArn}`);
      return _.Policy;
    })
    .catch((error) => {
      if (error.name === "NoSuchEntityException") {
        console.log(`Policy ${PolicyArn} no found`);
        return createPolicy(iamClient);
      } else {
        throw error;
      }
    });
}

function createPolicy(iamClient: IAMClient) {
  console.log("Creating new Policy");
  return iamClient
    .send(
      new CreatePolicyCommand({
        PolicyName,
        PolicyDocument,
      })
    )
    .then((data) => {
      console.log(`Created policy ${data.Policy?.Arn}`);
      return data.Policy;
    });
}

function deleteUnusedPolicyVersions(iamClient: IAMClient, PolicyArn: string) {
  return (policy?: Policy) => {
    console.log(`Deleting unused versions of ${PolicyArn}`);
    const defaultVersionId = policy?.DefaultVersionId;
    return iamClient
      .send(new ListPolicyVersionsCommand({ PolicyArn }))
      .then((data) => {
        if (!data.Versions) {
          return Promise.resolve([]);
        } else {
          return Promise.all(
            data.Versions.map((version) => {
              if (version.VersionId != defaultVersionId) {
                console.log(
                  `Deleting unused version ${version.VersionId} of ${PolicyArn}`
                );
                const command = new DeletePolicyVersionCommand({
                  PolicyArn,
                  VersionId: version.VersionId,
                });
                return iamClient.send(command).then((_) => Promise.resolve({}));
              } else {
                return Promise.resolve({});
              }
            })
          );
        }
      });
  };
}

function createNewDefaultPolicyVersion(
  iamClient: IAMClient,
  PolicyArn: string
) {
  return () => {
    console.log(`Creating new default version of ${PolicyArn}`);
    iamClient.send(
      new CreatePolicyVersionCommand({
        PolicyArn,
        PolicyDocument,
        SetAsDefault: true,
      })
    );
  };
}

main();
