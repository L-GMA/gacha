import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { query } from "../db.js";
import { can } from "../permissions.js";

export async function inviteRoutes(app: FastifyInstance) {
  app.post(
    "/api/invites",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 30, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const user = request.user as { sub: string };
      if (!(await can(user.sub, "invite"))) {
        return reply.status(403).send({ error: "Нет права приглашать" });
      }
      const code = crypto.randomBytes(16).toString("hex");
      const inserted = await query<{ id: string; code: string }>(
        "INSERT INTO invites (code, created_by) VALUES ($1, $2) RETURNING id, code",
        [code, user.sub],
      );
      return { id: inserted.rows[0].id, code: inserted.rows[0].code };
    },
  );

  app.get("/api/invites", { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { sub: string };
    const rows = await query(
      `SELECT i.id, i.code, i.used_at, i.created_at, u.login AS used_by_login
       FROM invites i
       LEFT JOIN users u ON u.id = i.used_by
       WHERE i.created_by = $1
       ORDER BY i.created_at DESC`,
      [user.sub],
    );
    return { invites: rows.rows };
  });

  app.delete(
    "/api/invites/:id",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const user = request.user as { sub: string };
      const { id } = request.params as { id: string };
      const found = await query<{ used_by: string | null }>(
        "SELECT used_by FROM invites WHERE id = $1 AND created_by = $2",
        [id, user.sub],
      );
      const row = found.rows[0];
      if (!row) return reply.status(404).send({ error: "Код не найден" });
      await query("DELETE FROM invites WHERE id = $1", [id]);
      return { ok: true };
    },
  );
}
