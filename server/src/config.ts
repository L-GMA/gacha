import { readFileSync } from "node:fs";

try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env file, rely on process env */
}

const rawJwtSecret = process.env.JWT_SECRET ?? "";
if (!rawJwtSecret || rawJwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET должен быть задан в .env и содержать минимум 32 символа. " +
      "Сгенерируйте его, например: openssl rand -hex 32",
  );
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: rawJwtSecret,
  trustProxy: process.env.TRUST_PROXY === "true",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://goowesh@localhost:5432/new_ds",
  corsOrigins: (
    process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173,null"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  storageType: (process.env.STORAGE_TYPE ?? "local") as "local" | "s3",
  s3: {
    bucket: process.env.S3_BUCKET ?? "",
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    publicUrl: process.env.S3_PUBLIC_URL ?? "",
  },
  livekit: {
    url: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
    apiKey: process.env.LIVEKIT_API_KEY ?? "devkey",
    apiSecret: process.env.LIVEKIT_API_SECRET ?? "376fcc2a1bad4fd2b3342e5f99fcadb8",
  },
};
