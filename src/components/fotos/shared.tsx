"use client";

// dados, cálculos e desenho compartilhados do fluxo de fotos.
// Fluxo: envia as fotos primeiro → escolhe tamanho/papel (todas ou cada uma) e ajusta → carrinho → WhatsApp.
import { useProfessional } from "@/components/fotos/useProfessional";
import { useState, type ReactNode } from "react";
import "./fotos.css";

import { queueUpload, retryUpload, uploadBlob } from "@/components/fotos/upload";
import { photoStore, setPhotos } from "@/components/fotos/store";
import {
  BIG_BANDS, BIG_MAX, CUSTOM_EXTRA, RETRO_SIZES, SIZES, SIZE_GROUPS, TIERS, bigBand, brl, customSize, groupOf, isListed, layout, listedMatch, num, photoCss, pricing, realLabel, same, sizeById, sizePriceHint, stepLabel,
  type FilterId, type Photo, type Size, type SizeGroup, type SizeId,
  PRO_PRICES,
} from "@/components/fotos/catalog";
export * from "@/components/fotos/catalog";

/** Desenhos da foto: com intensidade do filtro abaixo de 100%, a foto filtrada fica por cima da original, meio transparente. */
function photoLayers(photo: Photo, filter?: FilterId, original = false) {
  if (original) return [{ filter: "none", opacity: 1 }];
  const id = filter ?? photo.filter;
  const strength = filter ? 100 : photo.filterStrength;
  if (id === "original" || strength >= 100) return [{ filter: photoCss(photo, id), opacity: 1 }];
  return [{ filter: photoCss(photo, "original"), opacity: 1 }, { filter: photoCss(photo, id), opacity: strength / 100 }];
}

/** Só as imagens posicionadas (em % da área da foto), para usar dentro de qualquer caixa do tamanho da área. */
export function PhotoLayers({ photo, filter, original = false }: { photo: Photo; filter?: FilterId; original?: boolean }) {
  const g = layout(photo);
  return photoLayers(photo, filter, original).map((layer, index) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" draggable={false} key={index} src={photo.url} style={{ width: `${g.w}%`, height: `${g.h}%`, left: `${g.left}%`, top: `${g.top}%`, filter: layer.filter, opacity: layer.opacity }} />
  ));
}

/** Posição da área da foto (dentro da borda) em % do papel. */
export function areaInset(photo: Photo) {
  const { inset, W, H } = layout(photo);
  return { top: `${(inset.top / H) * 100}%`, bottom: `${(inset.bottom / H) * 100}%`, left: `${(inset.left / W) * 100}%`, right: `${(inset.right / W) * 100}%` };
}

/** Largura que cabe numa caixa com container-type: size, mantendo a proporção do papel. */
export const fitWidth = (W: number, H: number) => `min(100cqw, calc(100cqh * ${W / H}))`;

export function PhotoRender({ photo, filter, className = "", fit = false, original = false }: { photo: Photo; filter?: FilterId; className?: string; fit?: boolean; original?: boolean }) {
  const g = layout(photo);
  return (
    <div className={`print-frame ${className}`} style={{ aspectRatio: `${g.W} / ${g.H}`, ...(fit ? { width: fitWidth(g.W, g.H) } : null) }}>
      <div className="print-area" style={areaInset(photo)}>
        <PhotoLayers filter={filter} original={original} photo={photo} />
      </div>
    </div>
  );
}

