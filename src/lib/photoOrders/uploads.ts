import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import sharp from "sharp";
import { ABANDONED_UPLOAD_DAYS, FFMPEG, MAX_UPLOAD_BYTES, MAX_UPLOAD_PIXELS, UPLOADS_DIR } from "./config";

/** Foto enviada pelo cliente, antes de virar pedido. */
export type PhotoUpload = {
  id: string;
  /** Nome do arquivo no celular/computador do cliente. */
  name: string;
  createdAt: string;
  /** Arquivo exatamente como chegou. */
  original: string;
  /** JPG ou PNG que a máquina aceita (o próprio original, ou o convertido pelo ffmpeg). */
  source: string;
  /** Prévia leve para o navegador (o HEIC, por exemplo, o Chrome não mostra). */
  preview: string;
  width: number;
  height: number;
  /** Formato original quando precisou converter (ex.: "heic"). */
  convertedFrom: string | null;
};

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUploadId = (id: string) => ID.test(id);
const dirOf = (id: string) => path.join(UPLOADS_DIR, id);

/** Marcas de HEIC/HEIF/AVIF (caixa "ftyp" do arquivo). */
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis"]);

/**
 * JPG e PNG a máquina aceita como estão; HEIC, AVIF, WEBP, TIFF, GIF e BMP passam pelo ffmpeg.
 * Qualquer outra coisa é recusada antes do ffmpeg (ele abre playlists e outros formatos que poderiam ler arquivos do servidor).
 */
export async function sniff(file: string): Promise<"jpeg" | "png" | "other" | "unknown"> {
  const handle = await open(file, "r");
  try {
    const { buffer } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    const ascii = (start: number, end: number) => buffer.subarray(start, end).toString("latin1");
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
    if (ascii(4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(8, 12))) return "other";
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "other";
    if (ascii(0, 4) === "II*\0" || ascii(0, 4) === "MM\0*" || ascii(0, 4) === "GIF8" || ascii(0, 2) === "BM") return "other";
    return "unknown";
  } finally {
    await handle.close();
  }
}

/** Corta o envio que passar do limite (ninguém enche o disco do servidor). */
function sizeLimit(max: number) {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      total += chunk.length;
      done(total > max ? new Error(`Arquivo acima de ${Math.round(max / 1024 / 1024)} MB.`) : null, chunk);
    },
  });
}

/** HEIC (inclusive o "mosaico" do iPhone, que o ffmpeg 7.1+ junta sozinho), WEBP, AVIF, TIFF… → JPG. */
function convertToJpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ["-v", "error", "-y", "-i", input, "-frames:v", "1", "-q:v", "2", output], { windowsHide: true });
    let errors = "";
    child.stderr.on("data", (chunk) => { errors += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg não conseguiu converter (${code}): ${errors.slice(0, 300)}`))));
  });
}

const safeExtension = (name: string) => {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6);
  return ext.length > 1 ? ext : ".bin";
};

/** Guarda o arquivo enviado (até MAX_UPLOAD_BYTES), converte se precisar e prepara a prévia. */
export async function saveUpload(body: ReadableStream<Uint8Array>, fileName: string): Promise<PhotoUpload> {
  const id = randomUUID();
  const dir = dirOf(id);
  await mkdir(dir, { recursive: true });
  try {
    const original = path.join(dir, `original${safeExtension(fileName)}`);
    await pipeline(Readable.fromWeb(body as unknown as WebReadableStream<Uint8Array>), sizeLimit(MAX_UPLOAD_BYTES), createWriteStream(original));

    const kind = await sniff(original);
    if (kind === "unknown") throw new Error("Formato de arquivo não aceito.");
    let source = original;
    let convertedFrom: string | null = null;
    if (kind === "other") {
      source = path.join(dir, "convertido.jpg");
      await convertToJpeg(original, source);
      convertedFrom = safeExtension(fileName).slice(1);
    }

    // Medidas já com a rotação do celular aplicada (EXIF), igual o navegador mostra.
    const meta = await sharp(source, { limitInputPixels: MAX_UPLOAD_PIXELS }).metadata();
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? 0;
    const height = (rotated ? meta.width : meta.height) ?? 0;
    if (!width || !height) throw new Error("Não foi possível ler a imagem.");

    const preview = path.join(dir, "previa.jpg");
    await sharp(source, { limitInputPixels: MAX_UPLOAD_PIXELS }).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toFile(preview);

    const upload: PhotoUpload = {
      id, name: fileName.slice(0, 200), createdAt: new Date().toISOString(), original, source, preview, width, height, convertedFrom,
    };
    await writeFile(path.join(dir, "envio.json"), JSON.stringify(upload, null, 2));
    return upload;
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function readUpload(id: string): Promise<PhotoUpload | null> {
  if (!isUploadId(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(dirOf(id), "envio.json"), "utf8")) as PhotoUpload;
  } catch {
    return null;
  }
}

/** Depois que o pedido foi montado, o envio sai daqui (os arquivos já estão na pasta do pedido). */
export const removeUpload = (id: string) => (isUploadId(id) ? rm(dirOf(id), { recursive: true, force: true }) : Promise.resolve());

let lastCleanup = 0;
/** Apaga envios que nunca viraram pedido. Roda no máximo uma vez por hora, aproveitando os próprios envios. */
export async function cleanupAbandonedUploads(now = Date.now()) {
  if (now - lastCleanup < 60 * 60 * 1000) return 0;
  lastCleanup = now;
  const limit = now - ABANDONED_UPLOAD_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const id of await readdir(UPLOADS_DIR).catch(() => [] as string[])) {
    const upload = await readUpload(id);
    // Sem envio.json = ainda chegando (ou quebrou no meio): vale a data da pasta, nunca apaga um envio em andamento.
    const created = upload ? Date.parse(upload.createdAt) : await stat(dirOf(id)).then((info) => info.mtimeMs, () => now);
    if (created < limit) {
      await rm(dirOf(id), { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}
