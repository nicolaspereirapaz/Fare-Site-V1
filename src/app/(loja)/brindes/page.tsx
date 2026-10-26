import type { Metadata } from "next";
import Link from "next/link";
import { XbzCatalog } from "@/components/XbzCatalog";
import { FaqSection, type Faq } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Brindes Personalizados e Corporativos em Jundiaí | Fare Foto" },
  description:
    "Mais de 4 mil brindes personalizados com a sua marca: canetas, garrafas, canecas, cadernos, mochilas e kits executivos. Brindes corporativos e de fim de ano para empresas em Jundiaí.",
  keywords: ["brindes personalizados", "brindes corporativos", "brindes para empresas", "brindes de fim de ano", "brindes personalizados Jundiaí", "brindes com logo"],
  alternates: { canonical: "/brindes" },
};

const GIFT_FAQ: Faq[] = [
  { q: "Vocês fazem brindes corporativos com a logo da empresa?", a: "Sim. A Fare Foto personaliza brindes com a sua marca: canetas, garrafas e squeezes, canecas, cadernos e agendas, mochilas, kits executivos e mais de 4 mil opções. A equipe confere a arte e combina valor e prazo com você." },
  { q: "Como pedir um orçamento de brindes personalizados?", a: "Escolha os produtos no catálogo, a cor e a quantidade, adicione ao carrinho e envie a solicitação. Se preferir, fale com a equipe pelo WhatsApp." },
  { q: "Vocês têm brindes de fim de ano para empresas?", a: "Sim: kits executivos, garrafas térmicas, canecas, agendas, kits de churrasco e vinho e muito mais para presentear clientes e equipes no fim de ano." },
  { q: "Onde fica a Fare Foto?", a: "Na Rua do Rosário, 68, no Centro de Jundiaí (SP)." },
];

type BrindesPageProps = { searchParams: Promise<{ categoria?: string | string[] }> };

export default async function BrindesPage({ searchParams }: BrindesPageProps) {
  const { categoria } = await searchParams;
  const initialCategory = (Array.isArray(categoria) ? categoria[0] : categoria)?.trim() || "Todos";
  return (
    <>
      <section className="page-hero catalog-hero">
        <div className="container-shell">
          <h1>Brindes que levam sua marca mais longe.</h1>
          <p>
            Encontre produtos para sua empresa, evento ou equipe e monte uma solicitação de
            orçamento personalizada com a Fare Foto.
          </p>
        </div>
      </section>
      <section className="catalog-section">
        <div className="container-shell">
          <XbzCatalog initialCategory={initialCategory} />
        </div>
      </section>

      <section className="seo-text">
        <div className="container-shell">
          <h2>Brindes personalizados e corporativos com a sua marca</h2>
          <p>
            A Fare Foto, em Jundiaí, personaliza brindes para empresas, eventos, equipes e datas especiais. São mais de 4 mil
            produtos para gravar a sua logo: canetas, garrafas e squeezes, canecas, cadernos e agendas, mochilas, bolsas térmicas,
            tecnologia e kits executivos. Você escolhe no catálogo e a nossa equipe confere a arte, o valor e o prazo.
          </p>
          <p>
            Vai presentear clientes e colaboradores? Veja as ideias de <Link href="/brindes/fim-de-ano">brindes de fim de ano para empresas</Link>.
          </p>
        </div>
      </section>

      <FaqSection faqs={GIFT_FAQ} title="Perguntas frequentes sobre brindes" />
    </>
  );
}
