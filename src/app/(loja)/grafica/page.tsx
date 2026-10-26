import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, FileCheck2, MessageCircle, Palette, Printer } from "lucide-react";
import { GRAFICA_ITEMS, graficaWhatsApp } from "@/components/home/grafica";
import "@/components/home/home.css";

// página da Gráfica & Impressos. Os valores dependem de quantidade, papel e acabamento,
// então cada impresso leva direto ao orçamento pelo WhatsApp.
export const metadata: Metadata = {
  title: "Gráfica & Impressos",
  description: "Cartões de visita, panfletos, folders, banners, convites, tags e adesivos impressos em Jundiaí.",
};

export default function GraficaPage() {
  return (
    <>
      <section className="grafica-hero">
        <div className="container-shell">
          <nav className="breadcrumb" aria-label="Caminho de navegação">
            <Link href="/"><ArrowLeft aria-hidden="true" size={16} /> Início</Link>
            <span>/</span><strong>Gráfica & Impressos</strong>
          </nav>
          <div className="grafica-hero-grid">
            <div>
              <h1>Impressos que causam boa impressão.</h1>
              <p>Do cartão de visita ao banner da fachada. Você manda a sua arte ou a gente cria a partir da sua marca, e você aprova a prova antes de imprimir.</p>
              <div className="home-door-actions">
                <a className="button button-primary" href={graficaWhatsApp()} rel="noreferrer" target="_blank"><MessageCircle aria-hidden="true" size={18} /> Pedir orçamento</a>
                <a className="text-link" href="#impressos">Ver os impressos <ArrowRight aria-hidden="true" size={16} /></a>
              </div>
            </div>
            <ul className="grafica-hero-points">
              <li><Palette aria-hidden="true" size={20} /><span><strong>Sem arte? A gente cria.</strong>A partir do seu logo e das suas cores.</span></li>
              <li><FileCheck2 aria-hidden="true" size={20} /><span><strong>Prova antes de imprimir.</strong>Nada é impresso sem a sua aprovação.</span></li>
              <li><Printer aria-hidden="true" size={20} /><span><strong>Pequenas e grandes tiragens.</strong>De 50 convites a milhares de panfletos.</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section-space" id="impressos">
        <div className="container-shell">
          {/* Mesmo card dos brindes (XbzProductCard): foto, categoria, nome, descrição e rodapé com valor e seta. */}
          <div className="product-grid grafica-product-grid">
            {GRAFICA_ITEMS.map((item) => {
              const href = graficaWhatsApp(item.title);
              return (
                <article className="product-card grafica-product-card" id={item.id} key={item.id}>
                  <a className="product-card-image supplier-photo" href={href} rel="noreferrer" target="_blank">
                    <Image alt={item.title} fill sizes="(max-width: 640px) 82vw, (max-width: 1024px) 42vw, 280px" src={item.image} />
                  </a>
                  <div className="product-card-content">
                    <span className="product-card-meta">
                      <span className="product-category">Gráfica & Impressos</span>
                      <span className="product-code">Sob medida</span>
                    </span>
                    <h3><a href={href} rel="noreferrer" target="_blank">{item.title}</a></h3>
                    <p>{item.text}</p>
                    <div className="product-card-footer">
                      <div>
                        <small>Valor</small>
                        <strong>Sob consulta</strong>
                        <small>orçamento rápido pelo WhatsApp</small>
                      </div>
                      <a aria-label={`Pedir orçamento de ${item.title}`} href={href} rel="noreferrer" target="_blank">
                        <ArrowUpRight aria-hidden="true" size={20} />
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <p className="grafica-note">
            <MessageCircle aria-hidden="true" size={18} /> Não achou o que procura? Imprimimos muito mais: crachás, envelopes, blocos, calendários e o que a sua ideia pedir.{" "}
            <a href={graficaWhatsApp()} rel="noreferrer" target="_blank">Fale com a gente</a>.
          </p>
        </div>
      </section>
    </>
  );
}
