import * as lambda from "aws-lambda"

const albHostName = process.env["ALB_HOST_NAME"];
const twenttyFiveSecondsInMilliseconds = 25 * 1000;

exports.handler = async (event: lambda.APIGatewayProxyEventV2): Promise<lambda.APIGatewayProxyResultV2> => {
  const url = `https://${albHostName}${event.requestContext.http.path}`;
  return fetch(url, {
    signal: AbortSignal.timeout(twenttyFiveSecondsInMilliseconds),
    method: event.requestContext.http.method,
    headers: {
      "x-road-client": requireHeader(event, "x-road-client"),
      "content-type": requireHeader(event, "content-type"),
      authorization: requireHeader(event, "x-authorization"),
    },
    body: event.body,
  })
    .then(async (r) => {
      const headers = headersToObject(r);
      const body = await r.text();
      return {
        statusCode: r.status,
        headers: headers,
        body: body,
        isBase64Encoded: false,
      };
    })
    .catch((e) => {
      console.error(e);
      return {
        statusCode: 500,
        body: JSON.stringify(e),
      };
    });
};


function requireHeader(event: lambda.APIGatewayProxyEventV2, header: string): string {
  const value = event.headers[header]
  if (value === undefined) throw new Error(`Missing ${header} header`)
  return value
}

function headersToObject(r: Response) {
  const headers: [string, string][] = [];
  r.headers.forEach((value, key) => {
    headers.push([key, value]);
  });
  return Object.fromEntries(headers);
}
