"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Heart, MessageCircle, Minus, Plus, RefreshCw, Search, ShoppingBag, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { PublicProductsResponse } from "@/lib/publicCatalog";
import { buildOutubroRosaQuoteUrl } from "@/lib/outubroRosaQuote";
import { readCampaignCart, writeCampaignCart, type CampaignCartItem } from "@/lib/outubroRosaCart";
import { OutubroRosaProductCard } from "@/components/OutubroRosaProductCard";
import styles from "@/app/campanhas/outubro-rosa/outubro-rosa.module.css";

const PAGE_SIZE = 24;
type CampaignResponse = PublicProductsResponse & { error?: string };

export function OutubroRosaCampaign() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [categories, setCategories] = useState<Array<{ name: string; count: number }>>([]);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [cart, setCart] = useState<CampaignCartItem[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCart(readCampaignCart());
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (storageReady) writeCampaignCart(cart); }, [cart, storageReady]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set("q", search);
    if (category !== "Todos") params.set("categoria", category);
    void fetch(`/api/campaigns/outubro-rosa/products?${params}`, { cache: "no-store" })
      .then(async (response) => { const payload = (await response.json()) as CampaignResponse; if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os produtos."); return payload; })
      .then((payload) => { if (active) { setData(payload); if (payload.categories?.length) setCategories(payload.categories); setError(null); } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os produtos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, reloadKey, search, category]);

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
  const totalCount = categories.reduce((total, item) => total + item.count, 0);
  const hasActiveFilters = search !== "" || category !== "Todos";

  function applyFilters(next: { search?: string; category?: string }) {
    setLoading(true);
    setPage(1);
    if (next.search !== undefined) setSearch(next.search);
    if (next.category !== undefined) setCategory(next.category);
  }
  function clearFilters() { setDraftSearch(""); applyFilters({ search: "", category: "Todos" }); }

  function finishOnWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.assign(buildOutubroRosaQuoteUrl({ name, company, phone, notes }, cart));
  }
  function changeQuantity(id: string, change: number) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, item.quantity + change) } : item));
  }

  return <div className={styles.catalog}>
    <header className={styles.catalogHeader}><div><span className={styles.heart}><Heart aria-hidden="true" size={17} /></span><div><h2 id="outubro-rosa-produtos">Escolha seus brindes</h2><p>Produtos selecionados para sua campanha, personalizados pela Fare Foto.</p></div></div>
      <div className={styles.headerActions}><a className={styles.cartShortcut} href="#carrinho-outubro-rosa"><ShoppingBag aria-hidden="true" size={17} /> Carrinho ({itemCount})</a></div>
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

    <section className={styles.campaignCart} id="carrinho-outubro-rosa">
      <div className={styles.cartItems}><span className="eyebrow">Seu pedido de orçamento</span><h2>Carrinho Outubro Rosa</h2>
        {!cart.length ? <p className={styles.emptyCart}>Configure os produtos acima para montar seu pedido.</p> : cart.map((item) => <article className={styles.cartItem} key={item.id}>
          <div className={styles.cartThumb}>{item.image ? <Image alt="" fill sizes="72px" src={item.image} unoptimized /> : null}</div>
          <div><h3>{item.productName}</h3><p>{item.selections.Cor ?? item.selections.Variação}</p><div className={styles.quantityControl}><button aria-label="Diminuir quantidade" onClick={() => changeQuantity(item.id, -1)} type="button"><Minus size={15} /></button><span>{item.quantity}</span><button aria-label="Aumentar quantidade" onClick={() => changeQuantity(item.id, 1)} type="button"><Plus size={15} /></button></div></div>
          <button aria-label={`Remover ${item.productName}`} className={styles.removeButton} onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))} type="button"><Trash2 size={17} /></button>
        </article>)}
      </div>
      <form className={styles.quoteForm} onSubmit={finishOnWhatsApp}><span className="eyebrow">Atendimento direto</span><h2>Enviar pelo WhatsApp</h2><p>O pedido será organizado em uma mensagem. Você confirma valores e prazo antes da produção.</p>
        <label><span>Nome</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Empresa (opcional)</span><input value={company} onChange={(event) => setCompany(event.target.value)} /></label><label><span>WhatsApp para retorno</span><input inputMode="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label><span>Observações (opcional)</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button className="button button-whatsapp button-large" disabled={!cart.length} type="submit"><MessageCircle size={19} /> Solicitar orçamento</button><small>Nenhum pagamento é realizado neste site.</small>
      </form>
    </section>

  </div>;
}
