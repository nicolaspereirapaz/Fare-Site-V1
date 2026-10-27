// Regras do fluxo de fotos que valem no navegador e no servidor: tamanhos, preços, prazo, corte e resumo do pedido.
// Sem React e sem CSS, para o servidor recalcular preço e gerar o arquivo pronto para imprimir.

export type SizeId = string;
export type Paper = "brilho" | "fosco";
export type PrintSize = { width: number; height: number };
export type SizeGroup = "revelacao" | "retro" | "ampliacao" | "grande";
/**
 * Foto retrô (cm): cartão branco com a janela da foto. Na impressão os cartões vão numa folha 10,2 × 15,2 cinza,
 * que a loja recorta depois; no site aparece só o cartão branco com a foto.
 */
export type Frame = {
  card: PrintSize;
  window: { left: number; top: number; width: number; height: number };
  sheet: PrintSize;
  /** Onde cada cartão fica na folha (canto superior esquerdo). Instax: 2 por folha. */
  slots: { left: number; top: number }[];
};
export type Size = {
  id: SizeId; label: string; size: PrintSize; group: SizeGroup;
  tier?: "p" | "m"; // revelação: coluna da tabela por quantidade
  prices?: [number, number]; // ampliação: 1 a 10 fotos, acima de 10
  price?: number; // grande formato: preço fixo
  custom?: boolean; // tamanho digitado pelo cliente
  base?: Size; // revelação/ampliação digitada: tamanho da tabela usado como referência
  extra?: number; // acréscimo por foto sobre o tamanho de referência
  real?: PrintSize; // tamanho real impresso pela máquina (Print Size Setup), em cm
  frame?: Frame; // foto retrô: moldura fixa (sem borda nem orientação)
  steps?: { min: number; unit: number }[]; // foto retrô: preço por foto a partir de cada quantidade (a 1ª é o mínimo)
};
export const num = (n: number) => String(n).replace(".", ",");
const cm = (w: number, h: number) => ({ id: `${w}x${h}`, label: `${num(w)} × ${num(h)} cm`, size: { width: w, height: h } });
// Tamanho real (mm, lado menor × lado maior) tirado do cadastro da máquina (Print Size Setup, sem as versões "B" com borda).
const mm = (short: number, long: number): PrintSize => ({ width: short / 10, height: long / 10 });
const rev = (w: number, h: number, tier: "p" | "m", real: PrintSize): Size => ({ ...cm(w, h), group: "revelacao", tier, real });
const amp = (w: number, h: number, a: number, b: number, real: PrintSize): Size => ({ ...cm(w, h), group: "ampliacao", prices: [a, b], real });
// Grandes formatos: faixas da tabela da loja. Cada faixa vale até um lado menor × lado maior;
// um tamanho entra na primeira faixa em que cabe. Sem preço = sob consulta.
export const BIG_BANDS: { short: number; long: number; label: string; price: number | null }[] = [
  { short: 30, long: 60, label: "Até 30 × 60", price: 42 },
  { short: 39, long: 60, label: "31 × 40 a 39 × 60", price: 64 },
  { short: 45, long: 61, label: "40 × 50 a 45 × 61", price: 69 },
  { short: 50, long: 61, label: "46 × 60 a 50 × 61", price: 79.9 },
  { short: 50, long: 76, label: "50 × 70 a 50 × 76", price: 89.9 },
  { short: 50, long: 100, label: "50 × 80 a 50 × 100", price: 139.9 },
  { short: 60, long: 100, label: "60 × 70 a 60 × 100", price: 149.9 },
  { short: 60, long: 120, label: "60 × 101 a 60 × 120", price: 195 },
  { short: 60, long: 150, label: "60 × 121 a 60 × 150", price: null },
  { short: 60, long: 250, label: "60 × 151 a 60 × 250", price: 330 },
];
export const BIG_MAX = { short: 60, long: 250 };
export function bigBand(w: number, h: number) {
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  return BIG_BANDS.find((band) => short <= band.short && long <= band.long) ?? null;
}
const big = (w: number, h: number): Size => ({ ...cm(w, h), group: "grande", price: bigBand(w, h)!.price! });
// Fotos retrô: medidas do modelo da loja ("Design sem nome.pdf"). Preços aprovados em 20/10.
// Instax sai 2 por folha: faixas e quantidades sempre em número par.
const retro = (id: string, name: string, frame: Frame, steps: { min: number; unit: number }[]): Size =>
  ({ id, label: `${name} ${num(frame.card.width)} × ${num(frame.card.height)} cm`, size: frame.card, group: "retro", frame, steps });
