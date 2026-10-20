import { specsByPublicId } from "@/lib/proposals/catalogImages";

// Cliente vê só as medidas do produto; peso e área de gravação ficam para a equipe e a proposta.
const HIDDEN = /^(peso|área de gravação|tamanho total)/i;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Medidas do brinde para a página do cliente. Separado do produto porque a XBZ é lida
 * da página do fornecedor na 1ª vez (até 8 s) e a página do produto não deve esperar por isso.
 * Só produtos do catálogo: id desconhecido devolve lista vazia, sem consultar o fornecedor.
 */
export async function GET(_request: Request, context: RouteContext<"/api/xbz/products/[code]/medidas">) {
  const { code } = await context.params;
  try {
    const specs = await specsByPublicId(code.slice(0, 80));
    return Response.json({ specs: specs.filter((spec) => !HIDDEN.test(spec.label)) });
  } catch {
    return Response.json({ specs: [] });
  }
}
