import { ultimasNotas } from "@/lib/nfse/db";
import { emitir, type Pedido } from "@/lib/nfse/emitir";
import { exigirEquipe, json } from "@/lib/nfse/rotas";
import { ambiente } from "@/lib/nfse/sefin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const acesso = await exigirEquipe(request);
  if ("erro" in acesso) return acesso.erro;
  return json({ ambiente: ambiente(), notas: ultimasNotas() });
}

export async function POST(request: Request) {
  const acesso = await exigirEquipe(request);
  if ("erro" in acesso) return acesso.erro;
  let pedido: Pedido;
  try {
    pedido = (await request.json()) as Pedido;
  } catch {
    return json({ ok: false, erros: ["Pedido inválido."] }, 400);
  }
  const r = await emitir(pedido, acesso.session.user.name);
  return json(r, r.ok ? 201 : 422);
}