const SHEET_PORTRAIT = { width: 10.2, height: 15.2 };
const SHEET_LANDSCAPE = { width: 15.2, height: 10.2 };
export const RETRO_SIZES: Size[] = [
  retro("polaroid", "Polaroid", {
    card: { width: 9, height: 11 }, window: { left: 0.425, top: 0.525, width: 8.15, height: 8.15 },
    sheet: SHEET_PORTRAIT, slots: [{ left: 0.6, top: 2.1 }],
  }, [{ min: 1, unit: 8 }, { min: 2, unit: 6 }, { min: 10, unit: 5.5 }, { min: 20, unit: 5 }, { min: 30, unit: 4.5 }, { min: 40, unit: 4 }, { min: 50, unit: 3.5 }]),
  retro("instax", "Instax", {
    card: { width: 5.5, height: 8.5 }, window: { left: 0.27, top: 0.35, width: 4.96, height: 6.76 },
    sheet: SHEET_LANDSCAPE, slots: [{ left: 1.95, top: 0.85 }, { left: 7.75, top: 0.85 }],
  }, [{ min: 2, unit: 4 }, { min: 4, unit: 3.5 }, { min: 12, unit: 3 }, { min: 22, unit: 2.75 }, { min: 32, unit: 2.5 }, { min: 42, unit: 2.25 }, { min: 50, unit: 2 }]),
];

// Tabelas da loja (imagens de WhatsApp de 16/10). Grandes formatos: lista aprovada; outros tamanhos sob consulta.
export const SIZES: Size[] = [
  rev(9, 12, "p", mm(89, 127)), rev(10, 15, "p", mm(102, 152)), rev(13, 18, "m", mm(127, 178)), rev(15, 21, "m", mm(152, 216)),
  ...RETRO_SIZES,
  // 20 × 20: não estava na tabela de preços; mesmo valor da 20 × 30.
  amp(20, 20, 11, 10, mm(203, 203)), amp(20, 25, 11, 10, mm(203, 254)), amp(20, 30, 11, 10, mm(203, 305)), amp(21, 30, 12, 11, mm(210, 305)),
  amp(24, 30, 16, 15, mm(240, 305)), amp(30, 30, 24, 23, mm(305, 305)), amp(30, 40, 29, 29, mm(305, 406)), amp(30, 42, 32, 31, mm(305, 420)),
  amp(30, 45, 33, 32, mm(305, 457)),
  big(30, 60), big(40, 50), big(40, 60), big(45, 60), big(50, 60), big(50, 70), big(50, 75), big(50, 80),
  big(50, 90), big(50, 100), big(60, 80), big(60, 90), big(60, 100), big(60, 120), big(60, 180), big(60, 200),
];
// Tamanho digitado pelo cliente:
// - revelação e ampliação: cobra como o menor tamanho da tabela em que ele cabe, + R$ 1,00 (revelação) ou + R$ 3,00 (ampliação);
// - grandes formatos: entra na faixa de preço em que cabe.
export const CUSTOM_EXTRA: Record<SizeGroup, number> = { revelacao: 1, retro: 0, ampliacao: 3, grande: 0 };
// Medidas de um tamanho da tabela: a comercial e a real da máquina (lado menor × lado maior).
const measures = (size: Size) => [size.size, size.real].filter((m): m is PrintSize => !!m);
export const same = (a: number, b: number) => Math.abs(a - b) < 0.05;
/** Cabe no tamanho da tabela? Vale a maior medida entre a comercial e a real (o que a máquina imprime). */
const fits = (size: Size, short: number, long: number) =>
  measures(size).some((m) => short <= Math.min(m.width, m.height) + 0.001 && long <= Math.max(m.width, m.height) + 0.001);
export const isListed = (id: SizeId) => SIZES.some((item) => item.id === id);
const PREFIX: Record<SizeGroup, string> = { revelacao: "rev", retro: "retro", ampliacao: "amp", grande: "big" };

