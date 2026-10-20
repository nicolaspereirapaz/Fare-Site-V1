"use client";

import { paidCents, STAFF_PAYMENT_LABELS, type PaymentForm } from "@/components/staff/paymentFieldsShared";

/** Mesmo estilo do editor de orçamento; sem explicações ou tabela do módulo financeiro na tela. */
export function DirectOrderFields({ value, onChange }: { value: PaymentForm; onChange: (value: PaymentForm) => void }) {
  const set = <K extends keyof PaymentForm>(key: K, field: PaymentForm[K]) => onChange({ ...value, [key]: field });
  const hasPayment = (paidCents(value.paid) ?? 0) > 0;
  return (
    <>
      <section className="qe-card">
        <h2>Pagamento</h2>
        <div className="qe-payment-grid">
          <label className="qe-field"><span>Quanto o cliente já pagou (R$)</span><input inputMode="decimal" onChange={(e) => set("paid", e.target.value)} value={value.paid} /></label>
          <label className="qe-field"><span>Forma de pagamento</span><select onChange={(e) => set("paymentMethod", e.target.value as PaymentForm["paymentMethod"])} value={value.paymentMethod}>
            {Object.entries(STAFF_PAYMENT_LABELS).map(([method, label]) => <option key={method} value={method}>{label}</option>)}
          </select></label>
          {hasPayment ? <label className="qe-field"><span>Data do pagamento</span><input onChange={(e) => set("paidAt", e.target.value)} type="date" value={value.paidAt} /></label> : null}
          {value.paymentMethod === "cartao_credito" ? <label className="qe-field"><span>Parcelas</span><select onChange={(e) => set("installments", e.target.value)} value={value.installments}>
            {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
          </select></label> : null}
          {["boleto", "faturamento_empresa"].includes(value.paymentMethod) ? <label className="qe-field"><span>Vencimento do boleto / faturamento</span><input onChange={(e) => set("dueDate", e.target.value)} type="date" value={value.dueDate} /></label> : null}
        </div>
      </section>
      <section className="qe-card">
        <h2>Entrega</h2>
        <div className="qe-payment-grid">
          <label className="qe-field"><span>Data prevista de entrega</span><input onChange={(e) => set("deliveryDate", e.target.value)} type="date" value={value.deliveryDate} /></label>
          <label className="qe-field"><span>Horário (opcional)</span><input onChange={(e) => set("deliveryTime", e.target.value)} type="time" value={value.deliveryTime} /></label>
          <label className="qe-field"><span>Forma de entrega</span><select onChange={(e) => set("deliveryMode", e.target.value as PaymentForm["deliveryMode"])} value={value.deliveryMode}><option value="retirada">Retirada na loja</option><option value="entrega">Entrega ao cliente</option></select></label>
        </div>
      </section>
    </>
  );
}
