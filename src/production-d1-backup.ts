export const PRODUCTION_D1_BACKUP_CRON = "0 16 * * *";
export const PRODUCTION_D1_BACKUP_RETENTION_DAYS = 365;
export const PRODUCTION_D1_BACKUP_PREFIX = "production-d1/";

interface BackupDatabaseEnv {
  DB: D1Database;
}

export interface ProductionD1BackupEnv extends BackupDatabaseEnv {
  BACKUP_KV: KVNamespace;
}

export interface ProductionD1BackupTable {
  name: string;
  schema: string | null;
  rows: Array<Record<string, unknown>>;
}

export interface ProductionD1BackupPayload {
  format: "jinji.production-d1-backup.v1";
  databaseName: string;
  capturedAt: string;
  tables: ProductionD1BackupTable[];
  integrity: {
    algorithm: "SHA-256";
    canonicalPayloadSha256: string;
  };
}

export interface ProductionD1BackupResult {
  objectKey: string;
  latestKey: string;
  sha256: string;
  byteLength: number;
  tableCount: number;
  rowCount: number;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return { __type: "blob", hex: Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("") };
  }
  if (ArrayBuffer.isView(value)) {
    return { __type: "blob", hex: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength), (byte) => byte.toString(16).padStart(2, "0")).join("") };
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeValue(nested)]),
    );
  }
  return String(value);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function captureProductionD1Backup(
  env: BackupDatabaseEnv,
  capturedAt = new Date(),
  databaseName = "chicken-line-production",
): Promise<ProductionD1BackupPayload> {
  const schema = await env.DB.prepare(
    `SELECT name, sql
       FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  ).all<{ name: string; sql: string | null }>();

  const tables: ProductionD1BackupTable[] = [];
  for (const table of schema.results) {
    const rows = await env.DB.prepare(`SELECT * FROM ${quoteIdentifier(table.name)}`).all<Record<string, unknown>>();
    tables.push({
      name: table.name,
      schema: table.sql,
      rows: rows.results.map((row) => normalizeValue(row) as Record<string, unknown>),
    });
  }

  const payloadWithoutIntegrity = {
    format: "jinji.production-d1-backup.v1" as const,
    databaseName,
    capturedAt: capturedAt.toISOString(),
    tables,
  };
  const canonicalPayloadSha256 = await sha256Hex(canonicalJson(payloadWithoutIntegrity));
  return {
    ...payloadWithoutIntegrity,
    integrity: {
      algorithm: "SHA-256",
      canonicalPayloadSha256,
    },
  };
}

export async function verifyProductionD1Backup(payload: ProductionD1BackupPayload): Promise<boolean> {
  const { integrity: _integrity, ...payloadWithoutIntegrity } = payload;
  return payload.integrity.algorithm === "SHA-256"
    && payload.integrity.canonicalPayloadSha256 === await sha256Hex(canonicalJson(payloadWithoutIntegrity));
}

export async function runProductionD1Backup(
  env: ProductionD1BackupEnv,
  scheduledAt = new Date(),
): Promise<ProductionD1BackupResult> {
  const payload = await captureProductionD1Backup(env, scheduledAt);
  const body = canonicalJson(payload);
  const datePart = scheduledAt.toISOString().slice(0, 10);
  const objectPart = scheduledAt.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(/[-:]/g, "");
  const objectKey = `${PRODUCTION_D1_BACKUP_PREFIX}${datePart}/${objectPart}.json`;
  const latestKey = `${PRODUCTION_D1_BACKUP_PREFIX}latest.json`;
  const metadata = {
      format: payload.format,
      capturedAt: payload.capturedAt,
      canonicalPayloadSha256: payload.integrity.canonicalPayloadSha256,
  };
  const options: KVNamespacePutOptions = {
    expirationTtl: PRODUCTION_D1_BACKUP_RETENTION_DAYS * 24 * 60 * 60,
    metadata,
  };
  await env.BACKUP_KV.put(objectKey, body, options);
  await env.BACKUP_KV.put(latestKey, body, options);
  return {
    objectKey,
    latestKey,
    sha256: payload.integrity.canonicalPayloadSha256,
    byteLength: new TextEncoder().encode(body).byteLength,
    tableCount: payload.tables.length,
    rowCount: payload.tables.reduce((total, table) => total + table.rows.length, 0),
  };
}
