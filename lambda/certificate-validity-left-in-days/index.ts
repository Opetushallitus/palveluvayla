import * as xroad from "./xroad-types";

const host: string = process.env.XROAD_API_HOST!;
const port: string = process.env.XROAD_API_PORT!;
const url = `https://${host}:${port}/api/v1/tokens`;

exports.handler = async () => {
  return fetchTokens()
    .then((tokens) =>
      tokens.map(toCertificatesWithLongestValidDaysLeft).flat()
    )
    .then((items) =>
      items.forEach((item) => console.log(JSON.stringify(item)))
    );
};

async function fetchTokens(): Promise<xroad.Token[]> {
    const apiKey = await getSecret("xroad-api-key");
    const authorization = `X-Road-ApiKey token=${apiKey}`;
    const response = await fetch(url, {
        headers: {
            Authorization: authorization,
        },
    })
    const tokens: xroad.Token[] = await response.json()
    console.log(`Got tokens from security server: ${JSON.stringify(tokens, null, 2)}`)
    return tokens
}

function toValidDaysLeft(certificate: xroad.TokenCertificate) {
  const now = Date.now();
  const notValidBeforeInMillis = Date.parse(
    certificate.certificate_details.not_before
  );
  const notValidAfterInMillis = Date.parse(
    certificate.certificate_details.not_after
  );
  const validMillisLeft =
    notValidBeforeInMillis > now ? 0 : notValidAfterInMillis - now;
  const validDaysLeft = Math.floor(validMillisLeft / 1000 / 60 / 60 / 24);

  return validDaysLeft > 0 ? validDaysLeft : 0;
}

function inDescendingOrder(a: number, b: number): number {
  return b - a;
}

function longestValidityTimeOfAnUsableCertifcate(key: xroad.Key): number {
  const sorted = key.certificates
    .filter(isUsableCertificate)
    .map(toValidDaysLeft)
    .sort(inDescendingOrder);
  return sorted.length > 0 ? sorted[0] : 0;
}

function isUsableCertificate(certificate: xroad.TokenCertificate): boolean {
    return certificate.status === "REGISTERED" && certificate.ocsp_status === "OCSP_RESPONSE_GOOD";
}

function extracted(token: xroad.Token) {
  return (key: xroad.Key) => ({
    token: token.name,
    label: key.label,
    validDaysLeft: longestValidityTimeOfAnUsableCertifcate(key),
  });
}

function toCertificatesWithLongestValidDaysLeft(token: xroad.Token) {
  return token.keys.map(extracted(token));
}

async function getSecret(secretId: string): Promise<string> {
  // https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html
  const secretsExtensionHttpPort = 2773;
  const secretsExtensionEdpoint = `http://localhost:${secretsExtensionHttpPort}/secretsmanager/get?secretId=${secretId}&withDecryption=true`;
  const response = await fetch(secretsExtensionEdpoint, {
    headers: {
      "X-Aws-Parameters-Secrets-Token": process.env.AWS_SESSION_TOKEN!,
    },
  });

  return response.json().then((j) => j.SecretString);
}
