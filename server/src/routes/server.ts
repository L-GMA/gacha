import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getRoleForUser } from "../permissions.js";
import { listConversations, shapeConversation } from "./conversations.js";

type ChannelRow = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  channel_id: string | null;
  channel_name: string | null;
  channel_color: string | null;
  type: string | null;
  ch_position: number | null;
};

export async function serverRoutes(app: FastifyInstance) {
  app.get("/api/server", { preHandler: app.authenticate }, async (request) => {
    const user = request.user as { sub: string };
    await query("UPDATE users SET last_seen = now() WHERE id = $1", [user.sub]);
    const me = await getRoleForUser(user.sub);
    const isAdmin = me?.kind === "admin";

    let restricted = new Set<string>();
    if (!isAdmin && me) {
      const rows = await query<{ channel_id: string }>(
        "SELECT channel_id FROM channel_permissions WHERE role_id = $1 AND can_view = false",
        [me.id],
      );
      restricted = new Set(rows.rows.map((r) => r.channel_id));
    }

    const tree = await query<ChannelRow>(
      `SELECT c.id, c.name, c.color, c.position,
              ch.id AS channel_id, ch.name AS channel_name, ch.color AS channel_color, ch.type, ch.position AS ch_position
       FROM categories c
       LEFT JOIN channels ch ON ch.category_id = c.id
       ORDER BY c.position, ch.position`,
    );

    const categories = new Map<
      string,
      { id: string; name: string; color: string | null; channels: { id: string; name: string; color: string | null; type: string }[] }
    >();
    for (const row of tree.rows) {
      if (!categories.has(row.id)) {
        categories.set(row.id, { id: row.id, name: row.name, color: row.color, channels: [] });
      }
      if (row.channel_id && !restricted.has(row.channel_id)) {
        categories.get(row.id)!.channels.push({
          id: row.channel_id,
          name: row.channel_name!,
          color: row.channel_color,
          type: row.type!,
        });
      }
    }

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
       WHERE NOT u.banned
       GROUP BY u.id, inv.login, u.last_seen
       ORDER BY u.created_at`,
    );

    const meRow = members.rows.find((m) => m.id === user.sub);
    const conversations = (await listConversations(user.sub)).map(shapeConversation);
    return {
      categories: [...categories.values()],
      members: members.rows,
      conversations,
      me:
        meRow ??
        {
          id: user.sub,
          login: "",
          nickname: null,
          avatar: null,
          bio: null,
          banned: false,
          created_at: "",
          invited_by: null,
          online: false,
          roles: [],
        },
    };
  });
}
