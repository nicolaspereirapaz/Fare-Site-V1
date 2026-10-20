"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, ShoppingBag, UserRound, X } from "lucide-react";
import { useState } from "react";
import { BrindesMenu } from "@/components/BrindesMenu";
import { FotosMenu } from "@/components/FotosMenu";
import { GraficaMenu } from "@/components/GraficaMenu";
import { useCart } from "@/context/CartContext";
import { photoCartLines, usePhotoState } from "@/components/fotos/store";
import type { MenuCategory } from "@/lib/menuCategories";

const navItems = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#contato", label: "Contato" },
];

export function Header({ user, categories = [] }: { user: { name: string } | null; categories?: MenuCategory[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { itemCount: giftCount } = useCart();
  // Carrinho único: brindes e o pedido de fotos (uma linha por tamanho + papel) contam juntos.
  const itemCount = giftCount + photoCartLines(usePhotoState());

  return (
    <header className="site-header">
      <div className="header-inner container-shell">
        <Link className="brand-link" href="/" aria-label="Fare Foto — início">
          {/* Fundo branco: logo com o slogan em preto; no celular, a versão compacta (sem slogan). */}
          <Image
            alt="Fare Foto"
            className="brand-logo-full"
            height={109}
            priority
            src="/images/fare-foto-logo-slogan.svg"
            width={200}
          />
          <Image
            alt=""
            aria-hidden="true"
            className="brand-logo-compact"
            height={87}
            priority
            src="/images/fare-foto-logo-compacto.svg"
            width={200}
          />
        </Link>

        <nav aria-label="Navegação principal" className={menuOpen ? "main-nav open" : "main-nav"}>
          <Link href="/" onClick={() => setMenuOpen(false)}>
            Início
          </Link>
          {/* "Brindes" e "Categorias" num item só: as categorias abrem ao passar o mouse. */}
          {/* Fotos, Gráfica & Impressos e Brindes lado a lado, com a mesma importância no menu. */}
          <FotosMenu onNavigate={() => setMenuOpen(false)} />
          <GraficaMenu onNavigate={() => setMenuOpen(false)} />
          <BrindesMenu categories={categories} onNavigate={() => setMenuOpen(false)} />
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <Link className="account-link" href={user ? "/minha-conta" : "/entrar"}>
            <UserRound aria-hidden="true" size={19} />
            <span>{user ? "Minha conta" : "Entrar"}</span>
          </Link>
          <Link className="cart-link" href="/carrinho" aria-label={`Carrinho com ${itemCount} itens`}>
            <ShoppingBag aria-hidden="true" size={20} />
            <span className="cart-label">Carrinho</span>
            {itemCount > 0 ? <span className="cart-count">{itemCount}</span> : null}
          </Link>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            className="menu-toggle"
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}
