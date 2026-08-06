export function highestRoleColor(
  roles: { position?: number; color: string | null }[],
): string | null {
  return (
    [...roles]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .find((r) => r.color)?.color ?? null
  );
}
