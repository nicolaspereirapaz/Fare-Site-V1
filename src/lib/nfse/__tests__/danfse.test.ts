// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarDanfse } from "../danfse";
import { gerarPdf } from "../danfse-pdf";

// NFS-e real de produção emitida pelo Emissor web em 10/11/2026 (Revelação para a Caedu).
const xml = readFileSync(path.join(__dirname, "fixtures", "nfse-producao-revelacao.xml"), "utf8");
const semRede = async (c: string) => (c === "3525904" ? "Jundiaí" : undefined);

describe("DANFSe", () => {
  it("lê os campos da NFS-e no formato da NT 008", async () => {
    const d = await montarDanfse(xml, semRede);
    expect(d.cabecalho).toEqual({ municipio: "Município: Jundiaí / SP", ambGer: "2", tpAmb: "1", teste: false });
    expect(d.id.chave).toBe("35259042250344377000136000000000000226115650246939");
    expect(d.id.qrcode).toBe("https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=35259042250344377000136000000000000226115650246939");
    expect(d.id).toMatchObject({ nNFSe: "2", competencia: "10/11/2026", dhProc: "10/11/2026 16:55:29", serie: "70000", emitente: "Prestador", situacao: "NFS-e Gerada", finalidade: "-" });
    expect(d.prestador).toMatchObject({
      doc: "50.344.377/0001-36", nome: "FARE FOTO ARTIGOS FOTOGRAFICOS LTDA", fone: "(11) 7112-2316", municipio: "Jundiaí / SP",
      ibgeCep: "3525904 / 13.201-014", endereco: "RUA DO ROSARIO, 68, CENTRO", simples: "Optante - Microempresa ou Empresa de ...",
    });
    expect(d.tomador).toMatchObject({ doc: "46.377.727/0006-06", municipio: "Jundiaí / SP", endereco: "BARAO DE JUNDIAI, 508, CENTRO", email: "-" });
    expect(d.servico).toEqual({
      codigo: "13.03.01 / 004", nbs: "1.1408.20.00", local: "Jundiaí / SP / -",
      descCodigo: "Revelação/Ampliação/Cópia/Reprodução/ Trucagem E Congêneres", descricao: "IMPRESSAO DE FOTOS",
    });
    expect(d.issqn).toMatchObject({ tipo: "Operação Tributável", retencao: "Não Retido", aliquota: "-" });
    expect(d.federal.descContrib).toBe("0 - PIS/COFINS/CSLL Não Retidos");
    expect(d.total).toMatchObject({ vServ: "R$ 39,00", vLiq: "R$ 39,00", ibsCbs: "R$ 0,00", liqMaisIbsCbs: "R$ 39,00" });
    expect(d.complementares.at(-1)).toBe("Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: -; Estaduais: -; Municipais: -; Simples Nacional: 3,69%");
  });

  it("nota de teste ganha o aviso de sem validade e nota sem tomador fica sem bloco", async () => {
    const teste = xml.replace("<tpAmb>1</tpAmb>", "<tpAmb>2</tpAmb>").replace(/<toma>[\s\S]*<\/toma>/, "");
    const d = await montarDanfse(teste, semRede);
    expect(d.cabecalho.teste).toBe(true);
    expect(d.tomador).toBeNull();
  });

  it("gera um PDF de uma página", async () => {
    const pdf = await gerarPdf(await montarDanfse(xml, semRede));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  }, 30_000);
});
