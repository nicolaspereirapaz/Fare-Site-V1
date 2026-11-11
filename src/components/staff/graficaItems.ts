/*
 * Gráfica por m² no orçamento/pedido da equipe (Banner Lona, Adesivo Vinil): a equipe digita largura e altura
 * em cm, e o preço sai da área × R$ 140,00/m², com pedido mínimo de R$ 30,00 no item.
 * Entra como item fora do catálogo com nome padrão ("Banner Lona 100 × 60 cm") e o preço gravado;
 * como o servidor guarda só o nome, é pelo nome que se reconhece o item para editar de novo.
 */

export const GRAFICA_M2 = [
  { id: "banner-lona", name: "Banner Lona", image: "/images/grafica/04-banner-lona.webp", text: "Lona impressa para fachada, eventos e ponto de venda." },
  { id: "adesivo-vinil", name: "Adesivo Vinil", image: "/images/grafica/07-adesivos-etiquetas.webp", text: "Vinil adesivo impresso para vitrine, parede, carro e embalagem." },
] as const;

export type GraficaId = (typeof GRAFICA_M2)[number]["id"];
export type GraficaChoice = { id: GraficaId; width: number; height: number };

export const PRECO_M2 = 140;
export const PEDIDO_MINIMO = 30;

export const graficaById = (id: GraficaId) => GRAFICA_M2.find((entry) => entry.id === id)!;

const cm = (value: number) => String(value).replace(".", ",");
export const graficaItemName = ({ id, width, height }: GraficaChoice) => `${graficaById(id).name} ${cm(width)} × ${cm(height)} cm`;

const NAME = /^(.+) (\d+(?:,\d+)?) × (\d+(?:,\d+)?) cm$/;

export function graficaFromName(name: string): GraficaChoice | null {
  const match = NAME.exec(name);
  const product = match && GRAFICA_M2.find((entry) => entry.name === match[1]);
  if (!match || !product) return null;
  const choice = { id: product.id, width: Number(match[2].replace(",", ".")), height: Number(match[3].replace(",", ".")) };
  return graficaItemName(choice) === name ? choice : null;
}

/** Área de uma peça em m² (cm × cm / 10.000). */
export const areaM2 = (width: number, height: number) => (width * height) / 10_000;

/**
 * Preço por peça: área × R$ 140,00 (arredondado para cima no centavo). Se o item todo ficar abaixo do
 * pedido mínimo, o valor por peça sobe para fechar R$ 30,00 (arredondado para cima no centavo).
 */
export function graficaUnitPrice(width: number, height: number, quantity: number): { unit: number; minimum: boolean } {
  const unitCents = Math.ceil(areaM2(width, height) * PRECO_M2 * 100 - 1e-9);
  const qty = Math.max(1, quantity);
  if (unitCents * qty >= PEDIDO_MINIMO * 100) return { unit: unitCents / 100, minimum: false };
  return { unit: Math.ceil((PEDIDO_MINIMO * 100) / qty) / 100, minimum: true };
}
