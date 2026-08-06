import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { getRolesForUser } from "../permissions.js";

const sseClients = new Set<NodeJS.WritableStream>();

function broadcastPassVoiceChanged() {
  if (sseClients.size === 0) return;
  const payload = "data: changed\n\n";
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      /* клиент мог закрыться */
    }
  }
}

const sseHeartbeat = setInterval(() => {
  if (sseClients.size === 0) return;
  for (const res of sseClients) {
    try {
      res.write(": ping\n\n");
    } catch {
      /* ignore */
    }
  }
}, 25000);
sseHeartbeat.unref();

type PvListRow = {
  id: string;
  name: string;
  owner_id: string;
  owner_login: string;
  owner_nickname: string | null;
  has_password: boolean;
  max_participants: number | null;
  allowed_role_ids: string[];
  participant_count: number;
};

type PvParticipantRow = {
  id: string;
  login: string;
  nickname: string | null;
  avatar: string | null;
  online: boolean;
};

const LIST_SELECT = `
  SELECT c.id, c.name, c.owner_id,
         u.login AS owner_login, u.nickname AS owner_nickname,
         (c.password_hash IS NOT NULL) AS has_password,
         c.max_participants,
         COALESCE((SELECT array_agg(role_id::text) FROM pass_voice_channel_roles r WHERE r.channel_id = c.id), '{}') AS allowed_role_ids,
         (SELECT count(*)::int FROM pass_voice_presence p WHERE p.channel_id = c.id) AS participant_count
  FROM pass_voice_channels c
  JOIN users u ON u.id = c.owner_id`;

const PARTICIPANTS_SELECT = `
  SELECT u.id, u.login, u.nickname, u.avatar,
         (u.last_seen IS NOT NULL AND u.last_seen > now() - interval '90 seconds') AS online
  FROM pass_voice_presence p
  JOIN users u ON u.id = p.user_id
  WHERE p.channel_id = $1
  ORDER BY p.joined_at, u.login`;

async function isBanned(userId: string): Promise<boolean> {
  const r = await query<{ banned: boolean }>("SELECT banned FROM users WHERE id = $1", [userId]);
  return r.rows[0]?.banned ?? true;
}

async function joinedMap(userId: string): Promise<Set<string>> {
  const r = await query<{ channel_id: string }>(
    "SELECT channel_id FROM pass_voice_presence WHERE user_id = $1",
    [userId],
  );
  return new Set(r.rows.map((x) => x.channel_id));
}

async function participantsOf(channelId: string): Promise<PvParticipantRow[]> {
  const r = await query<PvParticipantRow>(PARTICIPANTS_SELECT, [channelId]);
  return r.rows;
}

function shapeChannel(
  row: PvListRow,
  userId: string,
  roleIds: Set<string>,
  isAdmin: boolean,
  joined: boolean,
) {
  const allowed = row.allowed_role_ids ?? [];
  const owner = userId === row.owner_id;
  const canJoin =
    owner || isAdmin || allowed.length === 0 || allowed.some((r) => roleIds.has(r));
  return {
    id: row.id,
    name: row.name,
    owner: { id: row.owner_id, login: row.owner_login, nickname: row.owner_nickname },
    has_password: row.has_password,
    max_participants: row.max_participants,
    allowed_role_ids: allowed,
    participant_count: row.participant_count,
    joined,
    can_join: canJoin,
  };
}

async function rolesCtx(userId: string) {
  const roles = await getRolesForUser(userId);
  return {
    roleIds: new Set(roles.map((r) => r.id)),
    isAdmin: roles.some((r) => r.kind === "admin"),
  };
}

type PvPresenceRow = PvParticipantRow & { channel_id: string };

