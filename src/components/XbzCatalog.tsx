"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { formatProductName } from "@/lib/xbz";
import type { PublicCatalogProduct, PublicProductsResponse } from "@/lib/publicCatalog";

const PAGE_SIZE = 24;

type CategoryCount = { name: string; count: number };

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function XbzProductCard({ product, pricesVisible }: { product: PublicCatalogProduct; pricesVisible: boolean }) {
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
        <span className="product-category">{product.category}</span>
        <h3>
          <Link href={href}>{formatProductName(product.name)}</Link>
        </h3>
        <p>
          {product.colors.length
            ? `${product.colors.length} ${product.colors.length === 1 ? "cor disponível" : "cores disponíveis"}`
            : "Personalização sob consulta"}
        </p>
        <div className="product-card-footer">
          {hasPrice ? (
            <div>
              <small>A partir de</small>
              <strong>{currency.format(product.startingPrice as number)}</strong>
              <small>/un. · pedido de 100 un.</small>
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

export function XbzCatalog() {
  const [data, setData] = useState<(PublicProductsResponse & { pricesVisible?: boolean }) | null>(null);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      if (category !== "Todos") params.set("categoria", category);

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
    [category, page, search],
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set("q", search);
      if (category !== "Todos") params.set("categoria", category);

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
  }, [category, page, search]);

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;
  const hasActiveFilters = search !== "" || category !== "Todos";

  const totalCount = useMemo(
    () => categories.reduce((total, item) => total + item.count, 0),
    [categories],
  );

  function clearFilters() {
    setLoading(true);
    setDraftSearch("");
    setSearch("");
    setCategory("Todos");
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
            <span>Brindes personalizados para empresas, eventos e ocasiões especiais.</span>
          </div>
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
