/**
 * Lê o XML da NFS-e e devolve os campos do DANFSe v2.0 já formatados (NT 008/2026 v1.02).
 * Só usa o que está no XML; campo vazio vira "-" (nota 12 da NT).
 */
import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";

type No = XmlElement | undefined;

function filho(pai: No, caminho: string): No {
  let atual = pai;
  for (const nome of caminho.split("/")) {
    if (!atual) return undefined;
    atual = Array.from(atual.childNodes).find((n) => n.nodeType === 1 && (n as XmlElement).localName === nome) as No;
  }
  return atual;
}

const txt = (pai: No, caminho: string) => filho(pai, caminho)?.textContent?.trim() || undefined;

const UF: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};
export const ufDoMunicipio = (cMun?: string) => (cMun ? UF[cMun.slice(0, 2)] : undefined);

const OPCOES = {
  tpEmit: { "1": "Prestador", "2": "Tomador", "3": "Intermediário" },
  cStat: { "100": "NFS-e Gerada", "101": "NFS-e de Substituição Gerada", "102": "NFS-e de Decisão Judicial", "103": "NFS-e Avulsa" },
  finNFSe: { "0": "NFS-e regular" },
  opSimpNac: { "1": "Não Optante", "2": "Optante - Microempreendedor Individual (MEI)", "3": "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)" },
  regApTribSN: {
    "1": "Regime de apuração dos tributos federais e municipal pelo Simples Nacional",
    "2": "Regime de apuração dos tributos federais pelo SN e o ISSQN pela NFS-e conforme respectiva legislação municipal do tributo",
    "3": "Regime de apuração dos tributos federais e municipal pela NFS-e conforme respectivas legislações federal e municipal de cada tributo",
  },
  tribISSQN: { "1": "Operação Tributável", "2": "Imunidade", "3": "Exportação de Serviço", "4": "Não Incidência" },
  tpRetISSQN: { "1": "Não Retido", "2": "Retido pelo Tomador", "3": "Retido pelo Intermediário" },
  tpRetPisCofins: {
    "0": "PIS/COFINS/CSLL Não Retidos", "1": "PIS/COFINS Retidos", "2": "PIS/COFINS Não Retidos", "3": "PIS/COFINS/CSLL Retidos", "4": "PIS/COFINS Retidos, CSLL Não Retido",
    "5": "PIS Retido, COFINS/CSLL Não Retido", "6": "COFINS Retido, PIS/CSLL Não Retido", "7": "PIS Não Retido, COFINS/CSLL Retidos", "8": "PIS/COFINS Não Retidos, CSLL Retido", "9": "COFINS Não Retido, PIS/CSLL Retidos",
  },
} as const;

const opcao = (tabela: Record<string, string>, v?: string) => (v ? (tabela[v] ?? v) : undefined);

/** Corta com reticências quando passa do limite da NT. */
export const corta = (s: string | undefined, max: number) => (s && s.length > max ? `${s.slice(0, max - 3)}...` : s);
const ou = (s?: string) => s || "-";

export function documento(v?: string) {
  if (!v) return undefined;
  if (/^\d{14}$/.test(v)) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (/^\d{11}$/.test(v)) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v;
}

const fone = (v?: string) => (!v ? undefined : v.length === 11 ? v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : v.length === 10 ? v.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3") : v);
const cep = (v?: string) => v?.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2-$3");
export const reais = (v?: string) => (v == null ? undefined : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v?: string) => (v == null ? undefined : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);
const data = (v?: string) => v?.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, "$3/$2/$1");
/** Mostra a hora como está no XML (horário de quem emitiu), sem converter fuso. */
const dataHora = (v?: string) => v?.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2}).*$/, "$3/$2/$1 $4");

export type NomeMunicipio = (cMun: string) => Promise<string | undefined>;

