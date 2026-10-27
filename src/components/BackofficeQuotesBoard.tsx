"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseQuoteDialog, type QuoteToClose } from "@/components/staff/CloseQuoteDialog";
import { Camera, RefreshCw, ShoppingCart, TriangleAlert } from "lucide-react";
import {
  formatDay,
  itemsSummary,
  matchesSearch,
  KanbanBoard,
  KanbanCard,
  KanbanCardBody,
  KanbanColumn,
  messageFor,
} from "@/components/backofficeShared";
import { movePath } from "@/lib/backoffice/boardMoves";
import { type BackofficeOrder } from "@/components/BackofficeBoard";
import type { BackofficeQuoteSummary } from "@/lib/backoffice/quotesAccess";
import { canTransitionQuote, QUOTE_BOARD_COLUMNS, QUOTE_STATUS_LABELS } from "@/lib/quotes/quoteCode";

type Column = (typeof QUOTE_BOARD_COLUMNS)[number];

const COLUMN_COLORS: Record<Column, { dot: string; bg: string; fg: string }> = {
  aguardando_orcamento: { dot: "#d4532a", bg: "#f8e7df", fg: "#8f3416" },
  em_negociacao: { dot: "#2c3561", bg: "#e9ebf3", fg: "#1d2447" },
  aguardando_pagamento: { dot: "#b7791f", bg: "#fbf0dc", fg: "#7a4f0d" },
};

const isColumn = (status: string): status is Column => (QUOTE_BOARD_COLUMNS as readonly string[]).includes(status);
/** Pedido feito no site (esperando pagamento) mora na última coluna e não se arrasta. */
const ORDER_PREFIX = "pedido:";



/**
 * Quadro de orçamentos: Aguardando orçamento | Em negociação | Aguardando pagamento.
 * Pedidos feitos direto no site (sem orçamento) também entram em "Aguardando pagamento".
 * Pagamento recebido → vira pedido em "Aguardando arte" (aba Pedidos) e sai daqui.
 */
export function QuotesBoard({ freshQuoteId, onFreshShown, search = "" }: { canCancel?: boolean; freshQuoteId?: string; onFreshShown?: () => void; search?: string }) {
  const [quotes, setQuotes] = useState<BackofficeQuoteSummary[]>([]);
  const [orders, setOrders] = useState<BackofficeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Cartões salvando agora (cada um com a sua trava). */
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const busyRef = useRef<Set<string>>(new Set());
  const setBusy = (id: string, on: boolean) => {
    if (on) busyRef.current.add(id);
    else busyRef.current.delete(id);
    setBusyIds(new Set(busyRef.current));
  };
  const router = useRouter();
  const [closingQuote, setClosingQuote] = useState<QuoteToClose | null>(null);
  /** Orçamento que acabou de ser criado no editor (?novo=<id>): aparece em destaque por alguns segundos. */
  const [freshId, setFreshId] = useState<string | null>(freshQuoteId ?? null);

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

  const freshLoaded = Boolean(freshId && (quotes.some((quote) => quote.id === freshId) || orders.some((order) => order.id === freshId)));
  useEffect(() => {
    if (!freshLoaded) return;
    onFreshShown?.();
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    document.querySelector(".kb-card.is-new")?.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
    const timer = window.setTimeout(() => setFreshId(null), 3200);
    return () => window.clearTimeout(timer);
  }, [freshLoaded, onFreshShown]);

  async function send(id: string, url: string, statuses: string[]) {
    if (busyRef.current.has(id)) return;
    setBusy(id, true);
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
    setBusy(id, false);
  }

  /** Até uma coluna do quadro (arrastar ou "Etapa"): passa por cada etapa no caminho. */
  function moveQuote(quote: BackofficeQuoteSummary & { status: Column }, column: Column) {
    const path = movePath(QUOTE_BOARD_COLUMNS, quote.status, column, canTransitionQuote);
    if (path === null) return setError("Essa transição de status não é permitida.");
    if (!path.length || busyRef.current.has(quote.id)) return;
    setQuotes((list) => list.map((entry) => (entry.id === quote.id ? { ...entry, status: column } : entry)));
    void send(quote.id, `/api/backoffice/quotes/${quote.id}`, path);
  }

  const boardQuotes = quotes.filter((quote): quote is BackofficeQuoteSummary & { status: Column } =>
    (QUOTE_BOARD_COLUMNS as readonly string[]).includes(quote.status) && matchesSearch(quote, search),
  );
  const siteOrders = orders.filter((order) => order.status === "aguardando_pagamento" && matchesSearch(order, search));
  const quoteCard = (quote: BackofficeQuoteSummary) => ({
    code: quote.code,
    summary: itemsSummary(quote.items),
    tag: <span className="kb-origin">{quote.createdBy ? `Feito por ${quote.createdBy}` : "Site"}</span>,
    title: quote.customerCompany || quote.customerName,
    total: quote.total,
    meta: quote.proposalSentAt ? `Proposta enviada ${formatDay(quote.proposalSentAt)}` : `Criado ${formatDay(quote.createdAt)}`,
  });
  const orderCard = (order: BackofficeOrder) => ({
    code: order.code,
    summary: itemsSummary(order.items),
    badge: order.photos
      ? <span className="kb-tag kb-tag-photos"><Camera aria-hidden="true" size={12} /> Fotos do site</span>
      : <span className="kb-tag"><ShoppingCart aria-hidden="true" size={12} /> {order.finance ? `Pedido · ${order.finance.createdBy}` : "Pedido do site"}</span>,
    title: order.customerCompany || order.customerName,
    total: order.total,
    meta: `Pedido ${formatDay(order.createdAt)}`,
    finance: order.finance,
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
                  <KanbanCard {...quoteCard(quote)} busy={busyIds.has(quote.id)} fresh={quote.id === freshId} id={quote.id} key={quote.id} onDetails={() => router.push(`/equipe/orcamentos/${quote.id}/consulta`)} action={quote.status === "aguardando_pagamento" ? <button className="kb-close-quote" type="button" disabled={busyIds.has(quote.id)} onClick={() => setClosingQuote(quote)}>Fechar Orçamento</button> : null} />
                ))}
                {columnOrders.map((order) => (
                  <KanbanCard {...orderCard(order)} busy id={`${ORDER_PREFIX}${order.id}`} key={order.id} fresh={order.id === freshId} onDetails={() => router.push(`/equipe/pedidos/${order.id}`)} action={order.finance ? null : <button className="kb-close-quote" type="button" onClick={() => setClosingQuote({ id: order.id, code: order.code, customerName: order.customerName, total: order.total, updatedAt: order.updatedAt, kind: "order" })}>Fechar Pedido</button>} />
                ))}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      )}

      {closingQuote ? <CloseQuoteDialog quote={closingQuote} onClose={() => setClosingQuote(null)} onClosed={order => router.push(`/equipe?aba=${order.status === 'aguardando_pagamento' ? 'orcamentos' : 'pedidos'}&novo=${order.id}`)} /> : null}
    </div>
  );
}
