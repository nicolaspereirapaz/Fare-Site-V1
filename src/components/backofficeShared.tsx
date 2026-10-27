"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CheckCircle2, X } from "lucide-react";
import { formatBillingAddress, type QuoteBilling } from "@/lib/commerce";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { photoFromName } from "@/components/staff/photoItems";
import type { OrderFinance } from "@/lib/orders/payments";
import { deliveryLabel } from "@/components/staff/paymentFieldsShared";

/** Partes comuns aos quadros de pedidos e de orçamentos do painel. */
export type BackofficeItem = {
  productName: string;
  quantity: number;
  selections: Record<string, string>;
  unitPrice: number | null;
  codes?: { fare: string; supplier: "xbz" | "spot" | "asia"; supplierCode: string; sku: string } | null;
  costing?: { personalizacao: string | null; custoProduto: number; personalizacaoUnitaria: number } | null;
};

const SUPPLIER_NAMES = { xbz: "XBZ", spot: "Spot", asia: "Asia Import" } as const;

/** "X10001 · XBZ 06520 · SKU 06520-AZU" — só no painel da equipe. */
export function itemCodeLine(item: BackofficeItem) {
  const codes = item.codes;
  if (!codes) return "";
  return [codes.fare, `${SUPPLIER_NAMES[codes.supplier]} ${codes.supplierCode}`, codes.sku ? `SKU ${codes.sku}` : ""]
    .filter((part) => part.trim())
    .join(" · ");
}

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: "É necessário estar autenticado para acessar o backoffice.",
  FORBIDDEN: "Você não tem permissão para executar esta ação.",
  ORDER_NOT_FOUND: "Pedido não encontrado.",
  INVALID_REQUEST: "Não foi possível entender a requisição.",
  INVALID_TRANSITION: "Essa transição de status não é permitida.",
  QUOTE_NOT_FOUND: "Orçamento não encontrado.",
};

export function messageFor(code: unknown): string {
  if (typeof code === "string" && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (typeof code === "string" && code) return code;
  return "Não foi possível concluir a operação.";
}

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export const formatDay = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(value));

export function billingDocument(billing: QuoteBilling) {
  return billing.personType === "pj" ? `CNPJ ${billing.document}` : `CPF ${billing.document}`;
}

/** "100 × Caneta Plástica · Azul" */
export function itemLine(item: BackofficeItem) {
  const variation = Object.values(item.selections).filter(Boolean).join(" · ");
  return `${item.quantity} × ${item.productName}${variation ? ` · ${variation}` : ""}`;
}

/** Resumo do cartão: 1º item + quantos itens a mais. */
export function itemsSummary(items: BackofficeItem[]) {
  if (!items.length) return "Sem itens";
  const extra = items.length - 1;
  return `${itemLine(items[0])}${extra > 0 ? ` + ${extra} ${extra === 1 ? "item" : "itens"}` : ""}`;
}

/** Link para responder o cliente no WhatsApp, já citando o número. */
export function whatsAppReplyUrl(name: string, phone: string, code: string, what: "pedido" | "orçamento") {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return buildWhatsAppUrl(full, `Olá, ${name.split(" ")[0]}! Aqui é da Fare Foto, sobre o seu ${what} #${code}.`);
}

/** Quadro com arrastar e soltar (estilo Trello). `onMove(cardId, columnId)` decide o que fazer; o cartão arrastado aparece "flutuando". */
export function KanbanBoard({
  className,
  onMove,
  canDrop,
  renderOverlay,
  children,
}: {
  className: string;
  onMove: (cardId: string, columnId: string) => void;
  /** Coluna aceita este cartão? (as que não aceitam ficam apagadas durante o arraste) */
  canDrop: (cardId: string, columnId: string) => boolean;
  renderOverlay: (cardId: string) => ReactNode;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  // Arrastar só depois de mover 6px: um clique simples continua abrindo o detalhe.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  return (
    <BoardDragContext.Provider value={{ dragging, canDrop }}>
      <DndContext
        collisionDetection={collision}
        onDragCancel={() => setDragging(null)}
        onDragEnd={(event: DragEndEvent) => {
          setDragging(null);
          if (event.over) onMove(String(event.active.id), String(event.over.id));
        }}
        onDragStart={(event: DragStartEvent) => setDragging(String(event.active.id))}
        sensors={sensors}
      >
        <div className={`kb-board ${className}${dragging ? " is-dragging" : ""}`}>{children}</div>
        <DragOverlay dropAnimation={{ duration: 160, easing: "ease-out" }}>{dragging ? <div className="kb-card-ghost">{renderOverlay(dragging)}</div> : null}</DragOverlay>
      </DndContext>
    </BoardDragContext.Provider>
  );
}