/** Tamanho da tabela igual ao digitado (medida comercial ou real, em qualquer orientação), se houver. */
export function listedMatch(group: SizeGroup, w: number, h: number) {
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  return SIZES.find((size) => size.group === group && measures(size).some((m) => same(m.width, short) && same(m.height, long))) ?? null;
}
/** Monta o tamanho digitado; null quando não dá para cobrar (grande demais para o grupo ou sob consulta). */
export function customSize(group: SizeGroup, w: number, h: number): Size | null {
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  // Foto retrô só nos modelos da loja (a moldura é fixa).
  if (!(short > 0) || group === "retro") return null;
  const id = `${PREFIX[group]}-${short}x${long}`;
  if (group === "grande") {
    const price = bigBand(short, long)?.price;
    return price ? { ...cm(short, long), id, group, price, custom: true } : null;
  }
  const base = SIZES.find((size) => size.group === group && fits(size, short, long));
  if (!base) return null;
  const extra = CUSTOM_EXTRA[group];
  return {
    ...cm(short, long), id, group, custom: true, base, extra,
    ...(group === "revelacao" ? { tier: base.tier } : { prices: [base.prices![0] + extra, base.prices![1] + extra] as [number, number] }),
  };
}
export function sizeById(id: SizeId): Size {
  const listed = SIZES.find((item) => item.id === id);
  if (listed) return listed;
  const match = /^(rev|amp|big)-([\d.]+)x([\d.]+)$/.exec(id);
  const group = (Object.keys(PREFIX) as SizeGroup[]).find((key) => PREFIX[key] === match?.[1]);
  return (match && group && customSize(group, Number(match[2]), Number(match[3]))) || SIZES[1];
}
export const SIZE_GROUPS: { id: SizeGroup; label: string; item: string; note: string }[] = [
  { id: "revelacao", label: "Revelação", item: "Revelação", note: "Quanto mais fotos do mesmo tamanho, menor o preço. Tamanho digitado: preço do tamanho em que ele cabe + R$ 1,00. Pronto em 1 hora após o pagamento." },
  { id: "retro", label: "Fotos retrô", item: "Foto retrô", note: "Estilo Polaroid e Instax, com a moldura branca. Quanto mais fotos do mesmo modelo, menor o preço. Instax: sempre em número par. Pronto em 1 hora após o pagamento." },
  { id: "ampliacao", label: "Ampliações", item: "Ampliação", note: "Preço por foto: de 1 a 10 ou acima de 10 do mesmo tamanho. Tamanho digitado: preço do tamanho em que ele cabe + R$ 3,00. Pronto em 1 hora após o pagamento." },
  { id: "grande", label: "Grandes formatos", item: "Grande formato", note: "Escolha um tamanho ou digite o seu: o preço segue a faixa da tabela. Pronto em 3 dias úteis." },
];
/** Foto padrão do produto de cada grupo (carrinho e equipe; as fotos do cliente não aparecem). */
export const PHOTO_PRODUCT_IMAGE: Record<SizeGroup, string> = {
  revelacao: "/images/revelacao/01-pilha-fotos-10x15.webp",
  retro: "/images/revelacao/06-fotos-retro.webp",
  ampliacao: "/images/revelacao/04-ampliacao-30x45-parede.webp",
  grande: "/images/revelacao/05-grande-formato-60x90.webp",
};
export const groupOf = (id: SizeGroup) => SIZE_GROUPS.find((group) => group.id === id)!;
/** Preço que aparece no botão do tamanho (revelação depende da quantidade, então não mostra). */
export function sizePriceHint(size: Size) {
  if (size.group === "ampliacao") return brl(size.prices![0]);
  if (size.group === "grande") return brl(size.price!);
  if (size.base) return `${size.base.label.replace(" cm", "")} + ${brl(size.extra!)}`;
  if (size.steps) return `${brl(size.steps[0].unit)}${pairs(size) > 1 ? " · em pares" : ""}`;
  return null;
}
/** Prazo do pedido: sai tudo junto quando o item mais demorado ficar pronto. */
export function deadline(photos: { sizeId: SizeId }[]) {
  return photos.some((photo) => sizeById(photo.sizeId).group === "grande")
    ? "Com grandes formatos, o pedido fica pronto em 3 dias úteis após o pagamento."
    : "Pronto em 1 hora após o pagamento.";
}
export const PAPERS: { id: Paper; label: string }[] = [
  { id: "brilho", label: "Brilho" },
  { id: "fosco", label: "Fosco" },
];
export const paperLabel = (paper: Paper) => (paper === "brilho" ? "Brilho" : "Fosco");

