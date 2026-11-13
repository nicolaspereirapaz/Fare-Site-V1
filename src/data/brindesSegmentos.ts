import type { Faq } from "@/lib/seo";

/**
 * Páginas de brindes por segmento de empresa (/brindes/segmentos/<slug>), enviadas pelo WhatsApp na
 * campanha de fim de ano. Cada segmento tem banner e textos próprios; a vitrine (BRINDES_VITRINE) é a
 * mesma em todos e cada brinde leva à categoria no catálogo do site.
 * Nos títulos, **palavra** aparece destacada.
 */
export type SegmentCard = {
  title: string;
  /** Categoria do catálogo aberta pelo brinde (/brindes?categoria=...). */
  category: string;
  /** Foto montada com "SEU LOGO" (em /public). */
  image: string;
};

export type Segment = {
  slug: string;
  /** Nome como aparece no meio da frase ("Perguntas frequentes sobre brindes para ..."). */
  name: string;
  /** Cor da parede do banner, atrás da arte enquanto ela carrega. */
  color: string;
  /** Arte sem texto (em /public): computador 2400x800 (3:1) e celular 1024x1536 (2:3). */
  banner: { pc: string; mobile: string; alt: string };
  /** Título do banner: o trecho em **...** vai para a segunda linha, destacado. */
  title: string;
  slogan: string;
  showcaseEyebrow: string;
  showcaseTitle: string;
  showcaseLead: string;
  metaTitle: string;
  description: string;
  keywords: string[];
  whatsApp: string;
  faq: Faq[];
};

// Tipos de brinde vindos da seleção do PED-0342 e do ORC-0340 (+ nécessaire, bolsa térmica e kits churrasco/vinho).
export const BRINDES_VITRINE: SegmentCard[] = [
  { title: "Squeeze", category: "Garrafas e Squeezes", image: "/images/segmentos/brindes/squeeze.webp" },
  { title: "Garrafa", category: "Garrafas e Squeezes", image: "/images/segmentos/brindes/garrafa.webp" },
  { title: "Garrafa térmica", category: "Garrafas e Squeezes", image: "/images/segmentos/brindes/garrafa-termica.webp" },
  { title: "Copos térmicos", category: "Canecas, Copos e Taças", image: "/images/segmentos/brindes/copo-termico.webp" },
  { title: "Canetas", category: "Canetas e Lápis", image: "/images/segmentos/brindes/caneta.webp" },
  { title: "Bloco de anotações", category: "Cadernos e Agendas", image: "/images/segmentos/brindes/bloco.webp" },
  { title: "Bolsa térmica", category: "Bolsas Térmicas e Marmitas", image: "/images/segmentos/brindes/bolsa-termica.webp" },
  { title: "Nécessaire", category: "Necessaires e Estojos", image: "/images/segmentos/brindes/necessaire.webp" },
  { title: "Chaveiros", category: "Chaveiros", image: "/images/segmentos/brindes/chaveiro.webp" },
  { title: "Kit executivo", category: "Kits Executivos", image: "/images/segmentos/brindes/kit-executivo.webp" },
  { title: "Kit churrasco e vinho", category: "Churrasco, Vinho e Queijo", image: "/images/segmentos/brindes/kit-churrasco-vinho.webp" },
];

const COMO_PEDIR: Faq = {
  q: "Como pedir um orçamento?",
  a: "Escolha os produtos, a cor e a quantidade e envie pelo carrinho, ou fale com a equipe pelo WhatsApp. A Fare Foto confere a arte e combina valor e prazo.",
};

export const SEGMENTS: Segment[] = [
  {
    slug: "rh-de-empresas",
    name: "RH de empresas",
    color: "#5f4196",
    banner: {
      pc: "/images/segmentos/rh-de-empresas-pc.webp",
      mobile: "/images/segmentos/rh-de-empresas-celular.webp",
      alt: "Brindes para RH de empresas: kit executivo, bolsa térmica, garrafa térmica, copo térmico, squeeze e caneta com a sua marca.",
    },
    title: "Brindes para **RH de empresas**",
    slogan: "Presentes de fim de ano para quem faz a sua empresa acontecer.",
    showcaseEyebrow: "Seleção de fim de ano para o RH",
    showcaseTitle: "Presentes de **fim de ano** para a sua equipe",
    showcaseLead: "Garrafas, copos térmicos e kits com a marca da empresa, para agradecer a equipe por mais um ano de trabalho.",
    metaTitle: "Brindes Personalizados para Colaboradores e RH em Jundiaí | Fare Foto",
    description:
      "Brindes para o RH presentear colaboradores: kits de boas-vindas e presentes de fim de ano com a logo da empresa. Garrafas e copos térmicos, bolsas térmicas, kits executivos e mais.",
    keywords: ["brindes para funcionários", "brindes para colaboradores", "kit de boas-vindas", "kit onboarding", "presente de fim de ano para funcionários", "brindes corporativos", "brindes Jundiaí"],
    whatsApp: "Olá! Sou do RH e quero um orçamento de brindes de fim de ano para os colaboradores da empresa.",
    faq: [
      { q: "Quais brindes o RH costuma escolher para os colaboradores?", a: "Garrafas e copos térmicos, bolsas térmicas, squeezes e kits executivos estão entre os mais pedidos, tanto no kit de boas-vindas quanto no presente de fim de ano. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem empresas de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "farmacias-e-clinicas",
    name: "farmácias e clínicas médicas",
    color: "#18817d",
    banner: {
      pc: "/images/segmentos/farmacias-e-clinicas-pc.webp",
      mobile: "/images/segmentos/farmacias-e-clinicas-celular.webp",
      alt: "Brindes para farmácias e clínicas: bolsa térmica, garrafas térmicas, copo térmico, squeeze, bloco com caneta e nécessaire com a sua marca.",
    },
    title: "Brindes para **farmácias e clínicas**",
    slogan: "Neste fim de ano, sua marca no cuidado de todo dia.",
    showcaseEyebrow: "Seleção de fim de ano para farmácias e clínicas",
    showcaseTitle: "Presentes de **fim de ano** para clientes, pacientes e equipe",
    showcaseLead: "Presentes úteis no dia a dia, com a sua marca gravada com acabamento profissional.",
    metaTitle: "Brindes Personalizados para Farmácias e Clínicas Médicas em Jundiaí | Fare Foto",
    description:
      "Brindes para farmácias, drogarias, clínicas e consultórios com a sua logo: squeezes, garrafas e copos térmicos, canetas, blocos, bolsas térmicas, nécessaires e kits para presente.",
    keywords: ["brindes para farmácia", "brindes para drogaria", "brindes para clínica médica", "brindes para consultório", "brindes para médicos", "brindes personalizados", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para a minha farmácia ou clínica.",
    faq: [
      { q: "Quais brindes combinam com farmácias e clínicas?", a: "Squeezes, garrafas e copos térmicos, canetas e blocos, bolsas térmicas, nécessaires e kits para presente estão entre os mais pedidos. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem farmácias e clínicas de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
];

export const findSegment = (slug: string) => SEGMENTS.find((segment) => segment.slug === slug);
