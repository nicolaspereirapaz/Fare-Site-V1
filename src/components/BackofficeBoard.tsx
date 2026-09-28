"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  LayoutGrid,
  Phone,
  RefreshCw,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { ORDEM_STATUS_PEDIDO, podeTransicionarStatusPedido, type StatusPedido } from "@/lib/backoffice/orderStatus";
import type { PaymentMethod } from "@/lib/orders/repository";

export type BackofficeOrder = {
  id: string;
  status: StatusPedido;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  customerCompany: string | null;
  itemCount: number;
  total: number;
  createdAt: string;
};

type OrdersResponse = {
  orders: BackofficeOrder[];
  counts: Partial<Record<StatusPedido, number>>;
};

const STATUS_LABELS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pagamento_confirmado: "Pagamento confirmado",
  aguardando_personalizacao: "Aguardando personalização",
  personalizacao_em_aprovacao: "Personalização em aprovação",
  personalizacao_aprovada: "Personalização aprovada",
  em_producao: "Em produção",
  pronto_para_envio: "Pronto para envio",
  em_transporte_ou_retirada: "Em transporte ou retirada",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  boleto: "Boleto",
  faturamento_empresa: "Faturamento para empresa",
};

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "É necessário estar autenticado para acessar o backoffice.",
  FORBIDDEN: "Você não tem permissão para executar esta ação.",
  ORDER_NOT_FOUND: "Pedido não encontrado.",
  INVALID_REQUEST: "Não foi possível entender a requisição.",
  INVALID_TRANSITION: "Essa transição de status não é permitida.",
};

function messageFor(code: unknown): string {
  if (typeof code === "string" && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (typeof code === "string" && code) return code;
  return "Não foi possível concluir a operação.";
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export type BackofficeBoardProps = {
  canCancel: boolean;
};

export function BackofficeBoard({ canCancel }: BackofficeBoardProps) {
  const [orders, setOrders] = useState<BackofficeOrder[]>([]);
  const [counts, setCounts] = useState<Partial<Record<StatusPedido, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadOrders() {
    try {
      const response = await fetch("/api/backoffice/orders", { cache: "no-store" });
      const payload = (await response.json()) as OrdersResponse & { error?: string };
      if (!response.ok) throw new Error(messageFor(payload.error));
      setOrders(payload.orders);
      setCounts(payload.counts);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/backoffice/orders", { cache: "no-store" });
        const payload = (await response.json()) as OrdersResponse & { error?: string };
        if (!active) return;
        if (!response.ok) throw new Error(messageFor(payload.error));
        setOrders(payload.orders);
        setCounts(payload.counts);
        setError(null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Erro inesperado.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleTransition(orderId: string, nextStatus: StatusPedido) {
    setUpdatingId(orderId);
    let transitionError: string | null = null;
    try {
      const response = await fetch(`/api/backoffice/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(messageFor(payload.error));
    } catch (caughtError) {
      transitionError = caughtError instanceof Error ? caughtError.message : "Erro inesperado.";
    }

    await loadOrders();
    setUpdatingId(null);
    if (transitionError) setError(transitionError);
  }

  return (
    <div className="backoffice-page container-shell">
      <header className="backoffice-heading">
        <span className="eyebrow">
          <LayoutGrid aria-hidden="true" size={16} />
          Backoffice
        </span>
        <h1>Quadro de pedidos</h1>
        <p>Acompanhe e avance o status dos pedidos em produção.</p>
      </header>

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
        <div className="backoffice-board">
          {ORDEM_STATUS_PEDIDO.map((status) => {
            const columnOrders = orders.filter((order) => order.status === status);

            return (
              <section aria-labelledby={`backoffice-column-${status}`} className="backoffice-column" key={status}>
                <div className="backoffice-column-header">
                  <h2 id={`backoffice-column-${status}`}>{STATUS_LABELS[status]}</h2>
                  <span className="backoffice-column-count">{counts[status] ?? columnOrders.length}</span>
                </div>

                <div className="backoffice-column-cards">
                  {columnOrders.length === 0 ? (
                    <p className="backoffice-column-empty">Nenhum pedido nesta etapa.</p>
                  ) : (
                    columnOrders.map((order) => {
                      const nextStatuses = ORDEM_STATUS_PEDIDO.filter(
                        (candidate) =>
                          podeTransicionarStatusPedido(order.status, candidate) &&
                          (canCancel || candidate !== "cancelado"),
                      );

                      return (
                        <article className="backoffice-card" key={order.id}>
                          <strong className="backoffice-card-customer">{order.customerName}</strong>
                          <ul className="backoffice-card-meta">
                            <li>
                              <Phone aria-hidden="true" size={14} />
                              {order.customerPhone}
                            </li>
                            {order.customerCompany ? (
                              <li>
                                <Building2 aria-hidden="true" size={14} />
                                {order.customerCompany}
                              </li>
                            ) : null}
                            <li>
                              <Wallet aria-hidden="true" size={14} />
                              {PAYMENT_LABELS[order.paymentMethod]}
                            </li>
                            <li>
                              <CalendarDays aria-hidden="true" size={14} />
                              {formatDate(order.createdAt)}
                            </li>
                          </ul>
                          <div className="backoffice-card-footer">
                            <span>
                              {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
                            </span>
                            <strong>{formatCurrency(order.total)}</strong>
                          </div>
                          {nextStatuses.length ? (
                            <div className="backoffice-card-actions">
                              {nextStatuses.map((nextStatus) => (
                                <button
                                  className="backoffice-transition-button"
                                  disabled={updatingId === order.id}
                                  key={nextStatus}
                                  onClick={() => handleTransition(order.id, nextStatus)}
                                  type="button"
                                >
                                  {STATUS_LABELS[nextStatus]}
                                  <ArrowRight aria-hidden="true" size={14} />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