export const TIERS: { min: number; max: number | null; label: string; p: number; m: number }[] = [
  { min: 1, max: 1, label: "1 foto", p: 6, m: 9 },
  { min: 2, max: 9, label: "2 a 9 fotos", p: 3.5, m: 7 },
  { min: 10, max: 50, label: "10 a 50 fotos", p: 3, m: 6 },
  { min: 51, max: 100, label: "51 a 100 fotos", p: 2.5, m: 5 },
  { min: 101, max: 250, label: "101 a 250 fotos", p: 1.8, m: 4.5 },
  { min: 251, max: 500, label: "251 a 500 fotos", p: 1.5, m: 4 },
  { min: 501, max: 999, label: "501 a 999 fotos", p: 1.3, m: 3.5 },
  { min: 1000, max: null, label: "1000 fotos ou mais", p: 1, m: 2.5 },
];
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Fotos por folha de impressão (Instax: 2). A quantidade tem de ser múltipla disso. */
const pairs = (size: Size) => size.frame?.slots.length ?? 1;
/** Faixa da tabela retrô: "1 foto", "2 a 9 fotos", "50 fotos ou mais" (Instax anda de 2 em 2). */
export function stepLabel(size: Size, i: number) {
  const steps = size.steps!;
  const from = steps[i].min;
  if (!steps[i + 1]) return `${from} fotos ou mais`;
  const to = steps[i + 1].min - pairs(size);
  return to === from ? `${from} ${from === 1 ? "foto" : "fotos"}` : `${from} a ${to} fotos`;
}

/**
 * Tabela de Revelação Profissional (clientes que se cadastraram pelo convite): preço único por foto,
 * sem faixa de quantidade. Só os tamanhos da tabela; os outros (retrô, tamanho digitado…) seguem o preço normal.
 */
export const PRO_PRICES: Record<string, number> = {
  "9x12": 1, "10x15": 1, "13x18": 2, "15x21": 2, "20x25": 4.3, "20x30": 4.3, "24x30": 5.4, "30x30": 8,
  "30x40": 14, "30x45": 14, "30x60": 30, "40x50": 58, "45x60": 58, "50x60": 65, "50x70": 74, "50x75": 74, "60x100": 120,
};

/** Preço de um tamanho: cada tamanho conta a sua própria faixa. `pro`: cliente profissional (tabela própria). */
export function pricing(sizeId: SizeId, total: number, pro = false) {
  const size = sizeById(sizeId);
  const result = (unit: number, tier: string, nudge: { missing: number; unit: number } | null) =>
    ({ unit, tier, total: Math.round(total * unit * 100) / 100, nudge });
  if (pro && PRO_PRICES[size.id] !== undefined) return result(PRO_PRICES[size.id], "tabela profissional", null);
  const ref = size.base ? ` · como ${size.base.label.replace(" cm", "")} + ${brl(size.extra!)}` : "";
  if (size.group === "grande") return result(size.price!, "preço fixo", null);
  if (size.steps) {
    // Faixa = última quantidade mínima alcançada (abaixo da primeira, vale a primeira).
    const steps = size.steps;
    let index = 0;
    steps.forEach((step, i) => { if (total >= step.min) index = i; });
    const next = steps[index + 1];
    return result(steps[index].unit, stepLabel(size, index), next ? { missing: next.min - total, unit: next.unit } : null);
  }
  if (size.group === "ampliacao") {
    const [upTo10, above10] = size.prices!;
    return total > 10
      ? result(above10, `acima de 10 fotos${ref}`, null)
      : result(upTo10, `1 a 10 fotos${ref}`, above10 < upTo10 ? { missing: 11 - total, unit: above10 } : null);
  }
  const extra = size.extra ?? 0;
  const col = size.tier!;
  const index = TIERS.findIndex((tier) => total >= tier.min && (tier.max === null || total <= tier.max));
  const unit = index >= 0 ? TIERS[index][col] + extra : 0;
  const next = index >= 0 ? TIERS[index + 1] : undefined;
  return result(unit, index >= 0 ? `${TIERS[index].label}${ref}` : "", next && next[col] + extra < unit ? { missing: next.min - total, unit: next[col] + extra } : null);
}

