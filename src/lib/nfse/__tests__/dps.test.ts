// @vitest-environment node
import { describe, expect, it } from "vitest";
import { centavos, erroCompetencia, idDps, montarDps } from "../dps";
import { validarXsd } from "./xsd";

const base = {
  ambiente: 2 as const,
  serie: "1",
  numero: 7,
  emissao: new Date("2026-11-10T15:00:00Z"),
  servico: "impressao" as const,
  descricao: "Adesivos <Caedu> & cia",
  valorCentavos: 6000,
};

const caedu = { doc: "46.377.727/0006-06", nome: "CAEDU", cMun: "3525904", cep: "13201-010", logradouro: "BARAO DE JUNDIAI", numero: "508", bairro: "CENTRO", fone: "(11) 3469-2300", email: "a@b.com" };

describe("montarDps", () => {
  it("monta o Id com 45 posições e horário de Brasília", () => {
    const { id, xml } = montarDps(base);
    expect(id).toBe("DPS3525904250344377000136" + "00001" + "000000000000007");
    expect(id).toHaveLength(45);
    expect(xml).toContain("<dhEmi>2026-11-10T12:00:00-03:00</dhEmi>");
    expect(xml).toContain("<vServ>60.00</vServ>");
    expect(xml).toContain("Adesivos &lt;Caedu&gt; &amp; cia");
  });

  for (const ambiente of [1, 2] as const) {
    describe(`XSD oficial do ambiente ${ambiente}`, () => {
      it("sem tomador", async () => {
        const { xml } = montarDps({ ...base, ambiente });
        expect(xml).not.toContain("<toma>");
        expect(await validarXsd(xml, ambiente)).toEqual([]);
      });

      it("revelação com tomador CNPJ e endereço", async () => {
        const { xml } = montarDps({ ...base, ambiente, servico: "revelacao", pTotTribSN: 3.69, tomador: caedu });
        expect(xml).toContain("<cTribNac>130301</cTribNac><cTribMun>004</cTribMun>");
        expect(xml).toContain("<pTotTribSN>3.69</pTotTribSN>");
        expect(await validarXsd(xml, ambiente)).toEqual([]);
      });

      it("personalização de brindes", async () => {
        const { xml } = montarDps({ ...base, ambiente, servico: "brindes", tomador: caedu });
        expect(xml).toContain("<cTribNac>130501</cTribNac><cTribMun>001</cTribMun>");
        expect(await validarXsd(xml, ambiente)).toEqual([]);
      });

      it("tomador CPF sem endereço", async () => {
        const { xml } = montarDps({ ...base, ambiente, tomador: { doc: "123.456.789-09", nome: "Fulano" } });
        expect(xml).toContain("<CPF>12345678909</CPF>");
        expect(xml).not.toContain("<end>");
        expect(await validarXsd(xml, ambiente)).toEqual([]);
      });
    });
  }

  it("produção segue a nota do Emissor web: sem finNFSe, descrição antes do NBS", () => {
    const { xml } = montarDps({ ...base, ambiente: 1, servico: "revelacao" });
    expect(xml).not.toContain("finNFSe");
    expect(xml).toMatch(/<xDescServ>.*<\/xDescServ><cNBS>/);
  });

  it("o validador reprova DPS quebrada", async () => {
    const { xml } = montarDps(base);
    expect((await validarXsd(xml.replace("<cTribNac>130401</cTribNac>", ""), 2)).length).toBeGreaterThan(0);
  });

  it("converte valor digitado em centavos", () => {
    expect(centavos("60,00")).toBe(6000);
    expect(centavos("R$ 1.234,5")).toBe(123450);
    expect(centavos("30.10")).toBe(3010);
    expect(centavos("0")).toBeNull();
    expect(centavos("abc")).toBeNull();
    expect(centavos("1,234")).toBeNull();
  });

  it("data de competência escolhida vai no dCompet; sem ela, o dia da emissão", async () => {
    expect(montarDps(base).xml).toContain("<dCompet>2026-11-10</dCompet>");
    const { xml } = montarDps({ ...base, competencia: "2026-10-31" });
    expect(xml).toContain("<dCompet>2026-10-31</dCompet>");
    expect(xml).toContain("<dhEmi>2026-11-10T12:00:00-03:00</dhEmi>");
    expect(await validarXsd(xml, 2)).toEqual([]);
  });

  it("competência: só data real e até o dia da emissão (horário de Brasília)", () => {
    // 01:30 UTC de 11/11 ainda é 10/11 em Brasília.
    const emissao = new Date("2026-11-11T01:30:00Z");
    expect(erroCompetencia("2026-11-10", emissao)).toBeNull();
    expect(erroCompetencia("2026-10-01", emissao)).toBeNull();
    expect(erroCompetencia("2026-11-11", emissao)).toMatch(/depois de hoje/);
    expect(erroCompetencia("2026-02-30", emissao)).toMatch(/inválida/);
    expect(erroCompetencia("10/11/2026", emissao)).toMatch(/inválida/);
  });

  it("série com 5 dígitos no Id", () => {
    expect(idDps("10000", 514).slice(-20)).toBe("10000000000000000514");
  });
});
