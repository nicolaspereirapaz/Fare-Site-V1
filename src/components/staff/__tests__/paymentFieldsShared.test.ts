import { describe, expect, it } from "vitest";
import { paidCents, paymentFormError, EMPTY_PAYMENT_FORM } from "@/components/staff/paymentFieldsShared";

describe("pagamento livre do pedido direto", () => {
  it("interpreta centavos sem arredondar dinheiro inválido", () => {
    expect(paidCents("300,50")).toBe(30050);
    expect(paidCents("0")).toBe(0);
    expect(paidCents("")).toBe(0);
    for (const value of ["-1", "NaN", "1,999", "abc", "1e5"]) expect(paidCents(value)).toBeNull();
  });
  it("não permite recebimento maior que o total descontado", () => {
    expect(paymentFormError({ ...EMPTY_PAYMENT_FORM, paid: "750,01", paidAt: "2026-10-14" }, 75000)).toMatch(/maior/);
    expect(paymentFormError({ ...EMPTY_PAYMENT_FORM, paid: "300", paidAt: "2026-10-14", deliveryDate: "2026-10-23" }, 75000)).toBeNull();
  });
  it("recebimento exige data, zero não cria recebimento", () => {
    expect(paymentFormError({ ...EMPTY_PAYMENT_FORM, paid: "1" }, 75000)).toMatch(/data/);
    expect(paymentFormError(EMPTY_PAYMENT_FORM, 75000)).toBeNull();
  });
});
