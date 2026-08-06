import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { isSafeImageUrl } from "../validate.js";

const MEMBER_ROW = `
  c.id, c.kind, c.created_at,
  (SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id = c.id)::int AS member_count,
  lm.id AS lm_id, lm.content AS lm_content, lm.image_url AS lm_image_url, lm.created_at AS lm_created_at, lm.sender_id AS lm_sender_id,
  su.login AS lm_login, su.nickname AS lm_nickname,
  other.id AS other_id, other.login AS other_login, other.nickname AS other_nickname, other.avatar AS other_avatar,
  (other.last_seen IS NOT NULL AND other.last_seen > now() - interval '90 seconds') AS other_online
`;

type ConvRow = {
  id: string;
  kind: "group" | "dm";
  created_at: string;
  member_count: number;
  lm_id: string | null;
  lm_content: string | null;
  lm_image_url: string | null;
  lm_created_at: string | null;
  lm_sender_id: string | null;
  lm_login: string | null;
  lm_nickname: string | null;
  other_id: string | null;
  other_login: string | null;
  other_nickname: string | null;
  other_avatar: string | null;
  other_online: boolean | null;
};

export function shapeConversation(row: ConvRow) {
  return {
    id: row.id,
    kind: row.kind,
    created_at: row.created_at,
    member_count: row.member_count,
    last_message: row.lm_id
      ? {
          id: row.lm_id,
          content: row.lm_content || (row.lm_image_url ? "🖼 Фото" : ""),
          created_at: row.lm_created_at,
          sender_id: row.lm_sender_id,
          sender_login: row.lm_login,
          sender_nickname: row.lm_nickname,
        }
      : null,
    member: {
      id: row.other_id,
      login: row.other_login,
      nickname: row.other_nickname,
      avatar: row.other_avatar,
      online: row.other_online ?? false,
    },
  };
}

export async function listConversations(userId: string): Promise<ConvRow[]> {
  const rows = await query<ConvRow>(
    `SELECT ${MEMBER_ROW}
     FROM conversations c
     JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $1
      LEFT JOIN LATERAL (
        SELECT m.id, m.content, m.image_url, m.created_at, m.sender_id FROM messages m
        WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
      ) lm ON true
      LEFT JOIN users su ON su.id = lm.sender_id
      LEFT JOIN LATERAL (
        SELECT cm.user_id AS id FROM conversation_members cm
        WHERE cm.conversation_id = c.id AND cm.user_id <> $1 LIMIT 1
      ) om ON true
      LEFT JOIN users other ON other.id = om.id
      WHERE c.kind = 'dm' AND me.user_id = $1 AND me.closed_at IS NULL
      ORDER BY COALESCE(lm.created_at, c.created_at) DESC`,
    [userId],
  );
  return rows.rows;
}
async function getConversation(conversationId: string, userId: string): Promise<ConvRow | null> {
  const rows = await query<ConvRow>(
    `SELECT ${MEMBER_ROW}
     FROM conversations c
     JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $1
      LEFT JOIN LATERAL (
        SELECT m.id, m.content, m.image_url, m.created_at, m.sender_id FROM messages m
        WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
      ) lm ON true
      LEFT JOIN users su ON su.id = lm.sender_id
      LEFT JOIN LATERAL (
        SELECT cm.user_id AS id FROM conversation_members cm
        WHERE cm.conversation_id = c.id AND cm.user_id <> $1 LIMIT 1
      ) om ON true
      LEFT JOIN users other ON other.id = om.id
      WHERE c.kind = 'dm' AND c.id = $2`,
    [userId, conversationId],
  );
  return rows.rows[0] ?? null;
}

export async function conversationsRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  app.get("/api/conversations", auth, async (request) => {
    const user = request.user as { sub: string };
    const rows = await listConversations(user.sub);
    return { conversations: rows.map(shapeConversation) };
  });

  app.get("/api/conversations/:id/messages", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    const isMember = await query(
      "SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
      [id, user.sub],
    );
    if (isMember.rows.length === 0) {
      return reply.status(403).send({ error: "Нет доступа к диалогу" });
    }
    const messages = await query<{
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
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at, m.id`,
      [id],
    );
    return {
      messages: messages.rows.map((m) => ({
        id: m.id,
        content: m.content,
        image_url: m.image_url,
        created_at: m.created_at,
        sender: {
          id: m.sender_id,
          login: m.login,
          nickname: m.nickname,
          avatar: m.avatar,
        },
      })),
    };
  });

  app.post("/api/conversations/:id/messages", auth, async (request, reply) => {
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
    const isMember = await query(
      "SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
      [id, user.sub],
    );
    if (isMember.rows.length === 0) {
      return reply.status(403).send({ error: "Нет доступа к диалогу" });
    }
    const inserted = await query<{
      id: string;
      content: string;
      image_url: string | null;
      created_at: string;
      sender_id: string;
      login: string;
      nickname: string | null;
      avatar: string | null;
    }>(
      `INSERT INTO messages (conversation_id, sender_id, content, image_url)
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

  app.post("/api/dms", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const targetId = typeof body.userId === "string" ? body.userId : "";
    if (!targetId || targetId === user.sub) {
      return reply.status(400).send({ error: "Некорректный пользователь" });
    }
    const target = await query(
      "SELECT id FROM users WHERE id = $1 AND NOT banned",
      [targetId],
    );
    if (target.rows.length === 0) {
      return reply.status(400).send({ error: "Пользователь не найден" });
    }

    const existing = await query<{ id: string }>(
      `SELECT c.id FROM conversations c
       JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
       JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = $2
       WHERE c.kind = 'dm'`,
      [user.sub, targetId],
    );
    let conversationId: string;
    if (existing.rows[0]) {
      conversationId = existing.rows[0].id;
      await query(
        "UPDATE conversation_members SET closed_at = NULL WHERE conversation_id = $1 AND user_id = $2",
        [conversationId, user.sub],
      );
    } else {
      const created = await query<{ id: string }>(
        "INSERT INTO conversations (kind) VALUES ('dm') RETURNING id",
      );
      conversationId = created.rows[0].id;
      await query(
        "INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING",
        [conversationId, user.sub, targetId],
      );
    }

    const conv = await getConversation(conversationId, user.sub);
    return { conversation: conv ? shapeConversation(conv) : null };
  });

  app.delete("/api/conversations/:id", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    const member = await query(
      "SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
      [id, user.sub],
    );
    if (member.rows.length === 0) {
      return reply.status(403).send({ error: "Нет доступа к диалогу" });
    }
    await query(
      "UPDATE conversation_members SET closed_at = now() WHERE conversation_id = $1 AND user_id = $2",
      [id, user.sub],
    );
    return { ok: true };
  });

  app.get("/api/users", auth, async (request) => {
    const user = request.user as { sub: string };
    const users = await query<{
      id: string;
      login: string;
      nickname: string | null;
      avatar: string | null;
      online: boolean;
      has_dm: boolean;
    }>(
      `SELECT u.id, u.login, u.nickname, u.avatar,
              (u.last_seen IS NOT NULL AND u.last_seen > now() - interval '90 seconds') AS online,
              EXISTS(SELECT 1 FROM conversations c
                     JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = $1
                     JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = u.id
                     WHERE c.kind = 'dm') AS has_dm
       FROM users u
       WHERE NOT u.banned AND u.id <> $1
       ORDER BY u.login`,
      [user.sub],
    );
    return { users: users.rows };
  });
}
