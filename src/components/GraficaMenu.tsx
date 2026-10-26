"use client";

// item "Gráfica & Impressos" do cabeçalho. Mesmo comportamento do BrindesMenu:
// clicar leva à página da gráfica; passar o mouse (ou focar pelo teclado) abre a lista de impressos.
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GRAFICA_HREF, GRAFICA_ITEMS } from "@/components/home/grafica";
import "./home/home.css";

export function GraficaMenu({ onNavigate }: { onNavigate?: () => void }) {
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
      className={open ? "brindes-menu grafica-menu open" : "brindes-menu grafica-menu"}
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
      <Link aria-expanded={open} className="brindes-trigger" href={GRAFICA_HREF} onClick={navigate}>
        Gráfica & Impressos <ChevronDown aria-hidden="true" size={16} />
      </Link>
      <div className="brindes-panel grafica-panel">
        <div className="brindes-panel-head">
          <Link className="text-link" href={GRAFICA_HREF} onClick={navigate}>
            Ver todos <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </div>
        <ul className="brindes-list-grid grafica-list-grid">
          {GRAFICA_ITEMS.map(({ icon: Icon, ...item }) => (
            <li key={item.id}>
              <Link className="brindes-list-item" href={`${GRAFICA_HREF}#${item.id}`} onClick={navigate}>
                <span className="brindes-list-icon"><Icon aria-hidden="true" size={16} /></span>
                <span>{item.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
