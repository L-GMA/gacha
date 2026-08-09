import type { FastifyReply, FastifyRequest } from "fastify";

const clients = new Set<NodeJS.WritableStream>();
const presenceClients = new Set<NodeJS.WritableStream>();

export function broadcastServerChanged() {
  if (clients.size === 0) return;
  const payload = "data: changed\n\n";
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      /* клиент мог закрыться */
    }
  }
}

export function broadcastPresenceChanged() {
  if (presenceClients.size === 0) return;
  const payload = "data: changed\n\n";
  for (const res of presenceClients) {
    try {
      res.write(payload);
    } catch {
      /* клиент мог закрыться */
    }
  }
}

const sseHeartbeat = setInterval(() => {
  for (const set of [clients, presenceClients]) {
    if (set.size === 0) continue;
    for (const res of set) {
      try {
        res.write(": ping\n\n");
      } catch {
        /* ignore */
      }
    }
  }
}, 25000);
sseHeartbeat.unref();

function attachSse(req: FastifyRequest, reply: FastifyReply, set: Set<NodeJS.WritableStream>) {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  set.add(res);
  req.raw.on("close", () => {
    set.delete(res);
  });
}

export async function serverEventsRoute(request: FastifyRequest, reply: FastifyReply) {
  attachSse(request, reply, clients);
}

export async function presenceEventsRoute(request: FastifyRequest, reply: FastifyReply) {
  attachSse(request, reply, presenceClients);
}
