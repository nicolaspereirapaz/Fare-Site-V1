import { describe, expect, it } from "vitest";
import { coresLabel, spotChoices, type SpotPickable } from "@/lib/suppliers/spotOptionPicker";

const opt = (id: string, componente: string, local: string, tecnica: string, area: string, cores: number, padrao = false): SpotPickable =>
  ({ id, componente, local, tecnica, area, cores, padrao });

// Mochila 52276 (dados reais da Spot, resumidos)
const MOCHILA = [
  opt("LSR-05", "Mochila", "Placa", "Laser", "3,7 × 0,5 cm", 1, true),
  opt("LSR-10", "Mochila", "Placa", "Laser", "3,7 × 1 cm", 1),
  opt("TRD-43", "Mochila", "Frente superior", "Transfer Digital", "4 × 3 cm", 13),
  opt("TRD-95", "Mochila", "Frente superior", "Transfer Digital", "9,5 × 5 cm", 13),
  opt("TRS-34-1", "Mochila", "Frente superior", "Transfer", "3 × 4 cm", 1),
  opt("TRS-34-2", "Mochila", "Frente superior", "Transfer", "3 × 4 cm", 2),
  opt("TRS-34-3", "Mochila", "Frente superior", "Transfer", "3 × 4 cm", 3),
  opt("TRS-95-1", "Mochila", "Frente superior", "Transfer", "9,5 × 5 cm", 1),
  opt("TRS-95-2", "Mochila", "Frente superior", "Transfer", "9,5 × 5 cm", 2),
];

const values = (result: ReturnType<typeof spotChoices>, key: string) => result.levels.find((level) => level.key === key)?.values.map((v) => v.label);
const selected = (result: ReturnType<typeof spotChoices>, key: string) => result.levels.find((level) => level.key === key)?.selected;

describe("escolha da personalização da Spot em níveis", () => {
  it("sem nada escolhido, começa pela opção padrão do fornecedor", () => {
    const result = spotChoices(MOCHILA, {});
    expect(result.levels.map((level) => level.label)).toEqual(["Componente", "Local", "Técnica", "Área", "Nº de cores"]);
    expect(values(result, "local")).toEqual(["Placa", "Frente superior"]);
    expect(result.option?.id).toBe("LSR-05");
  });

  it("cada nível só mostra o que existe para as escolhas de cima", () => {
    const result = spotChoices(MOCHILA, { local: "Frente superior" });
    expect(values(result, "tecnica")).toEqual(["Transfer", "Transfer Digital"]);
    expect(selected(result, "tecnica")).toBe("Transfer");
    expect(values(result, "area")).toEqual(["3 × 4 cm", "9,5 × 5 cm"]);
    expect(values(result, "cores")).toEqual(["1 cor", "2 cores", "3 cores"]);
    expect(result.option?.id).toBe("TRS-34-1");
  });

  it("área em ordem de tamanho e nº de cores em ordem crescente", () => {
    const result = spotChoices([...MOCHILA].reverse(), { local: "Frente superior", tecnica: "Transfer" });
    expect(values(result, "area")).toEqual(["3 × 4 cm", "9,5 × 5 cm"]);
    expect(values(result, "cores")).toEqual(["1 cor", "2 cores", "3 cores"]);
  });

  it("trocar um nível de cima ajusta os de baixo para algo que exista", () => {
    // 3 cores só existe em 3 × 4; ao ir para 9,5 × 5 volta para a 1ª disponível
    const result = spotChoices(MOCHILA, { local: "Frente superior", tecnica: "Transfer", area: "9,5 × 5 cm", cores: "3" });
    expect(selected(result, "cores")).toBe("1");
    expect(result.option?.id).toBe("TRS-95-1");
  });

  it("parte de uma opção já salva (reabrir gravação)", () => {
    const result = spotChoices(MOCHILA, { fromId: "TRS-95-2" });
    expect(result.option?.id).toBe("TRS-95-2");
    expect(selected(result, "area")).toBe("9,5 × 5 cm");
    expect(selected(result, "cores")).toBe("2");
  });

  it("nível sem informação (componente vazio) não aparece", () => {
    const result = spotChoices([opt("a", "", "Corpo", "Laser", "4 × 0,5 cm", 1)], {});
    expect(result.levels.map((level) => level.key)).toEqual(["local", "tecnica", "area", "cores"]);
    expect(result.option?.id).toBe("a");
  });

  it("sem opções, não escolhe nada", () => {
    expect(spotChoices([], {}).option).toBeNull();
  });

  it("rótulo do nº de cores", () => {
    expect(coresLabel(1)).toBe("1 cor");
    expect(coresLabel(4)).toBe("4 cores");
    expect(coresLabel(13)).toBe("Até 13 cores");
  });
});
