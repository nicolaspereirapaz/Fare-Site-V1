import { atendimentoDb, json, withStaff } from "@/lib/atendimento/server";
import { searchMessages } from "@/lib/atendimento/search";

export const dynamic = "force-dynamic";

/** Busca texto dentro das mensagens de todas as conversas (?q=). */
export const GET = withStaff((_staff, request) => {
  const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
  return json({ hits: searchMessages(atendimentoDb(), query) });
});
