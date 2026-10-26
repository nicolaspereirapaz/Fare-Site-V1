"use client";

// "Como funciona" com uma aba para cada parte da loja (fotos, gráfica e brindes).
import { useState } from "react";
import { Camera, Clock, FileCheck2, Gift, MessageCircle, Package, PackageCheck, Palette, Printer, ShoppingBag, Upload } from "lucide-react";

const STEPS = {
  fotos: {
    label: "Fotos",
    title: "Do celular para o papel.",
    text: "Você envia e ajusta as fotos; a equipe confere tudo antes de revelar.",
    items: [
      { icon: Upload, title: "Envie as fotos", text: "Do celular ou do computador, quantas quiser. Escolha tamanho e papel e ajuste o corte." },
      { icon: PackageCheck, title: "A equipe confere", text: "Olhamos cada foto antes de imprimir e avisamos se alguma puder sair borrada." },
      { icon: Clock, title: "Retire em 1 hora", text: "Até 30 × 45 cm fica pronto em 1 hora após o pagamento. Ou receba em casa." },
    ],
  },
  grafica: {
    label: "Gráfica",
    title: "Da ideia ao impresso.",
    text: "Você conta o que precisa; a gente ajuda com a arte e mostra a prova antes de imprimir.",
    items: [
      { icon: MessageCircle, title: "Conte o que precisa", text: "Escolha o impresso e mande quantidade, medida e papel. Não sabe? A gente indica." },
      { icon: Palette, title: "Envie a arte ou peça a criação", text: "Use a sua arte pronta ou deixe a equipe criar a partir da sua marca." },
      { icon: FileCheck2, title: "Aprove a prova e retire", text: "Você aprova antes de imprimir. Depois é só retirar na loja ou receber." },
    ],
  },
  brindes: {
    label: "Brindes",
    title: "Do catálogo à entrega.",
    text: "Você escolhe os brindes; a equipe confere arte, valores e prazo com você antes de produzir.",
    items: [
      { icon: ShoppingBag, title: "Escolha os brindes", text: "Navegue pelo catálogo, compare cores e quantidades. Com seu cadastro, os preços aparecem na hora." },
      { icon: Package, title: "Faça o pedido ou peça um orçamento", text: "Monte o carrinho com tudo o que precisa e envie. Seus dados de faturamento já vão junto." },
      { icon: Palette, title: "A equipe confirma com você", text: "Pelo WhatsApp, combinamos a arte com o seu logo, o valor final, o prazo e a entrega." },
    ],
  },
};

const TAB_ICONS = { fotos: Camera, grafica: Printer, brindes: Gift };

export function HowItWorksTabs() {
  const [tab, setTab] = useState<keyof typeof STEPS>("fotos");
  const current = STEPS[tab];
  return (
    <section className="section-space process-section" id="como-funciona">
      <div className="container-shell">
        <div className="section-heading centered-heading">
          <h2>{current.title}</h2>
          <p>{current.text}</p>
        </div>
        <div aria-label="Como funciona para" className="home-how-tabs" role="tablist">
          {(Object.keys(STEPS) as (keyof typeof STEPS)[]).map((key) => {
            const Icon = TAB_ICONS[key];
            return (
              <button aria-selected={tab === key} className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)} role="tab" type="button">
                <Icon aria-hidden="true" size={17} /> {STEPS[key].label}
              </button>
            );
          })}
        </div>
        <ol className="process-grid" role="tabpanel">
          {current.items.map(({ icon: Icon, title, text }, index) => (
            <li key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
