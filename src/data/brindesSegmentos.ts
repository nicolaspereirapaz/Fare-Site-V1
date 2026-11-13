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
    slug: "contabilidade",
    name: "escritórios de contabilidade",
    color: "#1d3c63",
    banner: {
      pc: "/images/segmentos/contabilidade-pc.webp",
      mobile: "/images/segmentos/contabilidade-celular.webp",
      alt: "Brindes para escritórios de contabilidade: kit executivo, bloco, copo térmico, garrafa térmica e caneta com a sua marca.",
    },
    title: "Brindes para **escritórios de contabilidade**",
    slogan: "Presentes de fim de ano para quem confia as contas a você.",
    showcaseEyebrow: "Seleção de fim de ano para contabilidade",
    showcaseTitle: "Presentes de **fim de ano** para os seus clientes",
    showcaseLead: "Kit executivo, bloco com caneta e copo térmico com a logo do escritório, para agradecer a parceria de mais um ano.",
    metaTitle: "Brindes Personalizados para Escritórios de Contabilidade em Jundiaí | Fare Foto",
    description: "Brindes para escritórios de contabilidade presentearem os clientes no fim de ano: kits executivos, blocos, canetas, copos e garrafas térmicas com a sua logo.",
    keywords: ["brindes para contabilidade", "brindes para escritório de contabilidade", "brindes para contador", "brindes para clientes", "presente de fim de ano para clientes", "brindes corporativos", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para o meu escritório de contabilidade.",
    faq: [
      { q: "Quais brindes combinam com escritórios de contabilidade?", a: "Kits executivos, blocos com caneta, canetas de metal e copos e garrafas térmicas estão entre os mais pedidos: ficam na mesa do cliente o ano todo. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem escritórios de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "imobiliarias-e-construtoras",
    name: "imobiliárias, corretores e construtoras",
    color: "#53643a",
    banner: {
      pc: "/images/segmentos/imobiliarias-e-construtoras-pc.webp",
      mobile: "/images/segmentos/imobiliarias-e-construtoras-celular.webp",
      alt: "Brindes para imobiliárias e construtoras: garrafa térmica, copo térmico, bloco, kit churrasco e vinho, chaveiros e caneta com a sua marca.",
    },
    title: "Brindes para **imobiliárias e construtoras**",
    slogan: "Presentes de fim de ano com a sua marca na casa nova.",
    showcaseEyebrow: "Seleção de fim de ano para imobiliárias e construtoras",
    showcaseTitle: "Presentes de **fim de ano** para clientes, parceiros e equipe",
    showcaseLead: "Kit churrasco para celebrar a casa nova, chaveiro com a sua logo e garrafas térmicas para a equipe de obra.",
    metaTitle: "Brindes Personalizados para Imobiliárias, Corretores e Construtoras em Jundiaí | Fare Foto",
    description: "Brindes para imobiliárias, corretores e construtoras: chaveiros para a entrega das chaves, kits churrasco e vinho, garrafas e copos térmicos com a sua logo.",
    keywords: ["brindes para imobiliária", "brindes para corretor de imóveis", "brindes para construtora", "chaveiro personalizado para imobiliária", "presente na entrega das chaves", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para a minha imobiliária, corretora ou construtora.",
    faq: [
      { q: "Qual o brinde ideal para a entrega das chaves?", a: "O chaveiro personalizado é o clássico: o cliente leva a sua marca junto com a chave da casa nova. Para uma lembrança maior, o kit churrasco e vinho é um ótimo presente. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem imobiliárias e construtoras de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "advocacia",
    name: "escritórios de advocacia",
    color: "#621a2c",
    banner: {
      pc: "/images/segmentos/advocacia-pc.webp",
      mobile: "/images/segmentos/advocacia-celular.webp",
      alt: "Brindes para escritórios de advocacia: kit executivo, bloco, copo térmico, kit vinho, kit churrasco e caneta com a sua marca.",
    },
    title: "Brindes para **escritórios de advocacia**",
    slogan: "Presentes de fim de ano que fortalecem a relação com seus clientes.",
    showcaseEyebrow: "Seleção de fim de ano para advocacia",
    showcaseTitle: "Presentes de **fim de ano** para clientes e parceiros",
    showcaseLead: "Canetas de metal, kits executivos e kit vinho, com acabamento à altura do seu escritório.",
    metaTitle: "Brindes Personalizados para Escritórios de Advocacia em Jundiaí | Fare Foto",
    description: "Brindes para escritórios de advocacia: canetas de metal, kits executivos, kits vinho e blocos com a sua logo para presentear clientes e parceiros.",
    keywords: ["brindes para advogados", "brindes para escritório de advocacia", "presente para clientes de advocacia", "caneta personalizada", "kit executivo personalizado", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para o meu escritório de advocacia.",
    faq: [
      { q: "Quais brindes combinam com escritórios de advocacia?", a: "Canetas de metal gravadas a laser, kits executivos e kits vinho estão entre os mais escolhidos para presentear clientes e parceiros. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem escritórios de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "industrias-e-logistica",
    name: "indústrias e logística",
    color: "#384855",
    banner: {
      pc: "/images/segmentos/industrias-e-logistica-pc.webp",
      mobile: "/images/segmentos/industrias-e-logistica-celular.webp",
      alt: "Brindes para indústrias e logística: garrafas, bolsa térmica, copo térmico e chaveiros com a sua marca.",
    },
    title: "Brindes para **indústrias e logística**",
    slogan: "Neste fim de ano, reconheça quem faz a empresa andar.",
    showcaseEyebrow: "Seleção de fim de ano para indústrias e logística",
    showcaseTitle: "Presentes de **fim de ano** para toda a equipe",
    showcaseLead: "Garrafas, copos e bolsas térmicas resistentes, que acompanham a equipe no turno, na estrada e em casa.",
    metaTitle: "Brindes Personalizados para Indústrias e Logística em Jundiaí | Fare Foto",
    description: "Brindes para indústrias e transportadoras presentearem a equipe no fim de ano e na SIPAT: garrafas e copos térmicos, bolsas térmicas, squeezes e chaveiros com a sua logo.",
    keywords: ["brindes para indústria", "brindes para SIPAT", "brindes para funcionários", "brindes para transportadora", "brindes para logística", "garrafa térmica personalizada", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para os colaboradores da minha empresa.",
    faq: [
      { q: "Quais brindes funcionam bem na SIPAT e no fim de ano?", a: "Garrafas e copos térmicos, squeezes e bolsas térmicas: são úteis no dia a dia da equipe e levam a marca da empresa para casa. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem indústrias e transportadoras de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "clinicas-odontologicas",
    name: "clínicas odontológicas",
    color: "#1b6ea2",
    banner: {
      pc: "/images/segmentos/clinicas-odontologicas-pc.webp",
      mobile: "/images/segmentos/clinicas-odontologicas-celular.webp",
      alt: "Brindes para clínicas odontológicas: nécessaire, squeeze, garrafa, bloco, chaveiros e caneta com a sua marca.",
    },
    title: "Brindes para **clínicas odontológicas**",
    slogan: "Neste fim de ano, sua marca no sorriso dos pacientes.",
    showcaseEyebrow: "Seleção de fim de ano para odontologia",
    showcaseTitle: "Presentes de **fim de ano** para pacientes e equipe",
    showcaseLead: "Nécessaires, squeezes e itens do dia a dia que lembram o paciente da sua clínica o ano todo.",
    metaTitle: "Brindes Personalizados para Clínicas Odontológicas e Dentistas em Jundiaí | Fare Foto",
    description: "Brindes para clínicas odontológicas e dentistas: nécessaires, squeezes, garrafas, blocos, canetas e chaveiros com a sua logo para pacientes e equipe.",
    keywords: ["brindes para dentista", "brindes para clínica odontológica", "brindes para consultório odontológico", "brindes para pacientes", "nécessaire personalizada", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para a minha clínica odontológica.",
    faq: [
      { q: "Quais brindes combinam com clínicas odontológicas?", a: "A nécessaire personalizada é uma ótima escolha: vai na bolsa do paciente todos os dias. Squeezes, garrafas, blocos, canetas e chaveiros completam a seleção. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem clínicas e consultórios de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
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
  {
    slug: "concessionarias-e-oficinas",
    name: "concessionárias, oficinas e autopeças",
    color: "#393b3f",
    banner: {
      pc: "/images/segmentos/concessionarias-e-oficinas-pc.webp",
      mobile: "/images/segmentos/concessionarias-e-oficinas-celular.webp",
      alt: "Brindes para concessionárias e oficinas: garrafas, copo térmico, kit executivo e chaveiros com a sua marca.",
    },
    title: "Brindes para **concessionárias e oficinas**",
    slogan: "Neste fim de ano, sua marca na estrada com o cliente.",
    showcaseEyebrow: "Seleção de fim de ano para concessionárias, oficinas e autopeças",
    showcaseTitle: "Presentes de **fim de ano** para os seus clientes",
    showcaseLead: "Chaveiro com a sua logo, copo térmico para o dia a dia e kits para os clientes especiais.",
    metaTitle: "Brindes Personalizados para Concessionárias, Oficinas e Autopeças em Jundiaí | Fare Foto",
    description: "Brindes para concessionárias, oficinas mecânicas e autopeças: chaveiros para a entrega do carro, copos e garrafas térmicas, squeezes e kits executivos com a sua logo.",
    keywords: ["brindes para concessionária", "brindes para oficina mecânica", "brindes para autopeças", "chaveiro personalizado para concessionária", "brindes para clientes", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para a minha concessionária, oficina ou loja de autopeças.",
    faq: [
      { q: "Qual o brinde ideal para a entrega do carro?", a: "O chaveiro personalizado vai junto com a chave e fica com o cliente todos os dias. O copo térmico é outra boa escolha para quem passa muito tempo no carro. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem concessionárias e oficinas de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "academias",
    name: "academias, pilates e crossfit",
    color: "#01835d",
    banner: {
      pc: "/images/segmentos/academias-pc.webp",
      mobile: "/images/segmentos/academias-celular.webp",
      alt: "Brindes para academias: bolsa térmica, garrafas, squeeze e chaveiros com a sua marca.",
    },
    title: "Brindes para **academias, pilates e crossfit**",
    slogan: "Neste fim de ano, sua marca em cada treino.",
    showcaseEyebrow: "Seleção de fim de ano para academias e estúdios",
    showcaseTitle: "Presentes de **fim de ano** para alunos e equipe",
    showcaseLead: "Squeezes, garrafas e bolsas térmicas que vão para o treino e deixam a sua marca sempre à vista.",
    metaTitle: "Brindes Personalizados para Academias, Pilates e Crossfit em Jundiaí | Fare Foto",
    description: "Brindes para academias, estúdios de pilates e boxes de crossfit: squeezes, garrafas, garrafas e bolsas térmicas e chaveiros com a sua logo para alunos e equipe.",
    keywords: ["brindes para academia", "squeeze personalizado para academia", "brindes para alunos", "brindes para pilates", "brindes para crossfit", "garrafa personalizada", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para a minha academia ou estúdio.",
    faq: [
      { q: "Quais brindes combinam com academias e estúdios?", a: "O squeeze é o clássico do treino. Garrafas, garrafas térmicas, bolsas térmicas e chaveiros completam a seleção para matrículas, aniversários de alunos e fim de ano. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem academias e estúdios de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "saloes-e-estetica",
    name: "salões de beleza e clínicas de estética",
    color: "#a1556c",
    banner: {
      pc: "/images/segmentos/saloes-e-estetica-pc.webp",
      mobile: "/images/segmentos/saloes-e-estetica-celular.webp",
      alt: "Brindes para salões de beleza e estética: bloco, nécessaire, garrafa, copo térmico e chaveiros com a sua marca.",
    },
    title: "Brindes para **salões de beleza e estética**",
    slogan: "Presentes de fim de ano que a cliente leva para casa.",
    showcaseEyebrow: "Seleção de fim de ano para salões e estética",
    showcaseTitle: "Presentes de **fim de ano** para clientes e equipe",
    showcaseLead: "A nécessaire é o destaque: útil, elegante e sempre na bolsa da cliente, com a sua marca.",
    metaTitle: "Brindes Personalizados para Salões de Beleza e Clínicas de Estética em Jundiaí | Fare Foto",
    description: "Brindes para salões de beleza e clínicas de estética: nécessaires, squeezes, copos térmicos, blocos, canetas e chaveiros com a sua logo para clientes e equipe.",
    keywords: ["brindes para salão de beleza", "brindes para clínica de estética", "nécessaire personalizada", "brindes para clientes", "brindes de beleza", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para o meu salão de beleza ou clínica de estética.",
    faq: [
      { q: "Quais brindes combinam com salões e clínicas de estética?", a: "A nécessaire personalizada é a escolha certa: vai na bolsa da cliente todos os dias. Squeezes, copos térmicos, blocos e chaveiros completam a seleção. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem salões e clínicas de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "escolas",
    name: "escolas e faculdades",
    color: "#3a4da1",
    banner: {
      pc: "/images/segmentos/escolas-pc.webp",
      mobile: "/images/segmentos/escolas-celular.webp",
      alt: "Brindes para escolas e faculdades: garrafas, bloco, kit executivo, bolsa térmica e caneta com a sua marca.",
    },
    title: "Brindes para **escolas e faculdades**",
    slogan: "No fim do ano letivo, gratidão a quem ensina todos os dias.",
    showcaseEyebrow: "Seleção de fim de ano para escolas e faculdades",
    showcaseTitle: "Presentes de **fim de ano** para professores e funcionários",
    showcaseLead: "Blocos, canetas, garrafas e kits para agradecer a equipe no fim do ano letivo.",
    metaTitle: "Brindes Personalizados para Escolas e Faculdades em Jundiaí | Fare Foto",
    description: "Brindes para escolas e faculdades presentearem professores e funcionários no fim do ano letivo: blocos, canetas, kits executivos, squeezes, garrafas e bolsas térmicas com a sua logo.",
    keywords: ["brindes para professores", "brindes para escola", "presente de fim de ano para professores", "brindes para faculdade", "brindes para funcionários", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para a minha escola ou faculdade.",
    faq: [
      { q: "Quais brindes combinam com professores e funcionários?", a: "Blocos com caneta, kits executivos, squeezes, garrafas e bolsas térmicas são úteis na sala de aula e fora dela. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem escolas e faculdades de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende escolas e empresas da cidade e da região." },
    ],
  },
  {
    slug: "veterinarias-e-pet-shops",
    name: "clínicas veterinárias e pet shops",
    color: "#196f84",
    banner: {
      pc: "/images/segmentos/veterinarias-e-pet-shops-pc.webp",
      mobile: "/images/segmentos/veterinarias-e-pet-shops-celular.webp",
      alt: "Brindes para veterinárias e pet shops: bolsa térmica, garrafas, copo térmico e chaveiros com a sua marca.",
    },
    title: "Brindes para **veterinárias e pet shops**",
    slogan: "Presentes de fim de ano para quem cuida de quem tem quatro patas.",
    showcaseEyebrow: "Seleção de fim de ano para veterinárias e pet shops",
    showcaseTitle: "Presentes de **fim de ano** para tutores e equipe",
    showcaseLead: "Squeezes, chaveiros e bolsas térmicas para o passeio, com a sua marca sempre perto do tutor.",
    metaTitle: "Brindes Personalizados para Clínicas Veterinárias e Pet Shops em Jundiaí | Fare Foto",
    description: "Brindes para clínicas veterinárias e pet shops presentearem os tutores: squeezes, garrafas, chaveiros, copos e bolsas térmicas com a sua logo.",
    keywords: ["brindes para pet shop", "brindes para clínica veterinária", "brindes para veterinário", "brindes para tutores", "chaveiro personalizado", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para a minha clínica veterinária ou pet shop.",
    faq: [
      { q: "Quais brindes combinam com veterinárias e pet shops?", a: "Squeezes, garrafas e bolsas térmicas acompanham o tutor no passeio, e o chaveiro fica com ele todos os dias. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem veterinárias e pet shops de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
  {
    slug: "seguros-e-cooperativas",
    name: "corretoras de seguros e cooperativas de crédito",
    color: "#2c6053",
    banner: {
      pc: "/images/segmentos/seguros-e-cooperativas-pc.webp",
      mobile: "/images/segmentos/seguros-e-cooperativas-celular.webp",
      alt: "Brindes para corretoras de seguros e cooperativas: copo térmico, kit executivo, garrafa térmica, bloco e caneta com a sua marca.",
    },
    title: "Brindes para **corretoras e cooperativas**",
    slogan: "Presentes de fim de ano que ficam na mesa do cliente.",
    showcaseEyebrow: "Seleção de fim de ano para seguros e cooperativas",
    showcaseTitle: "Presentes de **fim de ano** para clientes, cooperados e equipe",
    showcaseLead: "Canetas, blocos e kits executivos para agradecer a confiança de mais um ano.",
    metaTitle: "Brindes Personalizados para Corretoras de Seguros e Cooperativas em Jundiaí | Fare Foto",
    description: "Brindes para corretoras de seguros e cooperativas de crédito presentearem clientes e cooperados: canetas, blocos, kits executivos, copos e garrafas térmicas com a sua logo.",
    keywords: ["brindes para corretora de seguros", "brindes para cooperativa de crédito", "brindes para cooperados", "brindes para clientes", "caneta personalizada", "brindes Jundiaí"],
    whatsApp: "Olá! Quero um orçamento de brindes de fim de ano para a minha corretora de seguros ou cooperativa.",
    faq: [
      { q: "Quais brindes combinam com corretoras e cooperativas?", a: "Canetas de metal, blocos e kits executivos ficam na mesa do cliente o ano todo. Copos e garrafas térmicas são presentes úteis no dia a dia. No catálogo completo do site você encontra centenas de outras opções." },
      COMO_PEDIR,
      { q: "Vocês atendem corretoras e cooperativas de Jundiaí e região?", a: "Sim. A Fare Foto é de Jundiaí e atende empresas da cidade e da região." },
    ],
  },
];

export const findSegment = (slug: string) => SEGMENTS.find((segment) => segment.slug === slug);
