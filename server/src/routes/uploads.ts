import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { storeFile } from "../storage.js";
import { query } from "../db.js";

type ImageType = { mime: string; ext: string };

const SOUND_MAX_BYTES = 700 * 1024;

function detectAudioType(mime: string): string | null {
  switch (mime.toLowerCase()) {
    case "audio/mpeg":
    case "audio/mp3":
      return ".mp3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return ".wav";
    case "audio/ogg":
    case "audio/opus":
      return ".ogg";
    case "audio/webm":
      return ".webm";
    case "audio/mp4":
    case "audio/aac":
    case "audio/x-m4a":
      return ".m4a";
    default:
      return null;
  }
}

function detectImageType(buf: Buffer): ImageType | null {
  if (buf.length < 12) return null;
  const ascii = (from: number, to: number) => buf.toString("latin1", from, to);
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return { mime: "image/webp", ext: ".webp" };
  }
  if (
    ascii(4, 8) === "ftyp" &&
    (ascii(8, 12) === "avif" || ascii(8, 12) === "avis")
  ) {
    return { mime: "image/avif", ext: ".avif" };
  }
  if (ascii(0, 4) === "GIF8") {
    return { mime: "image/gif", ext: ".gif" };
  }
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    return { mime: "image/png", ext: ".png" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  return null;
}

export async function uploadsRoutes(app: FastifyInstance) {
  const auth = app.authenticate;

  app.post("/api/upload", { preHandler: auth }, async (request, reply) => {
    const data = await request.file({ limits: { fileSize: 8 * 1024 * 1024 } });
    if (!data) return reply.status(400).send({ error: "Файл не получен" });

    const buffer = await data.toBuffer();
    const detected = detectImageType(buffer);
    if (!detected) {
      return reply.status(400).send({ error: "Можно загружать только изображения" });
    }

    const key = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}${detected.ext}`;
    const url = await storeFile(key, buffer, detected.mime);
    return { url };
  });

  app.put("/api/me/sound/:type", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { type } = request.params as { type: string };
    if (type !== "join" && type !== "leave") {
      return reply.status(400).send({ error: "Неверный тип звука" });
    }
    const data = await request.file({ limits: { fileSize: SOUND_MAX_BYTES } });
    if (!data) return reply.status(400).send({ error: "Файл не получен" });
    const buffer = await data.toBuffer();
    const ext = detectAudioType(data.mimetype ?? "");
    if (!ext) {
      return reply
        .status(400)
        .send({ error: "Можно загружать только аудио (mp3, wav, ogg, m4a)" });
    }
    const key = `sounds/${new Date().toISOString().slice(0, 10)}/${user.sub}-${type}-${randomUUID()}${ext}`;
    const url = await storeFile(key, buffer, data.mimetype ?? "audio/mpeg");
    const column = type === "join" ? "join_sound_url" : "leave_sound_url";
    await query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [url, user.sub]);
    return { url };
  });

  app.delete("/api/me/sound/:type", { preHandler: auth }, async (request, reply) => {
    const user = request.user as { sub: string };
    const { type } = request.params as { type: string };
    if (type !== "join" && type !== "leave") {
      return reply.status(400).send({ error: "Неверный тип звука" });
    }
    const column = type === "join" ? "join_sound_url" : "leave_sound_url";
    await query(`UPDATE users SET ${column} = NULL WHERE id = $1`, [user.sub]);
    return { ok: true };
  });
}
