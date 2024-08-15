import * as lambda from "aws-lambda";
import * as xroad from "./xroad-api";
import { CloudFormationCustomResourceEventCommon } from "aws-lambda/trigger/cloudformation-custom-resource";

type ResourceProperties =
  CloudFormationCustomResourceEventCommon["ResourceProperties"] & {
    XroadInstance: string;
    MemberClass: string;
    MemberName: string;
    MemberCode: string;
    SubsystemName: string;
    Registered: "true" | "false";
    WsdlServices: Array<{ url: string }>;
  };

exports.handler = async (
  event: lambda.CloudFormationCustomResourceEvent,
  context: lambda.Context,
) => {
  console.log(`Handling event: ${JSON.stringify(event)}`);
  try {
    const props = event.ResourceProperties as ResourceProperties;
    if (event.RequestType === "Delete") {
      const result = await handleDelete(props);
      return await report(event, context, "SUCCESS", result);
    } else if (event.RequestType === "Update") {
      const result = await handleUpdate(props);
      return await report(event, context, "SUCCESS", result);
    } else if (event.RequestType === "Create") {
      const result = await handleCreate(props);
      return await report(event, context, "SUCCESS", result);
    }
  } catch (err) {
    console.log(err);
    throw err;
  }
};

async function handleCreate({
  XroadInstance,
  MemberClass,
  MemberCode,
  MemberName,
  SubsystemName,
  Registered,
  WsdlServices,
}: ResourceProperties) {
  const clientId = `${XroadInstance}:${MemberClass}:${MemberCode}:${SubsystemName}`;
  await xroad.createClient({
    ignore_warnings: false,
    client: {
      member_class: MemberClass,
      member_code: MemberCode,
      member_name: MemberName,
      subsystem_code: SubsystemName,
    },
  });
  if (Registered === "true") {
    await xroad.registerClient(clientId);
  }

  for (const s of WsdlServices) {
    await xroad.addWsdlService(clientId, { url: s.url, type: "WSDL" });
  }
  return await xroad.requireClient(clientId);
}

async function handleUpdate({
  XroadInstance,
  MemberClass,
  MemberCode,
  SubsystemName,
  Registered,
  WsdlServices,
}: ResourceProperties) {
  const clientId = `${XroadInstance}:${MemberClass}:${MemberCode}:${SubsystemName}`;
  const client = await xroad.requireClient(clientId);

  if (client.status === "REGISTERED" && Registered !== "true") {
    await xroad.unregisterClient(clientId);
  } else if (client.status !== "REGISTERED" && Registered === "true") {
    await xroad.registerClient(clientId);
  }

  const services = await xroad.getServices(clientId);
  for (const s of WsdlServices) {
    const found = services.find((_) => _.type === "WSDL" && _.url === s.url);
    if (!found) {
      await xroad.addWsdlService(clientId, { url: s.url, type: "WSDL" });
    }
  }

  const desiredServiceUrls = WsdlServices.map((_) => _.url);
  const servicesToDelete = services.filter(
    (_) => !desiredServiceUrls.includes(_.url),
  );
  for (const s of servicesToDelete) {
    await xroad.deleteService(s.id);
  }

  return await xroad.requireClient(clientId);
}

async function handleDelete(props: ResourceProperties) {
  const clientId = `${props.XroadInstance}:${props.MemberClass}:${props.MemberCode}:${props.SubsystemName}`;
  const client = await xroad.getClient(clientId);
  if (!client) {
    console.log("Client doesn't exist, no need to delete");
  } else if (client) {
    console.log("Client exists");
    if (client.status === "REGISTERED") {
      console.log(`Unregistering client ${clientId}`);
      await xroad.unregisterClient(clientId);
    }
    console.log(`Deleting client ${clientId}`);
    await xroad.deleteClient(clientId);
  }
  return {};
}

async function report(
  event: lambda.CloudFormationCustomResourceEvent,
  context: lambda.Context,
  responseStatus: "SUCCESS" | "FAILED",
  responseData?: object,
): Promise<void> {
  const body = JSON.stringify({
    Status: responseStatus,
    Reason:
      "See the details in CloudWatch Log Stream: " + context.logStreamName,
    PhysicalResourceId: context.logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData,
  });
  console.log(`Sending response: ${body}`);
  const response = await fetch(event.ResponseURL, { method: "PUT", body });
  if (response.status >= 400) {
    throw new Error(
      `Server returned error ${response.status}: ${response.statusText}`,
    );
  }
}
