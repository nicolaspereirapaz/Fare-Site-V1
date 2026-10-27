import { describe, expect, it } from "vitest";
import { formatPersonName, formatProductName } from "@/lib/text/names";

describe("nomes formatados", () => {
  it("cliente: iniciais maiúsculas, conectores minúsculos", () => {
    expect(formatPersonName("  ana   MARIA da silva ")).toBe("Ana Maria da Silva");
    expect(formatPersonName("JOÃO DOS SANTOS E SILVA")).toBe("João dos Santos e Silva");
    expect(formatPersonName("maria-clara")).toBe("Maria-Clara");
  });

  it("produto: iniciais maiúsculas, conectores e medidas minúsculos, siglas mantidas", () => {
    expect(formatProductName("caneca de porcelana com alça")).toBe("Caneca de Porcelana com Alça");
    expect(formatProductName("SQUEEZE ALUMÍNIO 420ML")).toBe("Squeeze Alumínio 420ml");
    expect(formatProductName("Caneca Acrílica 400 Ml com Tampa")).toBe("Caneca Acrílica 400 ml com Tampa");
    expect(formatProductName("banner lona 90x120 cm em PVC")).toBe("Banner Lona 90x120 cm em PVC");
    expect(formatProductName("De volta para casa")).toBe("De Volta para Casa");
    expect(formatProductName("Camiseta tamanho M")).toBe("Camiseta Tamanho M");
    expect(formatProductName("CANETA PLÁSTICA C/ DET. EMBORRACHADO")).toBe("Caneta Plástica c/ Det. Emborrachado");
  });
});

import { matchesSearch } from "@/components/backofficeShared";
describe("pesquisa do quadro", () => {
  const order = { code: "PED-0012", customerName: "João da Silva", customerCompany: "Padaria Pão", items: [{ productName: "Caneca de Porcelana" }] };
  it("acha por nome, número ou produto, sem acento e com várias palavras", () => {
    expect(matchesSearch(order, "joao")).toBe(true);
    expect(matchesSearch(order, "12")).toBe(true);
    expect(matchesSearch(order, "ped-0012")).toBe(true);
    expect(matchesSearch(order, "caneca silva")).toBe(true);
    expect(matchesSearch(order, "padaria")).toBe(true);
    expect(matchesSearch(order, "camiseta")).toBe(false);
    expect(matchesSearch(order, "  ")).toBe(true);
  });
});
