"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, PencilLine, RefreshCw, ShoppingCart, TriangleAlert, XCircle } from "lucide-react";
import {
  DetailsDialog,
  DetailsSections,
  formatDay,
  itemsSummary,
  KanbanCard,
  KanbanColumn,
  messageFor,
  StepButtons,
  whatsAppReplyUrl,
} from "@/components/backofficeShared";
import { PAYMENT_LABELS, type BackofficeOrder } from "@/components/BackofficeBoard";
import type { BackofficeQuoteSummary } from "@/lib/backoffice/quotesAccess";
import { ProposalActions } from "@/components/staff/ProposalActions";
import { QUOTE_BOARD_COLUMNS, QUOTE_STATUS_LABELS, type QuoteStatus } from "@/lib/quotes/quoteCode";

type Column = (typeof QUOTE_BOARD_COLUMNS)[number];

const COLUMN_COLORS: Record<Column, { dot: string; bg: string; fg: string }> = {
  aguardando_orcamento: { dot: "#d4532a", bg: "#f8e7df", fg: "#8f3416" },
  em_negociacao: { dot: "#2c3561", bg: "#e9ebf3", fg: "#1d2447" },
  aguardando_pagamento: { dot: "#b7791f", bg: "#fbf0dc", fg: "#7a4f0d" },
};

/** Etapa seguinte e anterior de cada coluna (na última, avançar = pagamento recebido → vira pedido). */
const QUOTE_NEXT: Record<Column, QuoteStatus> = {
  aguardando_orcamento: "em_negociacao",
  em_negociacao: "aguardando_pagamento",
  aguardando_pagamento: "virou_pedido",
};
const QUOTE_BACK: Partial<Record<Column, Column>> = {
  em_negociacao: "aguardando_orcamento",
  aguardando_pagamento: "em_negociacao",
};

type Selected = { kind: "quote"; id: string } | { kind: "order"; id: string } | null;


/**
 * Quadro de orçamentos: Aguardando orçamento | Em negociação | Aguardando pagamento.
 * Pedidos feitos direto no site (sem orçamento) também entram em "Aguardando pagamento".
 * Pagamento recebido → vira pedido em "Aguardando arte" (aba Pedidos) e sai daqui.
 */
