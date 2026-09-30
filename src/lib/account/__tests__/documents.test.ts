import { describe, expect, it } from "vitest";
import { formatCep, formatCnpj, formatCpf, formatPhoneBR, isValidCnpj, isValidCpf } from "@/lib/account/documents";

describe("CPF", () => {
  it("valida os dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("formata enquanto digita", () => {
    expect(formatCpf("529")).toBe("529");
    expect(formatCpf("5299822")).toBe("529.982.2");
    expect(formatCpf("52998224725999")).toBe("529.982.247-25");
  });
});

describe("CNPJ", () => {
  it("valida CNPJ numérico e o novo alfanumérico da Receita", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-3X")).toBe(false);
  });

  it("formata enquanto digita, em maiúsculas", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(formatCnpj("1122")).toBe("11.22");
  });
});

describe("CEP e telefone", () => {
  it("formata CEP", () => {
    expect(formatCep("13201000")).toBe("13201-000");
    expect(formatCep("13201")).toBe("13201");
  });

  it("formata telefone fixo e celular", () => {
    expect(formatPhoneBR("11988887777")).toBe("(11) 98888-7777");
    expect(formatPhoneBR("1933334444")).toBe("(19) 3333-4444");
  });
});
