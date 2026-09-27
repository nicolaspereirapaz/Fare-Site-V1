"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, ShoppingBag, X } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/context/CartContext";

const navItems = [
  { href: "/", label: "Início" },
  { href: "/produtos", label: "Produtos" },
  { href: "/brindes", label: "Brindes personalizados" },
  { href: "/#categorias", label: "Categorias" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#contato", label: "Contato" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { itemCount } = useCart();

  return (
    <header className="site-header">
      <div className="header-inner container-shell">
        <Link className="brand-link" href="/" aria-label="Fare Foto — início">
          <Image
            alt="Fare Foto"
            height={82}
            priority
            src="/images/fare-foto-logo.svg"
            width={150}
          />
        </Link>

        <nav aria-label="Navegação principal" className={menuOpen ? "main-nav open" : "main-nav"}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
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
