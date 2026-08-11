import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { query } from "../db.js";
import { issueLiveKitToken, issueLiveKitAdminToken } from "../livekit.js";
import { broadcastPresenceChanged } from "../realtime.js";

const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;

const livekitHttp = config.livekit.url.replace(
  /^(wss?|https?):\/\//,
  (scheme) => (scheme === "wss://" || scheme === "https://" ? "https://" : "http://"),
);

async function listRoomParticipants(
  room: string,
): Promise<{ identity: string; attributes?: Record<string, string> }[]> {
  const token = issueLiveKitAdminToken({
    apiKey: config.livekit.apiKey,
    apiSecret: config.livekit.apiSecret,
    room,
  });
  try {
    const res = await fetch(
      `${livekitHttp}/twirp/livekit.RoomService/ListParticipants`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ room }),
        signal: AbortSignal.timeout(3000),
      },
    );
    const body = (await res.json()) as {
      participants?: {
        identity: string;
        attributes?: Record<string, string>;
      }[];
    };
    return Array.isArray(body.participants) ? body.participants : [];
  } catch {
    return [];
  }
}

async function getUserVoiceAttributes(
  userId: string,
): Promise<Record<string, string>> {
  try {
    const res = await query<{
      login: string;
      nickname: string | null;
      avatar: string | null;
      profile_color: string | null;
      join_sound_url: string | null;
      leave_sound_url: string | null;
    }>(
      "SELECT login, nickname, avatar, profile_color, join_sound_url, leave_sound_url FROM users WHERE id = $1",
      [userId],
    );
    const row = res.rows[0];
    if (!row) return {};
    return voiceAttrsFromRow(row);
  } catch {
    return {};
  }
}

const CLIENT_ATTR_KEYS = ["gacha_muted", "gacha_deafened", "gacha_ptt"];

async function updateParticipantAttrs(
  room: string,
  identity: string,
  existing: Record<string, string> | undefined,
  dbAttrs: Record<string, string>,
): Promise<void> {
  const merged = { ...dbAttrs };
  for (const key of CLIENT_ATTR_KEYS) {
    if (existing?.[key] != null) merged[key] = existing[key];
  }
  const token = issueLiveKitAdminToken({
    apiKey: config.livekit.apiKey,
    apiSecret: config.livekit.apiSecret,
    room,
  });
  await fetch(`${livekitHttp}/twirp/livekit.RoomService/UpdateParticipant`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      room,
      identity,
      attributes: merged,
    }),
    signal: AbortSignal.timeout(3000),
  });
}

async function syncRoomParticipantAttributes(room: string): Promise<void> {
  try {
    const participants = await listRoomParticipants(room);
    if (participants.length === 0) return;
    const userIds = Array.from(
      new Set(
        participants
          .map((p) => (p.identity ?? "").split("--")[0])
          .filter(Boolean),
      ),
    );
    if (userIds.length === 0) return;
    const rows = await query<{
      id: string;
      login: string;
      nickname: string | null;
      avatar: string | null;
      profile_color: string | null;
      join_sound_url: string | null;
      leave_sound_url: string | null;
    }>(
      "SELECT id, login, nickname, avatar, profile_color, join_sound_url, leave_sound_url FROM users WHERE id = ANY($1::uuid[])",
      [userIds],
    );
    const attrsByUser = new Map(
      rows.rows.map((r) => [r.id, voiceAttrsFromRow(r)]),
    );
    await Promise.all(
      participants.map(async (p) => {
        const userId = (p.identity ?? "").split("--")[0];
        const dbAttrs = attrsByUser.get(userId);
        if (!dbAttrs) return;
        await updateParticipantAttrs(room, p.identity, p.attributes, dbAttrs);
      }),
    );
  } catch {
    /* не критично — участник получит актуальные атрибуты при следующем заходе */
  }
}

// Обновляет атрибуты ВСЕХ активных LiveKit-сессий пользователя (во всех каналах) —
// смена профиля (аватар/ник/звуки) сразу видна остальным участникам без переподключения.
export async function refreshUserVoiceAttributes(userId: string): Promise<void> {
  try {
    const res = await query<{ id: string }>(
      "SELECT id FROM channels WHERE type = 'voice' UNION SELECT id FROM pass_voice_channels",
    );
    const dbAttrs = await getUserVoiceAttributes(userId);
    await Promise.all(
      res.rows.map(async ({ id: room }) => {
        const participants = await listRoomParticipants(room);
        await Promise.all(
          participants
            .filter((p) => (p.identity ?? "").split("--")[0] === userId)
            .map((p) =>
              updateParticipantAttrs(room, p.identity, p.attributes, dbAttrs),
            ),
        );
      }),
    );
  } catch {
    /* не критично */
  }
}