async function pessoa(p: No, nomeMunicipio: NomeMunicipio) {
  const cMun = txt(p, "end/endNac/cMun");
  const nome = cMun ? await nomeMunicipio(cMun) : txt(p, "end/endExt/xCidade");
  return {
    doc: ou(documento(txt(p, "CNPJ") ?? txt(p, "CPF") ?? txt(p, "NIF"))),
    im: ou(txt(p, "IM")),
    fone: ou(fone(txt(p, "fone"))),
    nome: ou(corta(txt(p, "xNome"), 80)),
    municipio: ou(nome ? `${nome}${cMun ? ` / ${ufDoMunicipio(cMun)}` : ""}` : cMun),
    ibgeCep: ou([cMun, cep(txt(p, "end/endNac/CEP")) ?? txt(p, "end/endExt/cEndPost")].filter(Boolean).join(" / ")),
    endereco: ou(corta(["xLgr", "nro", "xCpl", "xBairro"].map((k) => txt(p, `end/${k}`)).filter(Boolean).join(", "), 80)),
    email: ou(corta(txt(p, "email"), 80)),
  };
}

export type Danfse = Awaited<ReturnType<typeof montarDanfse>>;

export async function montarDanfse(xml: string, nomeMunicipio: NomeMunicipio) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const inf = Array.from(doc.getElementsByTagName("*")).find((e) => e.localName === "infNFSe");
  if (!inf) throw new Error("XML não é de uma NFS-e.");
  const dps = filho(inf, "DPS/infDPS");
  const emit = filho(inf, "emit");
  const val = filho(inf, "valores");
  const vDps = filho(dps, "valores");
  const ibs = filho(inf, "IBSCBS");
  const ibsDps = filho(dps, "IBSCBS");

  const chave = (inf.getAttribute("Id") ?? "").replace(/^NFS/, "");
  const tpAmb = txt(dps, "tpAmb") ?? "";
  const cLocEmi = txt(dps, "cLocEmi");
  const uf = txt(emit, "enderNac/UF") ?? ufDoMunicipio(cLocEmi);
  const dCompet = txt(dps, "dCompet");

  // O prestador emitente não manda nome/endereço na DPS (regra E0121); a Sefin devolve no grupo emit.
  const prest = await pessoa(filho(dps, "prest"), nomeMunicipio);
  const emitCMun = txt(emit, "enderNac/cMun");
  const prestador = {
    ...prest,
    nome: prest.nome !== "-" ? prest.nome : ou(corta(txt(emit, "xNome"), 80)),
    im: prest.im !== "-" ? prest.im : ou(txt(emit, "IM")),
    fone: prest.fone !== "-" ? prest.fone : ou(fone(txt(emit, "fone"))),
    email: prest.email !== "-" ? prest.email : ou(corta(txt(emit, "email"), 80)),
    municipio: prest.municipio !== "-" ? prest.municipio : ou(emitCMun ? `${txt(inf, "xLocEmi")} / ${txt(emit, "enderNac/UF")}` : undefined),
    ibgeCep: prest.ibgeCep !== "-" ? prest.ibgeCep : ou([emitCMun, cep(txt(emit, "enderNac/CEP"))].filter(Boolean).join(" / ")),
    endereco: prest.endereco !== "-" ? prest.endereco : ou(corta(["xLgr", "nro", "xCpl", "xBairro"].map((k) => txt(emit, `enderNac/${k}`)).filter(Boolean).join(", "), 80)),
    simples: ou(corta(opcao(OPCOES.opSimpNac, txt(dps, "prest/regTrib/opSimpNac")), 40)),
    regime: ou(corta(opcao(OPCOES.regApTribSN, txt(dps, "prest/regTrib/regApTribSN")), 80)),
  };

  const toma = filho(dps, "toma");
  const cTribNac = txt(dps, "serv/cServ/cTribNac");
  const cTribMun = txt(dps, "serv/cServ/cTribMun");
  const cNBS = txt(dps, "serv/cServ/cNBS");
  const cLocPrest = txt(dps, "serv/locPrest/cLocPrestacao");

  const tribFed = filho(vDps, "trib/tribFed");
  const tpRetPC = txt(tribFed, "piscofins/tpRetPisCofins");
  const pisRetido = tpRetPC === "1";
  const soma = (...v: (string | undefined)[]) => (v.some((x) => x != null) ? v.reduce((a, x) => a + Number(x ?? 0), 0).toFixed(2) : undefined);

  const pTot = filho(vDps, "trib/totTrib/pTotTrib");
  const vTot = filho(vDps, "trib/totTrib/vTotTrib");
  const pSN = txt(vDps, "trib/totTrib/pTotTribSN");
  const totais = pTot
    ? `Federais: ${pct(txt(pTot, "pTotTribFed"))}; Estaduais: ${pct(txt(pTot, "pTotTribEst"))}; Municipais: ${pct(txt(pTot, "pTotTribMun"))}`
    : vTot
      ? `Federais: ${reais(txt(vTot, "vTotTribFed"))}; Estaduais: ${reais(txt(vTot, "vTotTribEst"))}; Municipais: ${reais(txt(vTot, "vTotTribMun"))}`
      : "Federais: -; Estaduais: -; Municipais: -";
  const complementos = [
    ["Inf. Cont.", txt(dps, "serv/infoCompl/xInfComp")],
    ["NFS-e Subst.", txt(dps, "subst/chSubstda")],
    ["Doc. Ref.", txt(dps, "serv/infoCompl/docRef")],
    ["Doc. Tec.", txt(dps, "serv/infoCompl/idDocTec")],
    ["Núm. Ped.", txt(dps, "serv/infoCompl/xPed")],
    ["Inf. A. T. Mun.", txt(inf, "xOutInf")],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);

  const vIBSTot = txt(ibs, "totCIBS/gIBS/vIBSTot");
  const vCBS = txt(ibs, "totCIBS/gCBS/vCBS");
  const vServ = txt(vDps, "vServPrest/vServ");
  const vLiq = txt(val, "vLiq");

  return {
    cabecalho: {
      municipio: cTribNac?.startsWith("99") ? "" : `Município: ${txt(inf, "xLocEmi") ?? "-"} / ${uf ?? "-"}`,
      ambGer: ou(txt(inf, "ambGer")),
      tpAmb: ou(tpAmb),
      teste: tpAmb === "2",
    },
    id: {
      chave,
      nNFSe: ou(txt(inf, "nNFSe")),
      competencia: ou(data(dCompet)),
      dhProc: ou(dataHora(txt(inf, "dhProc"))),
      nDPS: ou(txt(dps, "nDPS")),
      serie: ou(txt(dps, "serie")),
      dhEmi: ou(dataHora(txt(dps, "dhEmi"))),
      emitente: ou(opcao(OPCOES.tpEmit, txt(dps, "tpEmit"))),
      situacao: ou(corta(opcao(OPCOES.cStat, txt(inf, "cStat")), 40)),
      finalidade: ou(corta(opcao(OPCOES.finNFSe, txt(dps, "finNFSe") ?? txt(ibsDps, "finNFSe")), 40)),
      qrcode: `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`,
    },
    prestador,
    tomador: toma ? await pessoa(toma, nomeMunicipio) : null,
    servico: {
      codigo: ou(cTribNac ? `${cTribNac.replace(/(\d\d)(\d\d)(\d\d)/, "$1.$2.$3")}${cTribMun ? ` / ${cTribMun}` : ""}` : undefined),
      nbs: ou(cNBS?.replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3.$4")),
      local: ou(txt(inf, "xLocPrestacao") ? `${txt(inf, "xLocPrestacao")} / ${ufDoMunicipio(cLocPrest) ?? "-"} / ${txt(dps, "serv/locPrest/cPaisPrestacao") ?? "-"}` : undefined),
      descCodigo: ou(corta(txt(inf, "xTribMun") ?? txt(inf, "xTribNac"), 170)),
      descricao: ou(corta(txt(dps, "serv/cServ/xDescServ"), 1300)),
    },
    issqn: {
      tipo: ou(opcao(OPCOES.tribISSQN, txt(vDps, "trib/tribMun/tribISSQN"))),
      incidencia: ou(txt(inf, "xLocIncid") ? `${txt(inf, "xLocIncid")} / ${ufDoMunicipio(txt(inf, "cLocIncid")) ?? "-"} / ${txt(vDps, "trib/tribMun/cPaisResult") ?? "-"}` : undefined),
      bc: ou(reais(txt(val, "vBC"))),
      aliquota: ou(pct(txt(val, "pAliqAplic"))),
      retencao: ou(opcao(OPCOES.tpRetISSQN, txt(vDps, "trib/tribMun/tpRetISSQN"))),
      apurado: ou(reais(txt(val, "vISSQN"))),
    },
    federal: {
      irrf: ou(reais(txt(tribFed, "vRetIRRF"))),
      cp: ou(reais(txt(tribFed, "vRetCP"))),
      contribRetidas: ou(reais(pisRetido ? soma(txt(tribFed, "vRetCSLL"), txt(tribFed, "piscofins/vPis"), txt(tribFed, "piscofins/vCofins")) : txt(tribFed, "vRetCSLL"))),
      pis: ou(reais(pisRetido ? "0" : txt(tribFed, "piscofins/vPis"))),
      cofins: ou(reais(pisRetido ? "0" : txt(tribFed, "piscofins/vCofins"))),
      descContrib: ou(tpRetPC ? `${tpRetPC} - ${opcao(OPCOES.tpRetPisCofins, tpRetPC)}` : undefined),
      // Nota 6: a linha de PIS/COFINS só sai para competência até 31/12/2026.
      linhaPisCofins: !dCompet || dCompet <= "2026-12-31",
    },
    ibscbs: {
      cst: ou([txt(ibsDps, "valores/trib/gIBSCBS/CST") ?? txt(ibsDps, "valores/trib/CST"), txt(ibsDps, "valores/trib/gIBSCBS/cClassTrib") ?? txt(ibsDps, "valores/trib/cClassTrib")].filter(Boolean).join(" / ")),
      indOp: ou([txt(ibsDps, "cIndOp"), txt(ibs, "cLocalidadeIncid"), txt(ibs, "xLocalidadeIncid"), ufDoMunicipio(txt(ibs, "cLocalidadeIncid"))].filter(Boolean).join(" / ")),
      exclusoes: ou(ibs ? reais(soma(txt(vDps, "vDescCondIncond/vDescIncond"), txt(ibs, "valores/vCalcReeRepRes"), txt(val, "vISSQN"), txt(tribFed, "piscofins/vPis"), txt(tribFed, "piscofins/vCofins")) ?? "0") : undefined),
      bc: ou(reais(txt(ibs, "valores/vBC"))),
      redAliq: ou(ibs ? [pct(txt(ibs, "valores/uf/pRedAliqUF")), pct(txt(ibs, "valores/mun/pRedAliqMun")), pct(txt(ibs, "valores/fed/pRedAliqCBS"))].map(ou).join(" / ") : undefined),
      aliqIbs: ou(ibs ? [pct(txt(ibs, "valores/uf/pIBSUF")), pct(txt(ibs, "valores/mun/pIBSMun"))].map(ou).join(" / ") : undefined),
      efetMun: ou(pct(txt(ibs, "valores/mun/pAliqEfetMun"))),
      vMun: ou(reais(txt(ibs, "totCIBS/gIBS/gIBSMunTot/vIBSMun"))),
      efetUF: ou(pct(txt(ibs, "valores/uf/pAliqEfetUF"))),
      vUF: ou(reais(txt(ibs, "totCIBS/gIBS/gIBSUFTot/vIBSUF"))),
      vIBSTot: ou(reais(vIBSTot)),
      pCBS: ou(pct(txt(ibs, "valores/fed/pCBS"))),
      efetCBS: ou(pct(txt(ibs, "valores/fed/pAliqEfetCBS"))),
      vCBS: ou(reais(vCBS)),
    },
    total: {
      vServ: ou(reais(vServ)),
      descIncond: ou(reais(txt(vDps, "vDescCondIncond/vDescIncond"))),
      descCond: ou(reais(txt(vDps, "vDescCondIncond/vDescCond"))),
      retencoes: ou(reais(txt(val, "vTotalRet"))),
      vLiq: ou(reais(vLiq)),
      ibsCbs: ou(reais(soma(vIBSTot, vCBS) ?? "0")),
      liqMaisIbsCbs: ou(reais(txt(ibs, "totCIBS/vTotNF") ?? vLiq)),
    },
    complementares: [
      ...(complementos.length ? [corta(complementos.join(" | "), 1997)!] : []),
      `Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: ${totais}${pSN ? `; Simples Nacional: ${pct(pSN)}` : ""}`,
    ],
    canhoto: `${ou(txt(inf, "nNFSe"))} / ${chave}`,
  };
}
