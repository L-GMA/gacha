export const LIMITS = {
  loginMin: 3,
  loginMax: 20,
  nickname: 32,
  bio: 50,
  categoryName: 40,
  channelName: 40,
  roleName: 32,
  content: 4000,
  imageUrl: 2048,
} as const;

export function isSafeImageUrl(value: string): boolean {
  if (value.length > LIMITS.imageUrl) return false;
  if (value.startsWith("/uploads/")) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}
