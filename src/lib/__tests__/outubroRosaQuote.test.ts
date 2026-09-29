import { describe, expect, it } from "vitest";
import { buildOutubroRosaQuoteMessage, buildOutubroRosaQuoteUrl, OUTUBRO_ROSA_WHATSAPP } from "@/lib/outubroRosaQuote";
import type { CampaignCartItem } from "@/lib/outubroRosaCart";

const caneta: CampaignCartItem = {
  id: "1", productName: "Caneta Plástica", slug: "campanhas/outubro-rosa/abc", quantity: 250,
  selections: { Cor: "Rosa" }, color: "Rosa", unitPrice: null, image: "",
  pricing: { unitSaleCents: 184, freightCents: 10000 },
};

describe("orçamento Outubro Rosa", () => {
  it("envia o carrinho exclusivamente ao WhatsApp informado", () => {
    const url = buildOutubroRosaQuoteUrl({ name: "Ana", phone: "11999999999" }, [caneta]);
    expect(OUTUBRO_ROSA_WHATSAPP).toBe("5511953147703");
    expect(url).toMatch(/^https:\/\/wa\.me\/5511953147703\?text=/);
    expect(decodeURIComponent(url)).toContain("Caneta Plástica");
  });

  it("lista cor, quantidade, valor estimado por item e o total", () => {
    const kit: CampaignCartItem = { ...caneta, id: "2", productName: "Kit manicure", quantity: 20, color: "Branco", pricing: null };
    const message = buildOutubroRosaQuoteMessage({ name: "Ana", company: "ACME", phone: "11999999999", notes: "Entrega em outubro" }, [caneta, kit]);
    expect(message).toContain("• Cor: Rosa");
    expect(message).toContain("• Quantidade: 250 un.");
    expect(message).toContain("• Valor estimado: R$ 2,24/un. — subtotal R$ 560,00");
    expect(message).toContain("• Valor: sob consulta");
    expect(message).toContain("Total estimado: R$ 560,00 (sem os itens sob consulta)");
    expect(message).toContain("Observações: Entrega em outubro");
    expect(message).not.toContain("Arte:");
  });
});