// Coluna sob o ponteiro (no teclado, os cantos mais próximos). Só com cantos, a coluna alta perdia o cartão para a vizinha.
const collision: CollisionDetection = (args) => { const hits = pointerWithin(args); return hits.length ? hits : closestCorners(args); };

const BoardDragContext = createContext<{ dragging: string | null; canDrop: (cardId: string, columnId: string) => boolean }>({ dragging: null, canDrop: () => true });

/** Coluna do quadro: borda delimitando a etapa, bolinha colorida e contador; recebe cartões arrastados. */
export function KanbanColumn({ id, title, color, count, empty, total, children }: { id: string; title: string; color: string; count: number; empty: string; total?: number; children: ReactNode }) {
  const headingId = useId();
  const { dragging, canDrop } = useContext(BoardDragContext);
  const { setNodeRef, isOver } = useDroppable({ id });
  const allowed = dragging ? canDrop(dragging, id) : true;
  const state = dragging ? (allowed ? (isOver ? " is-over" : " can-drop") : " no-drop") : "";
  return (
    <section aria-labelledby={headingId} className={`kb-column${state}`} ref={setNodeRef}>
      <header className="kb-column-header">
        <span aria-hidden="true" className="kb-dot" style={{ background: color }} />
        <h2 id={headingId}>{title}</h2>
        <span className="kb-count">{count}</span>
      </header>
      {total !== undefined ? <p className="kb-column-total">{formatCurrency(total)}</p> : null}
      <div className="kb-column-body">{count === 0 ? <p className="kb-empty">{empty}</p> : children}</div>
    </section>
  );
}

type CardProps = {
  code: string;
  total: number | null;
  title: string;
  summary: string;
  tag?: ReactNode;
  /** Etiqueta de origem no topo do cartão (Fotos do site, Pedido do site). */
  badge?: ReactNode;
  /** Rodapé discreto: data, quem fez, proposta enviada… */
  meta?: string;
  finance?: OrderFinance | null;
};

/** Conteúdo do cartão (usado no quadro e no cartão "flutuando" durante o arraste). */
export function KanbanCardBody({ code, total, title, summary, tag, badge, meta, finance }: CardProps) {
  return (
    <>
      {badge ? <div className="kb-card-tag">{badge}</div> : null}
      <div className="kb-card-row">
        <span className="kb-code">#{code}</span>
        <span className="kb-value">{total === null ? "Sob consulta" : formatCurrency(total)}</span>
      </div>
      <strong className="kb-title">{title}</strong>
      <span className="kb-summary">{summary}</span>
      {finance && finance.balanceCents > 0 ? <span className="kb-order-debt">Pagamento pendente</span> : null}
      {finance?.deliveryDate ? <span className="kb-order-delivery">Entrega prevista {deliveryLabel(finance.deliveryDate, finance.deliveryTime)}</span> : null}
      {tag || meta ? (
        <div className="kb-card-meta">
          {tag}
          {meta ? <span className="kb-meta">{meta}</span> : null}
        </div>
      ) : null}
    </>
  );
}

/** Cartão do quadro: arrasta para outra coluna; clique (ou Enter) abre os detalhes. */
/** fresh: cartão recém-criado (entra deslizando com brilho laranja). */
export function KanbanCard({ id, busy = false, fresh = false, onDetails, action, ...props }: CardProps & { id: string; busy?: boolean; fresh?: boolean; onDetails: () => void; action?: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled: busy });
  return (
    <article
      {...attributes}
      {...listeners}
      aria-label={`${props.title} — #${props.code}`}
      aria-roledescription="cartão arrastável"
      className={`kb-card${isDragging ? " is-ghosted" : ""}${busy ? " is-busy" : ""}${fresh ? " is-new" : ""}`}
      onClick={onDetails}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") onDetails();
        else listeners?.onKeyDown?.(event);
      }}
      ref={setNodeRef}
    >
      <KanbanCardBody {...props} />
      {action ? <div className="kb-card-action" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>{action}</div> : null}
    </article>
  );
}

/** "Etapa" na janela de detalhes: move o cartão sem arrastar (celular, teclado). */
export function StageSelect<S extends string>({ value, options, labels, busy, onChange }: { value: S; options: readonly S[]; labels: Record<S, string>; busy: boolean; onChange: (next: S) => void }) {
  const selectId = useId();
  return (
    <label className="kb-stage" htmlFor={selectId}>
      <span>Etapa</span>
      <select disabled={busy || options.length < 2} id={selectId} onChange={(event) => onChange(event.target.value as S)} value={value}>
        {options.map((option) => <option key={option} value={option}>{labels[option]}</option>)}
      </select>
    </label>
  );
}