export type Fit = "preencher" | "encaixar";
export type FilterId = "original" | "pb" | "sepia" | "vivo" | "quente";
export const FILTERS: { id: FilterId; label: string; css: string }[] = [
  { id: "original", label: "Original", css: "none" },
  { id: "pb", label: "Preto e branco", css: "grayscale(1) contrast(1.05)" },
  { id: "sepia", label: "Sépia", css: "sepia(0.75) contrast(1.02) brightness(1.02)" },
  { id: "vivo", label: "Vivo", css: "saturate(1.45) contrast(1.08)" },
  { id: "quente", label: "Quente", css: "sepia(0.22) saturate(1.25) hue-rotate(-8deg) brightness(1.04)" },
];
export const BORDERS: { cm: number; label: string }[] = [
  { cm: 0, label: "Sem borda" },
  { cm: 0.3, label: "3 mm" },
  { cm: 0.5, label: "5 mm" },
  { cm: 1, label: "1 cm" },
];

/** Envio da foto para o servidor (sobe enquanto o cliente edita). */
export type PhotoUploadState = { status: "enviando" | "pronto" | "erro"; progress: number; convertedFrom?: string | null };

export type Photo = {
  id: string; name: string; url: string; w: number; h: number;
  /** Id do arquivo no servidor, quando o envio terminou. */
  uploadId?: string; upload?: PhotoUploadState;
  sizeId: SizeId; paper: Paper; copies: number;
  fit: Fit; landscape: boolean; zoom: number; x: number; y: number; border: number; filter: FilterId; filterStrength: number;
  brightness: number; contrast: number; saturation: number;
};

export const ADJUSTMENTS = [
  { key: "brightness", label: "Brilho" },
  { key: "contrast", label: "Contraste" },
  { key: "saturation", label: "Saturação" },
] as const;

/** Filtro + ajustes (0 = sem mudança, de -50 a +50) num único filtro CSS. */
export function photoCss(photo: Photo, filter: FilterId = photo.filter) {
  const preset = FILTERS.find((item) => item.id === filter)!.css;
  const adjust = `brightness(${100 + photo.brightness}%) contrast(${100 + photo.contrast}%) saturate(${100 + photo.saturation}%)`;
  return preset === "none" ? adjust : `${preset} ${adjust}`;
}

/** Geometria da impressão: tudo em % da área da foto (dentro da borda), sem medir a tela. */
/** Medida que sai da máquina: a real quando cadastrada, senão a comercial. */
export const printSize = (size: Size) => size.real ?? size.size;
/** "10,2 × 15,2 cm" quando o tamanho real é diferente do comercial; senão null. */
export function realLabel(size: Size) {
  const real = size.real;
  if (!real || (real.width === size.size.width && real.height === size.size.height)) return null;
  return `${num(real.width)} × ${num(real.height)} cm`;
}

/** Zoom da foto: abaixo de 1 a foto fica menor que a área e sobra branco (em Preencher e em Encaixar). */
export const ZOOM = { min: 0.5, max: 4 };

export function layout(photo: Photo) {
  const size = sizeById(photo.sizeId);
  const frame = size.frame;
  const print = printSize(size);
  const short = frame ? frame.card.width : Math.min(print.width, print.height);
  const long = frame ? frame.card.height : Math.max(print.width, print.height);
  const W = photo.landscape ? long : short;
  const H = photo.landscape ? short : long;
  // Foto retrô: janela fixa da moldura (sem borda escolhida). Deitada = cartão girado, faixa larga à direita.
  const b = frame ? 0 : photo.border;
  /** Margem branca entre o papel/cartão e a foto, em cm, em cada lado. */
  let inset = frame
    ? { left: frame.window.left, top: frame.window.top, right: short - frame.window.left - frame.window.width, bottom: long - frame.window.top - frame.window.height }
    : { left: b, top: b, right: b, bottom: b };
  if (frame && photo.landscape) inset = { left: inset.top, top: inset.right, right: inset.bottom, bottom: inset.left };
  const iw = W - inset.left - inset.right;
  const ih = H - inset.top - inset.bottom;
  const ai = iw / ih;
  const am = photo.w / photo.h;
  // Preencher cobre a área, Encaixar mostra a foto inteira; depois o zoom e a posição valem nos dois.
  const [baseW, baseH] = (am > ai) === (photo.fit === "preencher") ? [(am / ai) * 100, 100] : [100, (ai / am) * 100];
  const w = baseW * photo.zoom;
  const h = baseH * photo.zoom;
  // x/y de 0 a 1: maior que a área escolhe o pedaço visível; menor, onde a foto fica no branco.
  const left = -(w - 100) * photo.x;
  const top = -(h - 100) * photo.y;
  const dpi = Math.round(photo.w / (((w / 100) * iw) / 2.54));
  return { W, H, b, inset, w, h, left, top, dpi };
}

