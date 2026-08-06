import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { can, countAdmins, isAdmin } from "../permissions.js";
import { LIMITS } from "../validate.js";
import {
  getS3Settings,
  setS3Settings,
  testS3Connection,
  type S3Settings,
} from "../settings.js";

const PERM_KEYS = ["invite", "manage_channels", "manage_roles"] as const;
type Perm = (typeof PERM_KEYS)[number];

const nameError = (name: string, max: number): string | null =>
  name.length > max ? `Слишком длинное название (максимум ${max} символов)` : null;

const readStr = (body: unknown, key: string): string | undefined => {
  const b = body as Record<string, unknown>;
  return typeof b[key] === "string" ? (b[key] as string) : undefined;
};

const readBool = (body: unknown, key: string): boolean | undefined => {
  const b = body as Record<string, unknown>;
  return typeof b[key] === "boolean" ? (b[key] as boolean) : undefined;
};

const readColor = (body: unknown): string | null | undefined => {
  const b = body as Record<string, unknown>;
  const v = b["color"];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return undefined;
  return v.trim() || null;
};

export async function adminRoutes(app: FastifyInstance) {
  const auth = { preHandler: app.authenticate };

  /* ---------- server settings ---------- */

  app.get("/api/server/settings", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    const manageRoles = await can(user.sub, "manage_roles");
    const manageChannels = await can(user.sub, "manage_channels");
    if (!manageRoles && !manageChannels) {
      return reply.status(403).send({ error: "Нет доступа к настройкам" });
    }

    const tree = await query(
      `SELECT c.id AS cat_id, c.name AS cat_name, c.color AS cat_color,
              ch.id AS ch_id, ch.name AS ch_name, ch.color AS ch_color, ch.type, ch.position AS ch_pos,
              cp.role_id, cp.can_view, cp.can_send
       FROM categories c
       LEFT JOIN channels ch ON ch.category_id = c.id
       LEFT JOIN channel_permissions cp ON cp.channel_id = ch.id
       ORDER BY c.position, ch.position, cp.role_id`,
    );

    const categories = new Map<
      string,
      {
        id: string;
        name: string;
        color: string | null;
        channels: {
          id: string;
          name: string;
          color: string | null;
          type: string;
          permissions: { role_id: string; can_view: boolean; can_send: boolean }[];
        }[];
      }
    >();
    for (const row of tree.rows as Record<string, unknown>[]) {
      const catId = row.cat_id as string;
      if (!categories.has(catId)) {
        categories.set(catId, { id: catId, name: row.cat_name as string, color: (row.cat_color as string) ?? null, channels: [] });
      }
      if (!row.ch_id) continue;
      const cat = categories.get(catId)!;
      const chId = row.ch_id as string;
      let ch = cat.channels.find((c) => c.id === chId);
      if (!ch) {
        ch = { id: chId, name: row.ch_name as string, color: (row.ch_color as string) ?? null, type: row.type as string, permissions: [] };
        cat.channels.push(ch);
      }
      if (row.role_id) {
        ch.permissions.push({
          role_id: row.role_id as string,
          can_view: row.can_view as boolean,
          can_send: row.can_send as boolean,
        });
      }
    }

    const roles = await query<{ id: string; name: string; kind: string; permissions: Record<string, boolean>; color: string | null; highlight: boolean; position: number }>(
      "SELECT id, name, kind, permissions, color, highlight, position FROM roles ORDER BY position, name",
    );

    const members = await query<{
      id: string;
      login: string;
      nickname: string | null;
      avatar: string | null;
      bio: string | null;
      banned: boolean;
      created_at: string;
      invited_by: string | null;
      online: boolean;
      roles: unknown;
    }>(
      `SELECT u.id, u.login, u.nickname, u.avatar, u.bio, u.banned, u.created_at,
              inv.login AS invited_by,
              (u.last_seen IS NOT NULL AND u.last_seen > now() - interval '90 seconds') AS online,
              COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name, 'kind', r.kind, 'permissions', r.permissions, 'color', r.color, 'position', r.position, 'highlight', r.highlight) ORDER BY r.position) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
       FROM users u
       LEFT JOIN invites i ON i.used_by = u.id
       LEFT JOIN users inv ON inv.id = i.created_by
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id, inv.login, u.last_seen
       ORDER BY u.created_at`,
    );

    return {
      categories: [...categories.values()],
      roles: roles.rows,
      members: members.rows,
    };
  });

  /* ---------- categories ---------- */

  app.post("/api/categories", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const name = readStr(request.body, "name")?.trim();
    if (!name) return reply.status(400).send({ error: "Введите название раздела" });
    const nameErr = nameError(name, LIMITS.categoryName);
    if (nameErr) return reply.status(400).send({ error: nameErr });
    const color = readColor(request.body) ?? null;

    const pos = await query<{ n: number }>("SELECT count(*)::int AS n FROM categories");
    const inserted = await query<{ id: string }>(
      "INSERT INTO categories (name, color, position) VALUES ($1, $2, $3) RETURNING id",
      [name, color, pos.rows[0].n],
    );
    return { id: inserted.rows[0].id };
  });

  app.patch("/api/categories/:id", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const name = readStr(request.body, "name")?.trim();
    if (!name) return reply.status(400).send({ error: "Введите название раздела" });
    const nameErr = nameError(name, LIMITS.categoryName);
    if (nameErr) return reply.status(400).send({ error: nameErr });
    const color = readColor(request.body);
    const { id } = request.params as { id: string };
    if (color !== undefined) {
      await query("UPDATE categories SET name = $1, color = $2 WHERE id = $3", [name, color, id]);
    } else {
      await query("UPDATE categories SET name = $1 WHERE id = $2", [name, id]);
    }
    return { ok: true };
  });

  app.delete("/api/categories/:id", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const { id } = request.params as { id: string };
    await query("DELETE FROM categories WHERE id = $1", [id]);
    return { ok: true };
  });

  /* ---------- channels ---------- */

  app.post("/api/channels", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const name = readStr(request.body, "name")?.trim();
    const categoryId = readStr(request.body, "categoryId");
    const type = readStr(request.body, "type") === "voice" ? "voice" : "text";
    if (!name || !categoryId) {
      return reply.status(400).send({ error: "Введите название канала" });
    }
    const nameErr = nameError(name, LIMITS.channelName);
    if (nameErr) return reply.status(400).send({ error: nameErr });
    const color = readColor(request.body) ?? null;

    const cat = await query("SELECT id FROM categories WHERE id = $1", [categoryId]);
    if (cat.rows.length === 0) {
      return reply.status(400).send({ error: "Раздел не найден" });
    }

    const pos = await query<{ n: number }>(
      "SELECT count(*)::int AS n FROM channels WHERE category_id = $1",
      [categoryId],
    );
    const inserted = await query<{ id: string }>(
      `INSERT INTO channels (category_id, name, color, type, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [categoryId, name, color, type, pos.rows[0].n],
    );
    return { id: inserted.rows[0].id };
  });

  app.patch("/api/channels/:id", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const name = readStr(request.body, "name")?.trim();
    if (!name) return reply.status(400).send({ error: "Введите название канала" });
    const nameErr = nameError(name, LIMITS.channelName);
    if (nameErr) return reply.status(400).send({ error: nameErr });
    const color = readColor(request.body);
    const { id } = request.params as { id: string };
    if (color !== undefined) {
      await query("UPDATE channels SET name = $1, color = $2 WHERE id = $3", [name, color, id]);
    } else {
      await query("UPDATE channels SET name = $1 WHERE id = $2", [name, id]);
    }
    return { ok: true };
  });

  app.delete("/api/channels/:id", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const { id } = request.params as { id: string };
    await query("DELETE FROM channels WHERE id = $1", [id]);
    return { ok: true };
  });

  /* ---------- channel permissions ---------- */

  app.patch("/api/categories/reorder", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const { orderedIds } = request.body as { orderedIds?: unknown };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return reply.status(400).send({ error: "Неверный список разделов" });
    }
    const ids = orderedIds as string[];
    const rows = await query<{ id: string }>("SELECT id FROM categories");
    const existing = new Set(rows.rows.map((r) => r.id));
    if (ids.length !== existing.size || ids.some((id) => !existing.has(id))) {
      return reply.status(400).send({ error: "Неверный список разделов" });
    }
    for (let i = 0; i < ids.length; i++) {
      await query("UPDATE categories SET position = $1 WHERE id = $2", [i, ids[i]]);
    }
    return { ok: true };
  });

  app.patch("/api/channels/reorder", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const { categoryId, orderedIds } = request.body as { categoryId?: unknown; orderedIds?: unknown };
    if (
      typeof categoryId !== "string" ||
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0
    ) {
      return reply.status(400).send({ error: "Неверный список каналов" });
    }
    const ids = orderedIds as string[];
    const rows = await query<{ id: string }>(
      "SELECT id FROM channels WHERE category_id = $1",
      [categoryId],
    );
    const existing = new Set(rows.rows.map((r) => r.id));
    if (ids.length !== existing.size || ids.some((id) => !existing.has(id))) {
      return reply.status(400).send({ error: "Неверный список каналов" });
    }
    for (let i = 0; i < ids.length; i++) {
      await query("UPDATE channels SET position = $1 WHERE id = $2", [i, ids[i]]);
    }
    return { ok: true };
  });

  app.patch("/api/channels/:id/permissions", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_channels"))) return reply.status(403).send({ error: "Нет прав" });
    const { id } = request.params as { id: string };
    const roleId = readStr(request.body, "roleId");
    const canView = readBool(request.body, "canView");
    const canSend = readBool(request.body, "canSend");
    if (!roleId || canView === undefined || canSend === undefined) {
      return reply.status(400).send({ error: "Неверные параметры" });
    }

    const ch = await query("SELECT id FROM channels WHERE id = $1", [id]);
    if (ch.rows.length === 0) return reply.status(404).send({ error: "Канал не найден" });
    const role = await query<{ kind: string }>("SELECT kind FROM roles WHERE id = $1", [roleId]);
    if (role.rows.length === 0) return reply.status(404).send({ error: "Роль не найдена" });
    if (role.rows[0].kind === "admin") {
      return reply.status(400).send({ error: "Права администратора изменить нельзя" });
    }

    if (canView && canSend) {
      await query("DELETE FROM channel_permissions WHERE channel_id = $1 AND role_id = $2", [id, roleId]);
    } else {
      await query(
        `INSERT INTO channel_permissions (channel_id, role_id, can_view, can_send)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (channel_id, role_id)
         DO UPDATE SET can_view = EXCLUDED.can_view, can_send = EXCLUDED.can_send`,
        [id, roleId, canView, canSend],
      );
    }
    return { ok: true };
  });

  /* ---------- roles ---------- */

  app.get("/api/roles", auth, async () => {
    const r = await query<{ id: string; name: string; color: string | null; position: number }>(
      "SELECT id, name, color, position FROM roles ORDER BY position, name",
    );
    return { roles: r.rows };
  });

  app.post("/api/roles", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_roles"))) return reply.status(403).send({ error: "Нет прав" });
    const name = readStr(request.body, "name")?.trim();
    if (!name) return reply.status(400).send({ error: "Введите название роли" });
    const nameErr = nameError(name, LIMITS.roleName);
    if (nameErr) return reply.status(400).send({ error: nameErr });
    const color = readColor(request.body) ?? null;

    const pos = await query<{ n: number }>("SELECT count(*)::int AS n FROM roles");
    const inserted = await query<{ id: string }>(
      `INSERT INTO roles (name, kind, permissions, color, position)
       VALUES ($1, 'custom', '{"invite":false,"manage_channels":false,"manage_roles":false}', $2, $3)
       RETURNING id`,
      [name, color, pos.rows[0].n],
    );
    return { id: inserted.rows[0].id };
  });

  app.patch("/api/roles/reorder", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_roles"))) return reply.status(403).send({ error: "Нет прав" });
    const { orderedIds } = request.body as { orderedIds?: unknown };
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return reply.status(400).send({ error: "Неверный список ролей" });
    }
    const ids = orderedIds as string[];
    const rows = await query<{ id: string }>("SELECT id FROM roles");
    const existing = new Set(rows.rows.map((r) => r.id));
    if (ids.length !== existing.size || ids.some((id) => !existing.has(id))) {
      return reply.status(400).send({ error: "Неверный список ролей" });
    }
    const admin = await query<{ id: string }>("SELECT id FROM roles WHERE kind = 'admin'");
    const adminId = admin.rows[0]?.id;
    if (adminId && ids[0] !== adminId) {
      return reply.status(400).send({ error: "Роль администратора должна быть первой" });
    }
    for (let i = 0; i < ids.length; i++) {
      await query("UPDATE roles SET position = $1 WHERE id = $2", [i, ids[i]]);
    }
    return { ok: true };
  });

  app.patch("/api/roles/:id", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_roles"))) return reply.status(403).send({ error: "Нет прав" });
    const { id } = request.params as { id: string };
    const role = await query<{ kind: string }>("SELECT kind FROM roles WHERE id = $1", [id]);
    if (role.rows.length === 0) return reply.status(404).send({ error: "Роль не найдена" });
    const locked = role.rows[0].kind === "admin";

    const name = readStr(request.body, "name")?.trim();
    const perms = readObj(request.body, "permissions");
    const highlight = readBool(request.body, "highlight");
    const color = readColor(request.body);
    if (locked && (name || perms)) {
      return reply.status(400).send({ error: "Системную роль администратора изменить нельзя" });
    }

    if (name && name.length > LIMITS.roleName) {
      return reply.status(400).send({ error: `Слишком длинное название (максимум ${LIMITS.roleName} символов)` });
    }
    await query("UPDATE roles SET name = $1 WHERE id = $2", [name, id]);

    if (perms) {
      const clean: Record<string, boolean> = {};
      for (const key of PERM_KEYS) {
        clean[key] = perms[key] === true;
      }
      await query("UPDATE roles SET permissions = $1 WHERE id = $2", [JSON.stringify(clean), id]);
    }

    if (highlight !== undefined) {
      await query("UPDATE roles SET highlight = $1 WHERE id = $2", [highlight, id]);
    }

    if (color !== undefined) {
      await query("UPDATE roles SET color = $1 WHERE id = $2", [color, id]);
    }
    return { ok: true };
  });

  app.delete("/api/roles/:id", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_roles"))) return reply.status(403).send({ error: "Нет прав" });
    const { id } = request.params as { id: string };
    const role = await query<{ kind: string }>("SELECT kind FROM roles WHERE id = $1", [id]);
    if (role.rows.length === 0) return reply.status(404).send({ error: "Роль не найдена" });
    if (role.rows[0].kind !== "custom") {
      return reply.status(400).send({ error: "Системную роль удалить нельзя" });
    }

    await query("DELETE FROM roles WHERE id = $1", [id]);
    return { ok: true };
  });

  /* ---------- member roles (up to 20) ---------- */

  app.patch("/api/users/:id/roles", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_roles"))) return reply.status(403).send({ error: "Нет прав" });
    const { id } = request.params as { id: string };
    const body = request.body as { roleIds?: unknown };
    if (!Array.isArray(body.roleIds)) {
      return reply.status(400).send({ error: "Неверный список ролей" });
    }
    const roleIds = body.roleIds.filter((r): r is string => typeof r === "string");
    if (roleIds.length === 0) {
      return reply.status(400).send({ error: "У пользователя должна быть хотя бы одна роль" });
    }
    if (roleIds.length > 20) {
      return reply.status(400).send({ error: "Можно выдать не больше 20 ролей" });
    }

    const target = await query("SELECT id FROM users WHERE id = $1", [id]);
    if (target.rows.length === 0) {
      return reply.status(404).send({ error: "Пользователь не найден" });
    }

    const unique = [...new Set(roleIds)];
    const existing = await query<{ id: string }>(
      "SELECT id FROM roles WHERE id = ANY($1)",
      [unique],
    );
    if (existing.rows.length !== unique.length) {
      return reply.status(400).send({ error: "Неизвестная роль" });
    }

    const targetRoles = await query<{ kind: string }>(
      "SELECT r.kind FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1",
      [id],
    );
    const hasAdminNow = targetRoles.rows.some((r) => r.kind === "admin");
    const willHaveAdmin = unique.includes(
      (await query<{ id: string }>("SELECT id FROM roles WHERE kind = 'admin'")).rows[0]?.id,
    );
    if (hasAdminNow && !willHaveAdmin && (await countAdmins()) <= 1) {
      return reply.status(400).send({ error: "Нельзя убрать последнего администратора" });
    }

    const client = await import("../db.js");
    await client.query("DELETE FROM user_roles WHERE user_id = $1", [id]);
    for (const roleId of unique) {
      await client.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id, roleId],
      );
    }
    return { ok: true };
  });

  /* ---------- ban / unban ---------- */

  app.patch("/api/users/:id/ban", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await can(user.sub, "manage_roles"))) return reply.status(403).send({ error: "Нет прав" });
    const { id } = request.params as { id: string };
    const body = request.body as { banned?: unknown };
    const banned = typeof body.banned === "boolean" ? body.banned : null;
    if (banned === null) return reply.status(400).send({ error: "Неверные параметры" });
    if (id === user.sub) {
      return reply.status(400).send({ error: "Нельзя заблокировать себя" });
    }

    const target = await query("SELECT id FROM users WHERE id = $1", [id]);
    if (target.rows.length === 0) {
      return reply.status(404).send({ error: "Пользователь не найден" });
    }

    const targetRoles = await query<{ kind: string }>(
      "SELECT r.kind FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1",
      [id],
    );
    if (banned && targetRoles.rows.some((r) => r.kind === "admin") && (await countAdmins()) <= 1) {
      return reply.status(400).send({ error: "Нельзя заблокировать последнего администратора" });
    }

    if (banned) {
      await query(
        "UPDATE users SET banned = true, token_version = token_version + 1 WHERE id = $1",
        [id],
      );
    } else {
      await query("UPDATE users SET banned = false WHERE id = $1", [id]);
    }
    return { ok: true };
  });

  /* ---------- важные настройки: S3 ---------- */

  app.get("/api/settings/s3", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await isAdmin(user.sub))) return reply.status(403).send({ error: "Нет прав" });
    const s3 = await getS3Settings();
    if (!s3) return { s3: null };
    return { s3: { ...s3, secretAccessKey: s3.secretAccessKey ? "****" : "" } };
  });

  app.post("/api/settings/s3", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await isAdmin(user.sub))) return reply.status(403).send({ error: "Нет прав" });
    const read = (k: string) =>
      typeof (request.body as Record<string, unknown>)?.[k] === "string"
        ? ((request.body as Record<string, unknown>)[k] as string).trim()
        : "";
    const existing = await getS3Settings();
    let secret = read("secretAccessKey");
    if (secret === "" || secret === "****") secret = existing?.secretAccessKey ?? "";
    const s3: S3Settings = {
      bucket: read("bucket"),
      region: read("region"),
      endpoint: read("endpoint"),
      accessKeyId: read("accessKeyId"),
      secretAccessKey: secret,
      publicUrl: read("publicUrl"),
    };
    if (
      !s3.bucket || !s3.region || !s3.endpoint ||
      !s3.accessKeyId || !s3.secretAccessKey || !s3.publicUrl
    ) {
      return reply.status(400).send({ error: "Заполните все поля" });
    }
    try {
      await testS3Connection(s3);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
    await setS3Settings(s3);
    return { ok: true };
  });

  app.delete("/api/settings/s3", auth, async (request, reply) => {
    const user = request.user as { sub: string };
    if (!(await isAdmin(user.sub))) return reply.status(403).send({ error: "Нет прав" });
    await setS3Settings(null);
    return { ok: true };
  });
}

function readObj(body: unknown, key: string): Record<string, unknown> | undefined {
  const b = body as Record<string, unknown>;
  return typeof b[key] === "object" && b[key] !== null ? (b[key] as Record<string, unknown>) : undefined;
}