export function QuotesBoard({ canCancel = false }: { canCancel?: boolean }) {
  const [quotes, setQuotes] = useState<BackofficeQuoteSummary[]>([]);
  const [orders, setOrders] = useState<BackofficeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);

  const load = useCallback(async () => {
    const [quotesResponse, ordersResponse] = await Promise.all([
      fetch("/api/backoffice/quotes", { cache: "no-store" }),
      fetch("/api/backoffice/orders", { cache: "no-store" }),
    ]);
    const quotesPayload = (await quotesResponse.json()) as { quotes: BackofficeQuoteSummary[]; error?: string };
    const ordersPayload = (await ordersResponse.json()) as { orders: BackofficeOrder[]; error?: string };
    if (!quotesResponse.ok) throw new Error(messageFor(quotesPayload.error));
    if (!ordersResponse.ok) throw new Error(messageFor(ordersPayload.error));
    return { quotes: quotesPayload.quotes, orders: ordersPayload.orders };
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .then((payload) => {
        if (!active) return;
        setQuotes(payload.quotes);
        setOrders(payload.orders);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Erro inesperado.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function send(id: string, url: string, status: string) {
    setUpdatingId(id);
    let changeError: string | null = null;
    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(messageFor(payload.error));
      setSelected(null);
    } catch (caught) {
      changeError = caught instanceof Error ? caught.message : "Erro inesperado.";
    }
    try {
      const payload = await load();
      setQuotes(payload.quotes);
      setOrders(payload.orders);
      setError(changeError);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro inesperado.");
    }
    setUpdatingId(null);
  }

  function changeQuote(quote: BackofficeQuoteSummary, next: QuoteStatus) {
    if (next === "encerrado" && !window.confirm(`Encerrar o orçamento #${quote.code} de ${quote.customerName}?`)) return;
    void send(quote.id, `/api/backoffice/quotes/${quote.id}`, next);
  }

  function changeOrder(order: BackofficeOrder, next: "aguardando_arte" | "cancelado") {
    if (next === "cancelado" && !window.confirm(`Cancelar o pedido #${order.code} de ${order.customerName}? Isso não pode ser desfeito.`)) return;
    void send(order.id, `/api/backoffice/orders/${order.id}`, next);
  }

  function quoteSteps(quote: BackofficeQuoteSummary & { status: Column }, large = false) {
    const back = QUOTE_BACK[quote.status];
    const next = QUOTE_NEXT[quote.status];
    return (
      <StepButtons
        back={back ? { label: `Voltar para ${QUOTE_STATUS_LABELS[back]}`, onClick: () => changeQuote(quote, back) } : null}
        busy={updatingId === quote.id}
        large={large}
        next={
          next === "virou_pedido"
            ? { label: "Pagamento recebido", text: large ? "Pagamento recebido" : "Pago", final: true, onClick: () => changeQuote(quote, next) }
            : { label: `Avançar para ${QUOTE_STATUS_LABELS[next]}`, onClick: () => changeQuote(quote, next) }
        }
      />
    );
  }

  function siteOrderSteps(order: BackofficeOrder, large = false) {
    return (
      <StepButtons
        busy={updatingId === order.id}
        large={large}
        next={{ label: "Pagamento recebido", text: large ? "Pagamento recebido" : "Pago", final: true, onClick: () => changeOrder(order, "aguardando_arte") }}
      />
    );
  }

  const closeDialog = useCallback(() => {
    setSelected(null);
  }, []);
  const reloadBoard = useCallback(() => {
    load().then((payload) => {
      setQuotes(payload.quotes);
      setOrders(payload.orders);
    }).catch(() => undefined);
  }, [load]);
  const boardQuotes = quotes.filter((quote): quote is BackofficeQuoteSummary & { status: Column } =>
    (QUOTE_BOARD_COLUMNS as readonly string[]).includes(quote.status),
  );
  const siteOrders = orders.filter((order) => order.status === "aguardando_pagamento");
  const openQuote = selected?.kind === "quote" ? boardQuotes.find((quote) => quote.id === selected.id) ?? null : null;
  const openOrder = selected?.kind === "order" ? siteOrders.find((order) => order.id === selected.id) ?? null : null;

  return (
    <div aria-labelledby="backoffice-tab-orcamentos" id="backoffice-panel-orcamentos" role="tabpanel">
      {error ? (
        <div className="backoffice-error" role="alert">
          <TriangleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && !boardQuotes.length && !siteOrders.length ? (
        <div className="backoffice-loading">
          <RefreshCw aria-hidden="true" size={22} />
          <p>Carregando orçamentos…</p>
        </div>
      ) : (
        <div className="kb-board kb-board-3">
          {QUOTE_BOARD_COLUMNS.map((status) => {
            const columnQuotes = boardQuotes.filter((quote) => quote.status === status);
            const columnOrders = status === "aguardando_pagamento" ? siteOrders : [];
            return (
              <KanbanColumn
                color={COLUMN_COLORS[status].dot}
                count={columnQuotes.length + columnOrders.length}
                empty="Nada nesta etapa."
                key={status}
                title={QUOTE_STATUS_LABELS[status]}
              >
                {columnQuotes.map((quote) => (
                  <KanbanCard
                    action={quoteSteps(quote)}
                    code={quote.code}
                    key={quote.id}
                    onDetails={() => setSelected({ kind: "quote", id: quote.id })}
                    summary={itemsSummary(quote.items)}
                    tag={<span className="kb-origin">{quote.createdBy ? `Feito por ${quote.createdBy}` : "Site"}</span>}
                    title={quote.customerCompany || quote.customerName}
                    total={quote.total}
                    warning={quote.billing || quote.createdBy ? null : "Sem dados de faturamento"}
                  />
                ))}
                {columnOrders.map((order) => (
                  <KanbanCard
                    action={siteOrderSteps(order)}
                    code={order.code}
                    key={order.id}
                    onDetails={() => setSelected({ kind: "order", id: order.id })}
                    summary={itemsSummary(order.items)}
                    tag={<span className="kb-tag"><ShoppingCart aria-hidden="true" size={12} /> Pedido do site</span>}
                    title={order.customerCompany || order.customerName}
                    total={order.total}
                    warning={order.billing ? null : "Sem dados de faturamento"}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>
      )}

      {openQuote ? (
        <DetailsDialog
          code={openQuote.code}
          footer={
            <>
              {quoteSteps(openQuote, true)}
              <Link className="kb-edit-quote" href={`/equipe/orcamentos/${openQuote.id}`}>
                <PencilLine aria-hidden="true" size={15} /> Editar itens e gravações
              </Link>
              <button className="kb-danger" disabled={updatingId === openQuote.id} onClick={() => changeQuote(openQuote, "encerrado")} type="button">
                <XCircle aria-hidden="true" size={15} /> Encerrar orçamento
              </button>
            </>
          }
          onClose={closeDialog}
          status={QUOTE_STATUS_LABELS[openQuote.status]}
          statusColor={COLUMN_COLORS[openQuote.status]}
          subtitle={`orçamento de ${formatDay(openQuote.createdAt)}${openQuote.createdBy ? ` · feito por ${openQuote.createdBy}` : " · pedido pelo site"}`}
          title={openQuote.customerName}
        >
          <ProposalActions
            blocked={openQuote.items.some((item) => item.unitPrice === null) ? "Há item sem preço. Clique em “Editar itens e gravações” e salve para gerar a proposta." : null}
            onSent={reloadBoard}
            quoteId={openQuote.id}
            sentAt={openQuote.proposalSentAt}
          />
          <DetailsSections
            billing={openQuote.billing}
            customerCompany={openQuote.customerCompany}
            customerName={openQuote.customerName}
            customerPhone={openQuote.customerPhone}
            items={openQuote.items}
            internalNotes={openQuote.internalNotes}
            notes={openQuote.notes}
            total={openQuote.total}
          />
        </DetailsDialog>
      ) : null}

      {openOrder ? (
        <DetailsDialog
          code={openOrder.code}
          footer={
            <>
              {siteOrderSteps(openOrder, true)}
              {openOrder.customerPhone ? (
                <a className="kb-whatsapp" href={whatsAppReplyUrl(openOrder.customerName, openOrder.customerPhone, openOrder.code, "pedido")} rel="noopener noreferrer" target="_blank">
                  <MessageCircle aria-hidden="true" size={15} /> WhatsApp
                </a>
              ) : null}
              {canCancel ? (
                <button className="kb-danger" disabled={updatingId === openOrder.id} onClick={() => changeOrder(openOrder, "cancelado")} type="button">
                  <XCircle aria-hidden="true" size={15} /> Cancelar pedido
                </button>
              ) : null}
            </>
          }
          onClose={closeDialog}
          status="Pedido do site · aguardando pagamento"
          statusColor={COLUMN_COLORS.aguardando_pagamento}
          subtitle={`pedido de ${formatDay(openOrder.createdAt)}`}
          title={openOrder.customerName}
        >
          <DetailsSections
            billing={openOrder.billing}
            customerCompany={openOrder.customerCompany}
            customerName={openOrder.customerName}
            customerPhone={openOrder.customerPhone}
            items={openOrder.items}
            notes={openOrder.notes}
            paymentLabel={PAYMENT_LABELS[openOrder.paymentMethod]}
            total={openOrder.total}
          />
        </DetailsDialog>
      ) : null}
    </div>
  );
}
