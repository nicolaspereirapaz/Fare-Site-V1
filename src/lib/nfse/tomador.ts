/** Monta o tomador da nota a partir do cadastro de clientes do site, do histórico do emissor ou da Receita (CNPJ). */
import { database } from "@/lib/auth";
import { getCustomerProfile } from "@/lib/account/profileRepository";
import { resolveCustomer } from "@/lib/customers/repository";
import { buscarTomadorSalvo } from "./db";
import { so, type Tomador } from "./dps";
import { codigoMunicipio } from "./municipios";

type BrasilApiCnpj = {
  razao_social?: string; cep?: string; codigo_municipio_ibge?: number | string;
  descricao_tipo_de_logradouro?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string;
  email?: string | null; ddd_telefone_1?: string;
};

/** CNPJ na base pública da Receita (BrasilAPI). Sem User-Agent ela responde 403 para o fetch do Node. */
async function receita(cnpj: string): Promise<Tomador | null> {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { "User-Agent": "FareNFSe/0.1" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r?.ok) return null;
  const c = (await r.json()) as BrasilApiCnpj;
  return {
    doc: cnpj,
    nome: c.razao_social ?? "",
    cMun: c.codigo_municipio_ibge ? String(c.codigo_municipio_ibge) : undefined,
    cep: c.cep || undefined,
    logradouro: [c.descricao_tipo_de_logradouro, c.logradouro].filter(Boolean).join(" ") || undefined,
    numero: c.numero || undefined,
    complemento: c.complemento || undefined,
    bairro: c.bairro || undefined,
    email: c.email || undefined,
    fone: c.ddd_telefone_1 || undefined,
  };
}

export type Origem = "cadastro" | "historico" | "receita";

/** Cliente escolhido no cadastro do site (pessoa ou empresa). Sem CPF/CNPJ no cadastro: devolve sem doc e a tela pede. */
export async function tomadorDoCadastro(ref: string): Promise<{ origem: Origem; tomador: Tomador } | null> {
  const c = resolveCustomer(database, ref);
  if (!c) return null;
  const doc = so(c.document);
  const perfil = c.kind === "conta" ? getCustomerProfile(database, c.ownerId) : null;
  const end = c.address ?? (perfil?.address.street ? { ...perfil.address } : null);
  // Empresa (CNPJ): nota no nome da empresa; pessoa (CPF): no nome da pessoa.
  const nome = doc.length === 14 ? c.company || perfil?.companyName || c.name : c.name;
  const base: Tomador = {
    doc,
    nome,
    email: c.email || undefined,
    fone: c.phone || undefined,
    cep: end?.cep || undefined,
    logradouro: end?.street || undefined,
    numero: end?.number || undefined,
    complemento: end?.complement || undefined,
    bairro: end?.district || undefined,
    cMun: end ? await codigoMunicipio(end.city, end.state) : undefined,
  };
  // Empresa sem endereço completo no cadastro: completa com a Receita, mantendo o que o cadastro tem.
  if (doc.length === 14 && !(base.cMun && base.logradouro && base.numero && base.bairro && base.cep)) {
    const r = await receita(doc);
    if (r) return { origem: "cadastro", tomador: { ...r, ...Object.fromEntries(Object.entries(base).filter(([, v]) => v)) } as Tomador };
  }
  return { origem: "cadastro", tomador: base };
}

/** CPF/CNPJ digitado: histórico de notas do emissor; senão, CNPJ na Receita. CPF não tem consulta pública. */
export async function tomadorPorDocumento(documento: string): Promise<{ origem: Origem; tomador: Tomador } | null> {
  const doc = so(documento);
  const salvo = buscarTomadorSalvo(doc);
  if (salvo) return { origem: "historico", tomador: salvo };
  if (doc.length !== 14) return null;
  const r = await receita(doc);
  return r ? { origem: "receita", tomador: r } : null;
}
