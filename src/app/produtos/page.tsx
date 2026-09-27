import type { Metadata } from "next";
import { CatalogGrid } from "@/components/CatalogGrid";
import { productCategories, products } from "@/data/products";

export const metadata: Metadata = {
  title: "Produtos",
  description: "Catálogo de fotografias, álbuns, molduras, brindes para empresas e materiais gráficos da Fare Foto.",
};

type ProductsPageProps = {
  searchParams: Promise<{ categoria?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { categoria } = await searchParams;
  const validCategory = productCategories.includes(
    categoria as (typeof productCategories)[number],
  )
    ? (categoria as (typeof productCategories)[number])
    : "Todos";

  return (
    <>
      <section className="page-hero catalog-hero">
        <div className="container-shell">
          <span className="eyebrow">Catálogo Fare Foto</span>
          <h1>Escolha, configure e peça seu orçamento.</h1>
          <p>Do álbum ao material da sua empresa. Os valores são confirmados no atendimento para respeitar cada configuração.</p>
        </div>
      </section>
      <section className="catalog-section">
        <div className="container-shell">
          <CatalogGrid initialCategory={validCategory} products={products} />
        </div>
      </section>
    </>
  );
}
