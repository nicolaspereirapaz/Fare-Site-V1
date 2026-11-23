import { describe, expect, it } from "vitest";
import { phoneFromWhatsAppUrl } from "@/components/staff/ProposalActions";
import { buildWhatsAppUrl } from "@/lib/commerce";

describe("phoneFromWhatsAppUrl", () => {
  it("tira o número do link wa.me do servidor", () => {
    expect(phoneFromWhatsAppUrl(buildWhatsAppUrl("5511987654321", "Olá, segue a proposta"))).toBe("5511987654321");
  });

  it("cliente sem WhatsApp: null", () => {
    expect(phoneFromWhatsAppUrl(null)).toBeNull();
    expect(phoneFromWhatsAppUrl("https://example.com/")).toBeNull();
  });
});
