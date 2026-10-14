"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import type { PublicCatalogProduct } from "@/lib/publicCatalog";
import { formatProductName } from "@/lib/xbz";
import styles from "@/app/(loja)/campanhas/outubro-rosa/outubro-rosa.module.css";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatCampaignPrice(value: number) {
  return currency.format(value);
}

export function campaignProductHref(product: Pick<PublicCatalogProduct, "publicId">) {
  return `/campanhas/outubro-rosa/${product.publicId}`;
}

export function OutubroRosaProductCard({ product }: { product: PublicCatalogProduct }) {
  const [imageFailed, setImageFailed] = useState(false);
  const href = campaignProductHref(product);
  const name = formatProductName(product.name);

  return (
    <article className={styles.card}>
      <Link aria-label={name} className={styles.cardImage} href={href}>
        {product.imageUrl && !imageFailed ? (
          <Image
            alt={name}
            fill
            onError={() => setImageFailed(true)}
            sizes="(max-width: 640px) 86vw, (max-width: 1024px) 42vw, 280px"
            src={product.imageUrl}
            unoptimized
          />
        ) : (
          <span className={styles.imageFallback}>Imagem indisponível</span>
        )}
      </Link>
      <div className={styles.cardBody}>
        <span className={styles.category}>{product.category}</span>
        <h3><Link className={styles.titleButton} href={href}>{name}</Link></h3>
        <p>
          {product.colors.length
            ? `${product.colors.length} ${product.colors.length === 1 ? "cor disponível" : "cores disponíveis"}`
            : "Personalização sob consulta"}
        </p>
        <div className={styles.cardPrice}>
          {typeof product.startingPrice === "number" ? (
            <>
              <small>A partir de</small>
              <strong>{formatCampaignPrice(product.startingPrice)}</strong>
              <span>/un. · pedido de 100 un.</span>
            </>
          ) : (
            <>
              <small>Valor</small>
              <strong>Sob consulta</strong>
            </>
          )}
        </div>
        <Link className={styles.addButton} href={href}>
          <ShoppingBag aria-hidden="true" size={17} /> Configurar<span className={styles.addButtonExtra}> produto</span>
        </Link>
      </div>
    </article>
  );
}
