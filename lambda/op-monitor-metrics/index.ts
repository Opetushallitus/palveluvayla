import { Client } from "pg";
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";

const METRIC_NAMESPACE = "OpMonitor";
const METRIC_NAME = "Requests";
const ROW_LIMIT = 10000;
const NONE = "none";
const UNKNOWN = "unknown";
const DB_NAME = "op-monitor";
const DB_TABLE = "opmonitor.operational_data";

const watermarkParameterName = process.env.WATERMARK_PARAMETER_NAME!;
const dbSecretId = process.env.DB_SECRET_ID!;
const targetFaultCode = process.env.TARGET_FAULT_CODE!;

const ssm = new SSMClient();

type Row = {
  id: string;
  soap_fault_code: string | null;
  soap_fault_string: string | null;
  client_subsystem_code: string | null;
  succeeded: boolean | null;
};

type Key = {
  fault_code: string;
  fault_string: string;
  client_subsystem_code: string;
  succeeded: string;
};

exports.handler = async (): Promise<void> => {
  const { host, port, username, password } = await readDbCredentials();
  const client = new Client({
    host,
    port,
    database: DB_NAME,
    user: username,
    password,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const lastId = await readWatermark();
    if (BigInt(lastId) <= 0n) {
      throw new Error(
        `Watermark ${watermarkParameterName} must be a positive op_monitor_data.id; got ${lastId}. Set it to MAX(id) of op_monitor_data before enabling the Lambda.`,
      );
    }

    const rows = await fetchRows(client, lastId);
    if (rows.length === 0) {
      console.log(`No new rows since id=${lastId}.`);
      return;
    }

    const counts = new Map<string, { key: Key; count: number }>();
    let maxId = BigInt(lastId);
    for (const row of rows) {
      const key: Key = {
        fault_code: row.soap_fault_code?.trim() || NONE,
        fault_string: row.soap_fault_string?.trim() || NONE,
        client_subsystem_code: row.client_subsystem_code?.trim() || UNKNOWN,
        succeeded: row.succeeded === null ? UNKNOWN : String(row.succeeded),
      };
      if (key.fault_code === targetFaultCode) {
        console.log(
          `Target fault detected: ${JSON.stringify({
            id: row.id,
            fault_string: key.fault_string,
            client_subsystem_code: key.client_subsystem_code,
          })}`,
        );
      }
      const mapKey = [
        key.fault_code,
        key.fault_string,
        key.client_subsystem_code,
        key.succeeded,
      ].join("|");
      const existing = counts.get(mapKey);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(mapKey, { key, count: 1 });
      }
      const rowId = BigInt(row.id);
      if (rowId > maxId) maxId = rowId;
    }

    emitMetrics([...counts.values()]);
    await writeWatermark(maxId.toString());
    console.log(
      `Emitted ${counts.size} datapoint(s) from ${rows.length} row(s); new watermark id=${maxId}.`,
    );
  } finally {
    await client.end();
  }
};

async function fetchRows(client: Client, lastId: string): Promise<Row[]> {
  const result = await client.query<Row>(
    `SELECT id, fault_code, fault_string, client_subsystem_code, succeeded
       FROM ${DB_TABLE}
      WHERE id > $1
      ORDER BY id ASC
      LIMIT ${ROW_LIMIT}`,
    [lastId],
  );
  return result.rows;
}

async function readWatermark(): Promise<string> {
  const out = await ssm.send(
    new GetParameterCommand({ Name: watermarkParameterName }),
  );
  return out.Parameter?.Value ?? "0";
}

async function writeWatermark(value: string): Promise<void> {
  await ssm.send(
    new PutParameterCommand({
      Name: watermarkParameterName,
      Value: value,
      Type: "String",
      Overwrite: true,
    }),
  );
}

async function readDbCredentials(): Promise<{
  host: string;
  port: number;
  username: string;
  password: string;
}> {
  // https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html
  const secretsExtensionHttpPort = 2773;
  const url = `http://localhost:${secretsExtensionHttpPort}/secretsmanager/get?secretId=${dbSecretId}&withDecryption=true`;
  const response = await fetch(url, {
    headers: {
      "X-Aws-Parameters-Secrets-Token": process.env.AWS_SESSION_TOKEN!,
    },
  });
  const body = (await response.json()) as { SecretString: string };
  const parsed = JSON.parse(body.SecretString);
  return {
    host: parsed.host,
    port: Number(parsed.port),
    username: parsed.username,
    password: parsed.password,
  };
}

function emitMetrics(entries: Array<{ key: Key; count: number }>): void {
  const timestamp = Date.now();
  for (const { key, count } of entries) {
    const emf = {
      _aws: {
        Timestamp: timestamp,
        CloudWatchMetrics: [
          {
            Namespace: METRIC_NAMESPACE,
            Dimensions: [
              ["fault_code", "fault_string", "client_subsystem_code", "succeeded"],
              ["fault_code"],
            ],
            Metrics: [{ Name: METRIC_NAME, Unit: "Count" }],
          },
        ],
      },
      fault_code: key.fault_code,
      fault_string: key.fault_string,
      client_subsystem_code: key.client_subsystem_code,
      succeeded: key.succeeded,
      [METRIC_NAME]: count,
    };
    console.log(JSON.stringify(emf));
  }
}
