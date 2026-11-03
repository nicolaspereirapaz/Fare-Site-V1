import { readFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { mediaPath } from "@/lib/atendimento/media";
import { getMessage, mediaFileOf, setTranscript } from "@/lib/atendimento/repository";

/**
 * Transcrição de áudio pelo serviço local (extensions/fare_atendimento/painel_voz.py, faster-whisper no PC).
 * Configuração: FARE_VOZ_URL (padrão http://127.0.0.1:8652) e o mesmo token da IA (FARE_IA_TOKEN).
 */
export function voiceConfig(env: Record<string, string | undefined> = process.env) {
  const token = env.FARE_IA_TOKEN?.trim();
  const url = (env.FARE_VOZ_URL?.trim() || "http://127.0.0.1:8652").replace(/\/$/, "");
  return token ? { url, token } : null;
}

export const needsTranscript = (message: { media: { kind: string } | null }) => message.media?.kind === "audio";

/** Transcreve o áudio da mensagem e guarda o texto. Nunca lança: falha vira "falhou" (o painel mostra). */
export async function transcribeMessage(db: DatabaseSync, messageId: string, config = voiceConfig(), fetcher: typeof fetch = fetch) {
  const message = getMessage(db, messageId);
  const stored = mediaFileOf(db, messageId);
  if (!message || !stored || !needsTranscript(message)) return null;
  if (!config) {
    setTranscript(db, messageId, "falhou");
    return null;
  }
  setTranscript(db, messageId, "pendente");
  try {
    const response = await fetcher(`${config.url}/transcrever`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-fare-token": config.token },
      body: new Uint8Array(await readFile(mediaPath(stored.file))),
      signal: AbortSignal.timeout(180_000),
    });
    const data = (await response.json().catch(() => ({}))) as { text?: string };
    if (!response.ok) throw new Error(`transcrição respondeu ${response.status}`);
    const text = (data.text ?? "").trim();
    setTranscript(db, messageId, "ok", text);
    return text;
  } catch (error) {
    console.error("[atendimento] transcrição:", error instanceof Error ? error.message : error);
    setTranscript(db, messageId, "falhou");
    return null;
  }
}