/** Janela de detalhes no centro da tela (fecha com Esc, no X ou clicando fora). */
export function DetailsDialog({
  title,
  code,
  subtitle,
  status,
  statusColor,
  onClose,
  footer,
  children,
  className,
}: {
  title: string;
  code: string;
  subtitle: string;
  status: string;
  statusColor: { bg: string; fg: string };
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="kb-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-labelledby={titleId} aria-modal="true" className={`kb-dialog${className ? ` ${className}` : ''}`} role="dialog">
        <header className="kb-dialog-head">
          <div>
            <span className="kb-dialog-code"><span>#{code}</span> · {subtitle}</span>
            <h2 id={titleId}>{title}</h2>
            <span className="kb-chip" style={{ background: statusColor.bg, color: statusColor.fg }}>{status}</span>
          </div>
          <button aria-label="Fechar" className="kb-dialog-close" onClick={onClose} ref={closeRef} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="kb-dialog-body">{children}</div>
        <footer className="kb-dialog-foot">{footer}</footer>
      </div>
    </div>
  );
}

/** Blocos dos detalhes: contato, faturamento, itens (com total) e observações. */
export function DetailsSections({
  customerName,
  customerPhone,
  customerCompany,
  paymentLabel,
  billing,
  items,
  total,
  discount,
  notes,
  internalNotes,
}: {
  customerName: string;
  customerPhone: string;
  customerCompany: string | null;
  paymentLabel?: string;
  billing: QuoteBilling | null;
  items: BackofficeItem[];
  total: number | null;
  /** Desconto no total (orçamento/pedido vindo de orçamento). */
  discount?: { label: string; amount: number } | null;
  notes: string | null;
  /** Observação só da equipe (orçamentos). */
  internalNotes?: string;
}) {
  return (
    <>
      <div className="kb-dialog-grid">
        <section>
          <h3>Contato</h3>
          <p>
            <strong>{customerName}</strong>
            {customerCompany ? <span>{customerCompany}</span> : null}
            <span>{customerPhone}</span>
            {paymentLabel ? <span>{paymentLabel}</span> : null}
          </p>
        </section>
        <section>
          <h3>Faturamento</h3>
          {billing ? (
            <p>
              <strong>{billing.personType === "pj" ? billing.companyName : customerName}</strong>
              {billing.personType === "pj" && billing.tradeName ? <span>{billing.tradeName}</span> : null}
              <span>
                {billingDocument(billing)}
                {billing.personType === "pj" ? ` · IE ${billing.stateRegistration}` : ""}
              </span>
              <span>{formatBillingAddress(billing.address)}</span>
            </p>
          ) : (
            <p className="kb-dialog-warning">Cliente sem cadastro completo. Confirmar CPF/CNPJ e endereço no WhatsApp.</p>
          )}
        </section>
      </div>

      <section>
        <h3>Itens</h3>
        <table className="kb-items">
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.productName}-${index}`}>
                <td>
                  {itemLine(item)}
                  {itemCodeLine(item) ? <small className="kb-item-codes">{itemCodeLine(item)}</small> : null}
                  {/* Foto não tem gravação nem custo de fornecedor: só o preço por cópia. */}
                  {photoFromName(item.productName) ? (
                    <small className="kb-item-costing">venda {item.unitPrice === null ? "—" : `${formatCurrency(item.unitPrice)}/cópia`}</small>
                  ) : item.costing ? (
                    <small className="kb-item-costing">
                      {item.costing.personalizacao ?? "Sem gravação"} · custo {formatCurrency(item.costing.custoProduto + item.costing.personalizacaoUnitaria)}/un. · venda {item.unitPrice === null ? "—" : `${formatCurrency(item.unitPrice)}/un.`}
                    </small>
                  ) : null}
                </td>
                <td>{item.unitPrice === null ? "Sob consulta" : formatCurrency(item.unitPrice * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {discount && total !== null ? (
              <>
                <tr className="kb-subtotal">
                  <td>Subtotal</td>
                  <td>{formatCurrency(total + discount.amount)}</td>
                </tr>
                <tr className="kb-discount">
                  <td>{discount.label}</td>
                  <td>− {formatCurrency(discount.amount)}</td>
                </tr>
              </>
            ) : null}
            <tr>
              <td>Total</td>
              <td>{total === null ? "Sob consulta" : formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {notes ? (
        <section>
          <h3>Observações</h3>
          <p className="kb-note">{notes}</p>
        </section>
      ) : null}

      {internalNotes ? (
        <section>
          <h3>Observações internas</h3>
          <p className="kb-note">{internalNotes}</p>
        </section>
      ) : null}
    </>
  );
}

/** Ação final verde da janela (ex.: "Concluir pedido", "Pagamento recebido"). */
export function FinalAction({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button className="kb-primary kb-pay" disabled={busy} onClick={onClick} type="button">
      <CheckCircle2 aria-hidden="true" size={15} /> {label}
    </button>
  );
}
