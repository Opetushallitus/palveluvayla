"use strict";
const albHostName = process.env["ALB_HOST_NAME"];
const twenttyFiveSecondsInMilliseconds = 25 * 1000;

exports.handler = async (event) => {
  const url = `https://${albHostName}${event.requestContext.http.path}`;
  return fetch(url, {
    signal: AbortSignal.timeout(twenttyFiveSecondsInMilliseconds),
    method: event.requestContext.http.method,
    headers: {
      "x-road-client": event.headers["x-road-client"],
      "content-type": event.headers["content-type"],
      authorization: event.headers["x-authorization"],
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

function headersToObject(r) {
  const headers = [];
  r.headers.forEach((value, key) => {
    headers.push([key, value]);
  });
  return Object.fromEntries(headers);
}
