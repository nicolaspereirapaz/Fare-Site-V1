import type { Metadata } from "next";
import { FileText, MessageCircle } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";

export const metadata: Metadata = { title: "Orçamentos" };

export default function AccountQuotesPage() {
  return (
    <>
      <header className="account-content-heading">
        <h1>Orçamentos</h1>
        <p>Pedidos especiais que a equipe prepara para você.</p>
      </header>
      <div className="account-empty">
        <FileText aria-hidden="true" size={32} />
        <p>Nenhum orçamento por enquanto.</p>
        <small>Precisa de um produto ou quantidade que não está no site? Peça um orçamento pelo WhatsApp.</small>
        <a
          className="button button-whatsapp"
          href={buildWhatsAppUrl(FARE_FOTO_WHATSAPP, "Olá! Gostaria de pedir um orçamento.")}
          rel="noopener noreferrer"
          target="_blank"
        >
          <MessageCircle aria-hidden="true" size={17} /> Pedir orçamento
        </a>
      </div>
    </>
  );
}
