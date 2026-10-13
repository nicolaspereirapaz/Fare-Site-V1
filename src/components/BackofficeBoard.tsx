"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, FileText, LayoutGrid, MessageCircle, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { COLUNAS_QUADRO_PEDIDOS, ORDEM_STATUS_PEDIDO, podeTransicionarStatusPedido, type StatusPedido } from "@/lib/backoffice/orderStatus";
import type { OrderHistoryEntry } from "@/lib/backoffice/access";
import type { QuoteBilling } from "@/lib/commerce";
import {
  DetailsDialog,
  DetailsSections,
  formatDate,
  formatDay,
  itemsSummary,
  KanbanCard,
  KanbanColumn,
  messageFor,
  StepButtons,
  whatsAppReplyUrl,
} from "@/components/backofficeShared";
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

/** Etapa seguinte e anterior de cada coluna do quadro de pedidos. */
const FORWARD: Partial<Record<StatusPedido, StatusPedido>> = {
  aguardando_arte: "criando_arte",
  criando_arte: "aguardando_producao",
  aguardando_producao: "em_producao",
  em_producao: "aguardando_retirada",
  aguardando_retirada: "aguardando_feedback",
  aguardando_feedback: "concluido",
};
const BACK: Partial<Record<StatusPedido, StatusPedido>> = {
  criando_arte: "aguardando_arte",
  aguardando_producao: "criando_arte",
  em_producao: "aguardando_producao",
  aguardando_retirada: "em_producao",
  aguardando_feedback: "aguardando_retirada",
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

function OrderSteps({ order, busy, onMove, large = false }: { order: BackofficeOrder; busy: boolean; onMove: (to: StatusPedido) => void; large?: boolean }) {
  const back = BACK[order.status];
  const next = FORWARD[order.status];
  return (
    <StepButtons
      back={back && podeTransicionarStatusPedido(order.status, back) ? { label: `Voltar para ${STATUS_LABELS[back]}`, onClick: () => onMove(back) } : null}
      busy={busy}
      large={large}
      next={
        next && podeTransicionarStatusPedido(order.status, next)
          ? next === "concluido"
            ? { label: "Concluir pedido", text: "Concluir", final: true, onClick: () => onMove(next) }
            : { label: `Avançar para ${STATUS_LABELS[next]}`, onClick: () => onMove(next) }
          : null
      }
    />
  );
}

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
  const [updatingId, setUpdatingId] = useState<string | null>(null);
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

  async function move(order: BackofficeOrder, nextStatus: StatusPedido) {
    if (nextStatus === "cancelado" && !window.confirm(`Cancelar o pedido #${order.code} de ${order.customerName}? Isso não pode ser desfeito.`)) {
      return;
    }
    setUpdatingId(order.id);
    let transitionError: string | null = null;
    try {
      const response = await fetch(`/api/backoffice/orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(messageFor(payload.error));
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
    setUpdatingId(null);
  }

  const closeDialog = useCallback(() => setOpenId(null), []);
  const open = orders.find((order) => order.id === openId) ?? null;

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
        <div className="kb-board kb-board-6">
          {COLUNAS_QUADRO_PEDIDOS.map((status) => {
            const column = orders.filter((order) => order.status === status);
            return (
              <KanbanColumn color={STATUS_COLORS[status].dot} count={column.length} empty="Nenhum pedido nesta etapa." key={status} title={STATUS_LABELS[status]}>
                {column.map((order) => (
                  <KanbanCard
                    action={<OrderSteps busy={updatingId === order.id} onMove={(to) => move(order, to)} order={order} />}
                    code={order.code}
                    key={order.id}
                    onDetails={() => setOpenId(order.id)}
                    summary={itemsSummary(order.items)}
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

      {open ? (
        <DetailsDialog
          code={open.code}
          footer={
            <>
              <OrderSteps busy={updatingId === open.id} large onMove={(to) => move(open, to)} order={open} />
              {open.customerPhone ? (
                <a className="kb-whatsapp" href={whatsAppReplyUrl(open.customerName, open.customerPhone, open.code, "pedido")} rel="noopener noreferrer" target="_blank">
                  <MessageCircle aria-hidden="true" size={15} /> WhatsApp
                </a>
              ) : null}
              {canCancel && podeTransicionarStatusPedido(open.status, "cancelado") ? (
                <button className="kb-danger" disabled={updatingId === open.id} onClick={() => move(open, "cancelado")} type="button">
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

export function BackofficeBoard({ canCancel, initialTab = "pedidos" }: BackofficeBoardProps & { initialTab?: BackofficeTab }) {
  const [tab, setTab] = useState<BackofficeTab>(initialTab);
  const tabs: Array<{ id: BackofficeTab; label: string; icon: typeof LayoutGrid }> = [
    { id: "pedidos", label: "Pedidos", icon: ClipboardList },
    { id: "orcamentos", label: "Orçamentos", icon: FileText },
  ];

  return (
    <div className="kb-page container-shell">
      <header className="kb-heading kb-heading-actions">
        <div>
        <h1>{tab === "pedidos" ? "Quadro de pedidos" : "Quadro de orçamentos"}</h1>
        <p>
          {tab === "pedidos"
            ? "Pedidos pagos, da arte à entrega. Ao concluir, o pedido sai do quadro."
            : "Orçamentos e pedidos esperando pagamento. Quando o pagamento entra, vira pedido em “Aguardando arte”."}
        </p>
        </div>
        {tab === "orcamentos" ? <Link className="kb-new-quote" href="/equipe/orcamentos/novo">Novo orçamento</Link> : null}
      </header>

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

      {tab === "pedidos" ? <OrdersBoard canCancel={canCancel} /> : <QuotesBoard canCancel={canCancel} />}
    </div>
  );
}
