import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { query } from "../db.js";
import { issueLiveKitToken, issueLiveKitAdminToken } from "../livekit.js";

const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/;

const livekitHttp = config.livekit.url.replace(
  /^(wss?|https?):\/\//,
  (scheme) => (scheme === "wss://" || scheme === "https://" ? "https://" : "http://"),
);

async function listRoomParticipants(room: string): Promise<{ identity: string }[]> {
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
      participants?: { identity: string }[];
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
      join_sound_url: string | null;
      leave_sound_url: string | null;
    }>(
      "SELECT login, nickname, avatar, join_sound_url, leave_sound_url FROM users WHERE id = $1",
      [userId],
    );
    const row = res.rows[0];
    if (!row) return {};
    const attrs: Record<string, string> = {};
    attrs.nickname = row.nickname || row.login;
    if (row.avatar) attrs.avatar = row.avatar;
    if (row.join_sound_url) attrs.joinSound = row.join_sound_url;
    if (row.leave_sound_url) attrs.leaveSound = row.leave_sound_url;
    return attrs;
  } catch {
    return {};
  }
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
    return { token, url: config.livekit.url, room };
  });

  app.get("/api/voice/presence", { preHandler: auth }, async () => {
    const channels = (
      await query<{ id: string }>(
        "SELECT id FROM channels WHERE type = 'voice' ORDER BY position",
      )
    ).rows.map((r) => r.id);

    const results = await Promise.all(
      channels.map(async (id) => ({
        id,
        participants: (await listRoomParticipants(id)).map((p) =>
          (p.identity ?? "").split("--")[0],
        ),
      })),
    );

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