export function quality(dpi: number) {
  if (dpi >= 300) return { label: "Ótima", tone: "great" };
  if (dpi >= 150) return { label: "Boa", tone: "good" };
  if (dpi >= 96) return { label: "Aceitável", tone: "ok" };
  return { label: "Baixa", tone: "low" };
}

/** Resumo por tamanho (cada tamanho tem sua faixa de preço), com as linhas de papel dentro. */
export function summarize(photos: Photo[], pro = false) {
  // Tamanhos da lista + os digitados pelo cliente (grandes formatos).
  const ids = [...new Set([...SIZES.map((size) => size.id), ...photos.map((photo) => photo.sizeId)])];
  const sizes = ids.map(sizeById).map((size) => {
    const list = photos.filter((photo) => photo.sizeId === size.id);
    const copies = list.reduce((sum, photo) => sum + photo.copies, 0);
    const papers = PAPERS.map((paper) => {
      const ofPaper = list.filter((photo) => photo.paper === paper.id);
      return { paper: paper.id, photos: ofPaper, copies: ofPaper.reduce((sum, photo) => sum + photo.copies, 0) };
    }).filter((line) => line.copies);
    return { size, photos: list, copies, papers, price: pricing(size.id, copies, pro) };
  }).filter((group) => group.copies);
  return { sizes, copies: sizes.reduce((sum, g) => sum + g.copies, 0), total: Math.round(sizes.reduce((sum, g) => sum + g.price.total, 0) * 100) / 100 };
}

/**
 * Tamanhos que não fecham a folha: abaixo do mínimo ou, na Instax (2 por folha), número ímpar.
 * A folha é montada por papel, então o par conta em cada papel. Vazio = pode fechar o pedido.
 */
export function minimumIssues(photos: Photo[]) {
  return summarize(photos).sizes.flatMap((group) => {
    const name = group.size.label.replace(" cm", "");
    const per = pairs(group.size);
    if (group.size.steps && group.copies < group.size.steps[0].min) return [`${name}: mínimo de ${group.size.steps[0].min} fotos.`];
    if (per > 1 && group.papers.some((line) => line.copies % per)) {
      return [`${name}: escolha um número par de fotos${group.papers.length > 1 ? " em cada papel" : ""}.`];
    }
    return [];
  });
}

/** Texto do pedido de fotos para a mensagem do WhatsApp (uma linha por tamanho + papel). */
export function photoOrderLines(photos: Photo[], pro = false) {
  const summary = summarize(photos, pro);
  if (!summary.copies) return [];
  const lines = summary.sizes.flatMap((group) => group.papers.map((line) => [
    `• ${groupOf(group.size.group).item} ${group.size.label} — papel ${paperLabel(line.paper)}`,
    `  ${line.photos.length} ${line.photos.length === 1 ? "foto" : "fotos"} · ${line.copies} ${line.copies === 1 ? "cópia" : "cópias"} · ${brl(line.copies * group.price.unit)} (${brl(group.price.unit)} cada)`,
  ]).flat());
  return [
    "Revelação de fotos:",
    ...lines,
    `Total das fotos: ${brl(summary.total)}`,
    deadline(summary.sizes.flatMap((group) => group.photos)),
    "Arquivos: envio aqui na conversa, como documento, para não perder qualidade.",
  ];
}

/** O que vai para o servidor de cada foto (sem a imagem: ela já subiu, só o id do envio e os ajustes). */
export const photoPayload = (photo: Photo) => ({
  uploadId: photo.uploadId, sizeId: photo.sizeId, paper: photo.paper, copies: photo.copies, fit: photo.fit, landscape: photo.landscape,
  zoom: photo.zoom, x: photo.x, y: photo.y, border: photo.border, filter: photo.filter, filterStrength: photo.filterStrength,
  brightness: photo.brightness, contrast: photo.contrast, saturation: photo.saturation,
});
