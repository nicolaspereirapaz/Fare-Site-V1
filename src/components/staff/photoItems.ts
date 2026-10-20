import { customSize, groupOf, num, paperLabel, pricing, SIZE_GROUPS, SIZES, sizeById, type Paper, type SizeGroup } from "@/components/fotos/catalog";

/*
 * Foto no orçamento/pedido da equipe: entra como item fora do catálogo com nome padrão
 * ("Revelação 10 × 15 cm"), custo zero e o preço da tabela do site. O papel o cliente escolhe
 * no link das fotos; depois disso o nome ganha o papel ("Revelação 10 × 15 cm · papel Brilho").
 * O servidor guarda só o nome, então é pelo nome que se reconhece a foto (inclusive tamanho digitado).
 */

export type PhotoChoice = { sizeId: string; paper?: Paper };

export const photoItemName = ({ sizeId, paper }: PhotoChoice) => {
  const size = sizeById(sizeId);
  return `${groupOf(size.group).item} ${size.label}${paper ? ` · papel ${paperLabel(paper)}` : ""}`;
};

const NAME = /^(.+) ([\d,]+) × ([\d,]+) cm(?: · papel (Brilho|Fosco))?$/;

export function photoFromName(name: string): PhotoChoice | null {
  // Tamanho da lista pelo nome exato (inclui "Foto retrô Polaroid 9 × 11 cm", que tem palavra antes da medida).
  const [base, paperText] = name.split(" · papel ");
  const listed = SIZES.find((entry) => photoItemName({ sizeId: entry.id }) === base);
  if (listed) {
    const choice: PhotoChoice = { sizeId: listed.id, ...(paperText ? { paper: paperText === "Fosco" ? "fosco" as const : "brilho" as const } : {}) };
    return photoItemName(choice) === name ? choice : null;
  }
  const match = NAME.exec(name);
  const group = match && SIZE_GROUPS.find((entry) => entry.item === match[1]);
  if (!match || !group) return null;
  const [w, h] = [Number(match[2].replace(",", ".")), Number(match[3].replace(",", "."))];
  const size = SIZES.find((entry) => entry.group === group.id && entry.size.width === w && entry.size.height === h) ?? customSize(group.id, w, h);
  if (!size) return null;
  const choice: PhotoChoice = { sizeId: size.id, ...(match[4] ? { paper: match[4] === "Fosco" ? "fosco" as const : "brilho" as const } : {}) };
  // Só aceita se o nome é exatamente o que a equipe/site gera (evita confundir com produto parecido).
  return photoItemName(choice) === name ? choice : null;
}

/** Preço por foto na tabela do site para essa quantidade do mesmo tamanho. */
export const photoTablePrice = (sizeId: string, quantity: number) => pricing(sizeId, Math.max(quantity, 1)).unit;

const DOCUMENT_TITLE: Record<SizeGroup, string> = { revelacao: "Revelação de Fotos", retro: "Fotos Retrô", ampliacao: "Ampliação de Fotos", grande: "Fotos em Grande Formato" };
// Mesmas informações da página da revelação (PhotoQualityBand). Grande formato: sem afirmar processo/papel que não está no site.
const QUIMICA = "em processo químico, com papel fotográfico Fujifilm de alta durabilidade.";
const DOCUMENT_DESCRIPTION: Record<SizeGroup, string> = {
  revelacao: `Revelação de fotos ${QUIMICA}`,
  retro: `Fotos estilo Polaroid e Instax, com moldura branca, ${QUIMICA}`,
  ampliacao: `Ampliação de fotos ${QUIMICA}`,
  grande: "Impressão de fotos em grande formato, com cores vivas e detalhes nítidos.",
};

/**
 * Foto no documento do cliente (orçamento/pedido), no mesmo modelo do brinde:
 * nome "Revelação de Fotos", etiquetas "Papel Fosco" e "4 Cópias", descrição e medidas ("10x15cm", tamanho real da máquina).
 */
export function photoDocumentLines(item: { productName: string; selections?: Record<string, string> }) {
  const photo = photoFromName(item.productName);
  if (!photo) return null;
  const size = sizeById(photo.sizeId);
  const paper = photo.paper ? paperLabel(photo.paper) : item.selections?.Papel;
  return {
    name: DOCUMENT_TITLE[size.group],
    color: paper ? `Papel ${paper}` : null,
    unitLabel: { one: "Cópia", many: "Cópias" },
    description: DOCUMENT_DESCRIPTION[size.group],
    specs: [
      `${num(size.size.width)}x${num(size.size.height)}cm`,
      ...(size.real ? [`Tamanho real: ${num(size.real.width)}x${num(size.real.height)}cm`] : []),
    ],
  };
}

/** "30 cópias" para foto, "30 un." para os demais (telas de equipe e cliente). */
export const quantityText = (productName: string, quantity: number) =>
  `${quantity.toLocaleString("pt-BR")} ${photoFromName(productName) ? (quantity === 1 ? "cópia" : "cópias") : "un."}`;
/** "/cópia" para foto, "/un." para os demais. */
export const perUnitText = (productName: string) => (photoFromName(productName) ? "/cópia" : "/un.");
