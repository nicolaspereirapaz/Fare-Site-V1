import { FARE_FOTO_INSTAGRAM, FARE_FOTO_WHATSAPP } from "@/lib/constants";

/*
 * Dados para buscadores (Google): a loja em Jundiaí (LocalBusiness) e perguntas frequentes (FAQPage).
 * Tudo aqui precisa bater com o que está escrito na página — o Google penaliza dado que o visitante não vê.
 */
export const SITE_URL = (process.env.FARE_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://www.farefoto.com.br").replace(/\/$/, "");

export const STORE = {
  name: "Fare Foto",
  street: "Rua do Rosário, 68",
  district: "Centro",
  city: "Jundiaí",
  region: "SP",
  postalCode: "13201-014",
  phone: `+${FARE_FOTO_WHATSAPP}`,
  email: "farefoto1@gmail.com",
};

export function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "Store"],
    "@id": `${SITE_URL}/#loja`,
    name: STORE.name,
    url: SITE_URL,
    logo: `${SITE_URL}/images/fare-foto-simbolo.svg`,
    image: `${SITE_URL}/images/revelacao/03-escala-tamanhos.webp`,
    description: "Revelação de fotos em 1 hora, impressão de fotos e ampliações, gráfica e brindes personalizados e corporativos em Jundiaí.",
    telephone: STORE.phone,
    email: STORE.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: STORE.street,
      addressLocality: STORE.city,
      addressRegion: STORE.region,
      postalCode: STORE.postalCode,
      addressCountry: "BR",
    },
    areaServed: [{ "@type": "City", name: "Jundiaí" }, { "@type": "State", name: "São Paulo" }],
    sameAs: [FARE_FOTO_INSTAGRAM],
    knowsAbout: ["Revelação de fotos", "Impressão de fotos", "Ampliação de fotos", "Brindes personalizados", "Brindes corporativos", "Gráfica"],
  };
}

export type Faq = { q: string; a: string };

export function faqJsonLd(faqs: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.q, acceptedAnswer: { "@type": "Answer", text: faq.a } })),
  };
}

/** Bloco de dados estruturados (JSON-LD). `<` escapado para nunca fechar o script por engano. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

/** Perguntas frequentes visíveis na página (as mesmas vão no JSON-LD). */
export function FaqSection({ title, faqs }: { title: string; faqs: Faq[] }) {
  return (
    <section className="seo-faq">
      <div className="container-shell">
        <h2>{title}</h2>
        {faqs.map((faq) => (
          <details key={faq.q}>
            <summary>{faq.q}</summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </div>
      <JsonLd data={faqJsonLd(faqs)} />
    </section>
  );
}
