"use client";

import { Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { brl, paperLabel, pricing, SIZE_GROUPS, SIZES, type Fit, type Paper } from "@/components/fotos/catalog";
import { api, type Conversation, type LinkedCustomer } from "@/components/staff/atendimento/shared";

type Created = { code: string; orderId: string | null; photos: number; totalCents: number; prazo: string };

/** Formulário do pedido de revelação com as fotos escolhidas na janela de mídias. */
export function PhotoOrderForm({
  conversation,
  customers,
  messageIds,
  onCancel,
}: {
  conversation: Conversation;
  customers: LinkedCustomer[] | null;
  messageIds: string[];
  onCancel: () => void;
}) {
  const [customerRef, setCustomerRef] = useState(customers?.[0]?.ref ?? "");
  const [sizeId, setSizeId] = useState("10x15");
  const [paper, setPaper] = useState<Paper>("brilho");
  const [copies, setCopies] = useState(1);
  const [fit, setFit] = useState<Fit>("preencher");
  const [delivery, setDelivery] = useState<"retirada" | "entrega">("retirada");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const total = messageIds.length * copies;
  const price = useMemo(() => {
    try {
      return pricing(sizeId, total);
    } catch {
      return null;
    }
  }, [sizeId, total]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      setCreated(await api<Created>(`/api/atendimento/conversas/${conversation.id}/pedido-fotos`, {
        method: "POST",
        body: { messageIds, sizeId, paper, copies, fit, delivery, customerRef },
      }));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar o pedido.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="at-order-form is-done" role="status">
        <strong>Pedido {created.code} criado</strong> — {created.photos} foto(s), {brl(created.totalCents / 100)}. {created.prazo}
        <span className="at-order-actions">
          {created.orderId ? (
            <a className="at-btn at-btn-primary" href={`/equipe/pedidos/${created.orderId}`} rel="noopener" target="_blank">
              Abrir pedido
            </a>
          ) : null}
          <button className="at-btn at-btn-quiet" onClick={onCancel} type="button">
            Fechar
          </button>
        </span>
      </div>
    );
  }

  if (!customers?.length) {
    return (
      <div className="at-order-form" role="alert">
        Para criar o pedido, o cliente precisa de cadastro. Feche esta janela e use <strong>Cadastrar cliente</strong> na lateral da conversa.
        <span className="at-order-actions">
          <button className="at-btn at-btn-quiet" onClick={onCancel} type="button">
            Voltar
          </button>
        </span>
      </div>
    );
  }

  return (
    <form
      className="at-order-form"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <strong className="at-order-title">
        <Printer aria-hidden="true" size={16} /> Pedido de revelação com {messageIds.length} foto(s)
      </strong>
      <div className="at-order-fields">
        <label>
          Cliente
          <select onChange={(event) => setCustomerRef(event.target.value)} value={customerRef}>
            {customers.map((customer) => (
              <option key={customer.ref} value={customer.ref}>
                {customer.name}
                {customer.company ? ` (${customer.company})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tamanho
          <select onChange={(event) => setSizeId(event.target.value)} value={sizeId}>
            {SIZE_GROUPS.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {SIZES.filter((size) => size.group === group.id).map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Papel
          <select onChange={(event) => setPaper(event.target.value as Paper)} value={paper}>
            <option value="brilho">{paperLabel("brilho")}</option>
            <option value="fosco">{paperLabel("fosco")}</option>
          </select>
        </label>
        <label>
          Cópias de cada
          <input inputMode="numeric" min={1} onChange={(event) => setCopies(Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1))} type="number" value={copies} />
        </label>
        <label title="Preencher: a foto ocupa o papel todo (corta as sobras). Encaixar: a foto inteira aparece (pode sobrar borda branca).">
          Ajuste
          <select onChange={(event) => setFit(event.target.value as Fit)} value={fit}>
            <option value="preencher">Preencher (corta sobras)</option>
            <option value="encaixar">Encaixar (foto inteira)</option>
          </select>
        </label>
        <label>
          Entrega
          <select onChange={(event) => setDelivery(event.target.value as "retirada" | "entrega")} value={delivery}>
            <option value="retirada">Retirar na loja</option>
            <option value="entrega">Entregar</option>
          </select>
        </label>
      </div>
      <p className="at-muted">
        {total} cópia(s){price && price.unit ? ` · ${brl(price.unit)} cada (${price.tier}) · total ${brl(price.total)}` : ""}. Cada foto sai na orientação dela; para recorte ou ajuste foto a foto, edite depois no pedido.
      </p>
      {error ? <p className="at-form-error" role="alert">{error}</p> : null}
      <span className="at-order-actions">
        <button className="at-btn at-btn-quiet" disabled={busy} onClick={onCancel} type="button">
          Cancelar
        </button>
        <button className="at-btn at-btn-primary" disabled={busy || !customerRef} type="submit">
          {busy ? "Criando pedido… (pode levar um minuto)" : "Criar pedido"}
        </button>
      </span>
    </form>
  );
}
