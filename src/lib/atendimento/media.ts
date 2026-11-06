import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import sharp from "sharp";
import type { DatabaseSync } from "node:sqlite";
import type { MediaKind } from "@/lib/atendimento/types";
import { markMediaPruned, mediaToPrune } from "@/lib/atendimento/repository";
import { FFMPEG } from "@/lib/photoOrders/config";

/**
 * Fotos, vídeos, áudios e documentos das conversas do atendimento.
 * Ficam no disco do PC (data/atendimento-midias/<conversa>/<arquivo>), na qualidade em que chegaram.
 */
export const MEDIA_DIR = process.env.FARE_ATENDIMENTO_MEDIA_DIR || path.join(process.cwd(), "data", "atendimento-midias");
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const THUMB_SUFFIX = ".mini.jpg";

/** Miniatura no formato da foto (em pé fica em pé, deitada fica deitada), até 480 px no lado maior. */
const makeThumb = (source: string) =>
  sharp(source, { failOn: "none" }).rotate().resize(480, 480, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toFile(source + THUMB_SUFFIX);

/** Refaz miniaturas antigas (eram cortadas em quadrado) a partir do original, quando ele ainda existe. */
export async function redoThumbs(files: string[]) {
  let done = 0;
  for (const relative of files) {
    const original = mediaPath(relative);
    if (!existsSync(original)) continue;
    await makeThumb(original).then(() => (done += 1), () => undefined);
  }
  return done;
}

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

/**
 * Como o arquivo vai pelo WhatsApp: só os formatos que o app mostra como foto/vídeo/áudio vão assim;
 * qualquer outro (HEIC, TIFF, MKV, WAV, EXE, RAR, PSD...) vai como documento, com o nome e o arquivo intactos.
 */
export function kindFromMime(mime: string): MediaKind {
  if (/^image\/(jpeg|png|webp|gif)$/.test(mime)) return "imagem";
  if (/^video\/(mp4|3gpp|quicktime)$/.test(mime)) return "video";
  if (/^audio\/(ogg|mpeg|mp4|aac|amr|x-m4a|webm)$/.test(mime)) return "audio";
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
/** Qualquer tipo de arquivo (o navegador manda "application/octet-stream" quando não reconhece). */
export function acceptedMime(mime: string) {
  return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(mime);
}

/** Tipos que o navegador executaria (página, SVG, script): sempre baixados, nunca abertos no site. */
export const downloadOnlyMime = (mime: string) => /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript|application\/x-javascript)$/.test(mime);

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
    await makeThumb(target).catch(() => undefined);
  }
  return { file: relative.split(path.sep).join("/"), size, name, mime, kind: input.kind ?? kindFromMime(mime) };
}

/**
 * Áudio gravado no navegador (webm) -> ogg/opus, o formato de "mensagem de voz" do WhatsApp.
 * Usa o ffmpeg do PC (o mesmo do pedido de fotos).
 */
export async function toVoiceNote(stored: StoredMedia): Promise<StoredMedia> {
  if (stored.mime !== "audio/webm") return stored;
  const input = mediaPath(stored.file);
  const relative = stored.file.replace(/\.[^./]+$/, "") + ".ogg";
  const output = mediaPath(relative);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, ["-v", "error", "-y", "-i", input, "-vn", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", output], { windowsHide: true });
    let errors = "";
    child.stderr.on("data", (chunk) => (errors += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg não converteu o áudio (${code}): ${errors.slice(0, 200)}`))));
  });
  await rm(input, { force: true });
  const { size } = await stat(output);
  return { ...stored, file: relative, mime: "audio/ogg", name: "audio.ogg", size, kind: "audio" };
}

/** Copia um anexo (ex.: da mensagem rápida) para a pasta da conversa; cada envio fica com o seu arquivo. */
export async function copyMedia(relative: string, conversationId: string) {
  const target = path.join(conversationId, `${randomUUID()}${path.extname(relative)}`).split(path.sep).join("/");
  await mkdir(path.dirname(mediaPath(target)), { recursive: true });
  await copyFile(mediaPath(relative), mediaPath(target));
  await copyFile(mediaPath(relative, true), mediaPath(target, true)).catch(() => undefined);
  return target;
}

/** Dias que as mídias originais das conversas ficam guardadas (FARE_MIDIAS_DIAS; 0 = guardar tudo). */
export function mediaRetentionDays(env: NodeJS.ProcessEnv = process.env) {
  const days = Number(env.FARE_MIDIAS_DIAS ?? 90);
  return Number.isFinite(days) && days >= 0 ? Math.floor(days) : 90;
}

/**
 * Limpeza: apaga o ORIGINAL das mídias com mais de N dias e deixa a miniatura (a conversa continua mostrando a foto pequena).
 * Fotos de pedidos e anexos de mensagens rápidas são cópias à parte e não são apagados.
 */
export async function pruneOldMedia(db: DatabaseSync, days = mediaRetentionDays(), now = new Date()) {
  if (!days) return { pruned: 0, bytes: 0 };
  const before = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  let pruned = 0;
  let bytes = 0;
  for (;;) {
    const batch = mediaToPrune(db, before);
    if (!batch.length) break;
    for (const item of batch) {
      const file = mediaPath(item.file);
      bytes += (await stat(file).catch(() => null))?.size ?? 0;
      await rm(file, { force: true });
      markMediaPruned(db, item.id);
      pruned += 1;
    }
  }
  return { pruned, bytes };
}

export async function removeMedia(relative: string | null) {
  if (!relative) return;
  await rm(mediaPath(relative), { force: true });
  await rm(mediaPath(relative, true), { force: true });
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
