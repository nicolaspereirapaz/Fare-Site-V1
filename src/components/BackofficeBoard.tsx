"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, FileText, LayoutGrid, MessageCircle, Plus, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { COLUNAS_QUADRO_PEDIDOS, ORDEM_STATUS_PEDIDO, podeTransicionarStatusPedido, type StatusPedido } from "@/lib/backoffice/orderStatus";
import type { OrderHistoryEntry } from "@/lib/backoffice/access";
import type { QuoteBilling } from "@/lib/commerce";
import {
  DetailsDialog,
  DetailsSections,
  FinalAction,
  formatDate,
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
import type { PaymentMethod } from "@/lib/orders/repository";
import { QuotesBoard } from "@/components/BackofficeQuotesBoard";

export type BackofficeOrder = {
  id: string;
  code: string;
  status: StatusPedido;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  customerCompany: string | null;
  notes: string | null;
  billing: QuoteBilling | null;
  items: Array<{ productName: string; quantity: number; selections: Record<string, string>; unitPrice: number | null }>;
  itemCount: number;
  total: number;
  discount?: { label: string; amount: number } | null;
  createdAt: string;
  history?: OrderHistoryEntry[];
};

/** Nomes das situações no painel interno. */
export const STATUS_LABELS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  aguardando_arte: "Aguardando arte",
  criando_arte: "Criando arte",
  aguardando_producao: "Aguardando produção",
  em_producao: "Em produção",
  aguardando_retirada: "Aguardando retirada",
  aguardando_feedback: "Aguardando feedback",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/** Cor de cada etapa (bolinha da coluna e etiqueta nos detalhes). */
export const STATUS_COLORS: Record<StatusPedido, { dot: string; bg: string; fg: string }> = {
  aguardando_pagamento: { dot: "#b7791f", bg: "#fbf0dc", fg: "#7a4f0d" },
  aguardando_arte: { dot: "#eaa385", bg: "#fbefe9", fg: "#8f3416" },
  criando_arte: { dot: "#d4532a", bg: "#f8e7df", fg: "#8f3416" },
  aguardando_producao: { dot: "#8b93c4", bg: "#eff0f7", fg: "#1d2447" },
  em_producao: { dot: "#2c3561", bg: "#e9ebf3", fg: "#1d2447" },
  aguardando_retirada: { dot: "#b7791f", bg: "#fbf0dc", fg: "#7a4f0d" },
  aguardando_feedback: { dot: "#167b55", bg: "#e3f3ea", fg: "#0f5a3e" },
  concluido: { dot: "#167b55", bg: "#e3f3ea", fg: "#0f5a3e" },
  cancelado: { dot: "#a12a2a", bg: "#fdecec", fg: "#a12a2a" },
};

const HISTORY_LABELS: Partial<Record<StatusPedido, string>> = {
  aguardando_arte: "Pagamento recebido",
  criando_arte: "Arte iniciada",
  aguardando_producao: "Arte pronta",
  em_producao: "Produção iniciada",
  aguardando_retirada: "Pronto para retirada",
  aguardando_feedback: "Entregue",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
  faturamento_empresa: "Faturamento para empresa",
};

export type BackofficeBoardProps = {
  canCancel: boolean;
};

type BoardColumn = (typeof COLUNAS_QUADRO_PEDIDOS)[number];
const isBoardColumn = (status: string): status is BoardColumn => (COLUNAS_QUADRO_PEDIDOS as readonly string[]).includes(status);

/** "Pagamento recebido", "Enviado para produção"… ou "Voltou para Criando arte". */
function historyLabel(entry: OrderHistoryEntry) {
  if (entry.from && ORDEM_STATUS_PEDIDO.indexOf(entry.status) < ORDEM_STATUS_PEDIDO.indexOf(entry.from)) {
    return `Voltou para ${STATUS_LABELS[entry.status]}`;
  }
  return HISTORY_LABELS[entry.status] ?? STATUS_LABELS[entry.status];
}

/** Quadro de pedidos: Aguardando arte | Criando arte | Aguardando produção | Em produção | Aguardando retirada | Aguardando feedback. */
function OrdersBoard({ canCancel }: BackofficeBoardProps) {
  const [orders, setOrders] = useState<BackofficeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Cartões salvando agora (cada um com a sua trava; vários podem andar ao mesmo tempo). */
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const busyRef = useRef<Set<string>>(new Set());
  const setBusy = (id: string, on: boolean) => {
    if (on) busyRef.current.add(id);
    else busyRef.current.delete(id);
    setBusyIds(new Set(busyRef.current));
  };
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    const response = await fetch("/api/backoffice/orders", { cache: "no-store" });
    const payload = (await response.json()) as { orders: BackofficeOrder[]; error?: string };
    if (!response.ok) throw new Error(messageFor(payload.error));
    return payload.orders;
  }, []);

  useEffect(() => {
    let active = true;
    fetchOrders()
      .then((list) => {
        if (!active) return;
        setOrders(list);
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
  }, [fetchOrders]);

  /** Grava as etapas em ordem (arrastar/pular colunas passa por cada uma). Mostra o cartão já no destino enquanto salva. */
  async function moveThrough(order: BackofficeOrder, steps: StatusPedido[]) {
    if (!steps.length) return;
    if (steps.includes("cancelado") && !window.confirm(`Cancelar o pedido #${order.code} de ${order.customerName}? Isso não pode ser desfeito.`)) {
      return;
    }
    const target = steps[steps.length - 1];
    if (busyRef.current.has(order.id)) return;
    setBusy(order.id, true);
    setOrders((list) => list.map((entry) => (entry.id === order.id ? { ...entry, status: target } : entry)));
    let transitionError: string | null = null;
    try {
      for (const step of steps) {
        const response = await fetch(`/api/backoffice/orders/${order.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: step }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(messageFor(payload.error));
      }
      setOpenId(null);
    } catch (caughtError) {
      transitionError = caughtError instanceof Error ? caughtError.message : "Erro inesperado.";
    }
    try {
      setOrders(await fetchOrders());
      setError(transitionError);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro inesperado.");
    }
    setBusy(order.id, false);
  }

  const move = (order: BackofficeOrder, next: StatusPedido) => moveThrough(order, [next]);
  /** Até uma coluna do quadro: passa por cada etapa no caminho. */
  function moveToColumn(order: BackofficeOrder, column: StatusPedido) {
    if (!isBoardColumn(order.status) || !isBoardColumn(column)) return;
    const path = movePath(COLUNAS_QUADRO_PEDIDOS, order.status, column, podeTransicionarStatusPedido);
    if (path === null) return setError("Essa transição de status não é permitida.");
    void moveThrough(order, path);
  }

  const closeDialog = useCallback(() => setOpenId(null), []);
  const open = orders.find((order) => order.id === openId) ?? null;
  const cardProps = (order: BackofficeOrder) => ({
    code: order.code,
    summary: itemsSummary(order.items),
    title: order.customerCompany || order.customerName,
    total: order.total,
    warning: order.billing ? null : "Sem dados de faturamento",
    meta: `Pago em ${formatDay(order.history?.find((entry) => entry.status === "aguardando_arte")?.at ?? order.createdAt)}`,
  });

  return (
    <div id="backoffice-panel-pedidos" role="tabpanel" aria-labelledby="backoffice-tab-pedidos">
      {error ? (
        <div className="backoffice-error" role="alert">
          <TriangleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && !orders.length ? (
        <div className="backoffice-loading">
          <RefreshCw aria-hidden="true" size={22} />
          <p>Carregando quadro…</p>
        </div>
      ) : (
        <KanbanBoard
          canDrop={(cardId, column) => {
            const order = orders.find((entry) => entry.id === cardId);
            return Boolean(order && isBoardColumn(order.status) && isBoardColumn(column) && movePath(COLUNAS_QUADRO_PEDIDOS, order.status, column, podeTransicionarStatusPedido) !== null);
          }}
          className="kb-board-6"
          onMove={(cardId, column) => {
            const order = orders.find((entry) => entry.id === cardId);
            if (order) moveToColumn(order, column as StatusPedido);
          }}
          renderOverlay={(cardId) => {
            const order = orders.find((entry) => entry.id === cardId);
            return order ? <KanbanCardBody {...cardProps(order)} /> : null;
          }}
        >
          {COLUNAS_QUADRO_PEDIDOS.map((status) => {
            const column = orders.filter((order) => order.status === status);
            return (
              <KanbanColumn
                color={STATUS_COLORS[status].dot}
                count={column.length}
                empty="Arraste um pedido para cá."
                id={status}
                key={status}
                title={STATUS_LABELS[status]}
                total={column.reduce((sum, order) => sum + order.total, 0)}
              >
                {column.map((order) => (
                  <KanbanCard {...cardProps(order)} busy={busyIds.has(order.id)} id={order.id} key={order.id} onDetails={() => setOpenId(order.id)} />
                ))}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      )}

      {open ? (
        <DetailsDialog
          code={open.code}
          footer={
            <>
              {isBoardColumn(open.status) ? (
                <StageSelect
                  busy={busyIds.has(open.id)}
                  labels={STATUS_LABELS}
                  onChange={(next) => moveToColumn(open, next)}
                  options={reachableColumns(COLUNAS_QUADRO_PEDIDOS, open.status, podeTransicionarStatusPedido)}
                  value={open.status}
                />
              ) : null}
              {podeTransicionarStatusPedido(open.status, "concluido") ? (
                <FinalAction busy={busyIds.has(open.id)} label="Concluir pedido" onClick={() => move(open, "concluido")} />
              ) : null}
              {open.customerPhone ? (
                <a className="kb-whatsapp" href={whatsAppReplyUrl(open.customerName, open.customerPhone, open.code, "pedido")} rel="noopener noreferrer" target="_blank">
                  <MessageCircle aria-hidden="true" size={15} /> WhatsApp
                </a>
              ) : null}
              {canCancel && podeTransicionarStatusPedido(open.status, "cancelado") ? (
                <button className="kb-danger" disabled={busyIds.has(open.id)} onClick={() => move(open, "cancelado")} type="button">
                  <XCircle aria-hidden="true" size={15} /> Cancelar pedido
                </button>
              ) : null}
            </>
          }
          onClose={closeDialog}
          status={STATUS_LABELS[open.status]}
          statusColor={STATUS_COLORS[open.status]}
          subtitle={`pedido de ${formatDay(open.createdAt)}`}
          title={open.customerName}
        >
          <DetailsSections
            billing={open.billing}
            customerCompany={open.customerCompany}
            customerName={open.customerName}
            customerPhone={open.customerPhone}
            items={open.items}
            notes={open.notes}
            paymentLabel={PAYMENT_LABELS[open.paymentMethod]}
            total={open.total}
            discount={open.discount}
          />
          <section>
            <h3>Histórico</h3>
            <ul className="kb-history">
              {[...(open.history ?? [])].reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <strong>{historyLabel(entry)}</strong>
                  <span>{formatDate(entry.at)} · {entry.by}</span>
                </li>
              ))}
              <li>
                <strong>Pedido criado</strong>
                <span>{formatDate(open.createdAt)} · pelo site</span>
              </li>
            </ul>
          </section>
        </DetailsDialog>
      ) : null}
    </div>
  );
}

type BackofficeTab = "pedidos" | "orcamentos";

/** freshQuoteId: orçamento que acabou de ser criado no editor (?novo=<id>), destacado no quadro. */
export function BackofficeBoard({ canCancel, initialTab = "pedidos", freshQuoteId }: BackofficeBoardProps & { initialTab?: BackofficeTab; freshQuoteId?: string }) {
  const [tab, setTab] = useState<BackofficeTab>(initialTab);
  const tabs: Array<{ id: BackofficeTab; label: string; icon: typeof LayoutGrid }> = [
    { id: "pedidos", label: "Pedidos", icon: ClipboardList },
    { id: "orcamentos", label: "Orçamentos", icon: FileText },
  ];

  return (
    <div className="kb-page container-shell">
      <header className="kb-heading">
        <h1>{tab === "pedidos" ? "Quadro de pedidos" : "Quadro de orçamentos"}</h1>
        <p>
          {tab === "pedidos"
            ? "Acompanhe cada pedido pago da criação da arte até a entrega."
            : "Acompanhe cada negociação até o pagamento. Pago, o orçamento segue para Pedidos."}
        </p>
      </header>

      <div className={`kb-toolbar ${tab === "pedidos" ? "kb-toolbar-6" : "kb-toolbar-3"}`}>
      <div aria-label="Seções do painel" className="kb-tabs" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            aria-controls={`backoffice-panel-${id}`}
            aria-selected={tab === id}
            className={tab === id ? "active" : undefined}
            id={`backoffice-tab-${id}`}
            key={id}
            onClick={() => {
              setTab(id);
              window.history.replaceState(null, "", id === "orcamentos" ? "/equipe?aba=orcamentos" : "/equipe");
            }}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" size={16} />
            {label}
          </button>
        ))}
      </div>
        {tab === "orcamentos" ? (
          <Link className="kb-new-quote" href="/equipe/orcamentos/novo">
            <Plus aria-hidden="true" size={16} /> Novo orçamento
          </Link>
        ) : null}
      </div>

      {tab === "pedidos" ? <OrdersBoard canCancel={canCancel} /> : <QuotesBoard canCancel={canCancel} freshQuoteId={freshQuoteId} />}
    </div>
  );
}
