"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, FileUp, Info, MessageCircle, PackageCheck, ShoppingBag } from "lucide-react";
import { formatProductName } from "@/lib/xbz";
import type { PublicCatalogProduct } from "@/lib/publicCatalog";
import { useCart } from "@/context/CartContext";

type DetailResponse = {
  product: PublicCatalogProduct;
  meta: { fetchedAt: string; cached: boolean };
  error?: string;
};

export function XbzProductDetail({ code }: { code: string }) {
  const { addItem } = useCart();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [artworkName, setArtworkName] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch(`/api/xbz/products/${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as DetailResponse;
        if (!active) return;
        if (!response.ok) throw new Error(payload.error || "Produto indisponível.");
        setData(payload);
        setVariantId(payload.product.variants[0]?.publicId ?? "");
        setError(null);
      } catch {
        if (active) setError("Não foi possível carregar este produto agora.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [code]);

  const product = data?.product;
  const variant = useMemo(
    () => product?.variants.find((item) => item.publicId === variantId) ?? product?.variants[0],
    [product, variantId],
  );
  const clampedQuantity = Math.max(1, quantity);

  if (loading) {
    return (
      <div className="empty-state">
        <PackageCheck aria-hidden="true" size={28} />
        <h2>Carregando produto</h2>
        <p>Preparando as opções de personalização.</p>
      </div>
    );
  }

  if (error || !product || !variant) {
    return (
      <div className="empty-state" role="alert">
        <Info aria-hidden="true" size={28} />
        <h2>Produto indisponível</h2>
        <p>{error ?? "Este item não está mais em estoque."}</p>
        <Link className="button button-secondary" href="/brindes">
          Voltar aos brindes
        </Link>
      </div>
    );
  }

  const selectedProduct = product;
  const selectedVariant = variant;

  const handleAddToCart = () => {
    addItem({
      productName: formatProductName(selectedProduct.name),
      slug: `brindes/${selectedProduct.publicId}`,
      quantity: clampedQuantity,
      selections: {
        "Variação": selectedVariant.label,
        "Categoria": selectedProduct.category,
      },
      artworkName,
      unitPrice: null,
      image: selectedProduct.imageUrl,
    });
    setAdded(true);
  };

  return (
    <>
      <nav aria-label="Caminho de navegação" className="breadcrumb">
        <Link href="/brindes">
          <ArrowLeft aria-hidden="true" size={16} /> Brindes
        </Link>
        <span>/</span>
        <span>{product.category}</span>
        <span>/</span>
        <strong>{formatProductName(product.name)}</strong>
      </nav>

      <div className="product-detail-grid">
        <div className="product-media-column">
          <div className="product-gallery">
            <div className="product-main-image">
              {product.imageUrl && !imageFailed ? (
                <Image
                  alt={formatProductName(product.name)}
                  fill
                  onError={() => setImageFailed(true)}
                  priority
                  sizes="(max-width: 900px) 100vw, 48vw"
                  src={product.imageUrl}
                  unoptimized
                />
              ) : (
                <span className="product-image-fallback">Sem imagem</span>
              )}
            </div>
          </div>
          <div className="product-highlights">
            <span>
              <Check aria-hidden="true" size={17} />
              Personalização sob consulta
            </span>
            <span>
              <Check aria-hidden="true" size={17} />
              {product.variants.length}{" "}
              {product.variants.length === 1 ? "variação disponível" : "variações disponíveis"}
            </span>
            <span><Check aria-hidden="true" size={17} />Atendimento personalizado</span>
          </div>
        </div>

        <div className="product-configurator">
          <div className="config-heading">
            <span className="eyebrow">Configure seu brinde</span>
            <h1>{formatProductName(product.name)}</h1>
            {product.description ? <p>{product.description}</p> : null}
          </div>

          <div className="draft-notice" role="note">
            <Info aria-hidden="true" size={18} />
            <span>
              Escolha o modelo e a quantidade desejada. A Fare Foto confirma personalização,
              valor, prazo e entrega antes da produção.
            </span>
          </div>

          <div className="config-stack">
            <fieldset className="option-group">
              <legend>
                <span>01</span>
                Variação
              </legend>
              <div className="option-grid">
                {product.variants.map((item) => (
                  <button
                    aria-pressed={item.publicId === variant.publicId}
                    className={`option-button${item.publicId === variant.publicId ? " selected" : ""}`}
                    key={item.publicId}
                    onClick={() => {
                      setVariantId(item.publicId);
                      setAdded(false);
                    }}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="config-row">
              <label className="select-field">
                <span>Quantidade</span>
                <input
                  aria-label="Quantidade"
                  min={1}
                  onChange={(event) => {
                    const next = Number(event.target.value) || 1;
                    setQuantity(Math.max(1, next));
                    setAdded(false);
                  }}
                  type="number"
                  value={clampedQuantity}
                />
              </label>
            </div>

            <label className="upload-field">
              <input
                accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.ai,.cdr,.svg"
                aria-label="Enviar arte agora (opcional)"
                onChange={(event) => {
                  setArtworkName(event.target.files?.[0]?.name ?? null);
                  setAdded(false);
                }}
                type="file"
              />
              <FileUp aria-hidden="true" size={24} />
              <span>
                <strong>{artworkName ?? "Enviar arte agora (opcional)"}</strong>
                <small>PDF, JPG, PNG, TIFF, AI, CDR ou SVG. O arquivo não sai do seu dispositivo nesta etapa.</small>
              </span>
            </label>
          </div>

          <div className="quote-summary">
            <div>
              <span>Valor</span>
              <strong>Sob consulta</strong>
              <small>A Fare Foto confirma personalização, prazo, valor e frete no atendimento.</small>
            </div>
            <button className="button button-primary button-large" onClick={handleAddToCart} type="button">
              <ShoppingBag aria-hidden="true" size={19} />
              Adicionar ao carrinho
            </button>
          </div>

          {added ? (
            <div className="added-message" role="status">
              <Check aria-hidden="true" size={19} />
              <span>Configuração adicionada.</span>
              <Link href="/carrinho">Ver carrinho</Link>
            </div>
          ) : null}

          <p className="product-detail-note">
            <MessageCircle aria-hidden="true" size={16} /> Precisa de outra cor ou configuração?
            Fale com nossa equipe para montar seu pedido.
          </p>
        </div>
      </div>
    </>
  );
}
