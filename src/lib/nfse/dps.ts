/**
 * Monta o XML da DPS (Declaração de Prestação de Serviço) no leiaute nacional v1.01.
 * Módulo puro: sem rede, sem certificado, sem banco. Assinatura fica em sefin.ts.
 */

/** Fare Foto: o nome e o endereço do prestador NÃO vão na DPS (regra E0121: vêm do cadastro). */
export const PRESTADOR = { cnpj: "50344377000136", cMun: "3525904" } as const;

export const SERVICOS = {
  impressao: {
    nome: "Impressão",
    cTribNac: "130401",
    cTribMun: "001",
    cNBS: "121012100",
    descricao: "SERVICOS DE IMPRESSAO",
  },
  revelacao: {
    nome: "Revelação de Fotos",
    cTribNac: "130301",
    cTribMun: "004",
    cNBS: "114082000",
    descricao: "REVELACAO DE FOTOS",
  },
  brindes: {
    nome: "Personalização de Brindes",
    cTribNac: "130402",
    cTribMun: "827",
    // NBS 1.2101.21.00 "Serviços de impressão": personalização é impressão/gravação da marca no brinde.
    cNBS: "121012100",
    descricao: "PERSONALIZACAO DE BRINDES",
  },
} as const;

export type ServicoId = keyof typeof SERVICOS;

export type Tomador = {
  /** CPF (11) ou CNPJ (14), só dígitos. */
  doc: string;
  nome: string;
  email?: string;
  fone?: string;
  /** Endereço só entra se cMun, cep, logradouro, numero e bairro estiverem todos preenchidos. */
  cMun?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
};

export type DadosDps = {
  ambiente: 1 | 2;
  serie: string;
  numero: number;
  emissao: Date;
  servico: ServicoId;
  descricao: string;
  valorCentavos: number;
  tomador?: Tomador;
  /** % aproximado de tributos do Simples; sem ele vai 0,00 nos totais (como o Emissor web). */
  pTotTribSN?: number;
  /** Data de competência (AAAA-MM-DD), o dia a que o serviço se refere. Sem ela: o dia da emissão. */
  competencia?: string;
};

export const so = (s: string) => s.replace(/\D/g, "");

/** "1.234,56" / "60,5" / "60.00" → centavos. null se não for um valor positivo. */
export function centavos(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/, "");
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const c = Math.round(Number(normal) * 100);
  return c > 0 ? c : null;
}

function esc(s: string) {
  return s.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const tag = (nome: string, valor: string | undefined) => (valor ? `<${nome}>${esc(valor)}</${nome}>` : "");

/** Brasil sem horário de verão: -03:00 fixo. */
export function horaBrasilia(d: Date) {
  const local = new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 19);
  return { dhEmi: `${local}-03:00`, dCompet: local.slice(0, 10) };
}

/** Competência digitada: data real e não depois do dia da emissão (a Sefin recusa competência no futuro). */
export function erroCompetencia(competencia: string, emissao: Date): string | null {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(competencia) && new Date(`${competencia}T12:00:00Z`).toISOString().startsWith(competencia);
  if (!ok) return "Data de competência inválida.";
  return competencia > horaBrasilia(emissao).dCompet ? "A data de competência não pode ser depois de hoje." : null;
}

/** "DPS" + município(7) + tipo de inscrição(1: CPF, 2: CNPJ) + inscrição(14) + série(5) + número(15). */
export function idDps(serie: string, numero: number) {
  return `DPS${PRESTADOR.cMun}2${PRESTADOR.cnpj}${serie.padStart(5, "0")}${String(numero).padStart(15, "0")}`;
}

function tomadorXml(t: Tomador) {
  const doc = so(t.doc);
  const id = doc.length === 14 ? `<CNPJ>${doc}</CNPJ>` : `<CPF>${doc}</CPF>`;
  const temEnd = t.cMun && t.cep && t.logradouro && t.numero && t.bairro;
  const end = temEnd
    ? `<end><endNac><cMun>${so(t.cMun!)}</cMun><CEP>${so(t.cep!)}</CEP></endNac>${tag("xLgr", t.logradouro)}${tag("nro", t.numero)}${tag("xCpl", t.complemento)}${tag("xBairro", t.bairro)}</end>`
    : "";
  const fone = t.fone ? so(t.fone) : "";
  return `<toma>${id}${tag("xNome", t.nome)}${end}${fone.length >= 6 ? `<fone>${fone}</fone>` : ""}${tag("email", t.email)}</toma>`;
}

export function montarDps(d: DadosDps) {
  const s = SERVICOS[d.servico];
  const { dhEmi, dCompet: hoje } = horaBrasilia(d.emissao);
  const dCompet = d.competencia || hoje;
  const id = idDps(d.serie, d.numero);
  // Produção ainda usa o leiaute v1.01 de fev/2026 (sem finNFSe, xDescServ antes do cNBS), igual à nota do Emissor web de 10/11/2026.
  // A produção restrita já usa o leiaute da reforma (out/2026). Quando a produção migrar, apagar este desvio.
  const prod = d.ambiente === 1;
  const desc = tag("xDescServ", d.descricao);
  const totTrib =
    d.pTotTribSN != null
      ? `<pTotTribSN>${d.pTotTribSN.toFixed(2)}</pTotTribSN>`
      : "<pTotTrib><pTotTribFed>0.00</pTotTribFed><pTotTribEst>0.00</pTotTribEst><pTotTribMun>0.00</pTotTribMun></pTotTrib>";

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="${id}">` +
    `<tpAmb>${d.ambiente}</tpAmb><dhEmi>${dhEmi}</dhEmi><verAplic>FareNFSe-0.1</verAplic>` +
    `<serie>${d.serie}</serie><nDPS>${d.numero}</nDPS><dCompet>${dCompet}</dCompet>` +
    `<tpEmit>1</tpEmit>${prod ? "" : "<finNFSe>0</finNFSe>"}<cLocEmi>${PRESTADOR.cMun}</cLocEmi>` +
    // Simples Nacional ME/EPP, tributos federais e ISS apurados pelo Simples, sem regime especial.
    `<prest><CNPJ>${PRESTADOR.cnpj}</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>` +
    (d.tomador ? tomadorXml(d.tomador) : "") +
    `<serv><locPrest><cLocPrestacao>${PRESTADOR.cMun}</cLocPrestacao></locPrest>` +
    `<cServ><cTribNac>${s.cTribNac}</cTribNac><cTribMun>${s.cTribMun}</cTribMun>${prod ? desc : ""}<cNBS>${s.cNBS}</cNBS>${prod ? "" : desc}</cServ></serv>` +
    `<valores><vServPrest><vServ>${(d.valorCentavos / 100).toFixed(2)}</vServ></vServPrest>` +
    // Jundiaí está no Sistema Nacional: a alíquota vem da parametrização, não se informa pAliq.
    // PIS/COFINS sem destaque e sem retenção, como sai do Emissor web.
    `<trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><tribFed><piscofins><CST>00</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed><totTrib>${totTrib}</totTrib></trib></valores>` +
    `</infDPS></DPS>`;

  return { id, xml };
}
