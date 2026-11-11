import { cancelar } from "@/lib/nfse/emitir";
import type { MotivoCancelamento } from "@/lib/nfse/evento";
import { chaveValida, exigirEquipe, json } from "@/lib/nfse/rotas";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: RouteContext<"/api/equipe/nfse/[chave]/cancelar">) {
  const acesso = await exigirEquipe(request);
  if ("erro" in acesso) return acesso.erro;
  const { chave } = await context.params;
  if (!chaveValida(chave)) return json({ ok: false, erros: ["Chave inválida."] }, 400);
  const corpo = (await request.json().catch(() => ({}))) as { cMotivo?: MotivoCancelamento; xMotivo?: string };
  const r = await cancelar(chave, corpo.cMotivo ?? ("" as MotivoCancelamento), corpo.xMotivo ?? "");
  return json(r, r.ok ? 200 : 422);
}
