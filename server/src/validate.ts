import { getActiveS3 } from "./settings.js";

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

export async function isOwnImageUrl(value: string): Promise<boolean> {
  if (value.length > LIMITS.imageUrl) return false;
  if (value.startsWith("/uploads/")) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const s3 = await getActiveS3();
  if (!s3) return false;
  let pub: URL;
  try {
    pub = new URL(s3.publicUrl);
  } catch {
    return false;
  }
  return url.origin === pub.origin;
}
