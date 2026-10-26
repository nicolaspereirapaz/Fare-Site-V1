"use client";

import Link from "next/link";
import {
  ArrowRight, Backpack, Briefcase, BriefcaseBusiness, ChevronDown, Coffee, CookingPot, Dumbbell, Gift, GlassWater,
  KeyRound, Laptop, NotebookPen, Package, PawPrint, PenLine, Plane, Puzzle, Shirt, ShoppingBag, Snowflake, Sparkles,
  Wine, Wrench, type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MenuCategory } from "@/lib/menuCategories";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Canetas e Lápis": PenLine,
  "Cadernos e Agendas": NotebookPen,
  "Escritório": Briefcase,
  "Mochilas": Backpack,
  "Bolsas e Sacolas": ShoppingBag,
  "Bolsas Térmicas e Marmitas": Snowflake,
  "Necessaires e Estojos": Package,
  "Garrafas e Squeezes": GlassWater,
  "Canecas, Copos e Taças": Coffee,
  "Casa e Cozinha": CookingPot,
  "Churrasco, Vinho e Queijo": Wine,
  "Beleza e Bem-estar": Sparkles,
  "Tecnologia": Laptop,
  "Viagem e Lazer": Plane,
  "Vestuário e Acessórios": Shirt,
  "Chaveiros": KeyRound,
  "Ferramentas": Wrench,
  "Infantil e Diversão": Puzzle,
  "Esporte e Fitness": Dumbbell,
  "Kits Executivos": BriefcaseBusiness,
  "Embalagens para Presente": Gift,
  "Pet": PawPrint,
};

const categoryHref = (name: string) => `/brindes?categoria=${encodeURIComponent(name)}`;

/** Item "Brindes" do cabeçalho: clicar leva ao catálogo; passar o mouse (ou focar pelo teclado) abre as categorias. */
export function BrindesMenu({ categories, onNavigate }: { categories: MenuCategory[]; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  // Pequena espera ao sair: o mouse pode atravessar o vão entre o link e o painel sem fechar o menu.
  const hide = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 160);
  };
  const navigate = () => {
    cancelClose();
    setOpen(false);
    onNavigate?.();
  };

  useEffect(() => cancelClose, []);

  return (
    <div
      className={open ? "brindes-menu open" : "brindes-menu"}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide();
      }}
      onFocus={show}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <Link aria-expanded={categories.length ? open : undefined} className="brindes-trigger" href="/brindes" onClick={navigate}>
        Brindes {categories.length ? <ChevronDown aria-hidden="true" size={16} /> : null}
      </Link>
      {categories.length ? (
        <div className="brindes-panel">
          <div className="brindes-panel-head">
            <Link className="text-link" href="/brindes" onClick={navigate}>
              Ver todos os brindes <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>
          <ul className="brindes-list-grid">
            {categories.map((category) => {
              const Icon = CATEGORY_ICONS[category.name] ?? Package;
              return (
                <li key={category.name}>
                  <Link className="brindes-list-item" href={categoryHref(category.name)} onClick={navigate}>
                    <span className="brindes-list-icon"><Icon aria-hidden="true" size={16} /></span>
                    <span>{category.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
