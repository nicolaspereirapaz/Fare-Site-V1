import { database } from "@/lib/auth";
import { AtendimentoError, runAtendimentoMigrations, type StaffActor } from "@/lib/atendimento/repository";
import type { DatabaseSync } from "node:sqlite";
import { after } from "next/server";
import { readStaffSession } from "@/lib/staff/server";
import { queueIfAiOff, runAi } from "@/lib/atendimento/service";
import { deliverToWhatsApp } from "@/lib/atendimento/whatsapp";
import { transcribeMessage } from "@/lib/atendimento/transcribe";
import { pruneOldMedia, redoThumbs } from "@/lib/atendimento/media";
import type { Message } from "@/lib/atendimento/types";
import { createRealBrain, realAiConfig, REAL_AI_NAME } from "@/lib/atendimento/hermesBrain";
import { simulatedBrain, SIMULATED_AI_NAME, type Brain } from "@/lib/atendimento/simulatedBrain";

/**
 * Depois de responder ao navegador: a IA responde (se a conversa estiver com ela)
 * e o que ela escreveu sai pelo WhatsApp. Conversas do simulador não saem do site.
 */
export function respondInBackground(db: DatabaseSync, conversationId: string, options: { transcribeFirst?: string } = {}) {
  const { brain, name } = activeBrain();
  after(async () => {
    try {
      // Áudio do cliente: transcreve antes, para a IA "ouvir" o que ele disse.
      if (options.transcribeFirst) await transcribeMessage(db, options.transcribeFirst);
      // IA desligada no painel: a conversa vai para "Em atendimento".
      if (queueIfAiOff(db, conversationId)) return;
      const created = await runAi(db, conversationId, brain, name);
      await deliverToWhatsApp(db, created);
    } catch (error) {
      console.error("[atendimento] IA:", error instanceof Error ? error.message : error);
    }
  });
}

/** Transcreve em segundo plano (áudio que não precisa de resposta da IA: do vendedor ou do celular). */
export function transcribeInBackground(db: DatabaseSync, messageId: string) {
  after(() => transcribeMessage(db, messageId).then(() => undefined));
}

/** Envia ao WhatsApp em segundo plano (mensagem do vendedor ou reenvio). */
export function deliverInBackground(db: DatabaseSync, messages: Message[]) {
  after(() => deliverToWhatsApp(db, messages).catch((error) => console.error("[atendimento] envio:", error)));
}

/** IA usada no painel: a real (Hermes) quando FARE_IA_URL/FARE_IA_TOKEN existem; senão, a de teste. */
export function activeBrain(): { brain: Brain; name: string; mode: "real" | "teste" } {
  const config = realAiConfig();
  return config ? { brain: createRealBrain(config), name: REAL_AI_NAME, mode: "real" } : { brain: simulatedBrain, name: SIMULATED_AI_NAME, mode: "teste" };
}

/** Banco do site (o mesmo dos clientes/orçamentos), com as tabelas do atendimento garantidas. */
// Versão do esquema: o servidor de desenvolvimento mantém o globalThis entre recargas; com a versão, colunas novas entram sem reiniciar.
const SCHEMA_VERSION = 11;
const globalAtendimento = globalThis as typeof globalThis & { fareAtendimentoSchema?: number };
export function atendimentoDb() {
  if (globalAtendimento.fareAtendimentoSchema !== SCHEMA_VERSION) {
    runAtendimentoMigrations(database);
    globalAtendimento.fareAtendimentoSchema = SCHEMA_VERSION;
  }
  scheduleMediaCleanup();
  scheduleThumbRedo();
  return database;
}

/** Uma vez só: miniaturas antigas eram quadradas; refaz no formato da foto (em segundo plano). */
const globalThumbs = globalThis as typeof globalThis & { fareThumbRedo?: boolean };
function scheduleThumbRedo() {
  if (globalThumbs.fareThumbRedo) return;
  globalThumbs.fareThumbRedo = true;
  if (database.prepare("SELECT 1 FROM atd_meta WHERE key = 'miniaturas_formato'").get()) return;
  const files = (
    database
      .prepare(
        `SELECT media_file AS file FROM atd_messages WHERE media_thumb = 1 AND media_file IS NOT NULL AND media_pruned IS NULL
         UNION SELECT media_file FROM atd_quick_replies WHERE media_thumb = 1 AND media_file IS NOT NULL`,
      )
      .all() as Array<{ file: string }>
  ).map((row) => row.file);
  setTimeout(() => {
    redoThumbs(files)
      .then((done) => {
        database.prepare("INSERT OR REPLACE INTO atd_meta (key, value) VALUES ('miniaturas_formato', '1')").run();
        console.log(`[atendimento] miniaturas refeitas no formato da foto: ${done}`);
      })
      .catch((error) => console.error("[atendimento] miniaturas:", error));
  }, 0);
}

/** Limpeza das mídias antigas (originais com mais de FARE_MIDIAS_DIAS, padrão 90): no máximo a cada 6 h, em segundo plano. */
const CLEANUP_EVERY = 6 * 60 * 60 * 1000;
const globalCleanup = globalThis as typeof globalThis & { fareMediaCleanupAt?: number };
function scheduleMediaCleanup() {
  const now = Date.now();
  if (globalCleanup.fareMediaCleanupAt && now - globalCleanup.fareMediaCleanupAt < CLEANUP_EVERY) return;
  globalCleanup.fareMediaCleanupAt = now;
  setTimeout(() => {
    pruneOldMedia(database)
      .then(({ pruned, bytes }) => {
        if (pruned) console.log(`[atendimento] limpeza: ${pruned} mídias antigas apagadas (${Math.round(bytes / 1024 / 1024)} MB); miniaturas mantidas.`);
      })
      .catch((error) => console.error("[atendimento] limpeza de mídias:", error));
  }, 0);
}

const STATUS_BY_CODE: Record<AtendimentoError["code"], number> = {
  CONVERSATION_NOT_FOUND: 404,
  QUICK_REPLY_NOT_FOUND: 404,
  DUPLICATE_SHORTCUT: 409,
  INVALID_REQUEST: 400,
};

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Toda rota do atendimento: exige login da equipe e converte erros conhecidos em resposta com código. */
export function withStaff<Args extends unknown[]>(handler: (staff: StaffActor & { role: string }, request: Request, ...args: Args) => Promise<Response> | Response) {
  return async (request: Request, ...args: Args) => {
    const session = await readStaffSession({ headers: request.headers });
    if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
    try {
      return await handler({ id: session.user.id, name: session.user.name, role: session.user.role }, request, ...args);
    } catch (error) {
      if (error instanceof AtendimentoError) return json({ error: error.code, message: error.message, detail: error.detail ?? null }, STATUS_BY_CODE[error.code]);
      console.error("[atendimento]", error);
      return json({ error: "INTERNAL", message: "Não foi possível concluir a operação." }, 500);
    }
  };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // corpo inválido
  }
  throw new AtendimentoError("INVALID_REQUEST", "Não foi possível entender a requisição.");
}

export const text = (value: unknown, max = 4000) => (typeof value === "string" ? value.slice(0, max) : "");
