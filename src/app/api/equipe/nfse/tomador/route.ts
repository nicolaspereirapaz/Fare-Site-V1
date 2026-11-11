import { exigirEquipe, json } from "@/lib/nfse/rotas";
import { tomadorDoCadastro, tomadorPorDocumento } from "@/lib/nfse/tomador";

export const dynamic = "force-dynamic";

/** ?ref=conta:… / painel:… (cliente do cadastro do site) ou ?doc=CPF/CNPJ digitado. */
export async function GET(request: Request) {
  const acesso = await exigirEquipe(request);
  if ("erro" in acesso) return acesso.erro;
  const params = new URL(request.url).searchParams;
  const ref = params.get("ref")?.slice(0, 120);
  const doc = params.get("doc")?.replace(/\D/g, "").slice(0, 14);
  const achado = ref ? await tomadorDoCadastro(ref) : doc ? await tomadorPorDocumento(doc) : null;
  return json(achado ?? { origem: null, tomador: null });
}
