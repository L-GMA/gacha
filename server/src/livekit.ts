import { createHmac } from "node:crypto";

type LiveKitTokenOptions = {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name?: string;
  room: string;
  ttlSeconds?: number;
  attributes?: Record<string, string>;
};

export function issueLiveKitToken(opts: LiveKitTokenOptions): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts.ttlSeconds ?? 60 * 60;
  const header = { alg: "HS256", typ: "JWT", kid: opts.apiKey };
  const payload = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.name ?? opts.identity,
    nbf: now - 10,
    exp: now + ttl,
    video: {
      room: opts.room,
      roomJoin: true,
      canUpdateOwnMetadata: true,
      ...(opts.attributes && Object.keys(opts.attributes).length > 0
        ? { attributes: opts.attributes }
        : {}),
    },
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", opts.apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${sig}`;
}

export function issueLiveKitAdminToken(opts: {
  apiKey: string;
  apiSecret: string;
  room: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT", kid: opts.apiKey };
  const payload = {
    iss: opts.apiKey,
    sub: "presence",
    nbf: now - 10,
    exp: now + 60,
    video: { room: opts.room, roomAdmin: true, roomList: true },
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", opts.apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${sig}`;
}