// crypto.randomUUID só existe em https/localhost; pelo IP da rede (http://192.168…) não funciona.
let nextId = 0;
const newId = () => `foto-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

export function loadPhoto(name: string, url: string): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error(`O navegador não abre ${name}`));
    img.onload = () =>
      resolve({
        id: newId(), name, url, w: img.naturalWidth, h: img.naturalHeight,
        sizeId: "10x15", paper: "brilho", copies: 1,
        fit: "preencher", landscape: img.naturalWidth > img.naturalHeight, zoom: 1, x: 0.5, y: 0.5, border: 0, filter: "original", filterStrength: 100,
        brightness: 0, contrast: 0, saturation: 0,
      });
    img.src = url;
  });
}

export const DEMO_PHOTOS = [
  ["retrato.jpg", "/images/hero-farefoto.webp"],
  ["aniversario.jpg", "/images/fotoalbum.webp"],
  ["impressao.jpg", "/images/revelacao-fotos.webp"],
  ["quadro.jpg", "/images/quadro-personalizado.webp"],
  ["caneca.jpg", "/images/canecas-personalizadas.webp"],
];
export const loadDemoPhotos = () => Promise.all(DEMO_PHOTOS.map(async ([name, url]) => {
  const photo = await loadPhoto(name, url);
  queueUpload(photo.id, await fetch(url).then((response) => response.blob()), name);
  return photo;
}));

// HEIC/HEIF (iPhone) às vezes chega sem tipo no Windows; o servidor converte tudo o que não for JPG/PNG.
const IMAGE_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|avif|gif|bmp|tiff?)$/i;
const isImageFile = (file: File) => file.type.startsWith("image/") || IMAGE_EXTENSIONS.test(file.name);

/** Foto escolhida pelo cliente: aparece na hora e sobe em segundo plano. Se o navegador não abre (HEIC no Chrome), sobe antes e mostra a versão convertida. */
async function loadFile(file: File): Promise<Photo | null> {
  const local = URL.createObjectURL(file);
  try {
    const photo = await loadPhoto(file.name, local);
    queueUpload(photo.id, file, file.name);
    return photo;
  } catch {
    URL.revokeObjectURL(local);
  }
  try {
    const sent = await uploadBlob(file, file.name);
    const photo = await loadPhoto(file.name, `/api/fotos/envios/${sent.id}`);
    return { ...photo, w: sent.width, h: sent.height, landscape: sent.width > sent.height, uploadId: sent.id, upload: { status: "pronto", progress: 1, convertedFrom: sent.convertedFrom } };
  } catch {
    return null;
  }
}
export const loadFiles = async (files: FileList | File[] | null) =>
  (await Promise.all([...(files ?? [])].filter(isImageFile).map(loadFile))).filter((photo): photo is Photo => photo !== null);

/**
 * "Trocar foto": o arquivo novo entra no lugar, mantendo tamanho, papel, cópias, borda e filtro.
 * O enquadramento recomeça (a imagem é outra). Devolve false se o arquivo não for uma foto que dê para abrir.
 */
export async function replacePhotoFile(old: Photo, file: File) {
  const [fresh] = await loadFiles([file]);
  if (!fresh) return false;
  const { sizeId, paper, copies, border, fit, filter, filterStrength, brightness, contrast, saturation } = old;
  setPhotos(photoStore.get().photos.map((photo) => (photo.id === old.id
    ? { ...fresh, sizeId, paper, copies, border, fit, filter, filterStrength, brightness, contrast, saturation }
    : photo)));
  // O envio só começa sozinho para fotos novas no pedido; aqui a foto substitui outra, então dispara já.
  if (!fresh.uploadId) retryUpload(fresh.id);
  return true;
}

// Estado do pedido de fotos e envio para o servidor: ficam em store.ts e upload.ts e são reexportados aqui.
export { addPhotos, clearPhotoOrder, patchPhoto, photoStore, setPhotos, usePhotoState } from "@/components/fotos/store";
export { retryUpload } from "@/components/fotos/upload";

/**
 * Tabela de preços de um grupo. Com `counts` (cópias por tamanho no pedido), destaca o preço em que as fotos estão agora.
 */
export function PriceTable({ group, counts }: { group: SizeGroup; counts?: Record<SizeId, number> }) {
  const pro = useProfessional();
  const count = (id: SizeId) => counts?.[id] ?? 0;
  // Cliente profissional: tabela profissional (preço único por foto) nos tamanhos dela.
  const proSizes = SIZES.filter((size) => size.group === group && PRO_PRICES[size.id] !== undefined);
  if (pro && proSizes.length) {
    return (
      <div className="quantity-range-table">
        <div className="fp-price-row two"><strong>Tabela profissional</strong><strong>Por foto</strong></div>
        {proSizes.map((size) => (
          <div className="fp-price-row two" key={size.id}><span>{size.label}</span><strong className={count(size.id) > 0 ? "fp-hit" : undefined}>{brl(PRO_PRICES[size.id])}</strong></div>
        ))}
      </div>
    );
  }
  const hit = (on: boolean) => (on ? "fp-hit" : undefined);
  const ordered = Object.keys(counts ?? {}).filter((id) => count(id) > 0).map(sizeById);
  const inTier = (tier: (typeof TIERS)[number], col: "p" | "m") =>
    ordered.some((size) => size.group === "revelacao" && size.tier === col && count(size.id) >= tier.min && (tier.max === null || count(size.id) <= tier.max));
  const ampCount = (row: Size) => ordered.filter((size) => size.id === row.id || size.base?.id === row.id).map((size) => count(size.id));
  const anyHit = ordered.some((size) => size.group === group);
  const bigHit = (band: (typeof BIG_BANDS)[number]) =>
    ordered.some((size) => size.group === "grande" && bigBand(size.size.width, size.size.height) === band);
  // Retrô: uma tabela por modelo, lado a lado (as faixas da Instax andam de 2 em 2).
  if (group === "retro") {
    return (
      <div className="fp-price-table">
        <div className="fp-retro-tables">
          {RETRO_SIZES.map((size) => (
            <div className="quantity-range-table" key={size.id}>
              <div className="fp-retro-title"><strong>{size.label.split(" ")[0]}</strong><small>{size.label.replace(/^\S+ /, "")}</small></div>
              <div className="quantity-range-head fp-price-row two" aria-hidden="true"><span>Qtd</span><span>Por foto</span></div>
              {size.steps!.map((step, i) => (
                <div className="quantity-range-row fp-price-row two" key={step.min}>
                  <span>{stepLabel(size, i)}</span>
                  <strong className={hit(count(size.id) > 0 && pricing(size.id, count(size.id)).unit === step.unit)}>{brl(step.unit)}</strong>
                </div>
              ))}
            </div>
          ))}
        </div>
        {anyHit ? <p className="fp-hit-legend"><i className="fp-hit-swatch" /> Preço das suas fotos agora</p> : null}
      </div>
    );
  }
  return (
    <div className="fp-price-table">
      <div className="quantity-range-table">
        {group === "revelacao" ? (
          <>
            <div className="quantity-range-head fp-price-row" aria-hidden="true"><span>Quantidade</span><span>9 × 12 ou 10 × 15</span><span>13 × 18 ou 15 × 21</span></div>
            {TIERS.map((tier) => (
              <div className="quantity-range-row fp-price-row" key={tier.label}>
                <span>{tier.label}</span>
                <strong className={hit(inTier(tier, "p"))}>{brl(tier.p)}</strong>
                <strong className={hit(inTier(tier, "m"))}>{brl(tier.m)}</strong>
              </div>
            ))}
          </>
        ) : null}
        {group === "ampliacao" ? (
          <>
            <div className="quantity-range-head fp-price-row" aria-hidden="true"><span>Tamanho</span><span>1 a 10 fotos</span><span>Acima de 10</span></div>
            {SIZES.filter((size) => size.group === "ampliacao").map((size) => (
              <div className="quantity-range-row fp-price-row" key={size.id}>
                <span>{size.label}</span>
                <strong className={hit(ampCount(size).some((n) => n <= 10))}>{brl(size.prices![0])}</strong>
                <strong className={hit(ampCount(size).some((n) => n > 10))}>{brl(size.prices![1])}</strong>
              </div>
            ))}
          </>
        ) : null}
        {group === "grande" ? (
          <>
            <div className="quantity-range-head fp-price-row two" aria-hidden="true"><span>Tamanho (cm)</span><span>Cada foto</span></div>
            {BIG_BANDS.map((band) => (
              <div className="quantity-range-row fp-price-row two" key={band.label}>
                <span>{band.label}</span>
                <strong className={hit(bigHit(band))}>{band.price ? brl(band.price) : "Sob consulta"}</strong>
              </div>
            ))}
          </>
        ) : null}
      </div>
      {anyHit ? (
        <p className="fp-hit-legend">
          <i className="fp-hit-swatch" /> Preço das suas fotos agora
          {group !== "grande" && ordered.some((size) => size.group === group && size.custom) ? ` (tamanho digitado: + ${brl(CUSTOM_EXTRA[group])} por foto)` : ""}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Escolha do tamanho: abas por grupo e a lista de tamanhos (sem desenho do formato).
 * "chips" para a tela das fotos; "list" (um por linha, com preço à direita) para o editor.
 */
export function SizePicker({ value, onChange, layout: kind = "chips", below }: {
  value: SizeId | null; onChange: (id: SizeId) => void; layout?: "chips" | "list";
  /** Conteúdo extra no fim, que acompanha a aba aberta (ex.: papel e tabela de preços). */
  below?: (group: SizeGroup) => ReactNode;
}) {
  const valueGroup = value ? sizeById(value).group : null;
  // "Outro tamanho" fica recolhido (menos poluição); abre sozinho se o tamanho escolhido já é digitado.
  const [customOpen, setCustomOpen] = useState(false);
  const [group, setGroup] = useState<SizeGroup>(valueGroup ?? "revelacao");
  // Se o tamanho escolhido mudar por fora (outra foto, "usar em todas"), a aba acompanha.
  const [seen, setSeen] = useState(valueGroup);
  const pro = useProfessional();
  if (valueGroup !== seen) {
    setSeen(valueGroup);
    if (valueGroup) setGroup(valueGroup);
  }
  return (
    <div className={`sp sp-${kind}`}>
      <div className="sp-tabs" role="tablist">
        {SIZE_GROUPS.map((item) => (
          <button aria-selected={group === item.id} className={group === item.id ? "active" : ""} key={item.id} onClick={() => setGroup(item.id)} role="tab" type="button">
            {item.label}{valueGroup === item.id ? <i aria-label="(escolhido)" className="sp-dot" /> : null}
          </button>
        ))}
      </div>
      {/* Em grandes formatos a lista é longa e digitar é comum: o campo fica aberto e vem antes. */}
      {group === "grande" ? <CustomSizeForm group={group} key={`${group}-${value ?? ""}`} onPick={onChange} value={value} /> : null}
      <div className="sp-options" role="tabpanel">
        {[...SIZES.filter((size) => size.group === group), ...(value && !isListed(value) && sizeById(value).group === group ? [sizeById(value)] : [])].map((size) => {
          const hint = pro && PRO_PRICES[size.id] !== undefined ? brl(PRO_PRICES[size.id]) : sizePriceHint(size);
          return (
            <button aria-pressed={value === size.id} className={value === size.id ? "active" : ""} key={size.id} onClick={() => onChange(size.id)} type="button">
              <span>{kind === "list" ? size.label : size.label.replace(" cm", "")}{size.custom ? <em className="sp-custom-tag">seu tamanho</em> : null}</span>
              {hint ? <small>{hint}</small> : null}
            </button>
          );
        })}
      </div>
      {value && sizeById(value).group === group && realLabel(sizeById(value)) ? (
        <p className="sp-real">Tamanho real de impressão do {sizeById(value).label.replace(" cm", "")}: {realLabel(sizeById(value))}</p>
      ) : null}
      {group !== "grande" && group !== "retro" && (customOpen || (value && sizeById(value).custom && sizeById(value).group === group)) ? (
        <CustomSizeForm group={group} key={`${group}-${value ?? ""}`} onPick={onChange} value={value} />
      ) : null}
      {group !== "grande" && group !== "retro" && !customOpen && !(value && sizeById(value).custom && sizeById(value).group === group) ? (
        <button className="sp-custom-toggle" onClick={() => setCustomOpen(true)} type="button">+ Digitar outro tamanho</button>
      ) : null}
      <p className="sp-note">{groupOf(group).note}</p>
      {below?.(group)}
    </div>
  );
}

/** "Outro tamanho": o cliente digita largura × altura e vê na hora quanto vai pagar. */
export function CustomSizeForm({ group, value, onPick }: { group: SizeGroup; value: SizeId | null; onPick: (id: SizeId) => void }) {
  const current = value ? sizeById(value) : null;
  const initial = current?.custom && current.group === group ? current.size : null;
  const [w, setW] = useState(initial ? num(initial.width) : "");
  const [h, setH] = useState(initial ? num(initial.height) : "");
  const parse = (text: string) => Math.round(Number(text.replace(",", ".")) * 10) / 10;
  const width = parse(w);
  const height = parse(h);
  const filled = width > 0 && height > 0;
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const listed = filled ? listedMatch(group, short, long) : null;
  const size = filled && !listed ? customSize(group, short, long) : null;
  const pick = listed ?? size;

  let message: { tone: "ok" | "warn"; text: string } | null = null;
  if (filled && listed) {
    const commercial = same(listed.size.width, short) && same(listed.size.height, long);
    message = { tone: "ok", text: commercial
      ? `${listed.label} já está na lista, sem acréscimo.`
      : `É o tamanho real do ${listed.label.replace(" cm", "")}: fica como ${listed.label.replace(" cm", "")}, sem acréscimo.` };
  }
  else if (filled && group === "grande") {
    const band = bigBand(short, long);
    if (short > BIG_MAX.short || long > BIG_MAX.long) message = { tone: "warn", text: `Acima de ${BIG_MAX.short} × ${BIG_MAX.long} cm o valor é sob consulta. Fale com a gente no WhatsApp.` };
    else if (!size) message = { tone: "warn", text: `${band!.label} cm é sob consulta. Fale com a gente no WhatsApp.` };
    else message = { tone: "ok", text: `Faixa ${band!.label} cm: ${brl(size.price!)} cada.${long <= 45 && short <= 30 ? " Dica: até 30 × 45 sai mais barato em Ampliações." : ""}` };
  } else if (filled && !size) {
    message = group === "revelacao"
      ? { tone: "warn", text: "Maior que 15 × 21 cm? Escolha a aba Ampliações." }
      : { tone: "warn", text: "Maior que 30 × 45 cm? Escolha a aba Grandes formatos." };
  } else if (filled && size) {
    const base = size.base!;
    const price = group === "revelacao"
      ? `o preço de ${base.label.replace(" cm", "")} + ${brl(size.extra!)} por foto (1 foto: ${brl(TIERS[0][base.tier!] + size.extra!)})`
      : `${base.label.replace(" cm", "")} + ${brl(size.extra!)}: ${brl(size.prices![0])} (1 a 10) ou ${brl(size.prices![1])} (acima de 10)`;
    const tip = group === "ampliacao" && short <= 15 && long <= 21 ? " Dica: até 15 × 21 sai mais barato em Revelação." : "";
    message = { tone: "ok", text: `Cabe em ${base.label}. Fica ${price}.${tip}` };
  }
  const chosen = pick && value === pick.id;
  return (
    <form className="sp-custom" onSubmit={(event) => { event.preventDefault(); if (pick) onPick(pick.id); }}>
      <p className="sp-custom-title">Outro tamanho</p>
      <div className="sp-custom-row">
        <input aria-label="Largura em cm" inputMode="decimal" onChange={(e) => setW(e.target.value)} placeholder="Largura" value={w} />
        <span aria-hidden="true">×</span>
        <input aria-label="Altura em cm" inputMode="decimal" onChange={(e) => setH(e.target.value)} placeholder="Altura" value={h} />
        <span className="sp-custom-unit">cm</span>
        <button disabled={!pick || !!chosen} type="submit">{chosen ? "Escolhido" : "Usar"}</button>
      </div>
      {message ? <p className={`sp-custom-msg ${message.tone}`}>{message.text}</p> : null}
    </form>
  );
}

/** Quantidade de cópias digitável (os botões − e + ficam em volta). Vazio enquanto digita; ao sair, volta para o valor válido. */
export function CopiesInput({ value, onChange, className = "" }: { value: number; onChange: (copies: number) => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      aria-label="Cópias"
      className={`copies-input ${className}`}
      inputMode="numeric"
      onBlur={() => setDraft(null)}
      onChange={(event) => {
        const text = event.target.value.replace(/\D/g, "").slice(0, 4);
        setDraft(text);
        const copies = Number(text);
        if (copies >= 1) onChange(copies);
      }}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      pattern="[0-9]*"
      value={draft ?? String(value)}
    />
  );
}

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Envie as fotos", "Tamanho e ajustes", "Carrinho e WhatsApp"];
  return (
    <ol className="photo-steps" aria-label="Etapas do pedido">
      {steps.map((label, index) => (
        <li className={index + 1 === current ? "active" : index + 1 < current ? "done" : ""} key={label}>
          <span>{index + 1}</span>{label}
        </li>
      ))}
    </ol>
  );
}
