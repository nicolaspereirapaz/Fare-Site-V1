"use client";

import { QuoteClosingFields, type ClosingChoice } from "@/components/staff/QuoteClosingFields";
import type { PaymentForm } from "@/components/staff/paymentFieldsShared";
import "@/components/staff/closeQuote.css";

/** Pedido direto: mesmos campos de pagamento e entrega de "Fechar Orçamento" (sugestões, saldo, pagar na retirada). */
export function DirectOrderFields({ value, onChange, total, choice, onChoice }: {
  value: PaymentForm; onChange: (value: PaymentForm) => void; total: number; choice: ClosingChoice; onChoice: (choice: ClosingChoice) => void;
}) {
  return (
    <section className="qe-card cq-inline">
      <div className="cq-fields">
        <QuoteClosingFields choice={choice} onChange={onChange} onChoice={onChoice} total={total} value={value} />
      </div>
    </section>
  );
}
