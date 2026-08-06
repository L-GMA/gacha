import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getActiveS3, type S3Settings } from "./settings.js";

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
}

const UPLOADS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "uploads");

class LocalStorage implements StorageAdapter {
  async put(key: string, data: Buffer, contentType: string): Promise<string> {
    const file = join(UPLOADS_DIR, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    return `/uploads/${key}`;
  }
}

class S3Storage implements StorageAdapter {
  constructor(private settings: S3Settings) {}

  async put(key: string, data: Buffer, contentType: string): Promise<string> {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: this.settings.region,
      endpoint: this.settings.endpoint || undefined,
      credentials: {
        accessKeyId: this.settings.accessKeyId,
        secretAccessKey: this.settings.secretAccessKey,
      },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: this.settings.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
    return `${this.settings.publicUrl.replace(/\/+$/, "")}/${key}`;
  }
}

export async function storeFile(key: string, data: Buffer, contentType: string): Promise<string> {
  const s3 = await getActiveS3();
  if (s3) return new S3Storage(s3).put(key, data, contentType);
  return new LocalStorage().put(key, data, contentType);
}
