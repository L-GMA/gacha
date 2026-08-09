import Fastify, { type FastifyInstance } from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "./config.js";
import { pool, query } from "./db.js";
import { authRoutes } from "./routes/auth.js";
import { inviteRoutes } from "./routes/invites.js";
import { serverRoutes } from "./routes/server.js";
import { adminRoutes } from "./routes/admin.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { channelsRoutes } from "./routes/channels.js";
import { uploadsRoutes } from "./routes/uploads.js";
import { passVoiceRoutes } from "./routes/passVoice.js";
import { voiceRoutes } from "./routes/voice.js";
import { serverEventsRoute, presenceEventsRoute, broadcastServerChanged } from "./realtime.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; login: string; tv: number };
    user: { sub: string; login: string; tv: number };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const app: FastifyInstance = Fastify({ logger: true, trustProxy: config.trustProxy });

await app.register(jwt, { secret: config.jwtSecret });

app.decorate("authenticate", async (request, reply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Требуется авторизация" });
  }
  const user = request.user as { sub: string; tv: number };
  const row = await query<{ banned: boolean; token_version: number }>(
    "SELECT banned, token_version FROM users WHERE id = $1",
    [user.sub],
  );
  const u = row.rows[0];
  if (!u) return reply.status(401).send({ error: "Требуется авторизация" });
  if (u.banned) return reply.status(403).send({ error: "Аккаунт заблокирован" });
  if (u.token_version !== (user.tv ?? 0)) {
    return reply.status(401).send({ error: "Сессия устарела, войдите заново" });
  }
});

await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
});

await app.register(multipart, {
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});

await app.register(rateLimit, { global: false });

const uploadsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "uploads");
await app.register(fastifyStatic, {
  root: uploadsDir,
  prefix: "/uploads/",
  maxAge: "7d",
  setHeaders(res) {
    res.raw.setHeader("X-Content-Type-Options", "nosniff");
  },
});

await app.register(authRoutes);
await app.register(inviteRoutes);
await app.register(serverRoutes);
await app.register(adminRoutes);
await app.register(conversationsRoutes);
await app.register(channelsRoutes);
await app.register(uploadsRoutes);
await app.register(passVoiceRoutes);
await app.register(voiceRoutes);

app.get("/api/server/events", { preHandler: app.authenticate }, serverEventsRoute);
app.get("/api/voice/events", { preHandler: app.authenticate }, presenceEventsRoute);

app.addHook("onResponse", async (request, reply) => {
  if (reply.statusCode < 200 || reply.statusCode >= 300) return;
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
  const path = request.url.split("?")[0];
  if (path.endsWith("/messages") || path.endsWith("/upload")) return;
  if (
    path.startsWith("/api/categories") ||
    path.startsWith("/api/channels") ||
    path.startsWith("/api/roles") ||
    path.startsWith("/api/users") ||
    path.startsWith("/api/conversations") ||
    path === "/api/dms" ||
    path === "/api/me" ||
    path === "/api/auth/register"
  ) {
    broadcastServerChanged();
  }
});

app.get("/api/health", async () => ({ ok: true }));

const shutdown = async () => {
  await pool.end();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
