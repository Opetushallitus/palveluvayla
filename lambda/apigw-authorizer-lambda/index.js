"use strict";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const client = new SSMClient();

const getApikeys = async () => {
  const response = await client.send(
    new GetParameterCommand({
      Names: "/lambda/apikeys",
      WithDecryption: true,
    })
  );
  return JSON.parse(response.Parameter.Value);
};

const getIsAuthorized = (request, apiKeys) => {
  const headers = request.headers;
  const callerId = headers.CALLER_ID;
  const apiKey = headers.API_KEY;
  return !!callerId && !!apiKey && apiKeys[callerId] === apiKey;
};

export const handler = async (event) => {
  const request = event.Records[0].cf.request;
  const apiKeys = await getApikeys();
  const isAuthorized = getIsAuthorized(request, apiKeys);
  return { isAuthorized };
};
