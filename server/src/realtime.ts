import type { FastifyReply, FastifyRequest } from "fastify";

const clients = new Set<NodeJS.WritableStream>();

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

const sseHeartbeat = setInterval(() => {
  if (clients.size === 0) return;
  for (const res of clients) {
    try {
      res.write(": ping\n\n");
    } catch {
      /* ignore */
    }
  }
}, 25000);
sseHeartbeat.unref();

export async function serverEventsRoute(request: FastifyRequest, reply: FastifyReply) {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  clients.add(res);
  request.raw.on("close", () => {
    clients.delete(res);
  });
}
