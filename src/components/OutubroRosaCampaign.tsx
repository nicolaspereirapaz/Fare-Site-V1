"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Heart, RefreshCw, Search, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import type { PublicProductsResponse } from "@/lib/publicCatalog";
import { OUTUBRO_ROSA_CART_EVENT, OUTUBRO_ROSA_CART_PATH, readCampaignCart } from "@/lib/outubroRosaCart";
import { OutubroRosaProductCard } from "@/components/OutubroRosaProductCard";
import styles from "@/app/(loja)/campanhas/outubro-rosa/outubro-rosa.module.css";

const PAGE_SIZE = 24;
type CampaignResponse = PublicProductsResponse & { error?: string };

function subscribeCart(onChange: () => void) {
  window.addEventListener(OUTUBRO_ROSA_CART_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OUTUBRO_ROSA_CART_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function OutubroRosaCampaign() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Mesmo número do ícone do topo: quantidade de produtos (linhas) no carrinho.
  const cartCount = useSyncExternalStore(subscribeCart, () => readCampaignCart().length, () => 0);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set("q", search);
    if (category !== "Todos") params.set("categoria", category);
    void fetch(`/api/campaigns/outubro-rosa/products?${params}`, { cache: "no-store" })
      .then(async (response) => { const payload = (await response.json()) as CampaignResponse; if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os produtos."); return payload; })
      .then((payload) => { if (active) { setData(payload); if (payload.categories) setCategories(payload.categories); if (payload.catalogTotal) setCatalogTotal(payload.catalogTotal); setError(null); } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os produtos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, reloadKey, search, category]);

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;
  const totalCount = catalogTotal || categories.reduce((total, item) => total + item.count, 0);
  const hasActiveFilters = search !== "" || category !== "Todos";

  function applyFilters(next: { search?: string; category?: string }) {
    setLoading(true);
    setPage(1);
    if (next.search !== undefined) setSearch(next.search);
    if (next.category !== undefined) setCategory(next.category);
  }
  function clearFilters() { setDraftSearch(""); applyFilters({ search: "", category: "Todos" }); }

  return <div className={styles.catalog}>
    <header className={styles.catalogHeader}><div><span className={styles.heart}><Heart aria-hidden="true" size={17} /></span><div><h2 id="outubro-rosa-produtos">Escolha seus brindes</h2><p>Produtos selecionados para sua campanha, personalizados pela Fare Foto.</p></div></div>
      <div className={styles.headerActions}><Link className={styles.cartShortcut} href={OUTUBRO_ROSA_CART_PATH}><ShoppingBag aria-hidden="true" size={17} /> Ver carrinho{cartCount ? ` (${cartCount})` : ""}</Link></div>
    </header>
    <div className="catalog-layout">
      <aside aria-label="Filtros da campanha" className="catalog-sidebar">
        <div className="catalog-sidebar-heading"><SlidersHorizontal aria-hidden="true" size={19} /><h2>Filtrar brindes</h2></div>
        <form className="catalog-search-field" onSubmit={(event) => { event.preventDefault(); applyFilters({ search: draftSearch.trim() }); }}>
          <span>Buscar produto</span>
          <span className="catalog-search-input"><Search aria-hidden="true" size={18} /><input aria-label="Buscar brindes da campanha" onChange={(event) => setDraftSearch(event.target.value)} placeholder="O que você procura?" type="search" value={draftSearch} /></span>
          <button className="catalog-search-submit" type="submit">Buscar</button>
        </form>
        <fieldset className="catalog-filter-group">
          <legend>Categorias</legend>
          <div className="catalog-category-options">
            {[{ name: "Todos", count: totalCount }, ...categories].map((item) => <label className="catalog-category-option" key={item.name}>
              <input checked={category === item.name} name="outubro-rosa-category" onChange={() => applyFilters({ category: item.name })} type="radio" value={item.name} />
              <span className="catalog-radio" aria-hidden="true" />
              <span>{item.name === "Todos" ? "Todos os brindes" : item.name}</span>
              <small>({item.count})</small>
            </label>)}
          </div>
        </fieldset>
        {hasActiveFilters ? <button className="catalog-clear-button" onClick={clearFilters} type="button"><X aria-hidden="true" size={16} /> Limpar filtros</button> : null}
        <p className="catalog-sidebar-note">Escolha o modelo ideal e consulte as opções de personalização para sua campanha.</p>
      </aside>
      <div className="catalog-results">
    <div className="catalog-result-row"><div><strong>{loading ? "Consultando…" : `${data?.meta.total ?? 0} ${data?.meta.total === 1 ? "produto" : "produtos"}`}</strong><span>Seleção especial Outubro Rosa.</span></div></div>
    {loading && !data ? <div className={styles.state} aria-live="polite"><RefreshCw aria-hidden="true" className={styles.spin} size={27} /><h3>Preparando a seleção</h3><p>Carregando o catálogo da campanha.</p></div> : null}
    {error ? <div className={styles.state} role="alert"><Heart aria-hidden="true" size={27} /><h3>Não foi possível carregar agora</h3><p>{error}</p><button className="button button-secondary" onClick={() => { setLoading(true); setReloadKey((value) => value + 1); }} type="button">Tentar novamente</button></div> : null}
    {!error && data?.products.length ? <div className={styles.grid}>{data.products.map((product) => <OutubroRosaProductCard key={product.publicId} product={product} />)}</div> : null}
    {!error && !loading && data?.products.length === 0 ? <div className={styles.state}><Search aria-hidden="true" size={27} /><h3>Nenhum produto encontrado</h3><p>Tente outro termo ou escolha uma categoria diferente.</p>{hasActiveFilters ? <button className="button button-secondary" onClick={clearFilters} type="button">Limpar filtros</button> : null}</div> : null}
    {!error && data && data.meta.total > 0 ? <nav aria-label="Paginação dos produtos" className={styles.pagination}>
      <button disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} type="button"><ArrowLeft size={17} /> Anterior</button><span>Página <strong>{page}</strong> de {totalPages}</span><button disabled={page >= totalPages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} type="button">Próxima <ArrowRight size={17} /></button>
    </nav> : null}
      </div>
    </div>
  </div>;
}
