import { describe, expect, it, vi } from "vitest";
import { lookupCep } from "@/lib/account/profileClient";

describe("busca de endereço pelo CEP", () => {
  it("preenche rua, bairro, cidade e UF", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      cep: "13201-000", logradouro: "Rua Barão de Jundiaí", bairro: "Centro", localidade: "Jundiaí", uf: "SP",
    }), { status: 200 })));
    await expect(lookupCep("13201-000")).resolves.toEqual({ street: "Rua Barão de Jundiaí", district: "Centro", city: "Jundiaí", state: "SP" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://viacep.com.br/ws/13201000/json/");
  });

  it("retorna null para CEP inexistente, incompleto ou falha de rede", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ erro: "true" }), { status: 200 })));
    await expect(lookupCep("99999-999")).resolves.toBeNull();
    await expect(lookupCep("1320")).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(lookupCep("13201-000")).resolves.toBeNull();
  });
});
