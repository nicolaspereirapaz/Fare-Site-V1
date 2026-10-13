"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, PencilLine, RefreshCw, ShoppingCart, TriangleAlert, XCircle } from "lucide-react";
import {
  DetailsDialog,
  DetailsSections,
  FinalAction,
  formatDay,
  itemsSummary,
  KanbanBoard,
  KanbanCard,
  KanbanCardBody,
  KanbanColumn,
  messageFor,
  StageSelect,
  whatsAppReplyUrl,
} from "@/components/backofficeShared";
import { movePath, reachableColumns } from "@/lib/backoffice/boardMoves";
import { PAYMENT_LABELS, type BackofficeOrder } from "@/components/BackofficeBoard";
import type { BackofficeQuoteSummary } from "@/lib/backoffice/quotesAccess";
import { ProposalActions } from "@/components/staff/ProposalActions";
import { canTransitionQuote, NO_CUSTOMER_NAME, QUOTE_BOARD_COLUMNS, QUOTE_STATUS_LABELS, type QuoteStatus } from "@/lib/quotes/quoteCode";

type Column = (typeof QUOTE_BOARD_COLUMNS)[number];

const COLUMN_COLORS: Record<Column, { dot: string; bg: string; fg: string }> = {
  aguardando_orcamento: { dot: "#d4532a", bg: "#f8e7df", fg: "#8f3416" },
  em_negociacao: { dot: "#2c3561", bg: "#e9ebf3", fg: "#1d2447" },
  aguardando_pagamento: { dot: "#b7791f", bg: "#fbf0dc", fg: "#7a4f0d" },
};

const isColumn = (status: string): status is Column => (QUOTE_BOARD_COLUMNS as readonly string[]).includes(status);
/** Pedido feito no site (esperando pagamento) mora na última coluna e não se arrasta. */
const ORDER_PREFIX = "pedido:";

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

  async function send(id: string, url: string, statuses: string[]) {
    setUpdatingId(id);
    let changeError: string | null = null;
    try {
      for (const status of statuses) {
        const response = await fetch(url, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(messageFor(payload.error));
      }
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
    void send(quote.id, `/api/backoffice/quotes/${quote.id}`, [next]);
  }

  /** Até uma coluna do quadro (arrastar ou "Etapa"): passa por cada etapa no caminho. */
  function moveQuote(quote: BackofficeQuoteSummary & { status: Column }, column: Column) {
    const path = movePath(QUOTE_BOARD_COLUMNS, quote.status, column, canTransitionQuote);
    if (path === null) return setError("Essa transição de status não é permitida.");
    if (!path.length) return;
    setQuotes((list) => list.map((entry) => (entry.id === quote.id ? { ...entry, status: column } : entry)));
    void send(quote.id, `/api/backoffice/quotes/${quote.id}`, path);
  }

  function changeOrder(order: BackofficeOrder, next: "aguardando_arte" | "cancelado") {
    if (next === "cancelado" && !window.confirm(`Cancelar o pedido #${order.code} de ${order.customerName}? Isso não pode ser desfeito.`)) return;
    void send(order.id, `/api/backoffice/orders/${order.id}`, [next]);
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
  const quoteCard = (quote: BackofficeQuoteSummary) => ({
    code: quote.code,
    summary: itemsSummary(quote.items),
    tag: <span className="kb-origin">{quote.createdBy ? `Feito por ${quote.createdBy}` : "Site"}</span>,
    title: quote.customerCompany || quote.customerName,
    total: quote.total,
    warning: quote.billing || quote.createdBy || quote.customerName === NO_CUSTOMER_NAME ? null : "Sem dados de faturamento",
    meta: quote.proposalSentAt ? `Proposta enviada ${formatDay(quote.proposalSentAt)}` : `Criado ${formatDay(quote.createdAt)}`,
  });
  const orderCard = (order: BackofficeOrder) => ({
    code: order.code,
    summary: itemsSummary(order.items),
    tag: <span className="kb-tag"><ShoppingCart aria-hidden="true" size={12} /> Pedido do site</span>,
    title: order.customerCompany || order.customerName,
    total: order.total,
    warning: order.billing ? null : "Sem dados de faturamento",
    meta: `Pedido ${formatDay(order.createdAt)}`,
  });

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
        <KanbanBoard
          canDrop={(cardId, column) => {
            const quote = boardQuotes.find((entry) => entry.id === cardId);
            return Boolean(quote && isColumn(column) && movePath(QUOTE_BOARD_COLUMNS, quote.status, column, canTransitionQuote) !== null);
          }}
          className="kb-board-3"
          onMove={(cardId, column) => {
            const quote = boardQuotes.find((entry) => entry.id === cardId);
            if (quote && isColumn(column)) moveQuote(quote, column);
          }}
          renderOverlay={(cardId) => {
            if (cardId.startsWith(ORDER_PREFIX)) {
              const order = siteOrders.find((entry) => `${ORDER_PREFIX}${entry.id}` === cardId);
              return order ? <KanbanCardBody {...orderCard(order)} /> : null;
            }
            const quote = boardQuotes.find((entry) => entry.id === cardId);
            return quote ? <KanbanCardBody {...quoteCard(quote)} /> : null;
          }}
        >
          {QUOTE_BOARD_COLUMNS.map((status) => {
            const columnQuotes = boardQuotes.filter((quote) => quote.status === status);
            const columnOrders = status === "aguardando_pagamento" ? siteOrders : [];
            return (
              <KanbanColumn
                color={COLUMN_COLORS[status].dot}
                count={columnQuotes.length + columnOrders.length}
                empty="Arraste um orçamento para cá."
                id={status}
                key={status}
                title={QUOTE_STATUS_LABELS[status]}
                total={[...columnQuotes, ...columnOrders].reduce((sum, entry) => sum + (entry.total ?? 0), 0)}
              >
                {columnQuotes.map((quote) => (
                  <KanbanCard {...quoteCard(quote)} busy={updatingId === quote.id} id={quote.id} key={quote.id} onDetails={() => setSelected({ kind: "quote", id: quote.id })} />
                ))}
                {columnOrders.map((order) => (
                  <KanbanCard {...orderCard(order)} busy id={`${ORDER_PREFIX}${order.id}`} key={order.id} onDetails={() => setSelected({ kind: "order", id: order.id })} />
                ))}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      )}

      {openQuote ? (
        <DetailsDialog
          code={openQuote.code}
          footer={
            <>
              <StageSelect
                busy={updatingId === openQuote.id}
                labels={QUOTE_STATUS_LABELS}
                onChange={(next) => isColumn(next) && moveQuote(openQuote, next)}
                options={reachableColumns(QUOTE_BOARD_COLUMNS, openQuote.status, canTransitionQuote)}
                value={openQuote.status}
              />
              {openQuote.status === "aguardando_pagamento" ? (
                <FinalAction busy={updatingId === openQuote.id} label="Pagamento recebido" onClick={() => changeQuote(openQuote, "virou_pedido")} />
              ) : null}
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
            discount={openQuote.discount}
          />
        </DetailsDialog>
      ) : null}

      {openOrder ? (
        <DetailsDialog
          code={openOrder.code}
          footer={
            <>
              <FinalAction busy={updatingId === openOrder.id} label="Pagamento recebido" onClick={() => changeOrder(openOrder, "aguardando_arte")} />
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
