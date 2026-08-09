import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { isOwnImageUrl, LIMITS } from "../validate.js";

const AUTH_RATE = { config: { rateLimit: { max: 15, timeWindow: "60 seconds" } } };

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/register", AUTH_RATE, async (request, reply) => {
    const { login, password, inviteCode } = (request.body ?? {}) as Record<
      string,
      string
    >;

    if (!login || !password || !inviteCode) {
      return reply.status(400).send({ error: "Заполните все поля" });
    }
    if (password.length < 6) {
      return reply.status(400).send({ error: "Пароль короче 6 символов" });
    }
    const loginTrim = login.trim();
    if (
      loginTrim.length < LIMITS.loginMin ||
      loginTrim.length > LIMITS.loginMax
    ) {
      return reply
        .status(400)
        .send({ error: `Логин должен быть от ${LIMITS.loginMin} до ${LIMITS.loginMax} символов` });
    }
    if (/\s/.test(loginTrim)) {
      return reply.status(400).send({ error: "Логин не может содержать пробелы" });
    }

    const invite = await query<{ id: string; used_by: string | null }>(
      "SELECT id, used_by FROM invites WHERE code = $1",
      [inviteCode],
    );
    const inv = invite.rows[0];
    if (!inv) return reply.status(400).send({ error: "Неверный пригласительный код" });
    if (inv.used_by) return reply.status(400).send({ error: "Пригласительный код уже использован" });

    const existing = await query("SELECT id FROM users WHERE login = $1", [loginTrim]);
    if (existing.rows.length > 0) {
      return reply.status(400).send({ error: "Логин уже занят" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const defaultRole = await query<{ id: string }>(
      "SELECT id FROM roles WHERE kind = 'default'",
    );
    const created = await query<{ id: string }>(
      `INSERT INTO users (login, password_hash) VALUES ($1, $2)
       RETURNING id`,
      [loginTrim, passwordHash],
    );
    const userId = created.rows[0].id;

    await query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [
      userId,
      defaultRole.rows[0].id,
    ]);

    await query("UPDATE invites SET used_by = $1, used_at = now() WHERE id = $2", [
      userId,
      inv.id,
    ]);

    const token = app.jwt.sign(
      { sub: userId, login: loginTrim, tv: 0 },
      { expiresIn: "7d" },
    );
    return { token, user: { id: userId, login: loginTrim } };
  });

  app.post("/api/auth/login", AUTH_RATE, async (request, reply) => {
    const { login, password } = (request.body ?? {}) as Record<string, string>;
    if (!login || !password) {
      return reply.status(400).send({ error: "Заполните все поля" });
    }

    const user = await query<{
      id: string;
      login: string;
      password_hash: string;
      banned: boolean;
      token_version: number;
    }>(
      "SELECT id, login, password_hash, banned, token_version FROM users WHERE login = $1",
      [login],
    );
    const row = user.rows[0];
    if (!row) return reply.status(401).send({ error: "Неверный логин или пароль" });

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return reply.status(401).send({ error: "Неверный логин или пароль" });

    if (row.banned) {
      return reply.status(403).send({ error: "Аккаунт заблокирован" });
    }

    await query("UPDATE users SET last_seen = now() WHERE id = $1", [row.id]);

    const token = app.jwt.sign(
      { sub: row.id, login: row.login, tv: row.token_version },
      { expiresIn: "7d" },
    );
    return { token, user: { id: row.id, login: row.login } };
  });

  app.get("/api/auth/me", { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { sub: string; login: string };
    const me = await query<{
      id: string;
      login: string;
      nickname: string | null;
      avatar: string | null;
      bio: string | null;
      join_sound_url: string | null;
      leave_sound_url: string | null;
      banned: boolean;
      roles: unknown;
    }>(
      `SELECT u.id, u.login, u.nickname, u.avatar, u.bio, u.join_sound_url, u.leave_sound_url, u.banned,
              COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name, 'kind', r.kind, 'permissions', r.permissions, 'color', r.color, 'position', r.position, 'highlight', r.highlight) ORDER BY r.position) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [user.sub],
    );
    const inviter = await query<{ login: string }>(
      `SELECT u.login FROM invites i
       JOIN users u ON u.id = i.created_by
       WHERE i.used_by = $1`,
      [user.sub],
    );
    return {
      user: me.rows[0],
      invited_by: inviter.rows[0]?.login ?? null,
    };
  });

  app.patch("/api/me", { preHandler: app.authenticate }, async (request, reply) => {
    const user = request.user as { sub: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const nickname =
      typeof body.nickname === "string" ? body.nickname.trim() || null : undefined;
    const avatar = typeof body.avatar === "string" ? body.avatar.trim() || null : undefined;
    const bio = typeof body.bio === "string" ? body.bio.trim() || null : undefined;

    if (nickname === undefined && avatar === undefined && bio === undefined) {
      return reply.status(400).send({ error: "Нет данных для обновления" });
    }
    if (nickname !== null && nickname !== undefined && nickname.length > LIMITS.nickname) {
      return reply.status(400).send({ error: `Ник слишком длинный (максимум ${LIMITS.nickname} символа)` });
    }
    if (bio !== null && bio !== undefined && bio.length > LIMITS.bio) {
      return reply.status(400).send({ error: `Описание слишком длинное (максимум ${LIMITS.bio} символов)` });
    }
    if (avatar && !(await isOwnImageUrl(avatar))) {
      return reply
        .status(400)
        .send({ error: "Аватар можно задать только через загрузку файла" });
    }
    if (nickname) {
      const dup = await query("SELECT id FROM users WHERE nickname = $1 AND id <> $2", [
        nickname,
        user.sub,
      ]);
      if (dup.rows.length > 0) {
        return reply.status(400).send({ error: "Такой ник уже занят" });
      }
    }

    const set: string[] = [];
    const params: unknown[] = [];
    if (nickname !== undefined) {
      params.push(nickname);
      set.push(`nickname = $${params.length}`);
    }
    if (avatar !== undefined) {
      params.push(avatar);
      set.push(`avatar = $${params.length}`);
    }
    if (bio !== undefined) {
      params.push(bio);
      set.push(`bio = $${params.length}`);
    }
    params.push(user.sub);
    await query(`UPDATE users SET ${set.join(", ")} WHERE id = $${params.length}`, params);
    return { ok: true };
  });
}
