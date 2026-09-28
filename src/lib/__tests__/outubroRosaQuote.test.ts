import { describe, expect, it } from "vitest";
import { buildOutubroRosaQuoteUrl, OUTUBRO_ROSA_WHATSAPP } from "@/lib/outubroRosaQuote";

describe("orçamento Outubro Rosa", () => {
  it("envia o carrinho exclusivamente ao WhatsApp informado", () => {
    const url = buildOutubroRosaQuoteUrl(
      { name: "Ana", phone: "11999999999" },
      [{ id: "1", productName: "Kit manicure", slug: "campanha", quantity: 20,
        selections: { Variação: "Rosa" }, unitPrice: null }],
    );
    expect(OUTUBRO_ROSA_WHATSAPP).toBe("5511953147703");
    expect(url).toMatch(/^https:\/\/wa\.me\/5511953147703\?text=/);
    expect(decodeURIComponent(url)).toContain("Kit manicure");
    expect(decodeURIComponent(url)).toContain("Quantidade: 20");
  });
});
