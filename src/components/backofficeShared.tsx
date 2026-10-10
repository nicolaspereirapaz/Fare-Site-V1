"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, X } from "lucide-react";
import { formatBillingAddress, type QuoteBilling } from "@/lib/commerce";
import { buildWhatsAppUrl } from "@/lib/commerce";

/** Partes comuns aos quadros de pedidos e de orçamentos do painel. */
export type BackofficeItem = { productName: string; quantity: number; selections: Record<string, string>; unitPrice: number | null };

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

/** Coluna do quadro: borda delimitando a etapa, bolinha colorida e contador. */
export function KanbanColumn({ title, color, count, empty, children }: { title: string; color: string; count: number; empty: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="kb-column">
      <header className="kb-column-header">
        <span aria-hidden="true" className="kb-dot" style={{ background: color }} />
        <h2 id={headingId}>{title}</h2>
        <span className="kb-count">{count}</span>
      </header>
      <div className="kb-column-body">{count === 0 ? <p className="kb-empty">{empty}</p> : children}</div>
    </section>
  );
}

/** Cartão do quadro: só o essencial; o resto fica em "Ver detalhes". */
export function KanbanCard({
  code,
  total,
  title,
  summary,
  tag,
  warning,
  action,
  onDetails,
}: {
  code: string;
  total: number | null;
  title: string;
  summary: string;
  tag?: ReactNode;
  warning?: string | null;
  action?: ReactNode;
  onDetails: () => void;
}) {
  return (
    <article className="kb-card">
      <div className="kb-card-row">
        <span className="kb-code">#{code}</span>
        <span className="kb-value">{total === null ? "Sob consulta" : formatCurrency(total)}</span>
      </div>
      {tag}
      <strong className="kb-title">{title}</strong>
      <span className="kb-summary">{summary}</span>
      {warning ? <span className="kb-warning"><span aria-hidden="true">⚠ </span><span>{warning}</span></span> : null}
      <div className="kb-card-foot">
        <button className="kb-details" onClick={onDetails} type="button">Ver detalhes</button>
        {action ? <span className="kb-steps">{action}</span> : null}
      </div>
    </article>
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
}: {
  title: string;
  code: string;
  subtitle: string;
  status: string;
  statusColor: { bg: string; fg: string };
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
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
      <div aria-labelledby={titleId} aria-modal="true" className="kb-dialog" role="dialog">
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
  notes,
}: {
  customerName: string;
  customerPhone: string;
  customerCompany: string | null;
  paymentLabel?: string;
  billing: QuoteBilling | null;
  items: BackofficeItem[];
  total: number | null;
  notes: string | null;
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
                <td>{itemLine(item)}</td>
                <td>{item.unitPrice === null ? "Sob consulta" : formatCurrency(item.unitPrice * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
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
    </>
  );
}

export type StepAction = { label: string; onClick: () => void };

/**
 * Par de botões das etapas: "← Voltar" e "Avançar →".
 * Na última etapa o avançar vira uma ação final verde (ex.: "Concluir", "Pagamento recebido").
 */
export function StepButtons({
  back,
  next,
  busy,
  large = false,
}: {
  back?: StepAction | null;
  next?: (StepAction & { text?: string; final?: boolean }) | null;
  busy: boolean;
  large?: boolean;
}) {
  return (
    <>
      {back ? (
        <button aria-label={back.label} className={large ? "kb-secondary" : "kb-back"} disabled={busy} onClick={back.onClick} title={back.label} type="button">
          <ArrowLeft aria-hidden="true" size={large ? 15 : 16} />
          {large ? " Voltar" : null}
        </button>
      ) : null}
      {next ? (
        <button
          aria-label={next.label}
          className={`${large ? "kb-primary" : "kb-next"}${next.final ? " kb-pay" : ""}`}
          disabled={busy}
          onClick={next.onClick}
          title={next.label}
          type="button"
        >
          {next.final ? <CheckCircle2 aria-hidden="true" size={15} /> : null}
          {next.text ?? "Avançar"}
          {next.final ? null : <ArrowRight aria-hidden="true" size={15} />}
        </button>
      ) : null}
    </>
  );
}
