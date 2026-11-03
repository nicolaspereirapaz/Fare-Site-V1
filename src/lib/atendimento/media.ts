import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import sharp from "sharp";
import type { MediaKind } from "@/lib/atendimento/types";

/**
 * Fotos, vídeos, áudios e documentos das conversas do atendimento.
 * Ficam no disco do PC (data/atendimento-midias/<conversa>/<arquivo>), na qualidade em que chegaram.
 */
export const MEDIA_DIR = process.env.FARE_ATENDIMENTO_MEDIA_DIR || path.join(process.cwd(), "data", "atendimento-midias");
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const THUMB_SUFFIX = ".mini.jpg";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "video/mp4": ".mp4",
  "video/3gpp": ".3gp",
  "audio/ogg": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "application/pdf": ".pdf",
};

export function kindFromMime(mime: string): MediaKind {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

export const MEDIA_LABEL: Record<MediaKind, string> = {
  imagem: "[imagem]",
  video: "[vídeo]",
  audio: "[áudio]",
  documento: "[documento]",
  figurinha: "[figurinha]",
};

/** Nome de arquivo seguro (sem pastas, sem caracteres que o Windows recusa). */
export function safeFileName(name: string, mime: string) {
  const base = path.basename(name || "").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 120);
  const ext = path.extname(base) || MIME_EXT[mime.split(";")[0].trim()] || "";
  const stem = (ext ? base.slice(0, -ext.length) : base) || "arquivo";
  return `${stem}${ext.toLowerCase()}`;
}

/** Tipos aceitos para enviar pelo painel/simulador. */
export function acceptedMime(mime: string) {
  return /^(image|video|audio)\//.test(mime) || /^application\/(pdf|zip|x-zip-compressed|msword|vnd\.|octet-stream)/.test(mime) || mime === "text/plain";
}

function sizeLimit(max: number) {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      total += chunk.length;
      done(total > max ? new Error(`Arquivo acima de ${Math.round(max / 1024 / 1024)} MB.`) : null, chunk);
    },
  });
}

export type StoredMedia = { file: string; size: number; name: string; mime: string; kind: MediaKind };

/** Grava o arquivo recebido (stream) na pasta da conversa e faz a miniatura das fotos. */
export async function saveMedia(
  body: ReadableStream<Uint8Array> | Buffer,
  input: { conversationId: string; name: string; mime: string; kind?: MediaKind },
): Promise<StoredMedia> {
  const mime = input.mime.split(";")[0].trim().toLowerCase() || "application/octet-stream";
  const name = safeFileName(input.name, mime);
  const relative = path.join(input.conversationId, `${randomUUID()}${path.extname(name)}`);
  const target = path.join(MEDIA_DIR, relative);
  await mkdir(path.dirname(target), { recursive: true });
  const source = Buffer.isBuffer(body) ? Readable.from([body]) : Readable.fromWeb(body as unknown as WebReadableStream<Uint8Array>);
  try {
    await pipeline(source, sizeLimit(MAX_MEDIA_BYTES), createWriteStream(target, { flags: "wx" }));
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
  const { size } = await stat(target);
  if (!size) {
    await rm(target, { force: true });
    throw new Error("Arquivo vazio.");
  }
  if (mime.startsWith("image/")) {
    // Miniatura para a lista de mídias; se a foto não abrir (HEIC, por ex.), o painel usa o ícone.
    await sharp(target, { failOn: "none" }).rotate().resize(320, 320, { fit: "cover" }).jpeg({ quality: 72 }).toFile(target + THUMB_SUFFIX).catch(() => undefined);
  }
  return { file: relative.split(path.sep).join("/"), size, name, mime, kind: input.kind ?? kindFromMime(mime) };
}

/** Caminho absoluto, sem sair da pasta de mídias. */
export function mediaPath(relative: string, thumb = false) {
  const full = path.resolve(MEDIA_DIR, relative + (thumb ? THUMB_SUFFIX : ""));
  if (!full.startsWith(path.resolve(MEDIA_DIR) + path.sep)) throw new Error("Caminho inválido.");
  return full;
}

/* ===================== ZIP (sem compressão: fotos já são comprimidas) ===================== */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export type ZipEntry = { name: string; file: string; date: Date };

/** ZIP montado arquivo por arquivo (só um arquivo na memória de cada vez). Nomes em UTF-8. */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (index < entries.length) {
        const entry = entries[index];
        index += 1;
        const data = await readFile(entry.file);
        const name = Buffer.from(entry.name, "utf8");
        const crc = crc32(data);
        const { time, day } = dosDateTime(entry.date);
        if (offset + data.length > 0xfffffff0) throw new Error("Seleção grande demais para um ZIP (máx. 4 GB). Baixe em partes.");
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
        local.writeUInt16LE(0, 8); // sem compressão
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(day, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        const record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50, 0);
        record.writeUInt16LE(20, 4);
        record.writeUInt16LE(20, 6);
        record.writeUInt16LE(0x0800, 8);
        record.writeUInt16LE(0, 10);
        record.writeUInt16LE(time, 12);
        record.writeUInt16LE(day, 14);
        record.writeUInt32LE(crc, 16);
        record.writeUInt32LE(data.length, 20);
        record.writeUInt32LE(data.length, 24);
        record.writeUInt16LE(name.length, 28);
        record.writeUInt32LE(offset, 42);
        central.push(record, name);
        offset += local.length + name.length + data.length;
        controller.enqueue(new Uint8Array(Buffer.concat([local, name, data])));
        return;
      }
      const directory = Buffer.concat(central);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(entries.length, 8);
      end.writeUInt16LE(entries.length, 10);
      end.writeUInt32LE(directory.length, 12);
      end.writeUInt32LE(offset, 16);
      controller.enqueue(new Uint8Array(Buffer.concat([directory, end])));
      controller.close();
    },
  });
}
