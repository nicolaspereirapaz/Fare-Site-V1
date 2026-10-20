"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info, Maximize2, Search, SlidersHorizontal, X } from "lucide-react";
import { COLOR_GROUPS, colorGroupOf, colorGroupSwatch, isLightColorGroup } from "@/lib/colorGroups";
import { PRODUCT_CATEGORIES } from "@/lib/productCategories";
import { brl, useDebounced, type Product } from "@/components/staff/quoteEditorShared";
import { PHOTO_PRODUCT_IMAGE, SIZE_GROUPS, SIZES, type SizeGroup } from "@/components/fotos/catalog";

/**
 * Janela "Escolha o produto" (referência: brinde.me): busca + filtros à esquerda, grade de cards,
 * páginas no rodapé. Clique marca/desmarca (vários produtos, mesmo de páginas e buscas diferentes);
 * Confirmar abre a configuração de cada um, em fila. Duplo clique inclui o card e confirma na hora.
 * "Detalhes" abre foto grande, cores com estoque e medidas. Custo e estoque: só a equipe vê.
 */

export type PickedProduct = { product: Product; variant?: string };
type Match = { cost: number; stock: number; colors: number };
type PickerProduct = Product & { match: Match };
type Page = { products: PickerProduct[]; total: number; page: number; pages: number; colorCounts: Record<string, number> };

/** Brindes (catálogo dos fornecedores), Fotos (tabela da revelação) e Gráfica (em breve): cada um com os seus filtros. */
export type PickerTab = "brindes" | "fotos" | "grafica";
const TABS: [PickerTab, string][] = [["brindes", "Brindes"], ["fotos", "Fotos"], ["grafica", "Gráfica"]];

export type PickerState = {
  tab: PickerTab;
  query: string; supplier: string; colorGroup: string; category: string;
  minCost: number; maxCost: number; minStock: string; sort: string; page: number;
};

const COST_MAX = 800;
const STOCK_CHIPS = [["", "Qualquer"], ["100", "100+"], ["500", "500+"], ["1000", "1.000+"], ["5000", "5.000+"]] as const;
const SUPPLIERS = [["", "Todos os fornecedores"], ["xbz", "XBZ"], ["spot", "Spot"], ["asia", "Asia Import"]] as const;
const SORTS = [["relevancia", "Relevância"], ["menor-custo", "Menor custo"], ["maior-custo", "Maior custo"], ["mais-estoque", "Mais estoque"], ["nome", "Nome (A–Z)"]] as const;
export const EMPTY_PICKER: PickerState = { tab: "brindes", query: "", supplier: "", colorGroup: "", category: "", minCost: 0, maxCost: COST_MAX, minStock: "", sort: "relevancia", page: 1 };

const SUPPLIER_NAMES: Record<string, string> = { xbz: "XBZ", spot: "Spot", asia: "Asia Import" };
/** "XBZ 00518" → "00518" (o servidor manda o código já com o nome do fornecedor). */
const supplierCode = (product: Product) => product.supplierCode.replace(`${SUPPLIER_NAMES[product.supplier] ?? ""} `, "");
const units = (value: number) => value.toLocaleString("pt-BR");
const reaisInt = (value: number) => `R$ ${units(value)}`;

function pagesAround(page: number, pages: number) {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  return Array.from({ length: Math.min(5, pages) }, (_, index) => start + index);
}

/** Cor sugerida ao abrir a configuração: a de mais estoque entre as que atendem a TODOS os filtros (cor, custo e estoque). */
export function suggestedVariant(product: Product, state: PickerState) {
  const minStock = Number(state.minStock) || 0;
  const maxCost = state.maxCost >= COST_MAX ? Infinity : state.maxCost;
  const candidates = product.variants.filter((variant) => variant.stock >= minStock
    && variant.cost >= state.minCost && variant.cost <= maxCost
    && (!state.colorGroup || colorGroupOf(variant.label) === state.colorGroup));
  return candidates.sort((a, b) => b.stock - a.stock)[0]?.label;
}

