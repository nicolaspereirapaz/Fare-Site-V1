import { xmlDaNota } from "@/lib/nfse/db";
import { chaveValida, exigirEquipe } from "@/lib/nfse/rotas";

export const dynamic = "force-dynamic";

/** XML da NFS-e como a Sefin devolveu (para o cliente ou o contador). */
export async function GET(request: Request, context: RouteContext<"/api/equipe/nfse/[chave]/xml">) {
  const acesso = await exigirEquipe(request);
  if ("erro" in acesso) return acesso.erro;
  const { chave } = await context.params;
  const xml = chaveValida(chave) ? xmlDaNota(chave)?.xml : null;
  if (!xml) return new Response("Nota não encontrada.", { status: 404 });
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="NFSe-${chave}.xml"`, "Cache-Control": "no-store" },
  });
}
