// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { pricing, summarize, type Photo } from "@/components/fotos/catalog";
import { createProfessionalInvite, inviteState, isProfessional, professionalLink, redeemProfessionalInvite, setProfessional } from "@/lib/professional";

describe("tabela profissional", () => {
  it("preço único por foto nos tamanhos da tabela; retrô e outros seguem o normal", () => {
    expect(pricing("10x15", 1, true).unit).toBe(1);
    expect(pricing("10x15", 500, true).unit).toBe(1);
    expect(pricing("20x30", 3, true).unit).toBe(4.3);
    expect(pricing("60x100", 1, true).unit).toBe(120);
    expect(pricing("10x15", 1).unit).toBe(6); // cliente normal: nada muda
    expect(pricing("polaroid", 1, true).unit).toBe(pricing("polaroid", 1).unit);
    expect(pricing("60x120", 1, true).unit).toBe(pricing("60x120", 1).unit); // acima de 60x100: fora
    const photo = { id: "1", sizeId: "15x21", paper: "brilho", copies: 10 } as unknown as Photo;
    expect(summarize([photo], true).total).toBe(20);
  });

  it("convite vale uma vez, por 30 dias; equipe liga e desliga", () => {
    const db = new DatabaseSync(":memory:");
    const now = new Date("2026-10-21T12:00:00Z");
    const { token } = createProfessionalInvite(db, "Bia", now);
    expect(inviteState(db, token, now)).toBe("valido");
    expect(isProfessional(db, "u1")).toBe(false);
    redeemProfessionalInvite(db, token, "u1", now);
    redeemProfessionalInvite(db, token, "u1", now); // repetir na mesma conta: ok
    expect(isProfessional(db, "u1")).toBe(true);
    expect(() => redeemProfessionalInvite(db, token, "u2", now)).toThrow("já foi usado");
    const old = createProfessionalInvite(db, "Bia", now).token;
    expect(() => redeemProfessionalInvite(db, old, "u3", new Date("2026-12-01T12:00:00Z"))).toThrow("venceu");
    setProfessional(db, "u1", false, "Bia");
    expect(isProfessional(db, "u1")).toBe(false);
  });

  it("link geral: o mesmo para todos; trocar invalida o anterior", () => {
    const db = new DatabaseSync(":memory:");
    const link = professionalLink(db, "Bia");
    expect(professionalLink(db, "Ana")).toBe(link);
    expect(inviteState(db, link, new Date("2030-01-01T00:00:00Z"))).toBe("valido"); // não vence
    redeemProfessionalInvite(db, link, "u1");
    redeemProfessionalInvite(db, link, "u2");
    expect(isProfessional(db, "u1") && isProfessional(db, "u2")).toBe(true);
    const renewed = professionalLink(db, "Bia", true);
    expect(renewed).not.toBe(link);
    expect(inviteState(db, link)).toBe("inexistente");
    expect(() => redeemProfessionalInvite(db, link, "u3")).toThrow("não encontrado");
    expect(isProfessional(db, "u1")).toBe(true); // quem já entrou continua profissional
  });
});
