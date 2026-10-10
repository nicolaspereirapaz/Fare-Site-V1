import Link from "next/link";
import { CalendarDays, FileText, MessageCircle } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { QUOTE_STATUS_LABELS, quoteCode, type QuoteStatus } from "@/lib/quotes/quoteCode";

export type AccountQuote = {
  id: string;
  status: QuoteStatus;
  totalCents: number | null;
  createdAt: string;
  items: Array<{ productName: string; quantity: number; color: string | null; unitPrice: number | null }>;
};


const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const formatDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
}).format(new Date(iso));

export function AccountQuotes({ quotes }: { quotes: AccountQuote[] }) {
  if (!quotes.length) {
    return (
      <div className="account-empty">
        <FileText aria-hidden="true" size={32} />
        <p>Nenhum orçamento por enquanto.</p>
        <small>
          Monte o carrinho com os brindes e, ao finalizar, escolha <strong>Só quero um orçamento</strong>. A equipe responde pelo WhatsApp.
        </small>
        <div className="account-empty-actions">
          <Link className="button button-primary" href="/brindes">Ver brindes</Link>
          <a
            className="button button-secondary"
            href={buildWhatsAppUrl(FARE_FOTO_WHATSAPP, "Olá! Gostaria de um orçamento de um item que não está no site.")}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle aria-hidden="true" size={17} /> Pedir pelo WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="account-order-list">
      {quotes.map((quote) => {
        const code = quoteCode(quote.id);
        const titleId = `orcamento-${quote.id}`;
        return (
          <article aria-labelledby={titleId} className="account-order" key={quote.id}>
            <header className="account-order-heading">
              <div>
                <h2 id={titleId}>Orçamento #{code}</h2>
                <ul className="account-order-meta">
                  <li><CalendarDays aria-hidden="true" size={14} /> {formatDate(quote.createdAt)}</li>
                </ul>
              </div>
              <span className={`account-order-status quote-status-${quote.status}`}>{QUOTE_STATUS_LABELS[quote.status]}</span>
            </header>

            <ul className="account-order-items">
              {quote.items.map((item, index) => (
                <li key={`${quote.id}-${index}`}>
                  <span>
                    <strong>{item.productName}</strong>
                    {item.color ? <small> · {item.color}</small> : null}
                  </span>
                  <span>{item.quantity} un.</span>
                  <span>{item.unitPrice === null ? "sob consulta" : `${brl(item.unitPrice)}/un.`}</span>
                </li>
              ))}
            </ul>

            <footer className="account-order-footer">
              <p>
                <span>Total estimado</span>{" "}
                <strong>{quote.totalCents === null ? "sob consulta" : brl(quote.totalCents / 100)}</strong>
              </p>
              <a
                className="button button-secondary"
                href={buildWhatsAppUrl(FARE_FOTO_WHATSAPP, `Olá! Gostaria de falar sobre o orçamento #${code}.`)}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MessageCircle aria-hidden="true" size={17} /> Falar sobre este orçamento
              </a>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
