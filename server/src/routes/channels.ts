import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getRolesForUser } from "../permissions.js";
import { isSafeImageUrl } from "../validate.js";

type ChannelAccess = { view: boolean; send: boolean };

async function channelAccess(userId: string, channelId: string): Promise<ChannelAccess> {
  const roles = await getRolesForUser(userId);
  if (roles.some((r) => r.kind === "admin")) return { view: true, send: true };
  const perms = await query<{ can_view: boolean; can_send: boolean }>(
    `SELECT can_view, can_send FROM channel_permissions
     WHERE channel_id = $1 AND role_id = ANY($2::uuid[])`,
    [channelId, roles.map((r) => r.id)],
  );
  const view = perms.rows.every((p) => p.can_view);
  const send = perms.rows.every((p) => p.can_send);
  return { view, send };
}

export async function channelsRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get("/api/channels/:id/messages", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };

    const ch = await query<{ type: string }>("SELECT type FROM channels WHERE id = $1", [id]);
    if (ch.rows.length === 0) return reply.status(404).send({ error: "Канал не найден" });
    if (ch.rows[0].type !== "text") {
      return reply.status(400).send({ error: "В голосовом канале нет сообщений" });
    }
    const access = await channelAccess(user.sub, id);
    if (!access.view) return reply.status(403).send({ error: "Нет доступа к каналу" });

    const rows = await query<{
      id: string;
      content: string;
      image_url: string | null;
      created_at: string;
      sender_id: string;
      login: string;
      nickname: string | null;
      avatar: string | null;
    }>(
      `SELECT m.id, m.content, m.image_url, m.created_at, m.sender_id, u.login, u.nickname, u.avatar
       FROM channel_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.channel_id = $1
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT 200`,
      [id],
    );
    const messages = rows.rows.reverse().map((row) => ({
      id: row.id,
      content: row.content,
      image_url: row.image_url,
      created_at: row.created_at,
      sender: {
        id: row.sender_id,
        login: row.login,
        nickname: row.nickname,
        avatar: row.avatar,
      },
    }));
    return { messages };
  });

  app.post("/api/channels/:id/messages", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!content && !imageUrl) {
      return reply.status(400).send({ error: "Сообщение не может быть пустым" });
    }
    if (content.length > 4000) {
      return reply.status(400).send({ error: "Сообщение слишком длинное (максимум 4000 символов)" });
    }
    if (imageUrl && !isSafeImageUrl(imageUrl)) {
      return reply.status(400).send({ error: "Неверная ссылка на изображение" });
    }

    const ch = await query<{ type: string }>("SELECT type FROM channels WHERE id = $1", [id]);
    if (ch.rows.length === 0) return reply.status(404).send({ error: "Канал не найден" });
    if (ch.rows[0].type !== "text") {
      return reply.status(400).send({ error: "В голосовом канале нет сообщений" });
    }
    const access = await channelAccess(user.sub, id);
    if (!access.view || !access.send) {
      return reply.status(403).send({ error: "Нет прав на отправку в этот канал" });
    }

    const inserted = await query<{ id: string; content: string; image_url: string | null; created_at: string; sender_id: string }>(
      `INSERT INTO channel_messages (channel_id, sender_id, content, image_url)
       VALUES ($1, $2, $3, NULLIF($4, ''))
       RETURNING id, content, image_url, created_at, sender_id`,
      [id, user.sub, content, imageUrl],
    );
    const row = inserted.rows[0];
    const sender = await query<{ login: string; nickname: string | null; avatar: string | null }>(
      "SELECT login, nickname, avatar FROM users WHERE id = $1",
      [row.sender_id],
    );
    return {
      message: {
        id: row.id,
        content: row.content,
        image_url: row.image_url,
        created_at: row.created_at,
        sender: { id: row.sender_id, ...sender.rows[0] },
      },
    };
  });
}
