const host = process.env.XROAD_API_HOST;
const port = process.env.XROAD_API_PORT;
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

async function fetchTokens() {
    const apiKey = await getSecret("xroad-api-key");
    const authorization = `X-Road-ApiKey token=${apiKey}`;
    const response = await fetch(url, {
        headers: {
            Authorization: authorization,
        },
    })
    const tokens = await response.json()
    console.log(`Got tokens from security server: ${JSON.stringify(tokens, null, 2)}`)
    return tokens
}

function toValidDaysLeft(certificate) {
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

function inDescendingOrder(a, b) {
  return b - a;
}

function isRegistered(certificate) {
  return certificate.status === "REGISTERED";
}

function longestValidityTimeOfARegisteredCertifcate(key) {
  const sorted = key.certificates
    .filter(isRegistered)
    .map(toValidDaysLeft)
    .sort(inDescendingOrder);
  return sorted.length > 0 ? sorted[0] : 0;
}

function extracted(token) {
  return (key) => ({
    token: token.name,
    label: key.label,
    validDaysLeft: longestValidityTimeOfARegisteredCertifcate(key),
  });
}

function toCertificatesWithLongestValidDaysLeft(token) {
  return token.keys.map(extracted(token));
}

async function getSecret(secretId) {
  // https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html
  const secretsExtensionHttpPort = 2773;
  const secretsExtensionEdpoint = `http://localhost:${secretsExtensionHttpPort}/secretsmanager/get?secretId=${secretId}&withDecryption=true`;
  const response = await fetch(secretsExtensionEdpoint, {
    headers: {
      "X-Aws-Parameters-Secrets-Token": process.env.AWS_SESSION_TOKEN,
    },
  });

  return response.json().then((j) => j.SecretString);
}
