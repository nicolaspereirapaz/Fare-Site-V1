// @vitest-environment node
import { describe, expect, it } from "vitest";
import { montarCancelamento } from "../evento";
import { validarXsd } from "./xsd";

const chave = "35259042250344377000136000000000000126118327136451";

describe("montarCancelamento", () => {
  for (const ambiente of [1, 2] as const) {
    it(`passa no XSD oficial do pedido de evento (ambiente ${ambiente})`, async () => {
      const xml = montarCancelamento({ ambiente, chave, cMotivo: "1", xMotivo: "Valor digitado errado & refeito", quando: new Date("2026-11-10T15:00:00Z") });
      expect(xml).toContain(`<infPedReg Id="PRE${chave}101101">`);
      expect(xml).toContain("<dhEvento>2026-11-10T12:00:00-03:00</dhEvento>");
      expect(xml).toContain("errado &amp; refeito");
      expect(await validarXsd(xml, ambiente, "pedRegEvento_v1.01.xsd")).toEqual([]);
    });
  }
});
