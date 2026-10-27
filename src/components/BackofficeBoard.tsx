"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import "@/components/staff/quoteEditor.css";
import "@/components/staff/staffDocument.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, FileText, LayoutGrid, Plus, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { COLUNAS_QUADRO_PEDIDOS, ORDER_STAFF_LABELS, podeTransicionarStatusPedido, type StatusPedido } from "@/lib/backoffice/orderStatus";
import type { OrderHistoryEntry } from "@/lib/backoffice/access";
import type { QuoteBilling } from "@/lib/commerce";
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
import { horasNoQuadro, visivelNoQuadroDePedidos } from "@/lib/backoffice/finishedOrders";
import type { PaymentMethod } from "@/lib/orders/repository";
import { QuotesBoard } from "@/components/BackofficeQuotesBoard";
import "@/components/staff/fotos/kanbanFotos.css";
import type { OrderFinance } from "@/lib/orders/payments";

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
  /** Pedido de fotos do site: os arquivos estão na pasta "Pedidos". */
  photos?: boolean;
  total: number;
  discount?: { label: string; amount: number } | null;
  createdAt: string;
  updatedAt: string;
  history?: OrderHistoryEntry[];
  finance?: OrderFinance | null;
};

/** Nomes das situações no painel interno. */
export const STATUS_LABELS = ORDER_STAFF_LABELS;

/** Cor de cada etapa (bolinha da coluna e etiqueta nos detalhes). */
export const STATUS_COLORS: Record<StatusPedido, { dot: string; bg: string; fg: string }> = {
  aguardando_pagamento: { dot: "#b7791f", bg: "#fbf0dc", fg: "#7a4f0d" },
  aguardando_arte: { dot: "#eaa385", bg: "#fbefe9", fg: "#8f3416" },
  criando_arte: { dot: "#d4532a", bg: "#f8e7df", fg: "#8f3416" },
  aguardando_producao: { dot: "#8b93c4", bg: "#eff0f7", fg: "#1d2447" },
  em_producao: { dot: "#2c3561", bg: "#e9ebf3", fg: "#1d2447" },
  aguardando_retirada: { dot: "#b7791f", bg: "#fbf0dc", fg: "#7a4f0d" },
  aguardando_feedback: { dot: "#167b55", bg: "#e3f3ea", fg: "#0f5a3e" },
  concluido: { dot: "#8e9196", bg: "#eeeff1", fg: "#3f4248" },
  cancelado: { dot: "#a12a2a", bg: "#fdecec", fg: "#a12a2a" },
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
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

/** Quadro de pedidos: Aguardando arte | … | Aguardando feedback | Finalizado (fica 24 h e some). */
function OrdersBoard({ freshOrderId, onFreshShown, search = "" }: { freshOrderId?: string; onFreshShown: () => void; search?: string }) {
  const router = useRouter();
  const [freshId, setFreshId] = useState(freshOrderId);
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
  /** Relógio do quadro: a cada minuto recalcula o que sai da coluna Finalizado. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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

  const freshLoaded = Boolean(freshId && orders.some(order => order.id === freshId));
  useEffect(() => {
    if (!freshLoaded) return;
    onFreshShown();
    const url = new URL(window.location.href); url.searchParams.delete('novo');
    window.history.replaceState(null, '', url.pathname + url.search);
    document.querySelector('.kb-card.is-new')?.scrollIntoView?.({behavior:'smooth',block:'center',inline:'center'});
    const timer = window.setTimeout(() => setFreshId(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [freshLoaded, onFreshShown]);

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


  /** Até uma coluna do quadro: passa por cada etapa no caminho. */
  function moveToColumn(order: BackofficeOrder, column: StatusPedido) {
    if (!isBoardColumn(order.status) || !isBoardColumn(column)) return;
    const path = movePath(COLUNAS_QUADRO_PEDIDOS, order.status, column, podeTransicionarStatusPedido);
    if (path === null) return setError("Essa transição de status não é permitida.");
    void moveThrough(order, path);
  }

  const cardProps = (order: BackofficeOrder) => ({
    code: order.code,
    summary: itemsSummary(order.items),
    title: order.customerCompany || order.customerName,
    total: order.total,
    finance: order.finance,
    badge: order.photos ? <span className="kb-tag kb-tag-photos">Fotos</span> : undefined,
    meta: order.status === "concluido"
      ? `Sai do quadro em ${horasNoQuadro(order.history, now)} h`
      : order.finance?.paymentOnPickup ? 'Pagamento na retirada'
      : `Pago em ${formatDay(order.history?.find((entry) => entry.from === "aguardando_pagamento" || entry.status === "aguardando_arte")?.at ?? order.createdAt)}`,
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
            const column = orders.filter((order) => order.status === status && visivelNoQuadroDePedidos(order, now) && matchesSearch(order, search));
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
                  <KanbanCard {...cardProps(order)} busy={busyIds.has(order.id)} id={order.id} key={order.id} fresh={order.id === freshId} onDetails={() => router.push(`/equipe/pedidos/${order.id}`)} />
                ))}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      )}
    </div>
  );
}

type BackofficeTab = "pedidos" | "orcamentos";

/** freshQuoteId: orçamento que acabou de ser criado no editor (?novo=<id>), destacado no quadro. */
export function BackofficeBoard({ canCancel, initialTab = "pedidos", freshQuoteId }: BackofficeBoardProps & { initialTab?: BackofficeTab; freshQuoteId?: string }) {
  const [tab, setTab] = useState<BackofficeTab>(initialTab);
  /** Destaque do orçamento recém-criado: usado uma vez (trocar de aba e voltar não repete a animação). */
  const [freshId, setFreshId] = useState(freshQuoteId);
  const [search, setSearch] = useState("");
  const clearFresh = useCallback(() => setFreshId(undefined), []);
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
        <div className="kb-new-actions">
        <label className="kb-search">
          <Search aria-hidden="true" size={16} />
          <input aria-label="Pesquisar no quadro" onChange={(event) => setSearch(event.target.value)} placeholder="Nome, número ou produto" type="search" value={search} />
        </label>
        {tab === "pedidos" ? <Link className="kb-new-quote" href="/equipe/pedidos/novo"><Plus aria-hidden="true" size={16} /> Novo pedido</Link> : null}
        {tab === "orcamentos" ? (
          <Link className="kb-new-quote" href="/equipe/orcamentos/novo">
            <Plus aria-hidden="true" size={16} /> Novo orçamento
          </Link>
        ) : null}
        </div>
      </div>

      {tab === "pedidos" ? <OrdersBoard freshOrderId={freshId} onFreshShown={clearFresh} search={search} /> : <QuotesBoard canCancel={canCancel} freshQuoteId={freshId} onFreshShown={clearFresh} search={search} />}
    </div>
  );
}
