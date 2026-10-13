import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  normalizeSpotCustomizations,
  readSpotCustomizations,
  replaceSpotCustomizations,
} from "@/lib/suppliers/spotCustomizations";

function raw(overrides: Record<string, unknown> = {}) {
  return {
    ProdReference: "11110", ServiceCode: "11110.16.23.LSR1-01-01", Component: "Esferográfica", Location: "Lateral clipe",
    CustomizationTypeName: "Laser", IsDefault: false, MaxColors: 1, LocationMaxPrintingAreaMM: "40 x 4", TableMaxAreaCM: "4 x 0,4",
    HandlingCost: 0, MinQt1: 1, Price1: 64.99, MinQt2: 50, Price2: 4.1, MinQt3: 100, Price3: 2.85, MinQt4: null, Price4: null,
    MinQt12: 1000, Price12: 2.45, ...overrides,
  };
}

describe("personalizações da Spot", () => {
  it("agrupa por produto, com técnica, local, área, cores e faixas de preço em ordem", () => {
    const map = normalizeSpotCustomizations([
      raw(),
      raw({ ServiceCode: "11110.16.23.TAMP-01", CustomizationTypeName: "Tampografia", IsDefault: true, MaxColors: 2, TableMaxAreaCM: "99.9 x 99.9", LocationMaxPrintingAreaMM: "40 x 5" }),
      raw({ ProdReference: "30511", ServiceCode: "30511.X" }),
    ]);
    expect([...map.keys()]).toEqual(["11110", "30511"]);
    const [laser, tampo] = map.get("11110")!;
    expect(laser).toEqual({
      id: "11110.16.23.LSR1-01-01", tecnica: "Laser", local: "Lateral clipe", componente: "Esferográfica",
      area: "4 × 0,4 cm", cores: 1, padrao: false,
      faixas: [{ minimo: 1, preco: 64.99 }, { minimo: 50, preco: 4.1 }, { minimo: 100, preco: 2.85 }, { minimo: 1000, preco: 2.45 }],
    });
    // Tabela genérica (99,9 cm) → usa a área do local no produto.
    expect(tampo).toMatchObject({ tecnica: "Tampografia", area: "40 × 5 mm", cores: 2, padrao: true });
  });

  it("descarta opção sem preço", () => {
    const map = normalizeSpotCustomizations([raw({ Price1: null, Price2: null, Price3: null, Price12: null })]);
    expect(map.size).toBe(0);
  });

  it("grava e lê por referência do produto; nova sincronização substitui tudo", () => {
    const database = new DatabaseSync(":memory:");
    replaceSpotCustomizations(database, normalizeSpotCustomizations([raw(), raw({ ProdReference: "99999", ServiceCode: "Z" })]), "2026-10-12T00:00:00.000Z");
    expect(readSpotCustomizations(database, "11110")).toHaveLength(1);
    replaceSpotCustomizations(database, normalizeSpotCustomizations([raw()]), "2026-10-13T00:00:00.000Z");
    expect(readSpotCustomizations(database, "99999")).toEqual([]);
    expect(readSpotCustomizations(database, "11110")[0].tecnica).toBe("Laser");
  });
});
