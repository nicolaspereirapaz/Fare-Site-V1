"use client";

import Image from "next/image";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { MessageCircle, ShoppingBag } from "lucide-react";
import { CAMPAIGN_HOME } from "@/lib/siteMode";
import { OUTUBRO_ROSA_CART_EVENT, OUTUBRO_ROSA_CART_PATH, readCampaignCart } from "@/lib/outubroRosaCart";

function subscribe(onChange: () => void) {
  window.addEventListener(OUTUBRO_ROSA_CART_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OUTUBRO_ROSA_CART_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

const cartCount = () => readCampaignCart().length;

/** Cabeçalho enxuto da campanha: só a marca e o carrinho do Outubro Rosa. */
export function CampaignHeader() {
  const count = useSyncExternalStore(subscribe, cartCount, () => 0);

  return (
    <header className="site-header">
      <div className="header-inner container-shell">
        <Link aria-label="Fare Foto — Outubro Rosa" className="brand-link" href={CAMPAIGN_HOME}>
          <Image alt="Fare Foto" height={82} priority src="/images/fare-foto-logo.svg" width={150} />
        </Link>
        <div className="header-actions">
          <Link aria-label={`Carrinho com ${count} ${count === 1 ? "produto" : "produtos"}`} className="cart-link" href={OUTUBRO_ROSA_CART_PATH}>
            <ShoppingBag aria-hidden="true" size={20} />
            <span className="cart-label">Carrinho</span>
            {count > 0 ? <span className="cart-count">{count}</span> : null}
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Rodapé da campanha, sem links para outras partes do site. */
export function CampaignFooter() {
  return (
    <footer className="site-footer">
      <div className="container-shell footer-bottom">
        <span>© {new Date().getFullYear()} Fare Foto · Jundiaí, SP</span>
        <span><MessageCircle aria-hidden="true" size={15} /> Orçamentos pelo WhatsApp · valores confirmados no atendimento.</span>
      </div>
    </footer>
  );
}
