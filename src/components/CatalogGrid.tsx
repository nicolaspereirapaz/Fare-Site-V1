"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { productCategories, type Product } from "@/data/products";
import { ProductCard } from "./ProductCard";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

export function CatalogGrid({
  products,
  initialCategory = "Todos",
}: {
  products: Product[];
  initialCategory?: (typeof productCategories)[number];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] =
    useState<(typeof productCategories)[number]>(initialCategory);
  const [sort, setSort] = useState<"featured" | "name-asc" | "name-desc">("featured");

  const visibleProducts = useMemo(() => {
    const term = normalize(search.trim());
    const filtered = products.filter((product) => {
      const matchesCategory = category === "Todos" || product.category === category;
      const content = normalize(
        `${product.name} ${product.shortDescription} ${product.category}`,
      );
      return matchesCategory && (!term || content.includes(term));
    });

    if (sort === "name-asc") {
      return filtered.toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    if (sort === "name-desc") {
      return filtered.toSorted((a, b) => b.name.localeCompare(a.name, "pt-BR"));
    }
    return filtered;
  }, [category, products, search, sort]);

  const hasActiveFilters = search.trim() !== "" || category !== "Todos";

  function clearFilters() {
    setSearch("");
    setCategory("Todos");
  }

  return (
    <div className="catalog-layout">
      <aside aria-label="Filtros do catálogo" className="catalog-sidebar">
        <div className="catalog-sidebar-heading">
          <SlidersHorizontal aria-hidden="true" size={19} />
          <h2>Filtrar produtos</h2>
        </div>

        <label className="catalog-search-field">
          <span>Buscar produto</span>
          <span className="catalog-search-input">
            <Search aria-hidden="true" size={18} />
            <input
              aria-label="Buscar produtos"
              role="searchbox"
              placeholder="O que você procura?"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>

        <fieldset className="catalog-filter-group">
          <legend>Categorias</legend>
          <div className="catalog-category-options">
            {productCategories.map((item) => {
              const count =
                item === "Todos"
                  ? products.length
                  : products.filter((product) => product.category === item).length;
              const label = item === "Todos" ? "Todos os produtos" : item;

              return (
                <label className="catalog-category-option" key={item}>
                  <input
                    checked={category === item}
                    name="catalog-category"
                    onChange={() => setCategory(item)}
                    type="radio"
                    value={item}
                  />
                  <span className="catalog-radio" aria-hidden="true" />
                  <span>{label}</span>
                  <small>({count})</small>
                </label>
              );
            })}
          </div>
        </fieldset>

        {hasActiveFilters ? (
          <button className="catalog-clear-button" onClick={clearFilters} type="button">
            <X aria-hidden="true" size={16} />
            Limpar filtros
          </button>
        ) : null}

        <p className="catalog-sidebar-note">
          Selecione uma linha ou pesquise pelo produto. Os detalhes de material e acabamento ficam na configuração.
        </p>
      </aside>

      <div className="catalog-results">
        <div className="catalog-result-row">
          <div>
            <strong>
              {visibleProducts.length} {visibleProducts.length === 1 ? "produto" : "produtos"}
            </strong>
            <span>Opções e valores sujeitos à confirmação</span>
          </div>
          <label className="catalog-sort-field">
            <span>Ordenar por</span>
            <select
              aria-label="Ordenar produtos"
              onChange={(event) =>
                setSort(event.target.value as "featured" | "name-asc" | "name-desc")
              }
              value={sort}
            >
              <option value="featured">Destaques</option>
              <option value="name-asc">Nome: A a Z</option>
              <option value="name-desc">Nome: Z a A</option>
            </select>
          </label>
        </div>

        {visibleProducts.length ? (
          <div className="product-grid catalog-product-grid">
            {visibleProducts.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search aria-hidden="true" size={28} />
            <h2>Nenhum produto encontrado</h2>
            <p>Tente outro termo ou escolha uma categoria diferente.</p>
            <button className="button button-secondary" onClick={clearFilters} type="button">
              Limpar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
