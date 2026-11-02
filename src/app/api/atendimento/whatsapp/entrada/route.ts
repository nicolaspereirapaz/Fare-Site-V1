import { AtendimentoError } from "@/lib/atendimento/repository";
import { atendimentoDb, json, respondInBackground } from "@/lib/atendimento/server";
import { parseInbound, receiveWhatsAppMessage, tokenMatches } from "@/lib/atendimento/whatsapp";

export const dynamic = "force-dynamic";

/**
 * A ponte do WhatsApp (no mesmo PC) entrega aqui cada mensagem de cliente.
 * Sem login de vendedor: autenticado pelo token compartilhado (X-Fare-Token = FARE_PONTE_TOKEN).
 */
export async function POST(request: Request) {
  if (!tokenMatches(request.headers.get("x-fare-token"), process.env.FARE_PONTE_TOKEN?.trim())) {
    return json({ error: "AUTH" }, 401);
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("json");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "JSON" }, 400);
  }
  try {
    const db = atendimentoDb();
    const result = receiveWhatsAppMessage(db, parseInbound(body));
    if (!result.duplicate) respondInBackground(db, result.conversationId);
    return json({ ok: true, ...result }, result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof AtendimentoError) return json({ error: error.code, message: error.message }, 400);
    throw error;
  }
}
