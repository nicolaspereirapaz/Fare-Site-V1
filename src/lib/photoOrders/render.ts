import sharp from "sharp";
import { FILTERS, layout, photoCss, sizeById, type Frame, type Photo } from "@/components/fotos/catalog";
import { PRINT_DPI } from "./config";

/** O que o cliente escolheu no editor para uma foto (sem a imagem). */
export type PhotoEdits = Pick<Photo, "sizeId" | "fit" | "landscape" | "zoom" | "x" | "y" | "border" | "filter" | "filterStrength" | "brightness" | "contrast" | "saturation">;

type Matrix = number[][];
/** Transformação de cor afim: cor' = M · cor + offset (cores de 0 a 1). */
type Affine = { m: Matrix; o: number[] };
const IDENTITY: Affine = { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], o: [0, 0, 0] };

const mul = (a: Matrix, b: Matrix): Matrix => a.map((row) => [0, 1, 2].map((j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)));
const apply = (m: Matrix, v: number[]) => m.map((row) => row.reduce((sum, x, k) => sum + x * v[k], 0));
/** Aplica `next` depois de `prev`. */
const then = (prev: Affine, next: Affine): Affine => ({ m: mul(next.m, prev.m), o: apply(next.m, prev.o).map((v, i) => v + next.o[i]) });

/** Matrizes das funções de filtro do CSS (Filter Effects Level 1), as mesmas que o navegador usa na prévia. */
function cssFunction(name: string, value: number): Affine {
  const g = 1 - Math.min(1, Math.max(0, value));
  switch (name) {
    case "grayscale":
      return { m: [[0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g], [0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g], [0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g]], o: [0, 0, 0] };
    case "sepia":
      return { m: [[0.393 + 0.607 * g, 0.769 - 0.769 * g, 0.189 - 0.189 * g], [0.349 - 0.349 * g, 0.686 + 0.314 * g, 0.168 - 0.168 * g], [0.272 - 0.272 * g, 0.534 - 0.534 * g, 0.131 + 0.869 * g]], o: [0, 0, 0] };
    case "saturate": {
      const s = value;
      return { m: [[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]], o: [0, 0, 0] };
    }
    case "hue-rotate": {
      const r = (value * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      return { m: [
        [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928],
        [0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283],
        [0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072],
      ], o: [0, 0, 0] };
    }
    case "brightness":
      return { m: [[value, 0, 0], [0, value, 0], [0, 0, value]], o: [0, 0, 0] };
    case "contrast":
      return { m: [[value, 0, 0], [0, value, 0], [0, 0, value]], o: [0.5 - 0.5 * value, 0.5 - 0.5 * value, 0.5 - 0.5 * value] };
    default:
      return IDENTITY;
  }
}

/** "sepia(0.75) contrast(1.02) brightness(102%)" → uma transformação só. */
export function cssFilterToAffine(css: string): Affine {
  let result = IDENTITY;
  for (const [, name, raw, unit] of css.matchAll(/([a-z-]+)\(\s*(-?[\d.]+)\s*(%|deg)?\s*\)/g)) {
    const value = unit === "%" ? Number(raw) / 100 : Number(raw);
    result = then(result, cssFunction(name, value));
  }
  return result;
}

/** Filtro com intensidade < 100%: a prévia põe a foto filtrada por cima da só ajustada, meio transparente. Aqui é a mesma mistura. */
export function photoColor(edits: PhotoEdits): Affine {
  const photo = edits as Photo;
  const filtered = cssFilterToAffine(photoCss(photo));
  const strength = Math.min(100, Math.max(0, edits.filterStrength)) / 100;
  if (edits.filter === "original" || strength >= 1 || !FILTERS.some((item) => item.id === edits.filter)) return filtered;
  const plain = cssFilterToAffine(photoCss(photo, "original"));
  const mix = (a: number, b: number) => a * (1 - strength) + b * strength;
  return { m: plain.m.map((row, i) => row.map((v, j) => mix(v, filtered.m[i][j]))), o: plain.o.map((v, i) => mix(v, filtered.o[i])) };
}

const isIdentity = ({ m, o }: Affine) =>
  m.every((row, i) => row.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-6)) && o.every((v) => Math.abs(v) < 1e-6);