/** Custo digitado no filtro ("0,50", "R$ 2,35") → número com centavos; vazio ou inválido → null. */
export function parseCostInput(text: string): number | null {
  const cleaned = text.replace(/[^\d,.]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

const costLabel = (value: number) => String(value).replace(".", ",");

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab e Shift+Tab giram dentro da janela (o foco não vai para a página de trás). */
function trapTab(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !event.currentTarget.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !event.currentTarget.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/* ------------------------------------------------------------------ detalhes */

function ProductDetails({ product, onClose, onUse }: { product: Product; onClose: () => void; onUse: (variant: string) => void }) {
  const [variant, setVariant] = useState(() => [...product.variants].sort((a, b) => b.stock - a.stock)[0]?.label ?? "");
  const current = product.variants.find((entry) => entry.label === variant);
  const costs = product.variants.map((entry) => entry.cost);
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const stock = product.variants.reduce((sum, entry) => sum + entry.stock, 0);
  const photo = current?.imageUrl || product.imageUrl;
  const closeRef = useRef<HTMLButtonElement>(null);
  const [specs, setSpecs] = useState<Array<{ label: string; value: string }> | null>(null);

  // Medidas: buscadas ao abrir (a XBZ não manda no catálogo; o servidor lê e guarda).
  useEffect(() => {
    let alive = true;
    fetch(`/api/backoffice/orcamento-editor/medidas?id=${encodeURIComponent(product.publicId)}`)
      .then((response) => (response.ok ? response.json() : { specs: [] }))
      .then((data: { specs?: Array<{ label: string; value: string }> }) => alive && setSpecs(data.specs ?? []))
      .catch(() => alive && setSpecs([]));
    return () => { alive = false; };
  }, [product.publicId]);

  // Foco entra na janela ao abrir e volta para onde estava ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return (
    <div className="qe-scrim qe-pk-scrim-top" onClick={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <div aria-labelledby="qe-pk-det-title" aria-modal="true" className="qe-modal qe-pk-det" onKeyDown={trapTab} role="dialog">
        <header className="qe-modal-head">
          <h2 id="qe-pk-det-title">Detalhes do produto</h2>
          <button aria-label="Fechar detalhes" className="qe-modal-x" onClick={onClose} ref={closeRef} type="button"><X size={18} /></button>
        </header>
        <div className="qe-pk-det-body">
          <div className="qe-pk-det-photo">
            <div className="qe-pk-det-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo ? <img alt={`${product.name} — ${variant}`} src={photo} /> : <span>Produto sem foto.</span>}
            </div>
          </div>
          <div className="qe-pk-det-info">
            <h3>{product.name}</h3>
            <dl className="qe-pk-det-codes">
              <div><dt>Código Fare</dt><dd>{product.fareCode || "—"}</dd></div>
              <div><dt>Fornecedor</dt><dd>{product.supplierCode}</dd></div>
              <div><dt>Categoria</dt><dd>{product.category}</dd></div>
              <div><dt>Custo</dt><dd>{min === max ? brl(min) : `${brl(min)} a ${brl(max)}`}</dd></div>
              <div><dt>Estoque total</dt><dd>{units(stock)} un.</dd></div>
            </dl>
            <p className="qe-pk-det-label">Cores e estoque · {product.variants.length} {product.variants.length === 1 ? "cor" : "cores"}</p>
            <ul className="qe-pk-det-colors">
              {product.variants.map((entry) => (
                <li key={entry.label}>
                  <button aria-pressed={entry.label === variant} className={entry.label === variant ? "on" : undefined} onClick={() => setVariant(entry.label)} type="button">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {entry.imageUrl ? <img alt="" loading="lazy" src={entry.imageUrl} /> : <i />}
                    <span>{entry.label}</span>
                    <small>{units(entry.stock)} un. · {brl(entry.cost)}</small>
                  </button>
                </li>
              ))}
            </ul>
            {specs === null ? <p className="qe-pk-det-label">Carregando medidas…</p> : specs.length ? (
              <>
                <p className="qe-pk-det-label">Medidas</p>
                <dl className="qe-pk-det-codes qe-pk-det-specs">
                  {specs.map((spec) => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}
                </dl>
              </>
            ) : null}
          </div>
        </div>
        <footer className="qe-modal-foot">
          <button className="qe-btn qe-btn-secondary" onClick={onClose} type="button">Voltar</button>
          <button className="qe-btn qe-btn-primary" onClick={() => onUse(variant)} type="button">Selecionar</button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ janela */

export function ProductPickerModal({ initial, onClose, onPick, onPickPhoto, onStateChange }: {
  initial: PickerState;
  onClose: () => void;
  /** Produtos marcados, na ordem do clique (a configuração abre em fila). */
  onPick: (picked: PickedProduct[]) => void;
  /** Tipo de foto escolhido na aba Fotos: abre a configuração (tamanho, papel, cópias e preço). */
  onPickPhoto: (group: SizeGroup) => void;
  /** Guarda busca e filtros para a próxima vez que a janela abrir (adicionar vários produtos). */
  onStateChange: (state: PickerState) => void;
}) {
  const [state, setState] = useState<PickerState>(initial);
  const [costText, setCostText] = useState({ min: costLabel(initial.minCost), max: costLabel(initial.maxCost) });
  const [data, setData] = useState<Page | null>(null);
  /** Busca já respondida; diferente da atual = carregando (sem setState síncrono no efeito). */
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<PickedProduct[]>([]);
  const [details, setDetails] = useState<Product | null>(null);
  /** Celular: filtros recolhidos atrás do botão "Filtros" (no computador ficam sempre abertos). */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef(details);
  useEffect(() => {
    detailsRef.current = details;
  }, [details]);

  const query = useDebounced(state.query.trim(), 250);
  const costs = useDebounced(`${state.minCost}-${state.maxCost}`, 300);
  const stock = useDebounced(state.minStock, 300);

  const set = (change: Partial<PickerState>) => setState((current) => ({ ...current, page: 1, ...change }));

  useEffect(() => onStateChange(state), [state, onStateChange]);

  // Esc fecha os detalhes primeiro, depois a janela; a página de trás não rola.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detailsRef.current) setDetails(null);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const { supplier, colorGroup, category, sort, page, tab } = state;
  useEffect(() => {
    if (tab !== "brindes") return;
    const [minCost, maxCost] = costs.split("-").map(Number);
    const params = new URLSearchParams({ pagina: String(page), ordem: sort });
    if (query) params.set("q", query);
    if (supplier) params.set("fornecedor", supplier);
    if (colorGroup) params.set("cor", colorGroup);
    if (category) params.set("categoria", category);
    if (minCost > 0) params.set("custoMin", String(minCost));
    if (maxCost < COST_MAX) params.set("custoMax", String(maxCost));
    if (Number(stock) > 0) params.set("estoqueMin", stock);
    // Igual ao requestKey abaixo, senão o aviso "atualizando…" nunca some.
    const key = `${query}|${supplier}|${colorGroup}|${category}|${sort}|${page}|${costs}|${stock}`;
    let active = true;
    fetch(`/api/backoffice/orcamento-editor/produtos?${params}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Sessão expirada. Entre de novo." : "Não foi possível buscar os produtos.");
        return response.json() as Promise<Page>;
      })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setError(null);
        gridRef.current?.scrollTo({ top: 0 });
      })
      .catch((caught: unknown) => active && setError(caught instanceof Error ? caught.message : "Erro inesperado."))
      .finally(() => active && setLoadedKey(key));
    return () => {
      active = false;
    };
  }, [query, supplier, colorGroup, category, sort, page, costs, stock, tab]);

  function commitCost(which: "min" | "max", text: string) {
    const value = parseCostInput(text);
    const minCost = which === "min" ? (value !== null ? Math.min(Math.max(value, 0), state.maxCost) : 0) : state.minCost;
    const maxCost = which === "max" ? (value !== null ? Math.max(Math.min(value, COST_MAX), state.minCost) : COST_MAX) : state.maxCost;
    set({ minCost, maxCost });
    setCostText({ min: costLabel(minCost), max: costLabel(maxCost) });
  }

  function slide(which: "min" | "max", value: number) {
    const minCost = which === "min" ? Math.min(value, state.maxCost) : state.minCost;
    const maxCost = which === "max" ? Math.max(value, state.minCost) : state.maxCost;
    set({ minCost, maxCost });
    setCostText({ min: costLabel(minCost), max: costLabel(maxCost) });
  }

  const isChosen = (product: Product) => chosen.some((entry) => entry.product.publicId === product.publicId);
  /** Marca/desmarca; a cor sugerida segue os filtros do momento em que o produto foi marcado. */
  const toggle = (product: Product) => setChosen((list) => (list.some((entry) => entry.product.publicId === product.publicId)
    ? list.filter((entry) => entry.product.publicId !== product.publicId)
    : [...list, { product, variant: suggestedVariant(product, state) }]));
  /** Detalhes: marca com a cor escolhida (ou troca a cor, se já estava marcado). */
  const choose = (product: Product, variant: string) => setChosen((list) => (list.some((entry) => entry.product.publicId === product.publicId)
    ? list.map((entry) => (entry.product.publicId === product.publicId ? { product, variant } : entry))
    : [...list, { product, variant }]));
  /** Duplo clique / Enter: inclui o card (se ainda não estava) e confirma todos. */
  const confirmWith = (product: Product) => onPick(isChosen(product) ? chosen : [...chosen, { product, variant: suggestedVariant(product, state) }]);
  const requestKey = `${query}|${supplier}|${colorGroup}|${category}|${sort}|${page}|${costs}|${stock}`;
  const loading = loadedKey !== requestKey;
  const activeFilters = [state.supplier, state.colorGroup, state.category, state.minCost > 0 || state.maxCost < COST_MAX, state.minStock].filter(Boolean).length;
  const filtered = Boolean(state.supplier || state.colorGroup || state.category || state.minCost > 0 || state.maxCost < COST_MAX || state.minStock || state.query.trim());
  const pages = data?.pages ?? 1;
  const current = data?.page ?? 1;
  const goto = (target: number) => setState((value) => ({ ...value, page: Math.min(Math.max(target, 1), pages) }));
  const left = (state.minCost / COST_MAX) * 100;
  const right = 100 - (state.maxCost / COST_MAX) * 100;

  return (
    <div className="qe-scrim" role="presentation">
      <div aria-labelledby="qe-pk-title" aria-modal="true" className="qe-modal qe-pk" onKeyDown={trapTab} role="dialog">
        <header className="qe-modal-head">
          <h2 id="qe-pk-title">Escolha o produto</h2>
          <button aria-label="Fechar" className="qe-modal-x" onClick={onClose} type="button"><X size={18} /></button>
        </header>
        <div aria-label="Tipo de produto" className="qe-pk-tabs" role="tablist">
          {TABS.map(([value, label]) => (
            <button aria-selected={tab === value} className={tab === value ? "on" : undefined} key={value} onClick={() => setState((current) => ({ ...current, tab: value }))} role="tab" type="button">{label}</button>
          ))}
        </div>

        {tab === "fotos" ? <PhotoPanel onPick={onPickPhoto} /> : null}
        {tab === "grafica" ? <p className="qe-pk-empty qe-pk-soon">Gráfica &amp; Impressos: em breve (os filtros chegam junto com o catálogo).</p> : null}
        {tab === "brindes" ? (
        <div className="qe-pk-body">
          <aside className={`qe-pk-side${filtersOpen ? " open" : ""}`}>
            <div className="qe-search">
              <Search aria-hidden="true" size={16} />
              <input aria-label="Buscar produto" onChange={(event) => set({ query: event.target.value })} placeholder="Buscar produto..." ref={searchRef} value={state.query} />
            </div>

            <div className="qe-pk-filters-head">
              <span className="qe-pk-filters-title">Filtros</span>
              <button aria-controls="qe-pk-filter-groups" aria-expanded={filtersOpen} className="qe-pk-filtertoggle" onClick={() => setFiltersOpen((open) => !open)} type="button">
                <SlidersHorizontal aria-hidden="true" size={15} />
                Filtros{activeFilters ? ` (${activeFilters})` : ""}
                <ChevronDown aria-hidden="true" className="qe-pk-chev" size={15} />
              </button>
              {filtered ? (
                <button className="qe-btn-text" onClick={() => { setState({ ...EMPTY_PICKER, tab: "brindes" }); setCostText({ min: "0", max: costLabel(COST_MAX) }); }} type="button">Limpar</button>
              ) : null}
            </div>

            <div className="qe-pk-groups" id="qe-pk-filter-groups">
              <label className="qe-pk-group">
                <span>Fornecedor</span>
                <select onChange={(event) => set({ supplier: event.target.value })} value={state.supplier}>
                  {SUPPLIERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>

              <div className="qe-pk-group">
                <span id="qe-pk-color-label">Grupo de cores</span>
                <div aria-labelledby="qe-pk-color-label" className="qe-pk-colors" role="radiogroup">
                  <button aria-checked={!state.colorGroup} className={!state.colorGroup ? "on" : undefined} onClick={() => set({ colorGroup: "" })} role="radio" type="button">
                    <i className="qe-pk-dot qe-pk-dot-all" />Todos os grupos
                  </button>
                  {COLOR_GROUPS.map((group) => {
                    const count = data?.colorCounts[group.name] ?? 0;
                    if (!count && state.colorGroup !== group.name) return null;
                    return (
                      <button aria-checked={state.colorGroup === group.name} className={state.colorGroup === group.name ? "on" : undefined} key={group.name} onClick={() => set({ colorGroup: group.name })} role="radio" type="button">
                        <i className={`qe-pk-dot${isLightColorGroup(group.name) ? " light" : ""}`} style={colorGroupSwatch(group.name)} />
                        {group.name}
                        <small>{units(count)}</small>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="qe-pk-group">
                <span>Categoria</span>
                <select onChange={(event) => set({ category: event.target.value })} value={state.category}>
                  <option value="">Todas as categorias</option>
                  {PRODUCT_CATEGORIES.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>

              <div className="qe-pk-group">
                <span>Custo por peça</span>
                <div className="qe-pk-range">
                  <div className="qe-pk-track"><div style={{ left: `${left}%`, right: `${right}%` }} /></div>
                  <input aria-label="Custo mínimo" max={COST_MAX} min={0} onChange={(event) => slide("min", Number(event.target.value))} step={1} type="range" value={state.minCost} />
                  <input aria-label="Custo máximo" max={COST_MAX} min={0} onChange={(event) => slide("max", Number(event.target.value))} step={1} type="range" value={state.maxCost} />
                </div>
                <div className="qe-pk-range-fields">
                  <label><span>R$</span><input aria-label="Custo mínimo em reais" inputMode="numeric" onBlur={(event) => commitCost("min", event.target.value)} onChange={(event) => setCostText({ ...costText, min: event.target.value })} onKeyDown={(event) => event.key === "Enter" && commitCost("min", event.currentTarget.value)} value={costText.min} /></label>
                  <i>–</i>
                  <label><span>R$</span><input aria-label="Custo máximo em reais" inputMode="numeric" onBlur={(event) => commitCost("max", event.target.value)} onChange={(event) => setCostText({ ...costText, max: event.target.value })} onKeyDown={(event) => event.key === "Enter" && commitCost("max", event.currentTarget.value)} value={costText.max} /></label>
                </div>
                {state.maxCost >= COST_MAX ? <small className="qe-pk-help">{reaisInt(COST_MAX)} = sem limite</small> : null}
              </div>

              <div className="qe-pk-group">
                <span>Estoque mínimo (numa cor)</span>
                <label className="qe-pk-stock">
                  <input aria-label="Estoque mínimo" inputMode="numeric" onChange={(event) => set({ minStock: event.target.value.replace(/\D/g, "").slice(0, 7) })} placeholder="Qualquer" value={state.minStock} />
                  <span>un.</span>
                </label>
                <div className="qe-pk-chips">
                  {STOCK_CHIPS.map(([value, label]) => (
                    <button aria-pressed={state.minStock === value} className={state.minStock === value ? "on" : undefined} key={label} onClick={() => set({ minStock: value })} type="button">{label}</button>
                  ))}
                </div>
              </div>
              <button className="qe-btn qe-btn-primary qe-pk-apply" onClick={() => setFiltersOpen(false)} type="button">
                {data ? `Ver ${units(data.total)} ${data.total === 1 ? "produto" : "produtos"}` : "Ver produtos"}
              </button>
            </div>
          </aside>

          <section className="qe-pk-main">
            <div className="qe-pk-top">
              <span className="qe-pk-count">{data ? `${units(data.total)} ${data.total === 1 ? "produto" : "produtos"}` : "Carregando…"}{loading && data ? " · atualizando…" : ""}</span>
              <label className="qe-pk-sort">
                <span>Ordenar</span>
                <select aria-label="Ordenar" onChange={(event) => set({ sort: event.target.value })} value={state.sort}>
                  {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            <div aria-label="Produtos" aria-multiselectable="true" className={`qe-pk-grid${loading ? " is-loading" : ""}`} ref={gridRef} role="listbox">
              {error ? <p className="qe-error">{error}</p> : null}
              {!error && data && !data.products.length ? <p className="qe-pk-empty">Nenhum produto com esses filtros.</p> : null}
              {!data && !error ? <p className="qe-pk-empty">Carregando catálogo… (a 1ª busca pode levar alguns segundos)</p> : null}
              {data?.products.map((product) => {
                const isSelected = isChosen(product);
                return (
                  <div
                    aria-label={product.name}
                    aria-selected={isSelected}
                    className={`qe-pk-card${isSelected ? " selected" : ""}`}
                    key={product.publicId}
                    onClick={(event) => event.detail < 2 && toggle(product)}
                    onDoubleClick={() => confirmWith(product)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter") confirmWith(product);
                      if (event.key === " ") { event.preventDefault(); toggle(product); }
                    }}
                    role="option"
                    tabIndex={0}
                  >
                    <div className="qe-pk-photo">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {product.imageUrl ? <img alt="" loading="lazy" src={product.imageUrl} /> : <span>Sem foto</span>}
                      {isSelected ? <span aria-hidden="true" className="qe-pk-check"><Check size={14} strokeWidth={3} /></span> : null}
                      <button aria-label={`Detalhes de ${product.name}`} className="qe-pk-detbtn" onClick={(event) => { event.stopPropagation(); setDetails(product); }} title="Detalhes" type="button">
                        <Maximize2 size={14} /> Detalhes
                      </button>
                    </div>
                    <b className="qe-pk-name" title={product.name}>{product.name}</b>
                    <small className="qe-pk-code">{product.fareCode} · {supplierCode(product)}</small>
                    <small className="qe-pk-sup">{SUPPLIER_NAMES[product.supplier] ?? product.supplier}</small>
                    <span className="qe-pk-cost">{brl(product.match.cost)}</span>
                    <small className="qe-pk-stockline">
                      {units(product.match.stock)} em estoque
                      <button aria-label={`Cores e estoque de ${product.name}`} className="qe-pk-info" onClick={(event) => { event.stopPropagation(); setDetails(product); }} title={`${product.variants.length} ${product.variants.length === 1 ? "cor" : "cores"}`} type="button"><Info size={13} /></button>
                    </small>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        ) : null}

        {tab !== "brindes" ? (
          <footer className="qe-modal-foot qe-pk-foot">
            <span className="qe-pk-pageinfo">{tab === "fotos" ? "Escolha o tipo; tamanho, papel e cópias vêm na próxima tela." : ""}</span>
            <button className="qe-btn qe-btn-secondary" onClick={onClose} type="button">Voltar</button>
          </footer>
        ) : (
        <footer className="qe-modal-foot qe-pk-foot">
          <span className="qe-pk-pageinfo">{data ? `Página ${units(current)} de ${units(pages)} • ${units(data.total)} resultados` : ""}</span>
          <nav aria-label="Páginas" className="qe-pk-pager">
            <button aria-label="Primeira página" disabled={current <= 1} onClick={() => goto(1)} type="button"><ChevronsLeft size={15} /></button>
            <button aria-label="Página anterior" disabled={current <= 1} onClick={() => goto(current - 1)} type="button"><ChevronLeft size={15} /></button>
            {pagesAround(current, pages).map((number) => (
              <button aria-current={number === current ? "page" : undefined} className={number === current ? "on" : undefined} key={number} onClick={() => goto(number)} type="button">{number}</button>
            ))}
            <button aria-label="Próxima página" disabled={current >= pages} onClick={() => goto(current + 1)} type="button"><ChevronRight size={15} /></button>
            <button aria-label="Última página" disabled={current >= pages} onClick={() => goto(pages)} type="button"><ChevronsRight size={15} /></button>
          </nav>
          {chosen.length ? (
            <span className="qe-pk-chosen">
              {chosen.length} {chosen.length === 1 ? "selecionado" : "selecionados"}
              <button aria-label="Limpar seleção" className="qe-btn-text" onClick={() => setChosen([])} type="button">Limpar</button>
            </span>
          ) : null}
          <button className="qe-btn qe-btn-secondary" onClick={onClose} type="button">Voltar</button>
          <button className="qe-btn qe-btn-primary" disabled={!chosen.length} onClick={() => onPick(chosen)} type="button">
            {chosen.length ? `Confirmar (${chosen.length})` : "Confirmar"}
          </button>
        </footer>
        )}
      </div>

      {details ? <ProductDetails onClose={() => setDetails(null)} onUse={(variant) => { choose(details, variant); setDetails(null); }} product={details} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ fotos */

const sizeRange = (group: SizeGroup) => {
  const list = SIZES.filter((size) => size.group === group);
  return `${list[0].label.replace(" cm", "")} a ${list[list.length - 1].label}`;
};

/** Aba Fotos: os três tipos, como na página do cliente. Clique abre a configuração da foto. */
function PhotoPanel({ onPick }: { onPick: (group: SizeGroup) => void }) {
  return (
    <div className="qe-pk-photos">
      {SIZE_GROUPS.map((group) => (
        <button className="qe-pk-photo-type" key={group.id} onClick={() => onPick(group.id)} type="button">
          <span className="qe-pk-photo-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={PHOTO_PRODUCT_IMAGE[group.id]} />
          </span>
          <b>{group.label}</b>
          <small>{sizeRange(group.id)}</small>
          <em>{group.id === "grande" ? "Pronto em 3 dias úteis" : "Pronto em 1 hora"}</em>
        </button>
      ))}
    </div>
  );
}
