import { xmlDaNota } from "@/lib/nfse/db";
import { montarDanfse } from "@/lib/nfse/danfse";
import { gerarPdf } from "@/lib/nfse/danfse-pdf";
import { nomeMunicipio } from "@/lib/nfse/municipios";
import { chaveValida, exigirEquipe } from "@/lib/nfse/rotas";

export const dynamic = "force-dynamic";

/** DANFSe gerado aqui mesmo: a API oficial do PDF foi desligada em 03/08/2026 (NT 008). */
export async function GET(request: Request, context: RouteContext<"/api/equipe/nfse/[chave]/pdf">) {
  const acesso = await exigirEquipe(request);
  if ("erro" in acesso) return acesso.erro;
  const { chave } = await context.params;
  const nota = chaveValida(chave) ? xmlDaNota(chave) : null;
  if (!nota) return new Response("Nota não encontrada.", { status: 404 });
  const pdf = await gerarPdf(await montarDanfse(nota.xml, nomeMunicipio), { cancelada: nota.cancelada });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="NFSe-${chave}.pdf"`, "Cache-Control": "no-store" },
  });
}
