import { painelText, pixPaymentContent } from "../fare_painel.mjs";
import { describe, expect, it } from "vitest";

describe("cartão de Pix do WhatsApp no painel", () => {
  it("mostra nome e chave do Pix (antes virava menu vazio)", () => {
    const card = pixPaymentContent({ key: "41222388898", keyType: "CPF", name: "FARE FOTO" });
    expect(painelText(card)).toBe("[Pix do WhatsApp]\nNome: FARE FOTO\nChave Pix (CPF): 41222388898");
  });

  it("cobrança com valor e copia e cola", () => {
    const params = {
      currency: "BRL",
      total_amount: { value: 9745, offset: 100 },
      payment_settings: [{ type: "pix_dynamic_code", pix_dynamic_code: { code: "000201abc", merchant_name: "LOJA X", key: "a@b.com", key_type: "EMAIL" } }],
    };
    const text = painelText({ interactiveMessage: { nativeFlowMessage: { buttons: [{ name: "review_and_pay", buttonParamsJson: JSON.stringify(params) }] } } });
    expect(text).toContain("Valor: R$ 97,45");
    expect(text).toContain("Chave Pix (e-mail): a@b.com");
    expect(text).toContain("Pix copia e cola: 000201abc");
    expect(text).not.toContain("Menu do WhatsApp");
  });

  it("formato desconhecido: aviso em vez de menu vazio", () => {
    expect(painelText({ interactiveMessage: { nativeFlowMessage: { buttons: [{ name: "payment_info", buttonParamsJson: "{}" }] } } }))
      .toBe("[Pix do WhatsApp]\n[Abra no celular para ver os dados do Pix.]");
  });
});