const cmToPx = (cm: number) => Math.round((cm / 2.54) * PRINT_DPI);

/** Cinza da folha das fotos retrô (recortado depois, como no modelo da loja). */
export const SHEET_GREY = "#d9d9d9";
const JPEG = { quality: 95, chromaSubsampling: "4:4:4" } as const;

/**
 * Arquivo pronto para imprimir: papel no tamanho real da máquina a 300 dpi, borda branca, a foto cortada/encaixada
 * exatamente como no editor (mesma conta de `layout`) e com filtro/ajustes aplicados. Sai JPG com 300 dpi gravado.
 * Foto retrô: o cartão branco vai numa folha cinza 10,2 × 15,2 (como no modelo), uma foto por folha.
 */
export async function renderPrint(sourceFile: string, size: { width: number; height: number }, edits: PhotoEdits, output: string) {
  const frame = sizeById(edits.sizeId).frame;
  const card = await renderCard(sourceFile, size, edits);
  if (frame) return renderSheet(frame, [card.buffer], output);
  await sharp(card.buffer).withMetadata({ density: PRINT_DPI }).jpeg(JPEG).toFile(output);
  return { width: card.width, height: card.height };
}

/** Folha de foto retrô: fundo cinza e um cartão em cada posição do modelo (Instax: até 2). */
export async function renderSheet(frame: Frame, cards: Buffer[], output: string) {
  const width = cmToPx(frame.sheet.width);
  const height = cmToPx(frame.sheet.height);
  await sharp({ create: { width, height, channels: 3, background: SHEET_GREY } })
    .composite(cards.map((input, index) => ({ input, left: cmToPx(frame.slots[index].left), top: cmToPx(frame.slots[index].top) })))
    .withMetadata({ density: PRINT_DPI })
    .jpeg(JPEG)
    .toFile(output);
  return { width, height };
}

/** Papel (ou cartão retrô) com a foto, em PNG sem perda, para salvar ou montar na folha. */
export async function renderCard(sourceFile: string, size: { width: number; height: number }, edits: PhotoEdits) {
  const g = layout({ ...(edits as Photo), w: size.width, h: size.height });
  const W = cmToPx(g.W);
  const H = cmToPx(g.H);
  const inset = { left: cmToPx(g.inset.left), top: cmToPx(g.inset.top), right: cmToPx(g.inset.right), bottom: cmToPx(g.inset.bottom) };
  const areaW = W - inset.left - inset.right;
  const areaH = H - inset.top - inset.bottom;
  const fill = edits.fit === "preencher";
  // Preencher: a foto cobre a área toda (o arredondamento nunca pode deixar uma fresta).
  const imageW = Math.max(fill ? areaW : 1, Math.round((g.w / 100) * areaW));
  const imageH = Math.max(fill ? areaH : 1, Math.round((g.h / 100) * areaH));
  const left = Math.round((g.left / 100) * areaW);
  const top = Math.round((g.top / 100) * areaH);

  let image = sharp(sourceFile, { limitInputPixels: false }).rotate().flatten({ background: "#ffffff" })
    .resize(imageW, imageH, { fit: "fill" });
  const color = photoColor(edits);
  if (!isIdentity(color)) image = image.recomb(color.m as [[number, number, number], [number, number, number], [number, number, number]]).linear([1, 1, 1], color.o.map((v) => v * 255));

  let placed: Buffer;
  let at: { left: number; top: number };
  if (fill) {
    // Preencher: a foto é maior que a área; recorta o pedaço que o cliente posicionou.
    const cropLeft = Math.min(Math.max(0, -left), imageW - areaW);
    const cropTop = Math.min(Math.max(0, -top), imageH - areaH);
    placed = await image.extract({ left: cropLeft, top: cropTop, width: areaW, height: areaH }).toBuffer();
    at = { left: inset.left, top: inset.top };
  } else {
    // Encaixar: a foto inteira cabe na área, com papel branco em volta.
    placed = await image.toBuffer();
    at = { left: inset.left + Math.max(0, left), top: inset.top + Math.max(0, top) };
  }

  const buffer = await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
    .composite([{ input: placed, ...at }])
    .png()
    .toBuffer();
  return { buffer, width: W, height: H };
}