export async function passVoiceRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.get("/api/pass-voice", { preHandler: auth }, async (request) => {
    const user = request.user as { sub: string };
    const { roleIds, isAdmin } = await rolesCtx(user.sub);
    const joined = await joinedMap(user.sub);
    const rows = await query<PvListRow>(`${LIST_SELECT} ORDER BY c.created_at, c.name`);
    const presence = await query<PvPresenceRow>(
      `SELECT p.channel_id, u.id, u.login, u.nickname, u.avatar,
              (u.last_seen IS NOT NULL AND u.last_seen > now() - interval '90 seconds') AS online
       FROM pass_voice_presence p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.joined_at, u.login`,
    );
    const byChannel = new Map<string, PvParticipantRow[]>();
    for (const r of presence.rows) {
      const arr = byChannel.get(r.channel_id) ?? [];
      arr.push({ id: r.id, login: r.login, nickname: r.nickname, avatar: r.avatar, online: r.online });
      byChannel.set(r.channel_id, arr);
    }
    return {
      channels: rows.rows.map((row) => ({
        ...shapeChannel(row, user.sub, roleIds, isAdmin, joined.has(row.id)),
        participants: byChannel.get(row.id) ?? [],
      })),
    };
  });

  app.get("/api/pass-voice/events", { preHandler: auth }, async (request, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    sseClients.add(res);
    request.raw.on("close", () => {
      sseClients.delete(res);
    });
  });

  app.post("/api/pass-voice", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const maxRaw = body.maxParticipants;
    const roleIds = Array.isArray(body.roleIds)
      ? (body.roleIds as unknown[]).filter((r) => typeof r === "string").slice(0, 20)
      : [];

    if (!name) return reply.status(400).send({ error: "Укажите название канала" });
    if (name.length > 40) {
      return reply.status(400).send({ error: "Название слишком длинное (максимум 40 символов)" });
    }

    let max: number | null = null;
    if (maxRaw !== undefined && maxRaw !== null && maxRaw !== "") {
      max = Number(maxRaw);
      if (!Number.isInteger(max) || max < 1 || max > 99) {
        return reply.status(400).send({ error: "Максимум участников — число от 1 до 99" });
      }
    }

    if (await isBanned(user.sub)) return reply.status(403).send({ error: "Аккаунт заблокирован" });

    const passwordHash = password.trim() ? await bcrypt.hash(password, 10) : null;

    const created = await query<{ id: string }>(
      `INSERT INTO pass_voice_channels (owner_id, name, password_hash, max_participants)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.sub, name, passwordHash, max],
    );
    const id = created.rows[0].id;

    for (const rid of roleIds as string[]) {
      await query(
        `INSERT INTO pass_voice_channel_roles (channel_id, role_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [id, rid],
      );
    }

    const row = await query<PvListRow>(`${LIST_SELECT} WHERE c.id = $1`, [id]);
    const { roleIds: ri, isAdmin } = await rolesCtx(user.sub);
    const channel = shapeChannel(row.rows[0], user.sub, ri, isAdmin, false);
    broadcastPassVoiceChanged();
    return { channel };
  });

  app.get("/api/pass-voice/:id", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    const room = await query<PvListRow>(`${LIST_SELECT} WHERE c.id = $1`, [id]);
    if (room.rows.length === 0) return reply.status(404).send({ error: "Канал не найден" });
    const { roleIds, isAdmin } = await rolesCtx(user.sub);
    const joined = (await joinedMap(user.sub)).has(id);
    return {
      channel: shapeChannel(room.rows[0], user.sub, roleIds, isAdmin, joined),
      participants: await participantsOf(id),
    };
  });

  app.post("/api/pass-voice/:id/join", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const password = typeof body.password === "string" ? body.password : "";

    const ch = await query<{ owner_id: string; password_hash: string | null; max_participants: number | null }>(
      "SELECT owner_id, password_hash, max_participants FROM pass_voice_channels WHERE id = $1",
      [id],
    );
    if (ch.rows.length === 0) return reply.status(404).send({ error: "Канал не найден" });
    const channel = ch.rows[0];

    if (await isBanned(user.sub)) return reply.status(403).send({ error: "Аккаунт заблокирован" });

    const { roleIds, isAdmin } = await rolesCtx(user.sub);
    const allowed = await query<{ role_id: string }>(
      "SELECT role_id FROM pass_voice_channel_roles WHERE channel_id = $1",
      [id],
    );
    const allowedIds = allowed.rows.map((r) => r.role_id);
    const owner = user.sub === channel.owner_id;
    const canJoin =
      owner || isAdmin || allowedIds.length === 0 || allowedIds.some((r) => roleIds.has(r));
    if (!canJoin) return reply.status(403).send({ error: "Нет роли для входа в канал" });

    if (channel.password_hash && !owner) {
      const ok = await bcrypt.compare(password, channel.password_hash);
      if (!ok) return reply.status(403).send({ error: "Неверный пароль" });
    }

    if (channel.max_participants != null) {
      const cnt = await query<{ n: number }>(
        "SELECT count(*)::int AS n FROM pass_voice_presence WHERE channel_id = $1",
        [id],
      );
      if (cnt.rows[0].n >= channel.max_participants) {
        return reply.status(400).send({ error: "Канал заполнен" });
      }
    }

    await query(
      `INSERT INTO pass_voice_presence (channel_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, user.sub],
    );

    const room = await query<PvListRow>(`${LIST_SELECT} WHERE c.id = $1`, [id]);
    broadcastPassVoiceChanged();
    return {
      channel: shapeChannel(room.rows[0], user.sub, roleIds, isAdmin, true),
      participants: await participantsOf(id),
    };
  });

  app.post("/api/pass-voice/:id/leave", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    await query(
      "DELETE FROM pass_voice_presence WHERE channel_id = $1 AND user_id = $2",
      [id, user.sub],
    );
    broadcastPassVoiceChanged();
    return { ok: true };
  });

  app.patch("/api/pass-voice/:id", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    const row = await query<{ owner_id: string; password_hash: string | null }>(
      "SELECT owner_id, password_hash FROM pass_voice_channels WHERE id = $1",
      [id],
    );
    if (row.rows.length === 0) return reply.status(404).send({ error: "Канал не найден" });
    if (row.rows[0].owner_id !== user.sub) {
      return reply.status(403).send({ error: "Настраивать канал может только его создатель" });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return reply.status(400).send({ error: "Укажите название канала" });
    if (name.length > 40) {
      return reply.status(400).send({ error: "Название слишком длинное (максимум 40 символов)" });
    }

    let max: number | null = null;
    const maxRaw = body.maxParticipants;
    if (maxRaw !== undefined && maxRaw !== null && maxRaw !== "") {
      max = Number(maxRaw);
      if (!Number.isInteger(max) || max < 1 || max > 99) {
        return reply.status(400).send({ error: "Максимум участников — число от 1 до 99" });
      }
    }

    const roleIds = Array.isArray(body.roleIds)
      ? (body.roleIds as unknown[]).filter((r) => typeof r === "string").slice(0, 20)
      : [];

    const clearPassword = body.clearPassword === true;
    const newPassword = typeof body.password === "string" ? body.password.trim() : "";
    let passwordHash: string | null;
    if (clearPassword) passwordHash = null;
    else if (newPassword) passwordHash = await bcrypt.hash(newPassword, 10);
    else passwordHash = row.rows[0].password_hash;

    await query(
      "UPDATE pass_voice_channels SET name = $1, password_hash = $2, max_participants = $3 WHERE id = $4",
      [name, passwordHash, max, id],
    );

    await query("DELETE FROM pass_voice_channel_roles WHERE channel_id = $1", [id]);
    for (const rid of roleIds as string[]) {
      await query(
        `INSERT INTO pass_voice_channel_roles (channel_id, role_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [id, rid],
      );
    }

    const updated = await query<PvListRow>(`${LIST_SELECT} WHERE c.id = $1`, [id]);
    const { roleIds: ri, isAdmin } = await rolesCtx(user.sub);
    const joined = (await joinedMap(user.sub)).has(id);
    broadcastPassVoiceChanged();
    return {
      channel: shapeChannel(updated.rows[0], user.sub, ri, isAdmin, joined),
      participants: await participantsOf(id),
    };
  });

  app.delete("/api/pass-voice/:id", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { id } = request.params as { id: string };
    const row = await query<{ owner_id: string }>(
      "SELECT owner_id FROM pass_voice_channels WHERE id = $1",
      [id],
    );
    if (row.rows.length === 0) return reply.status(404).send({ error: "Канал не найден" });
    if (row.rows[0].owner_id !== user.sub) {
      return reply.status(403).send({ error: "Удалить канал может только его создатель" });
    }
    await query("DELETE FROM pass_voice_channels WHERE id = $1", [id]);
    broadcastPassVoiceChanged();
    return { ok: true };
  });
}
