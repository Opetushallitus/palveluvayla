"use strict";
const albHostName = process.env["ALB_HOST_NAME"];
const thirtyFiveSecondsInMilliseconds = 35 * 1000;

exports.handler = async (event) => {
  console.log(JSON.stringify(event));
  const { "x-amz-security-token": foo, ...headers } = event.headers;

  return fetch(`https://${albHostName}${event.requestContext.http.path}`, {
    signal: AbortSignal.timeout(thirtyFiveSecondsInMilliseconds),
    method: event.requestContext.http.method,
    headers: {
      "x-road-client": even.headers["x-road-client"],
      "content-type": event.headers["content-type"],
      authorization: event.headers["x-authentication"],
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
      };
    });
};

function headersToObject(r) {
  const headers = [];
  r.headers.forEach((value, key) => {
    headers.push([key, value]);
  });
  return Object.fromEntries(headers);
}
