import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { FaqSection, type Faq } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Brindes de Fim de Ano para Empresas em Jundiaí | Fare Foto" },
  description:
    "Brindes de fim de ano personalizados para clientes e colaboradores: kits executivos, garrafas térmicas, canecas, agendas, kits de churrasco e vinho com a logo da sua empresa. Peça seu orçamento.",
  keywords: ["brindes de fim de ano", "brindes de fim de ano para empresas", "presentes corporativos", "kit de fim de ano", "brindes de natal para clientes", "brindes corporativos Jundiaí"],
  alternates: { canonical: "/brindes/fim-de-ano" },
  openGraph: { title: "Brindes de fim de ano para empresas | Fare Foto", url: "/brindes/fim-de-ano" },
};

const categoryHref = (name: string) => `/brindes?categoria=${encodeURIComponent(name)}`;

/** Ideias por categoria do catálogo (nomes iguais aos do menu de brindes). */
const IDEAS = [
  { category: "Kits Executivos", text: "Conjuntos com caneta, caderno e acessórios em estojo: presente completo para clientes e diretoria." },
  { category: "Garrafas e Squeezes", text: "Garrafas térmicas e squeezes que acompanham o cliente o ano inteiro, com a sua logo gravada." },
  { category: "Canecas, Copos e Taças", text: "Canecas, copos térmicos e taças para brindar o fim de ano com a equipe." },
  { category: "Cadernos e Agendas", text: "Agendas e cadernos personalizados para começar o próximo ano com a sua marca na mesa do cliente." },
  { category: "Churrasco, Vinho e Queijo", text: "Kits de churrasco, vinho e queijo: os favoritos para confraternizações e presentes de fim de ano." },
  { category: "Bolsas Térmicas e Marmitas", text: "Bolsas térmicas e marmitas úteis no dia a dia, ótimas para as festas e as férias." },
  { category: "Tecnologia", text: "Carregadores, fones e acessórios que o cliente usa todos os dias." },
  { category: "Mochilas", text: "Mochilas e pastas para presentear a equipe com algo que dura." },
];

const FAQ: Faq[] = [
  { q: "Quais são os brindes de fim de ano mais pedidos pelas empresas?", a: "Kits executivos, garrafas térmicas, canecas e copos térmicos, agendas, kits de churrasco, vinho e queijo e bolsas térmicas, todos personalizados com a logo da empresa." },
  { q: "Com quanta antecedência devo pedir os brindes de fim de ano?", a: "O prazo depende do produto, da quantidade e da gravação, e é combinado no orçamento. Para o fim de ano, quanto antes você pedir, mais opções e estoque disponíveis." },
  { q: "Como faço um orçamento de brindes de fim de ano?", a: "Escolha os produtos no catálogo de brindes, a cor e a quantidade, e envie a solicitação pelo carrinho — ou fale com a equipe pelo WhatsApp. A Fare Foto confere a arte e combina valor e prazo." },
  { q: "Vocês atendem empresas de Jundiaí e região?", a: "Sim. A loja fica na Rua do Rosário, 68, no Centro de Jundiaí, e atende empresas da cidade e da região." },
];

export default function FimDeAnoPage() {
  const whatsApp = buildWhatsAppUrl(FARE_FOTO_WHATSAPP, "Olá! Quero um orçamento de brindes de fim de ano para a minha empresa.");
  return (
    <>
      <section className="page-hero catalog-hero">
        <div className="container-shell">
          <h1>Brindes de fim de ano para empresas</h1>
          <p>
            Agradeça clientes, parceiros e colaboradores com brindes personalizados com a sua marca. Mais de 4 mil opções,
            com a arte conferida pela nossa equipe, aqui em Jundiaí.
          </p>
          <p className="seo-actions">
            <Link className="button button-primary" href="/brindes">Ver todos os brindes</Link>
            <a className="button button-secondary" href={whatsApp} rel="noreferrer" target="_blank">Pedir orçamento no WhatsApp</a>
          </p>
        </div>
      </section>

      <section className="seo-text">
        <div className="container-shell">
          <h2>Ideias de brindes de fim de ano</h2>
          <ul className="seo-ideas">
            {IDEAS.map((idea) => (
              <li key={idea.category}>
                <Link href={categoryHref(idea.category)}>
                  <strong>{idea.category}</strong>
                  <span>{idea.text}</span>
                  <em>Ver opções <ArrowRight aria-hidden="true" size={15} /></em>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <FaqSection faqs={FAQ} title="Perguntas frequentes sobre brindes de fim de ano" />
    </>
  );
}
