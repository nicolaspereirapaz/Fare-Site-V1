import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getConversation } from "@/lib/atendimento/repository";
import { mediaPath } from "@/lib/atendimento/media";
import { bridgeConfig } from "@/lib/atendimento/whatsapp";

/** Foto guardada por 1 dia; "sem foto" (privacidade ou não tem) é conferido de novo a cada 6 h. */
const PHOTO_TTL = 24 * 60 * 60 * 1000;
const NONE_TTL = 6 * 60 * 60 * 1000;
const pending = new Map<string, Promise<Buffer | null>>();

async function fresh(file: string, ttl: number) {
  const info = await stat(file).catch(() => null);
  return info && Date.now() - info.mtimeMs < ttl ? info : null;
}

/** Foto de perfil do WhatsApp do contato (pela ponte), com cópia em disco. null = sem foto. */
export function contactPhoto(db: DatabaseSync, conversationId: string, fetcher: typeof fetch = fetch): Promise<Buffer | null> {
  const running = pending.get(conversationId);
  if (running) return running;
  const job = loadPhoto(db, conversationId, fetcher).finally(() => pending.delete(conversationId));
  pending.set(conversationId, job);
  return job;
}

async function loadPhoto(db: DatabaseSync, conversationId: string, fetcher: typeof fetch) {
  const conversation = getConversation(db, conversationId);
  if (conversation.channel !== "whatsapp" || !conversation.waChatId) return null;
  const file = mediaPath(`perfil/${conversation.id}.jpg`);
  const none = mediaPath(`perfil/${conversation.id}.sem-foto`);
  if (await fresh(file, PHOTO_TTL)) return readFile(file);
  if (await fresh(none, NONE_TTL)) return null;
  const bridge = bridgeConfig();
  const old = await readFile(file).catch(() => null);
  if (!bridge) return old;
  try {
    const response = await fetcher(`${bridge.url}/fare/painel/foto?chatId=${encodeURIComponent(conversation.waChatId)}`, {
      headers: { "x-fare-token": bridge.token },
      signal: AbortSignal.timeout(20000),
    });
    await mkdir(path.dirname(file), { recursive: true });
    if (response.status === 404 || response.status === 403) {
      await writeFile(none, "");
      return null;
    }
    if (!response.ok) return old; // ponte desconectada: usa a última foto que tinha
    const photo = Buffer.from(await response.arrayBuffer());
    await writeFile(file, photo);
    return photo;
  } catch {
    return old;
  }
}
