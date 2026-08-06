import { query } from "./db.js";

export type RoleRecord = {
  id: string;
  name: string;
  kind: string;
  permissions: Record<string, boolean>;
};

export async function getRolesForUser(userId: string): Promise<RoleRecord[]> {
  const r = await query<RoleRecord>(
    `SELECT r.id, r.name, r.kind, r.permissions
     FROM roles r JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1
     ORDER BY r.position, r.name`,
    [userId],
  );
  return r.rows;
}

export function mergeRoles(roles: RoleRecord[]): RoleRecord | null {
  if (roles.length === 0) return null;
  const isAdmin = roles.some((r) => r.kind === "admin");
  const admin = roles.find((r) => r.kind === "admin");
  const permissions: Record<string, boolean> = {};
  for (const role of roles) {
    for (const [key, value] of Object.entries(role.permissions ?? {})) {
      if (value) permissions[key] = true;
    }
  }
  return {
    id: admin?.id ?? roles[0].id,
    name: admin?.name ?? roles[0].name,
    kind: isAdmin ? "admin" : roles[0].kind,
    permissions,
  };
}

export async function getRoleForUser(userId: string): Promise<RoleRecord | null> {
  return mergeRoles(await getRolesForUser(userId));
}

export async function can(userId: string, perm: string): Promise<boolean> {
  const roles = await getRolesForUser(userId);
  if (roles.length === 0) return false;
  if (roles.some((r) => r.kind === "admin")) return true;
  return roles.some((r) => r.permissions?.[perm] === true);
}

export async function isAdmin(userId: string): Promise<boolean> {
  const roles = await getRolesForUser(userId);
  return roles.some((r) => r.kind === "admin");
}

export async function countAdmins(): Promise<number> {
  const r = await query<{ n: number }>(
    `SELECT count(DISTINCT ur.user_id)::int AS n
     FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE r.kind = 'admin'`,
  );
  return r.rows[0].n;
}
