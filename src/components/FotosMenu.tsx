"use client";

// item "Fotos" do cabeçalho, ao lado de "Brindes". Mesmo comportamento do BrindesMenu:
// clicar leva à revelação; passar o mouse (ou focar pelo teclado) abre os tipos de foto.
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./home/home.css";

const PHOTO_HREF = "/produtos/revelacao-de-fotos";

const ITEMS = [
  { tipo: "revelacao", title: "Revelação", sizes: "9 × 12 a 15 × 21 cm", note: "Pronto em 1 hora", image: "/images/revelacao/01-pilha-fotos-10x15.webp" },
  { tipo: "retro", title: "Fotos retrô", sizes: "Polaroid e Instax", note: "Pronto em 1 hora", image: "/images/revelacao/06-fotos-retro.webp" },
  { tipo: "ampliacao", title: "Ampliações", sizes: "20 × 20 a 30 × 45 cm", note: "Pronto em 1 hora", image: "/images/revelacao/04-ampliacao-30x45-parede.webp" },
  { tipo: "grande", title: "Grandes formatos", sizes: "30 × 60 até 60 × 250 cm", note: "3 dias úteis", image: "/images/revelacao/05-grande-formato-60x90.webp" },
];

export function FotosMenu({ onNavigate }: { onNavigate?: () => void }) {
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
      className={open ? "brindes-menu fotos-menu open" : "brindes-menu fotos-menu"}
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
      <Link aria-expanded={open} className="brindes-trigger" href={PHOTO_HREF} onClick={navigate}>
        Fotos <ChevronDown aria-hidden="true" size={16} />
      </Link>
      <div className="brindes-panel fotos-panel">
        <div className="brindes-panel-head">
          <Link className="text-link" href={PHOTO_HREF} onClick={navigate}>
            Enviar minhas fotos <ArrowRight aria-hidden="true" size={15} />
          </Link>
        </div>
        <ul className="fotos-menu-grid">
          {ITEMS.map((item) => (
            <li key={item.title}>
              <Link className="fotos-menu-card" href={`${PHOTO_HREF}?tipo=${item.tipo}`} onClick={navigate}>
                <span className="fotos-menu-photo"><Image alt="" fill sizes="190px" src={item.image} /></span>
                <strong>{item.title}</strong>
                <small>{item.sizes}</small>
                <small className="fotos-menu-note"><Clock aria-hidden="true" size={13} /> {item.note}</small>
              </Link>
            </li>
          ))}
        </ul>
        <p className="fotos-menu-soon">Em breve: álbuns, quadros e presentes com foto.</p>
      </div>
    </div>
  );
}
