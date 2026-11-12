import { whatsAppHistoryAnchors } from "@/lib/atendimento/repository";
import { atendimentoDb, json } from "@/lib/atendimento/server";
import { tokenMatches } from "@/lib/atendimento/whatsapp";

export const dynamic = "force-dynamic";

/** A ponte pergunta de onde pedir o histórico antigo: a mensagem mais antiga que o site tem de cada contato. */
export async function GET(request: Request) {
  if (!tokenMatches(request.headers.get("x-fare-token"), process.env.FARE_PONTE_TOKEN?.trim())) return json({ error: "AUTH" }, 401);
  return json({ anchors: whatsAppHistoryAnchors(atendimentoDb()) });
}
