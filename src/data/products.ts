export const productCategories = [
  "Todos",
  "Fotografias, álbuns e molduras",
  "Brindes para sua empresa",
  "Gráfica",
] as const;

export type ProductCategory = Exclude<(typeof productCategories)[number], "Todos">;

export type ProductOptionValue = {
  id: string;
  label: string;
  priceModifier?: number;
};

export type ProductOption = {
  id: string;
  label: string;
  helper?: string;
  control?: "buttons" | "select" | "size";
  values: ProductOptionValue[];
};

export type QuantityRange = {
  id: string;
  label: string;
  min: number;
  max: number;
};

export type Product = {
  slug: string;
  name: string;
  category: ProductCategory;
  shortDescription: string;
  description: string;
  image: string;
  imageAlt: string;
  badge?: string;
  featured?: boolean;
  startingPrice: number | null;
  quantities: number[];
  quantityRanges?: QuantityRange[];
  options: ProductOption[];
  highlights: string[];
  artworkGuidance: string;
};

export const products: Product[] = [
  {
    slug: "revelacao-de-fotos",
    name: "Revelação de fotos",
    category: "Fotografias, álbuns e molduras",
    shortDescription: "Suas melhores lembranças impressas com cuidado e definição.",
    description:
      "Escolha tamanho, tipo de papel e quantidade. A equipe confere os arquivos antes de confirmar o orçamento e o prazo.",
    image: "/images/revelacao-fotos.webp",
    imageAlt: "Tiras de fotografias impressas sendo seguradas",
    badge: "Mais pedido",
    featured: true,
    startingPrice: null,
    quantities: [1, 11, 21, 51],
    quantityRanges: [
      { id: "1-10", label: "1 a 10 fotos", min: 1, max: 10 },
      { id: "11-20", label: "11 a 20 fotos", min: 11, max: 20 },
      { id: "21-50", label: "21 a 50 fotos", min: 21, max: 50 },
      { id: "51-100", label: "51 a 100 fotos", min: 51, max: 100 },
    ],
    options: [
      {
        id: "material",
        label: "Material",
        control: "select",
        values: [
          { id: "fujifilm", label: "Papel Fotográfico Fujifilm" },
        ],
      },
      {
        id: "tamanho",
        label: "Tamanho",
        control: "size",
        values: [
          { id: "10x15", label: "10 × 15 cm" },
          { id: "13x18", label: "13 × 18 cm" },
          { id: "15x21", label: "15 × 21 cm" },
        ],
      },
      {
        id: "papel",
        label: "Papel",
        values: [
          { id: "fosco", label: "Fosco" },
          { id: "brilhante", label: "Brilhante" },
        ],
      },
      {
        id: "acabamento",
        label: "Acabamento",
        values: [
          { id: "com-borda", label: "Com borda" },
          { id: "sem-borda", label: "Sem borda" },
        ],
      },
    ],
    highlights: ["Conferência dos arquivos", "Opções de papel", "Vários tamanhos"],
    artworkGuidance: "Envie as fotos em JPG ou PNG na melhor resolução disponível.",
  },
  {
    slug: "quadro-personalizado",
    name: "Quadro personalizado",
    category: "Fotografias, álbuns e molduras",
    shortDescription: "Arte, fotografia e acabamento para transformar o ambiente.",
    description:
      "Monte um quadro com sua imagem favorita e escolha formato, orientação e acabamento para receber uma cotação personalizada.",
    image: "/images/quadro-personalizado.webp",
    imageAlt: "Quadro com ilustração colorida em moldura preta",
    badge: "Destaque",
    featured: true,
    startingPrice: null,
    quantities: [1, 2, 5, 10],
    options: [
      {
        id: "tamanho",
        label: "Tamanho",
        values: [
          { id: "a4", label: "A4" },
          { id: "a3", label: "A3" },
          { id: "40x60", label: "40 × 60 cm" },
        ],
      },
      {
        id: "orientacao",
        label: "Orientação",
        values: [
          { id: "vertical", label: "Vertical" },
          { id: "horizontal", label: "Horizontal" },
          { id: "quadrado", label: "Quadrado" },
        ],
      },
      {
        id: "acabamento",
        label: "Acabamento",
        values: [
          { id: "preto", label: "Moldura preta" },
          { id: "branco", label: "Moldura branca" },
          { id: "madeira", label: "Tom de madeira" },
        ],
      },
    ],
    highlights: ["Composição sob medida", "Acabamento cuidadoso", "Pronto para decorar"],
    artworkGuidance: "Prefira imagens em alta resolução, sem capturas de tela ou compressão de mensageiros.",
  },
  {
    slug: "porta-retrato-personalizado",
    name: "Porta-retrato personalizado",
    category: "Fotografias, álbuns e molduras",
    shortDescription: "Um jeito afetivo de deixar boas memórias sempre por perto.",
    description:
      "Selecione o tamanho, a orientação e o estilo. A foto pode ser enviada agora ou diretamente no atendimento.",
    image: "/images/porta-retrato.webp",
    imageAlt: "Porta-retrato preto com fotografia de paisagem",
    featured: true,
    startingPrice: null,
    quantities: [1, 2, 5, 10],
    options: [
      {
        id: "tamanho",
        label: "Tamanho",
        values: [
          { id: "10x15", label: "10 × 15 cm" },
          { id: "13x18", label: "13 × 18 cm" },
          { id: "15x21", label: "15 × 21 cm" },
        ],
      },
      {
        id: "orientacao",
        label: "Orientação",
        values: [
          { id: "retrato", label: "Retrato" },
          { id: "paisagem", label: "Paisagem" },
        ],
      },
      {
        id: "cor",
        label: "Cor da moldura",
        values: [
          { id: "preta", label: "Preta" },
          { id: "branca", label: "Branca" },
          { id: "natural", label: "Natural" },
        ],
      },
    ],
    highlights: ["Foto incluída na cotação", "Uso vertical ou horizontal", "Presente afetivo"],
    artworkGuidance: "Envie a foto em JPG ou PNG e indique se deseja algum recorte específico.",
  },
  {
    slug: "fotoalbum-personalizado",
    name: "Fotoálbum personalizado",
    category: "Fotografias, álbuns e molduras",
    shortDescription: "Uma história inteira organizada em páginas para guardar e compartilhar.",
    description:
      "Defina formato, capa e quantidade de páginas. A diagramação e a disponibilidade são alinhadas com a equipe no WhatsApp.",
    image: "/images/fotoalbum.webp",
    imageAlt: "Fotoálbum personalizado com retrato infantil na capa",
    badge: "Memórias",
    featured: true,
    startingPrice: null,
    quantities: [1, 2, 5],
    options: [
      {
        id: "formato",
        label: "Formato",
        values: [
          { id: "quadrado", label: "Quadrado" },
          { id: "paisagem", label: "Paisagem" },
          { id: "retrato", label: "Retrato" },
        ],
      },
      {
        id: "capa",
        label: "Capa",
        values: [
          { id: "fotografica", label: "Capa fotográfica" },
          { id: "personalizada", label: "Capa personalizada" },
        ],
      },
      {
        id: "paginas",
        label: "Páginas",
        values: [
          { id: "20", label: "20 páginas" },
          { id: "30", label: "30 páginas" },
          { id: "40", label: "40 páginas" },
        ],
      },
    ],
    highlights: ["Projeto personalizado", "Capa com sua identidade", "Conferência antes de produzir"],
    artworkGuidance: "Separe as fotos em uma pasta e envie os arquivos originais, preferencialmente numerados.",
  },
  {
    slug: "caneca-personalizada",
    name: "Caneca personalizada",
    category: "Brindes para sua empresa",
    shortDescription: "Fotos, frases ou marcas em um presente útil e cheio de personalidade.",
    description:
      "Configure o modelo, a cor e a área de personalização. A equipe valida a arte e confirma a disponibilidade.",
    image: "/images/canecas-personalizadas.webp",
    imageAlt: "Conjunto de canecas personalizadas com fotografias",
    badge: "Presenteável",
    featured: true,
    startingPrice: null,
    quantities: [1, 5, 10, 25, 50],
    options: [
      {
        id: "modelo",
        label: "Modelo",
        values: [
          { id: "branca", label: "Branca clássica" },
          { id: "interior-colorido", label: "Interior colorido" },
          { id: "magica", label: "Mágica" },
        ],
      },
      {
        id: "capacidade",
        label: "Capacidade",
        values: [
          { id: "325ml", label: "325 ml" },
          { id: "demais", label: "Outro formato — consultar" },
        ],
      },
      {
        id: "impressao",
        label: "Área de impressão",
        values: [
          { id: "uma-face", label: "Uma face" },
          { id: "envolvente", label: "Arte envolvente" },
        ],
      },
    ],
    highlights: ["Para fotos ou marcas", "Pedidos unitários ou em lote", "Conferência de arte"],
    artworkGuidance: "Envie JPG, PNG ou PDF. Arquivos com fundo transparente devem ser enviados em PNG.",
  },
  {
    slug: "copo-termico-personalizado",
    name: "Copo térmico personalizado",
    category: "Brindes para sua empresa",
    shortDescription: "Um brinde de presença para eventos, equipes e ocasiões especiais.",
    description:
      "Defina modelo, cor e tipo de personalização para receber um orçamento conforme a quantidade.",
    image: "/images/copo-termico.webp",
    imageAlt: "Copo térmico azul personalizado com logotipo",
    featured: true,
    startingPrice: null,
    quantities: [1, 5, 10, 25, 50],
    options: [
      {
        id: "modelo",
        label: "Modelo",
        values: [
          { id: "termico", label: "Térmico" },
          { id: "long-drink", label: "Long drink" },
          { id: "com-tampa", label: "Com tampa" },
        ],
      },
      {
        id: "cor",
        label: "Cor",
        values: [
          { id: "azul", label: "Azul" },
          { id: "preto", label: "Preto" },
          { id: "outra", label: "Outra — consultar" },
        ],
      },
      {
        id: "personalizacao",
        label: "Personalização",
        values: [
          { id: "logo", label: "Logotipo" },
          { id: "nome", label: "Nome individual" },
          { id: "arte", label: "Arte completa" },
        ],
      },
    ],
    highlights: ["Personalização individual ou em lote", "Cores sob consulta", "Ideal para brindes"],
    artworkGuidance: "Envie a marca em PDF, SVG, AI ou PNG com fundo transparente.",
  },
  {
    slug: "cartao-de-visita",
    name: "Cartão de visita",
    category: "Gráfica",
    shortDescription: "Uma apresentação profissional com acabamento alinhado à sua marca.",
    description:
      "Selecione papel, impressão e acabamento. Os dados são demonstrativos até a confirmação da disponibilidade.",
    image: "/images/cartao-visita.webp",
    imageAlt: "Cartões de visita minimalistas sobre superfície branca",
    badge: "Sua marca",
    featured: true,
    startingPrice: null,
    quantities: [50, 100, 250, 500, 1000],
    options: [
      {
        id: "papel",
        label: "Papel",
        values: [
          { id: "couche-brilho", label: "Couché brilho" },
          { id: "couche-fosco", label: "Couché fosco" },
          { id: "especial", label: "Especial — consultar" },
        ],
      },
      {
        id: "impressao",
        label: "Impressão",
        values: [
          { id: "frente", label: "Frente" },
          { id: "frente-verso", label: "Frente e verso" },
        ],
      },
      {
        id: "acabamento",
        label: "Acabamento",
        values: [
          { id: "refile", label: "Refile" },
          { id: "laminacao", label: "Laminação fosca" },
          { id: "verniz", label: "Verniz localizado — consultar" },
        ],
      },
    ],
    highlights: ["Frente ou frente e verso", "Acabamentos sob consulta", "Arquivo conferido"],
    artworkGuidance: "Envie PDF em alta qualidade, com sangria e fontes convertidas em curvas quando possível.",
  },
  {
    slug: "panfletos-e-folders",
    name: "Panfletos e folders",
    category: "Gráfica",
    shortDescription: "Divulgação clara para campanhas, cardápios, eventos e negócios.",
    description:
      "Escolha o formato, o papel e as dobras. A produção é cotada conforme a combinação e a tiragem.",
    image: "/images/panfletos-folders.webp",
    imageAlt: "Materiais impressos diagramados sobre uma mesa",
    startingPrice: null,
    quantities: [50, 100, 250, 500, 1000],
    options: [
      {
        id: "formato",
        label: "Formato",
        values: [
          { id: "a6", label: "A6" },
          { id: "a5", label: "A5" },
          { id: "a4", label: "A4" },
        ],
      },
      {
        id: "papel",
        label: "Papel",
        values: [
          { id: "couche-brilho", label: "Couché brilho" },
          { id: "couche-fosco", label: "Couché fosco" },
          { id: "sulfite", label: "Sulfite" },
        ],
      },
      {
        id: "dobra",
        label: "Dobra",
        values: [
          { id: "sem-dobra", label: "Sem dobra" },
          { id: "uma-dobra", label: "Uma dobra" },
          { id: "duas-dobras", label: "Duas dobras" },
        ],
      },
    ],
    highlights: ["Diversos formatos", "Opções de dobra", "Tiragens variadas"],
    artworkGuidance: "Envie o arquivo fechado em PDF, com sangria e margens de segurança.",
  },
  {
    slug: "tags-personalizadas",
    name: "Tags personalizadas",
    category: "Gráfica",
    shortDescription: "Detalhes que valorizam embalagens, presentes e produtos artesanais.",
    description:
      "Configure formato, papel e perfuração. A equipe confirma medidas especiais e acabamentos no atendimento.",
    image: "/images/tags-personalizadas.webp",
    imageAlt: "Conjunto de tags azuis personalizadas",
    featured: true,
    startingPrice: null,
    quantities: [25, 50, 100, 250, 500],
    options: [
      {
        id: "formato",
        label: "Formato",
        values: [
          { id: "retangular", label: "Retangular" },
          { id: "quadrada", label: "Quadrada" },
          { id: "especial", label: "Especial — consultar" },
        ],
      },
      {
        id: "papel",
        label: "Papel",
        values: [
          { id: "couche", label: "Couché" },
          { id: "kraft", label: "Kraft" },
          { id: "especial", label: "Especial — consultar" },
        ],
      },
      {
        id: "acabamento",
        label: "Acabamento",
        values: [
          { id: "sem-furo", label: "Sem furo" },
          { id: "com-furo", label: "Com furo" },
          { id: "cordao", label: "Com cordão — consultar" },
        ],
      },
    ],
    highlights: ["Para produtos e presentes", "Formatos variados", "Perfuração opcional"],
    artworkGuidance: "Envie PDF vetorial ou PNG de alta resolução. Para corte especial, inclua a linha de corte.",
  },
  {
    slug: "adesivos-e-etiquetas",
    name: "Adesivos e etiquetas",
    category: "Gráfica",
    shortDescription: "Identidade e organização para embalagens, vitrines e produtos.",
    description:
      "Escolha material, formato e corte. Medidas personalizadas são confirmadas antes do orçamento final.",
    image: "/images/adesivos-etiquetas.webp",
    imageAlt: "Etiquetas redondas personalizadas aplicadas em embalagens",
    badge: "Versátil",
    featured: true,
    startingPrice: null,
    quantities: [25, 50, 100, 250, 500],
    options: [
      {
        id: "material",
        label: "Material",
        values: [
          { id: "papel", label: "Papel adesivo" },
          { id: "vinil", label: "Vinil" },
          { id: "transparente", label: "Transparente — consultar" },
        ],
      },
      {
        id: "formato",
        label: "Formato",
        values: [
          { id: "redondo", label: "Redondo" },
          { id: "quadrado", label: "Quadrado" },
          { id: "personalizado", label: "Corte personalizado" },
        ],
      },
      {
        id: "acabamento",
        label: "Acabamento",
        values: [
          { id: "brilho", label: "Brilho" },
          { id: "fosco", label: "Fosco" },
          { id: "sem-laminacao", label: "Sem laminação" },
        ],
      },
    ],
    highlights: ["Cortes variados", "Para uso interno ou externo sob consulta", "Tamanhos personalizados"],
    artworkGuidance: "Para recorte personalizado, envie PDF, SVG ou AI com o contorno de corte indicado.",
  },
  {
    slug: "brindes-corporativos",
    name: "Brindes corporativos",
    category: "Brindes para sua empresa",
    shortDescription: "Kits e itens personalizados para equipes, clientes e eventos.",
    description:
      "Monte uma solicitação com o tipo de item, a ocasião e a quantidade. A equipe sugere combinações disponíveis.",
    image: "/images/brindes-corporativos.webp",
    imageAlt: "Camisa polo preta personalizada com marca bordada",
    badge: "Empresas",
    featured: true,
    startingPrice: null,
    quantities: [10, 25, 50, 100, 250],
    options: [
      {
        id: "linha",
        label: "Linha",
        values: [
          { id: "vestuario", label: "Vestuário" },
          { id: "escritorio", label: "Escritório" },
          { id: "kits", label: "Kits personalizados" },
        ],
      },
      {
        id: "aplicacao",
        label: "Aplicação",
        values: [
          { id: "logo", label: "Logotipo" },
          { id: "campanha", label: "Arte de campanha" },
          { id: "nominal", label: "Personalização nominal" },
        ],
      },
      {
        id: "objetivo",
        label: "Objetivo",
        values: [
          { id: "equipe", label: "Equipe" },
          { id: "clientes", label: "Clientes" },
          { id: "evento", label: "Evento" },
        ],
      },
    ],
    highlights: ["Combinações sob medida", "Atendimento consultivo", "Pedidos em volume"],
    artworkGuidance: "Envie a identidade visual e descreva o objetivo do kit para orientarmos os formatos adequados.",
  },
];

export const featuredProducts = products.filter((product) => product.featured).slice(0, 8);

export function getProductBySlug(slug: string) {
  return products.find((product) => product.slug === slug);
}
