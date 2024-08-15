const host: string = process.env.XROAD_API_HOST!;
const port: string = process.env.XROAD_API_PORT!;
const baseUrl = `https://${host}:${port}/api`;

type ClientAdd = {
  client: {
    member_class: string;
    member_code: string;
    member_name: string;
    subsystem_code?: string;
    connection_type?: ConnectionType;
  };
  ignore_warnings?: boolean;
};

export async function createClient(client: ClientAdd): Promise<Client> {
  console.log("Creating client", client.client.subsystem_code);
  const { status, body } = await callApi("POST", "/v1/clients", client);
  if (status != 201) {
    throw new Error("Failed to create client");
  }
  return body;
}

export async function registerClient(id: string): Promise<void> {
  console.log(`Registering client ${id}`);
  const { status } = await callApi(
    "PUT",
    `/v1/clients/${encodeURIComponent(id)}/register`,
    {},
  );
  if (status != 204) {
    throw new Error("Failed to register client");
  }

  while (true) {
    console.log(`Waiting for client ${id} to be registered`);
    const client = await requireClient(id);
    if (client.status === "REGISTERED") {
      console.log(`Client ${id} registered`);
      return;
    } else {
      await sleep(10000);
    }
  }
}

type ConnectionType = "HTTP" | "HTTPS" | "HTTPS_NO_AUTH";
type ClientStatus =
  | "REGISTERED"
  | "SAVED"
  | "GLOBAL_ERROR"
  | "REGISTRATION_IN_PROGRESS"
  | "DELETION_IN_PROGRESS";
type Client = {
  id: string;
  instance_id: string;
  member_name: string;
  member_class: string;
  member_code: string;
  subsystem_code: string;
  owner: boolean;
  has_valid_local_sign_cert: boolean;
  connection_type: ConnectionType;
  status: ClientStatus;
};

export async function getClient(id: string): Promise<Client | undefined> {
  const { status, body } = await callApi(
    "GET",
    `/v1/clients/${encodeURIComponent(id)}`,
  );
  if (status == 200) {
    return body;
  } else if (status == 404) {
    return undefined;
  } else {
    throw new Error("Failed to get client");
  }
}

export async function requireClient(id: string): Promise<Client> {
  const client = await getClient(id);
  if (!client) {
    throw new Error("Client not found");
  }
  return client;
}

export async function unregisterClient(id: string): Promise<void> {
  console.log(`Unregistering client ${id}`);
  const { status } = await callApi(
    "PUT",
    `/v1/clients/${encodeURIComponent(id)}/unregister`,
    {},
  );
  if (status != 204) {
    throw new Error("Failed to unregister client");
  }

  while (true) {
    console.log(`Waiting for client ${id} to be registered`);
    const client = await requireClient(id);
    if (client.status === "DELETION_IN_PROGRESS") {
      console.log(`Client ${id} unregistered`);
      await sleep(10000);
      return;
    } else {
      await sleep(10000);
    }
  }
}

export type ServiceDescription = {
  url: string;
  type: "WSDL";
};
export type ServiceResponse = {
  id: string;
  url: string;
  type: "WSDL";
  disabled: boolean;
  disabled_notice: string;
  refreshed_at: string;
  services: Array<{
    id: string;
    full_service_code: string;
    service_code: string;
    timeout: number;
    ssl_auth: boolean;
    url: string;
    endpoints: Array<{
      id: string;
      service_code: string;
      method: string;
      path: string;
      generated: boolean;
    }>;
  }>;
  client_id: string;
};

export async function getServices(
  clientId: string,
): Promise<ServiceResponse[]> {
  const { status, body } = await callApi(
    "GET",
    `/v1/clients/${encodeURIComponent(clientId)}/service-descriptions`,
  );
  if (status != 200) {
    throw new Error("Failed to get services");
  }
  return body;
}
export async function addWsdlService(
  clientId: string,
  serviceDescription: ServiceDescription,
): Promise<ServiceResponse> {
  const { status, body } = await callApi(
    "POST",
    `/v1/clients/${encodeURIComponent(clientId)}/service-descriptions`,
    serviceDescription,
  );
  if (status !== 201) {
    throw new Error("Failed to add service description");
  }
  console.log("Service added", body);
  await enableService(body.id);
  return body;
}

export async function deleteService(serviceId: string) {
  const { status } = await callApi(
    "DELETE",
    `/v1/service-descriptions/${serviceId}`,
  );
  if (status != 204) {
    throw new Error("Failed to delete service");
  }
}

export async function enableService(serviceId: string) {
  const { status } = await callApi(
    "PUT",
    `/v1/service-descriptions/${serviceId}/enable`,
    {},
  );
  if (status !== 200) {
    throw new Error("Failed to enable service");
  }
}

export async function deleteClient(id: string): Promise<void> {
  await callApi("DELETE", `/v1/clients/${encodeURIComponent(id)}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callApi<T = any>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  requestBody?: any,
): Promise<{ status: number; body?: T }> {
  const url = baseUrl + path;
  console.log(method, url, JSON.stringify(requestBody));
  let options: RequestInit = {
    method: method,
    headers: await authHeaders(),
  };
  if (typeof requestBody !== "undefined") {
    options.headers = {
      ...options.headers,
      "Content-Type": "application/json",
    };
    options.body = JSON.stringify(requestBody);
  }
  const response = await fetch(url, options);
  const responseBody = await response.text();
  console.log(
    `Response from ${method} ${url} ${response.status} ${options.body} ${responseBody}`,
  );

  if (response.headers.get("content-type") === "application/json") {
    return { status: response.status, body: JSON.parse(responseBody) };
  } else {
    return { status: response.status };
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const apiKey = await getSecret("xroad-api-key");
  const authorization = `X-Road-ApiKey token=${apiKey}`;
  return {
    Authorization: authorization,
  };
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
