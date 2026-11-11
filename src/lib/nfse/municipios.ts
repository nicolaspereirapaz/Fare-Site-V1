/** Códigos e nomes de municípios do IBGE, para a DPS (código) e o DANFSe (nome). */
const nomes = new Map<string, string | undefined>([["3525904", "Jundiaí"]]);
const listasPorUf = new Map<string, Array<{ id: number; nome: string }>>();

const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades";
const pedir = (url: string) => fetch(url, { headers: { "User-Agent": "FareNFSe/0.1" }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
const dobra = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function nomeMunicipio(cMun: string): Promise<string | undefined> {
  if (nomes.has(cMun)) return nomes.get(cMun);
  const r = await pedir(`${IBGE}/municipios/${cMun}`);
  const nome = r?.ok ? ((await r.json()) as { nome?: string }).nome : undefined;
  if (nome) nomes.set(cMun, nome);
  return nome;
}

/** Cadastro do site guarda cidade e UF por extenso; a DPS precisa do código IBGE. */
export async function codigoMunicipio(cidade: string, uf: string): Promise<string | undefined> {
  if (!cidade || !/^[A-Z]{2}$/.test(uf)) return undefined;
  if (uf === "SP" && dobra(cidade) === "jundiai") return "3525904";
  if (!listasPorUf.has(uf)) {
    const r = await pedir(`${IBGE}/estados/${uf}/municipios`);
    if (!r?.ok) return undefined;
    listasPorUf.set(uf, (await r.json()) as Array<{ id: number; nome: string }>);
  }
  const achado = listasPorUf.get(uf)!.find((m) => dobra(m.nome) === dobra(cidade));
  return achado ? String(achado.id) : undefined;
}
