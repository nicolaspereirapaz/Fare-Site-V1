/*
 * Gráfica por m² no orçamento/pedido da equipe (Banner Lona, Adesivo Vinil, Vinil Adesivo Recorte Eletrônico):
 * a equipe digita largura e altura em cm, e o preço sai da área × o valor do m² do produto (sempre arredondado
 * para cima, em reais inteiros), com o pedido mínimo do produto no item. Só a equipe usa (orçamento/pedido do painel); o site não mostra.
 * Entra como item fora do catálogo com nome padrão ("Banner Lona 100 × 60 cm"; com cor: "Vinil Adesivo Recorte
 * Eletrônico Preto Brilho 100 × 60 cm") e o preço gravado; como o servidor guarda só o nome, é pelo nome que se
 * reconhece o item para editar de novo.
 */

type GraficaColor = { name: string; image: string };
/** price = valor do m²; minimum = pedido mínimo do item (R$); colors = cores à escolha (a cor entra no nome do item). */
export type GraficaProduct = { id: string; name: string; price: number; minimum: number; image: string; text: string; colors?: readonly GraficaColor[] };

export const GRAFICA_M2 = [
  { id: "banner-lona", name: "Banner Lona", price: 140, minimum: 30, image: "/images/grafica/04-banner-lona.webp", text: "Lona impressa para fachada, eventos e ponto de venda." },
  { id: "adesivo-vinil", name: "Adesivo Vinil", price: 140, minimum: 30, image: "/images/grafica/07-adesivos-etiquetas.webp", text: "Vinil adesivo impresso para vitrine, parede, carro e embalagem." },
  {
    id: "vinil-recorte", name: "Vinil Adesivo Recorte Eletrônico", price: 160, minimum: 25, image: "/images/grafica/09-vinil-recorte-branco-brilho.webp",
    text: "Vinil recortado no formato da arte (sem impressão), para vitrine, parede, carro e placa.",
    colors: [
      { name: "Branco Brilho", image: "/images/grafica/09-vinil-recorte-branco-brilho.webp" },
      { name: "Preto Brilho", image: "/images/grafica/10-vinil-recorte-preto-brilho.webp" },
    ],
  },
] as const satisfies readonly GraficaProduct[];

export type GraficaId = (typeof GRAFICA_M2)[number]["id"];
/** color: só nos produtos com cor (nome da cor, ex.: "Preto Brilho"). */
export type GraficaChoice = { id: GraficaId; width: number; height: number; color?: string };

export const graficaById = (id: GraficaId): GraficaProduct => GRAFICA_M2.find((entry) => entry.id === id)!;

/** Foto do item: a da cor escolhida, quando o produto tem cor. */
export const graficaImage = ({ id, color }: Pick<GraficaChoice, "id" | "color">) => {
  const product = graficaById(id);
  return product.colors?.find((entry) => entry.name === color)?.image ?? product.image;
};

const cm = (value: number) => String(value).replace(".", ",");
export const graficaItemName = ({ id, color, width, height }: GraficaChoice) =>
  `${graficaById(id).name}${color ? ` ${color}` : ""} ${cm(width)} × ${cm(height)} cm`;

const NAME = /^(.+) (\d+(?:,\d+)?) × (\d+(?:,\d+)?) cm$/;

export function graficaFromName(name: string): GraficaChoice | null {
  const match = NAME.exec(name);
  if (!match) return null;
  const size = { width: Number(match[2].replace(",", ".")), height: Number(match[3].replace(",", ".")) };
  for (const product of GRAFICA_M2 as readonly GraficaProduct[]) {
    // Produto com cor sempre traz a cor no nome.
    for (const color of product.colors?.map((entry) => entry.name) ?? [undefined]) {
      const choice: GraficaChoice = { id: product.id as GraficaId, ...size, ...(color ? { color } : {}) };
      if (graficaItemName(choice) === name) return choice;
    }
  }
  return null;
}

/** Área de uma peça em m² (cm × cm / 10.000). */
export const areaM2 = (width: number, height: number) => (width * height) / 10_000;

/**
 * Preço por peça: área × valor do m² do produto, sempre arredondado para cima no real inteiro (R$ 15,52 → R$ 16,00).
 * Se o item todo ficar abaixo do pedido mínimo do produto, o valor por peça sobe (também em reais inteiros, para cima)
 * até o item fechar pelo menos o mínimo.
 */
export function graficaUnitPrice(id: GraficaId, width: number, height: number, quantity: number): { unit: number; minimum: boolean } {
  const { price, minimum } = graficaById(id);
  const unit = Math.ceil(areaM2(width, height) * price - 1e-9);
  const qty = Math.max(1, quantity);
  if (unit * qty >= minimum) return { unit, minimum: false };
  return { unit: Math.ceil(minimum / qty - 1e-9), minimum: true };
}