function voiceAttrsFromRow(row: {
  login: string;
  nickname: string | null;
  avatar: string | null;
  profile_color: string | null;
  join_sound_url: string | null;
  leave_sound_url: string | null;
}): Record<string, string> {
  const attrs: Record<string, string> = {};
  attrs.nickname = row.nickname || row.login;
  if (row.avatar) attrs.avatar = row.avatar;
  if (row.profile_color) attrs.color = row.profile_color;
  if (row.join_sound_url) attrs.joinSound = row.join_sound_url;
  if (row.leave_sound_url) attrs.leaveSound = row.leave_sound_url;
  return attrs;
}

export async function voiceRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.post("/api/voice/join", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string; login: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const room = typeof body.room === "string" ? body.room.trim() : "";
    if (!ROOM_RE.test(room)) {
      return reply.status(400).send({ error: "Некорректное имя комнаты" });
    }
    const pv = await query<{ id: string }>(
      "SELECT id FROM pass_voice_channels WHERE id = $1",
      [room],
    );
    if (pv.rows.length > 0) {
      const member = await query<{ channel_id: string }>(
        "SELECT channel_id FROM pass_voice_presence WHERE channel_id = $1 AND user_id = $2",
        [room, user.sub],
      );
      if (member.rows.length === 0) {
        return reply.status(403).send({ error: "Сначала войдите в канал" });
      }
    }
    const attrs = await getUserVoiceAttributes(user.sub);
    const token = issueLiveKitToken({
      apiKey: config.livekit.apiKey,
      apiSecret: config.livekit.apiSecret,
      identity: `${user.sub}--${randomUUID()}`,
      name: attrs.nickname || user.login,
      room,
      attributes: attrs,
    });
    void syncRoomParticipantAttributes(room);
    void broadcastPresenceChanged();
    return { token, url: config.livekit.url, room };
  });

  app.get("/api/voice/presence", { preHandler: auth }, async () => {
    const results = await getCachedPresence();

    const userIds = Array.from(
      new Set(results.flatMap((r) => r.participants).filter(Boolean)),
    );
    const users = new Map<
      string,
      { id: string; login: string; nickname: string | null; avatar: string | null }
    >();
    if (userIds.length > 0) {
      for (const u of (
        await query<{
          id: string;
          login: string;
          nickname: string | null;
          avatar: string | null;
        }>("SELECT id, login, nickname, avatar FROM users WHERE id = ANY($1::uuid[])", [
          userIds,
        ])
      ).rows) {
        users.set(u.id, u);
      }
    }

    return {
      channels: results.map((r) => {
        const seen = new Set<string>();
        const participants = [];
        for (const userId of r.participants) {
          if (!userId || seen.has(userId)) continue;
          seen.add(userId);
          const u = users.get(userId);
          if (!u) continue;
          participants.push({
            id: u.id,
            login: u.login,
            nickname: u.nickname,
            avatar: u.avatar,
          });
        }
        return { id: r.id, participants };
      }),
    };
  });
}

// ---------- кеш присутствия ----------
// Фоновый воркер опрашивает LiveKit раз в ~1.5с и пушит изменения всем клиентам
// через SSE — участник появляется/исчезает в списках каналов без ожидания опроса.

type PresenceChannel = { id: string; participants: string[] };

const presenceCache: { channels: PresenceChannel[] } = { channels: [] };
let presenceSig = "";
let watcherStarted = false;

async function getCachedPresence(): Promise<PresenceChannel[]> {
  if (!watcherStarted) {
    watcherStarted = true;
    // первичный сбор сразу и воркер
    void scanPresence();
    const timer = setInterval(() => void scanPresence(), 1500);
    timer.unref();
  }
  return presenceCache.channels;
}

async function scanPresence(): Promise<void> {
  try {
    const channels = (
      await query<{ id: string }>(
        "SELECT id FROM channels WHERE type = 'voice' ORDER BY position",
      )
    ).rows.map((r) => r.id);
    const results = await Promise.all(
      channels.map(async (id) => ({
        id,
        participants: await listRoomParticipants(id),
      })),
    );
    const next: PresenceChannel[] = results.map((r) => {
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const p of r.participants) {
        const uid = (p.identity ?? "").split("--")[0];
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);
        ids.push(uid);
      }
      return { id: r.id, participants: ids };
    });
    const sig = JSON.stringify(next);
    if (sig !== presenceSig) {
      presenceSig = sig;
      presenceCache.channels = next;
      broadcastPresenceChanged();
    }
  } catch {
    /* следующая итерация всё повторит */
  }
}
