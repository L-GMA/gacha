import { randomUUID, randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { query } from "./db.js";
import { config } from "./config.js";

export type S3Settings = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
};

const KEY = "s3";
const ENC_KEY = createHash("sha256").update(config.jwtSecret).digest();

function encryptValue(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  });
}

function decryptValue(stored: string): string | null {
  try {
    const p = JSON.parse(stored) as { v?: number; iv?: string; tag?: string; data?: string };
    if (p.v !== 1 || !p.iv || !p.tag || !p.data) return null;
    const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(p.iv, "base64"));
    decipher.setAuthTag(Buffer.from(p.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(p.data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export async function getS3Settings(): Promise<S3Settings | null> {
  const r = await query<{ value: unknown }>("SELECT value FROM settings WHERE key = $1", [KEY]);
  if (!r.rows[0]) return null;
  const raw =
    typeof r.rows[0].value === "string" ? r.rows[0].value : JSON.stringify(r.rows[0].value);
  const decrypted = decryptValue(raw);
  const json = decrypted ?? raw;
  try {
    const v = JSON.parse(json) as S3Settings;
    if (v && v.bucket && v.accessKeyId && v.secretAccessKey && v.publicUrl) {
      if (decrypted === null) await setS3Settings(v);
      return v;
    }
  } catch {
    /* broken value -> ignore */
  }
  return null;
}

export async function setS3Settings(s3: S3Settings | null): Promise<void> {
  if (!s3) {
    await query("DELETE FROM settings WHERE key = $1", [KEY]);
    return;
  }
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [KEY, encryptValue(JSON.stringify(s3))],
  );
}

export async function getActiveS3(): Promise<S3Settings | null> {
  const db = await getS3Settings();
  if (db) return db;
  if (config.storageType === "s3" && config.s3.bucket && config.s3.accessKeyId) {
    return {
      bucket: config.s3.bucket,
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
      publicUrl: config.s3.publicUrl,
    };
  }
  return null;
}

export async function testS3Connection(s3: S3Settings): Promise<void> {
  const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: s3.region,
    endpoint: s3.endpoint || undefined,
    credentials: {
      accessKeyId: s3.accessKeyId,
      secretAccessKey: s3.secretAccessKey,
    },
  });
  const key = `.gacha-test-${randomUUID()}`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        Body: "ok",
        ContentType: "text/plain",
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
  } catch (err) {
    throw new Error(`Не удалось подключиться к S3: ${s3ErrMsg(err)}`);
  }
}

function s3ErrMsg(err: unknown): string {
  const e = err as
    | { message?: string; name?: string; cause?: unknown; errors?: unknown[] }
    | undefined;
  for (const sub of e?.errors ?? []) {
    const s = s3ErrMsg(sub);
    if (s && s !== "AggregateError") return s;
  }
  const cause = e?.cause as { message?: string; code?: string } | undefined;
  return (
    e?.message?.trim() ||
    cause?.message?.trim() ||
    e?.name?.trim() ||
    cause?.code?.trim() ||
    "проверьте данные"
  );
}
