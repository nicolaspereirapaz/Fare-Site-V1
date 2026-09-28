"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Heart, MessageCircle, Minus, Plus, RefreshCw, ShoppingBag, Trash2, X } from "lucide-react";
import type { PublicCatalogProduct, PublicProductsResponse } from "@/lib/publicCatalog";
import { sentenceCaseProductName } from "@/lib/xbz";
import { type QuoteCartItem } from "@/lib/commerce";
import { buildOutubroRosaQuoteUrl } from "@/lib/outubroRosaQuote";
import styles from "@/app/campanhas/outubro-rosa/outubro-rosa.module.css";

const PAGE_SIZE = 24;
const STORAGE_KEY = "farefoto-outubro-rosa-cart-v1";
type CampaignResponse = PublicProductsResponse & { error?: string };
type CampaignCartItem = QuoteCartItem & { image: string };

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ProductCard({ product, configure }: { product: PublicCatalogProduct; configure: (product: PublicCatalogProduct) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <article className={styles.card}>
    <button className={styles.cardImage} onClick={() => configure(product)} type="button">
      {product.imageUrl && !imageFailed
        ? <Image alt={sentenceCaseProductName(product.name)} fill onError={() => setImageFailed(true)} sizes="(max-width: 640px) 86vw, (max-width: 1024px) 42vw, 280px" src={product.imageUrl} unoptimized />
        : <span className={styles.imageFallback}>Imagem indisponível</span>}
    </button>
    <div className={styles.cardBody}>
      <span className={styles.category}>{product.category}</span>
      <h3><button className={styles.titleButton} onClick={() => configure(product)} type="button">{sentenceCaseProductName(product.name)}</button></h3>
      <p>{product.colors.length ? `${product.colors.length} ${product.colors.length === 1 ? "cor disponível" : "cores disponíveis"}` : "Personalização sob consulta"}</p>
      <button className={styles.addButton} onClick={() => configure(product)} type="button"><ShoppingBag aria-hidden="true" size={17} /> Configurar produto</button>
    </div>
  </article>;
}

export function OutubroRosaCampaign() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<PublicCatalogProduct | null>(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<CampaignCartItem[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) setCart(JSON.parse(stored) as CampaignCartItem[]);
      } catch { /* armazenamento indisponível */ }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (storageReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); }, [cart, storageReady]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/campaigns/outubro-rosa/products?page=${page}&limit=${PAGE_SIZE}`, { cache: "no-store" })
      .then(async (response) => { const payload = (await response.json()) as CampaignResponse; if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os produtos."); return payload; })
      .then((payload) => { if (active) { setData(payload); setError(null); } })
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os produtos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, reloadKey]);

  const selectedVariant = useMemo(() => selected?.variants.find((item) => item.publicId === variantId) ?? selected?.variants[0], [selected, variantId]);
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);

  function configure(product: PublicCatalogProduct) { setSelected(product); setVariantId(product.variants[0]?.publicId ?? ""); setQuantity(1); }
  function addSelected() {
    if (!selected || !selectedVariant) return;
    setCart((current) => [...current, { id: newId(), productName: sentenceCaseProductName(selected.name), slug: `campanhas/outubro-rosa#${selected.publicId}`, quantity: Math.max(1, quantity), selections: { Variação: selectedVariant.label, Categoria: selected.category }, artworkName: null, unitPrice: null, image: selected.imageUrl }]);
    setSelected(null);
  }
  function finishOnWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.assign(buildOutubroRosaQuoteUrl({ name, company, phone, notes }, cart));
  }
  function changeQuantity(id: string, change: number) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(1, item.quantity + change) } : item));
  }

  return <div className={styles.catalog}>
    <header className={styles.catalogHeader}><div><span className={styles.heart}><Heart aria-hidden="true" size={17} /></span><div><h2 id="outubro-rosa-produtos">Escolha seus brindes</h2><p>Produtos selecionados para sua campanha, personalizados pela Fare Foto.</p></div></div>
      <div className={styles.headerActions}>{data && !loading ? <strong>{data.meta.total} produtos disponíveis</strong> : null}<a className={styles.cartShortcut} href="#carrinho-outubro-rosa"><ShoppingBag aria-hidden="true" size={17} /> Carrinho ({itemCount})</a></div>
    </header>
    {loading && !data ? <div className={styles.state} aria-live="polite"><RefreshCw aria-hidden="true" className={styles.spin} size={27} /><h3>Preparando a seleção</h3><p>Carregando o catálogo da campanha.</p></div> : null}
    {error ? <div className={styles.state} role="alert"><Heart aria-hidden="true" size={27} /><h3>Não foi possível carregar agora</h3><p>{error}</p><button className="button button-secondary" onClick={() => { setLoading(true); setReloadKey((value) => value + 1); }} type="button">Tentar novamente</button></div> : null}
    {!error && data?.products.length ? <div className={styles.grid}>{data.products.map((product) => <ProductCard configure={configure} key={product.publicId} product={product} />)}</div> : null}
    {!error && !loading && data?.products.length === 0 ? <div className={styles.state}><Heart aria-hidden="true" size={27} /><h3>Seleção em atualização</h3><p>Fale com a Fare Foto para conhecer outras opções para sua campanha.</p></div> : null}
    {!error && data && data.meta.total > 0 ? <nav aria-label="Paginação dos produtos" className={styles.pagination}>
      <button disabled={page === 1 || loading} onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} type="button"><ArrowLeft size={17} /> Anterior</button><span>Página <strong>{page}</strong> de {totalPages}</span><button disabled={page >= totalPages || loading} onClick={() => { setLoading(true); setPage((value) => value + 1); }} type="button">Próxima <ArrowRight size={17} /></button>
    </nav> : null}

    <section className={styles.campaignCart} id="carrinho-outubro-rosa">
      <div className={styles.cartItems}><span className="eyebrow">Seu pedido de orçamento</span><h2>Carrinho Outubro Rosa</h2>
        {!cart.length ? <p className={styles.emptyCart}>Configure os produtos acima para montar seu pedido.</p> : cart.map((item) => <article className={styles.cartItem} key={item.id}>
          <div className={styles.cartThumb}>{item.image ? <Image alt="" fill sizes="72px" src={item.image} unoptimized /> : null}</div>
          <div><h3>{item.productName}</h3><p>{item.selections.Variação}</p><div className={styles.quantityControl}><button aria-label="Diminuir quantidade" onClick={() => changeQuantity(item.id, -1)} type="button"><Minus size={15} /></button><span>{item.quantity}</span><button aria-label="Aumentar quantidade" onClick={() => changeQuantity(item.id, 1)} type="button"><Plus size={15} /></button></div></div>
          <button aria-label={`Remover ${item.productName}`} className={styles.removeButton} onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))} type="button"><Trash2 size={17} /></button>
        </article>)}
      </div>
      <form className={styles.quoteForm} onSubmit={finishOnWhatsApp}><span className="eyebrow">Atendimento direto</span><h2>Enviar pelo WhatsApp</h2><p>O pedido será organizado em uma mensagem. Você confirma valores e prazo antes da produção.</p>
        <label><span>Nome</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Empresa (opcional)</span><input value={company} onChange={(event) => setCompany(event.target.value)} /></label><label><span>WhatsApp para retorno</span><input inputMode="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label><span>Observações (opcional)</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <button className="button button-whatsapp button-large" disabled={!cart.length} type="submit"><MessageCircle size={19} /> Solicitar orçamento</button><small>Nenhum pagamento é realizado neste site.</small>
      </form>
    </section>

    {selected ? <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section aria-labelledby="config-product-title" aria-modal="true" className={styles.modal} role="dialog"><button aria-label="Fechar" className={styles.modalClose} onClick={() => setSelected(null)} type="button"><X size={20} /></button><div className={styles.modalImage}>{selected.imageUrl ? <Image alt={sentenceCaseProductName(selected.name)} fill sizes="360px" src={selected.imageUrl} unoptimized /> : null}</div><div className={styles.modalContent}><span className={styles.category}>{selected.category}</span><h2 id="config-product-title">{sentenceCaseProductName(selected.name)}</h2><label><span>Variação</span><select value={selectedVariant?.publicId ?? ""} onChange={(event) => setVariantId(event.target.value)}>{selected.variants.map((variant) => <option key={variant.publicId} value={variant.publicId}>{variant.label}</option>)}</select></label><label><span>Quantidade</span><input min={1} type="number" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><button className="button button-primary button-large" onClick={addSelected} type="button"><ShoppingBag size={18} /> Adicionar ao carrinho</button><small>Personalização, valor e prazo serão confirmados no atendimento.</small></div></section></div> : null}
  </div>;
}
