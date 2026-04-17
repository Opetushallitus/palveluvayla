import * as xroad from "./xroad-types";

const host: string = process.env.XROAD_API_HOST!;
const port: string = process.env.XROAD_API_PORT!;
const url = `https://${host}:${port}/api/v1/tokens`;

const USAGES: xroad.Key["usage"][] = ["AUTHENTICATION", "SIGNING"];

exports.handler = async () => {
  const tokens = await fetchTokens();
  tokens
    .flatMap(toValidDaysLeftPerUsage)
    .forEach((item) => console.log(JSON.stringify(item)));
};

async function fetchTokens(): Promise<xroad.Token[]> {
  const apiKey = await getSecret("xroad-api-key");
  const authorization = `X-Road-ApiKey token=${apiKey}`;
  const response = await fetch(url, {
    headers: {
      Authorization: authorization,
    },
  });
  const tokens: xroad.Token[] = await response.json();
  console.log(
    `Got tokens from security server: ${JSON.stringify(tokens, null, 2)}`
  );
  return tokens;
}

function toValidDaysLeft(certificate: xroad.TokenCertificate): number {
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

function isUsableCertificate(certificate: xroad.TokenCertificate): boolean {
  return (
    certificate.status === "REGISTERED" &&
    certificate.ocsp_status === "OCSP_RESPONSE_GOOD"
  );
}

function longestValidDaysLeftAcrossKeys(keys: xroad.Key[]): number {
  const days = keys
    .flatMap((k) => k.certificates)
    .filter(isUsableCertificate)
    .map(toValidDaysLeft);
  return days.length > 0 ? Math.max(...days) : 0;
}

function toValidDaysLeftPerUsage(token: xroad.Token) {
  return USAGES.map((usage) => ({
    token: token.name,
    usage,
    validDaysLeft: longestValidDaysLeftAcrossKeys(
      token.keys.filter((k) => k.usage === usage)
    ),
  }));
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
