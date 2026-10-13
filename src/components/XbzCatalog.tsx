"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ArrowUpDown, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { ColorDots } from "@/components/ColorDots";
import { formatProductName } from "@/lib/xbz";
import type { PublicCatalogProduct, PublicProductsResponse } from "@/lib/publicCatalog";
import { CATALOG_SORTS, PRICE_SORTS, SORT_LABELS, type CatalogSort } from "@/lib/catalogQuery";

const PAGE_SIZE = 24;

type CategoryCount = { name: string; count: number };

/** Atalhos de quantidade (os mesmos da tabela de preços do produto). */
const QUANTITY_SHORTCUTS = [50, 100, 250, 500, 1000];

type Filters = { quantity: string; minPrice: string; maxPrice: string };
const EMPTY_FILTERS: Filters = { quantity: "", minPrice: "", maxPrice: "" };

function onlyDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function priceInput(value: string) {
  return value.replace(/[^\d,.]/g, "").slice(0, 9);
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function XbzProductCard({ product, pricesVisible }: { product: PublicCatalogProduct; pricesVisible: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = `/brindes/${encodeURIComponent(product.publicId)}`;
  const hasPrice = pricesVisible && typeof product.startingPrice === "number";

  return (
    <article className="product-card">
      <Link className="product-card-image supplier-photo" href={href}>
        {product.imageUrl && !imageFailed ? (
          <Image
            alt={formatProductName(product.name)}
            fill
            onError={() => setImageFailed(true)}
            sizes="(max-width: 640px) 82vw, (max-width: 1024px) 42vw, 280px"
            src={product.imageUrl}
            unoptimized
          />
        ) : (
          <span className="product-image-fallback">Sem imagem</span>
        )}
      </Link>
      <div className="product-card-content">
        <span className="product-card-meta">
          <span className="product-category">{product.category}</span>
          {product.code ? <span className="product-code">Cód. {product.code}</span> : null}
        </span>
        <h3>
          <Link href={href}>{formatProductName(product.name)}</Link>
        </h3>
        {product.colors.length ? <ColorDots colors={product.colors} /> : <p>Personalização sob consulta</p>}
        <div className="product-card-footer">
          {hasPrice ? (
            <div>
              <small>{product.priceQuantity ? "Por unidade" : "A partir de"}</small>
              <strong>{currency.format(product.startingPrice as number)}</strong>
              <small>/un. · pedido de {(product.priceQuantity ?? 100).toLocaleString("pt-BR")} un.</small>
            </div>
          ) : pricesVisible ? (
            <div>
              <small>Valor</small>
              <strong>Sob consulta</strong>
            </div>
          ) : (
            <div>
              <small>Preços para clientes</small>
              <strong>Entre para ver o valor</strong>
            </div>
          )}
          <Link aria-label={`Ver ${formatProductName(product.name)}`} href={href}>
            <ArrowUpRight aria-hidden="true" size={20} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function XbzCatalog({ initialCategory = "Todos" }: { initialCategory?: string } = {}) {
  const [data, setData] = useState<(PublicProductsResponse & { pricesVisible?: boolean }) | null>(null);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<CatalogSort>("relevancia");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      if (category !== "Todos") params.set("categoria", category);
      if (filters.quantity) params.set("qtd", filters.quantity);
      if (filters.minPrice) params.set("precoMin", filters.minPrice);
      if (filters.maxPrice) params.set("precoMax", filters.maxPrice);
      if (sort !== "relevancia") params.set("ordem", sort);

      try {
        const response = await fetch(`/api/xbz/products?${params}`, { cache: "no-store" });
        const payload = (await response.json()) as PublicProductsResponse & { pricesVisible?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o catálogo.");
        setData(payload);
        if (payload.categories?.length) setCategories(payload.categories);
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Erro inesperado.");
      } finally {
        setLoading(false);
      }
    },
    [category, filters, page, search, sort],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      if (category !== "Todos") params.set("categoria", category);
      if (filters.quantity) params.set("qtd", filters.quantity);
      if (filters.minPrice) params.set("precoMin", filters.minPrice);
      if (filters.maxPrice) params.set("precoMax", filters.maxPrice);
      if (sort !== "relevancia") params.set("ordem", sort);

      try {
        const response = await fetch(`/api/xbz/products?${params}`, { cache: "no-store" });
        const payload = (await response.json()) as PublicProductsResponse & { pricesVisible?: boolean; error?: string };
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o catálogo.");
        setData(payload);
        if (payload.categories?.length) setCategories(payload.categories);
        setError(null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Erro inesperado.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [category, filters, page, search, sort]);

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;
  const pricesVisible = Boolean(data?.pricesVisible);
  const hasActiveFilters = search !== "" || category !== "Todos" || filters.quantity !== "" || filters.minPrice !== "" || filters.maxPrice !== "";
  const sortOptions = CATALOG_SORTS.filter((option) => pricesVisible || !PRICE_SORTS.has(option));

  function applyFilters(next: Filters = draftFilters) {
    const min = next.minPrice.replace(",", ".");
    const max = next.maxPrice.replace(",", ".");
    // Faixa invertida (mín. maior que máx.): troca os dois em vez de não mostrar nada.
    const swap = min && max && Number(min) > Number(max);
    const clean = { quantity: next.quantity, minPrice: swap ? next.maxPrice : next.minPrice, maxPrice: swap ? next.minPrice : next.maxPrice };
    setDraftFilters(clean);
    setLoading(true);
    setPage(1);
    setFilters(clean);
  }

  const totalCount = useMemo(
    () => categories.reduce((total, item) => total + item.count, 0),
    [categories],
  );

  function clearFilters() {
    setLoading(true);
    setDraftSearch("");
    setSearch("");
    setCategory("Todos");
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <div className="catalog-layout">
      <aside aria-label="Filtros do catálogo" className="catalog-sidebar">
        <div className="catalog-sidebar-heading">
          <SlidersHorizontal aria-hidden="true" size={19} />
          <h2>Filtrar brindes</h2>
        </div>

        <form
          className="catalog-search-field"
          onSubmit={(event) => {
            event.preventDefault();
            setLoading(true);
            setPage(1);
            setSearch(draftSearch.trim());
          }}
        >
          <span>Buscar produto</span>
          <span className="catalog-search-input">
            <Search aria-hidden="true" size={18} />
            <input
              aria-label="Buscar brindes"
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="O que você procura?"
              type="search"
              value={draftSearch}
            />
          </span>
          <button className="catalog-search-submit" type="submit">
            Buscar
          </button>
        </form>

        <form
          className="catalog-filter-group catalog-refine"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters();
          }}
        >
          <fieldset className="catalog-refine-field">
            <legend>Quantidade</legend>
            <label className="catalog-number-input">
              <input
                aria-label="Quantidade"
                inputMode="numeric"
                onChange={(event) => setDraftFilters((current) => ({ ...current, quantity: onlyDigits(event.target.value) }))}
                placeholder="Ex.: 300"
                value={draftFilters.quantity}
              />
              <span aria-hidden="true">un.</span>
            </label>
            <div className="catalog-chips" role="group" aria-label="Quantidades comuns">
              {QUANTITY_SHORTCUTS.map((quantity) => (
                <button
                  aria-pressed={filters.quantity === String(quantity)}
                  className={filters.quantity === String(quantity) ? "catalog-chip active" : "catalog-chip"}
                  key={quantity}
                  onClick={() => applyFilters({ ...draftFilters, quantity: filters.quantity === String(quantity) ? "" : String(quantity) })}
                  type="button"
                >
                  {quantity.toLocaleString("pt-BR")}
                </button>
              ))}
            </div>
            <small>Mostra só brindes com estoque para essa quantidade em pelo menos uma cor.</small>
          </fieldset>

          {pricesVisible ? (
            <fieldset className="catalog-refine-field">
              <legend>Preço por unidade</legend>
              <div className="catalog-price-range">
                <label className="catalog-number-input">
                  <span aria-hidden="true">R$</span>
                  <input
                    aria-label="Preço mínimo por unidade"
                    inputMode="decimal"
                    onChange={(event) => setDraftFilters((current) => ({ ...current, minPrice: priceInput(event.target.value) }))}
                    placeholder="mín."
                    value={draftFilters.minPrice}
                  />
                </label>
                <span aria-hidden="true">–</span>
                <label className="catalog-number-input">
                  <span aria-hidden="true">R$</span>
                  <input
                    aria-label="Preço máximo por unidade"
                    inputMode="decimal"
                    onChange={(event) => setDraftFilters((current) => ({ ...current, maxPrice: priceInput(event.target.value) }))}
                    placeholder="máx."
                    value={draftFilters.maxPrice}
                  />
                </label>
              </div>
              <small>
                Valor por unidade para {filters.quantity || draftFilters.quantity ? `${Number(draftFilters.quantity || filters.quantity).toLocaleString("pt-BR")} un.` : "pedidos de 100 un."}
              </small>
            </fieldset>
          ) : null}

          <button className="catalog-search-submit catalog-apply" type="submit">
            Aplicar filtros
          </button>
        </form>

        <fieldset className="catalog-filter-group">
          <legend>Categorias</legend>
          <div className="catalog-category-options">
            {[{ name: "Todos", count: totalCount }, ...categories].map((item) => (
              <label className="catalog-category-option" key={item.name}>
                <input
                  checked={category === item.name}
                  name="xbz-category"
                  onChange={() => {
                    setLoading(true);
                    setCategory(item.name);
                    setPage(1);
                  }}
                  type="radio"
                  value={item.name}
                />
                <span className="catalog-radio" aria-hidden="true" />
                <span>{item.name === "Todos" ? "Todos os brindes" : item.name}</span>
                <small>({item.count})</small>
              </label>
            ))}
          </div>
        </fieldset>

        {hasActiveFilters ? (
          <button className="catalog-clear-button" onClick={clearFilters} type="button">
            <X aria-hidden="true" size={16} />
            Limpar filtros
          </button>
        ) : null}

        <p className="catalog-sidebar-note">
          Escolha o modelo ideal e consulte as opções de personalização para sua empresa.
        </p>
        {data && !data.pricesVisible ? (
          <p className="catalog-sidebar-note">
            <Link href="/entrar">Entre ou crie sua conta</Link> para ver os preços dos brindes.
          </p>
        ) : null}
      </aside>

      <div className="catalog-results">
        <div className="catalog-result-row">
          <div>
            <strong>
              {loading ? "Consultando…" : `${data?.meta.total ?? 0} ${data?.meta.total === 1 ? "produto" : "produtos"}`}
            </strong>
            <span>
              {filters.quantity
                ? `Com estoque para ${Number(filters.quantity).toLocaleString("pt-BR")} unidades.`
                : "Brindes personalizados para empresas, eventos e ocasiões especiais."}
            </span>
          </div>
          <label className="catalog-sort-field">
            <ArrowUpDown aria-hidden="true" size={16} />
            <span>Ordenar por</span>
            <select
              aria-label="Ordenar por"
              onChange={(event) => {
                setLoading(true);
                setPage(1);
                setSort(event.target.value as CatalogSort);
              }}
              value={sortOptions.includes(sort) ? sort : "relevancia"}
            >
              {sortOptions.map((option) => (
                <option key={option} value={option}>{SORT_LABELS[option]}</option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="empty-state" role="alert">
            <X aria-hidden="true" size={28} />
            <h2>Falha na consulta</h2>
            <p>{error}</p>
            <button className="button button-secondary" onClick={() => {
              setLoading(true);
              void load();
            }} type="button">
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!error && loading && !data ? (
          <div className="empty-state">
            <RefreshCw aria-hidden="true" size={28} />
            <h2>Carregando catálogo</h2>
            <p>Estamos preparando as melhores opções para você.</p>
          </div>
        ) : null}

        {!error && data?.products.length ? (
          <div className="product-grid catalog-product-grid">
            {data.products.map((product) => (
              <XbzProductCard key={product.publicId} pricesVisible={Boolean(data.pricesVisible)} product={product} />
            ))}
          </div>
        ) : null}

        {!error && !loading && data?.products.length === 0 ? (
          <div className="empty-state">
            <Search aria-hidden="true" size={28} />
            <h2>Nenhum produto encontrado</h2>
            <p>Tente outro termo ou escolha uma categoria diferente.</p>
            <button className="button button-secondary" onClick={clearFilters} type="button">
              Limpar filtros
            </button>
          </div>
        ) : null}

        {!error && data && data.meta.total > 0 ? (
          <nav aria-label="Paginação" className="catalog-pagination">
            <button
              className="button button-secondary"
              disabled={page === 1 || loading}
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.max(1, current - 1));
              }}
              type="button"
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              className="button button-secondary"
              disabled={page >= totalPages || loading}
              onClick={() => {
                setLoading(true);
                setPage((current) => current + 1);
              }}
              type="button"
            >
              Próxima
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
