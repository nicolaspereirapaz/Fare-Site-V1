import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { Product } from "@/data/products";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link className="product-card-image" href={`/produtos/${product.slug}`}>
        <Image
          alt={product.imageAlt}
          fill
          sizes="(max-width: 640px) 82vw, (max-width: 1024px) 42vw, 280px"
          src={product.image}
        />
        {product.badge ? <span className="product-badge">{product.badge}</span> : null}
      </Link>
      <div className="product-card-content">
        <span className="product-category">{product.category}</span>
        <h3>
          <Link href={`/produtos/${product.slug}`}>{product.name}</Link>
        </h3>
        <p>{product.shortDescription}</p>
        <div className="product-card-footer">
          <div>
            <small>A partir de</small>
            <strong>Sob consulta</strong>
          </div>
          <Link aria-label={`Configurar ${product.name}`} href={`/produtos/${product.slug}`}>
            <ArrowUpRight aria-hidden="true" size={20} />
          </Link>
        </div>
      </div>
    </article>
  );
}
