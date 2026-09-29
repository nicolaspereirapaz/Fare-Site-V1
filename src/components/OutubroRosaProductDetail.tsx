"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, FileText, FileUp, Info, MessageCircle, PackageCheck, ShoppingBag } from "lucide-react";
import type { PublicCatalogProduct } from "@/lib/publicCatalog";
import { formatProductName } from "@/lib/xbz";
import { CAMPAIGN_REFERENCE_QUANTITY } from "@/lib/campaignPricing";
import { appendCampaignCartItem, OUTUBRO_ROSA_CART_ANCHOR } from "@/lib/outubroRosaCart";
import { formatCampaignPrice, OutubroRosaProductCard } from "@/components/OutubroRosaProductCard";
import styles from "@/app/campanhas/outubro-rosa/outubro-rosa.module.css";

type DetailResponse = {
  product: PublicCatalogProduct;
  related: PublicCatalogProduct[];
  error?: string;
};

const QUICK_QUANTITIES = [50, 100, 250, 500];

export function OutubroRosaProductDetail({ code }: { code: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(CAMPAIGN_REFERENCE_QUANTITY);
  const [artworkName, setArtworkName] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/campaigns/outubro-rosa/products/${encodeURIComponent(code)}`, { cache: "no-store" });
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
    return () => { active = false; };
  }, [code]);

  const product = data?.product;
  const variant = useMemo(
    () => product?.variants.find((item) => item.publicId === variantId) ?? product?.variants[0],
    [product, variantId],
  );

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
        <Link className="button button-secondary" href="/campanhas/outubro-rosa">Voltar ao Outubro Rosa</Link>
      </div>
    );
  }

  const name = formatProductName(product.name);
  const hasPrice = typeof product.startingPrice === "number";
  const selectedVariant = variant;

  function handleAddToCart() {
    appendCampaignCartItem({
      productName: name,
      slug: `campanhas/outubro-rosa/${product!.publicId}`,
      quantity,
      selections: {
        Cor: selectedVariant.label,
        Categoria: product!.category,
        ...(hasPrice
          ? { "Valor estimado": `a partir de ${formatCampaignPrice(product!.startingPrice as number)}/un. (ref. ${CAMPAIGN_REFERENCE_QUANTITY} un.)` }
          : {}),
      },
      artworkName,
      unitPrice: null,
      image: product!.imageUrl,
    });
    setAdded(true);
  }

  const reset = () => setAdded(false);

  return (
    <>
      <section className="product-detail-section">
        <div className="container-shell">
          <nav aria-label="Caminho de navegação" className="breadcrumb">
            <Link href="/campanhas/outubro-rosa"><ArrowLeft aria-hidden="true" size={16} /> Outubro Rosa</Link>
            <span>/</span><span>{product.category}</span><span>/</span><strong>{name}</strong>
          </nav>

          <div className="product-detail-grid">
            <div className="product-media-column">
              <div className="product-gallery">
                <div className={`product-thumbnail ${styles.detailImage}`} aria-hidden="true">
                  {product.imageUrl && !imageFailed ? <Image alt="" fill sizes="72px" src={product.imageUrl} unoptimized /> : null}
                </div>
                <div className={`product-main-image ${styles.detailImage}`}>
                  {product.imageUrl && !imageFailed ? (
                    <Image alt={name} fill onError={() => setImageFailed(true)} priority sizes="(max-width: 900px) 100vw, 48vw" src={product.imageUrl} unoptimized />
                  ) : (
                    <span className="product-image-fallback">Sem imagem</span>
                  )}
                  <span className={`product-badge ${styles.detailBadge}`}>Outubro Rosa</span>
                </div>
              </div>
              <div className="product-highlights">
                <span><Check aria-hidden="true" size={17} />Personalização com sua marca</span>
                <span><Check aria-hidden="true" size={17} />{product.variants.length} {product.variants.length === 1 ? "cor disponível" : "cores disponíveis"}</span>
                <span><Check aria-hidden="true" size={17} />Orçamento pelo WhatsApp</span>
              </div>
            </div>

            <div className="product-configurator">
              <div className="config-heading">
                <span className="eyebrow">Configure seu brinde</span>
                <h1>{name}</h1>
                <p>Brinde da seleção Outubro Rosa, personalizado pela Fare Foto para a sua campanha.</p>
              </div>

              <div className="draft-notice" role="note">
                <Info aria-hidden="true" size={18} />
                <span>Escolha a cor e a quantidade. Personalização, valor final e prazo são confirmados pela equipe no WhatsApp.</span>
              </div>

              <div className="config-stack">
                <fieldset className="option-group">
                  <legend><span>01</span>Cor</legend>
                  <div className="option-grid">
                    {product.variants.map((item) => (
                      <button
                        aria-pressed={item.publicId === variant.publicId}
                        className={`option-button${item.publicId === variant.publicId ? " selected" : ""}`}
                        key={item.publicId}
                        onClick={() => { setVariantId(item.publicId); reset(); }}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="option-group">
                  <legend><span>02</span>Quantidade</legend>
                  <div className="option-grid">
                    {QUICK_QUANTITIES.map((value) => (
                      <button
                        aria-pressed={quantity === value}
                        className={`option-button${quantity === value ? " selected" : ""}`}
                        key={value}
                        onClick={() => { setQuantity(value); reset(); }}
                        type="button"
                      >
                        {value} un.
                      </button>
                    ))}
                  </div>
                  <label className={`select-field ${styles.quantityField}`}>
                    <span>Outra quantidade</span>
                    <input
                      aria-label="Quantidade"
                      min={1}
                      onChange={(event) => { setQuantity(Math.max(1, Number(event.target.value) || 1)); reset(); }}
                      type="number"
                      value={quantity}
                    />
                  </label>
                </fieldset>

                <label className="upload-field">
                  <input
                    accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.ai,.cdr,.svg"
                    aria-label="Enviar logo ou arte agora (opcional)"
                    onChange={(event) => { setArtworkName(event.target.files?.[0]?.name ?? null); reset(); }}
                    type="file"
                  />
                  <FileUp aria-hidden="true" size={24} />
                  <span>
                    <strong>{artworkName ?? "Enviar logo ou arte agora (opcional)"}</strong>
                    <small>PDF, JPG, PNG, TIFF, AI, CDR ou SVG. O arquivo não sai do seu dispositivo; envie-o depois pelo WhatsApp.</small>
                  </span>
                </label>
              </div>

              <div className="quote-summary">
                <div>
                  <span>{hasPrice ? "A partir de" : "Valor"}</span>
                  <strong>{hasPrice ? <>{formatCampaignPrice(product.startingPrice as number)}<small className={styles.perUnit}>/un.</small></> : "Sob consulta"}</strong>
                  <small>{hasPrice ? `Referência para pedido de ${CAMPAIGN_REFERENCE_QUANTITY} unidades.` : "A Fare Foto confirma valor, prazo e frete no atendimento."}</small>
                </div>
                <button className="button button-primary button-large" onClick={handleAddToCart} type="button">
                  <ShoppingBag aria-hidden="true" size={19} /> Adicionar ao carrinho
                </button>
              </div>

              <p className={`${styles.estimateNotice} ${styles.detailNotice}`} role="note">
                <Info aria-hidden="true" size={16} />
                <span><strong>Valor estimado.</strong> O preço exibido é uma referência para pedidos de {CAMPAIGN_REFERENCE_QUANTITY} unidades e pode mudar no orçamento final, conforme quantidade, personalização, variação escolhida e frete.</span>
              </p>

              {added ? (
                <div className="added-message" role="status">
                  <Check aria-hidden="true" size={19} />
                  <span>Adicionado ao carrinho Outubro Rosa.</span>
                  <Link href={OUTUBRO_ROSA_CART_ANCHOR}>Ver carrinho</Link>
                </div>
              ) : null}

              <p className="product-detail-note">
                <MessageCircle aria-hidden="true" size={16} /> Precisa de outra cor ou quantidade? Fale com nossa equipe para montar seu pedido.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="product-information">
        <div className="container-shell product-information-grid">
          <div>
            <span className="eyebrow">Sobre o produto</span>
            <h2>Configure com liberdade. Confirme com segurança.</h2>
            {product.description ? <p>{product.description}</p> : null}
            <p>Envie o logo da sua empresa em PDF, AI, CDR ou PNG em alta resolução. A equipe confere a arte e indica a melhor forma de personalização.</p>
          </div>
          <ol className="product-steps">
            <li><FileText aria-hidden="true" /><span><strong>1. Monte o pedido</strong>Selecione cor e quantidade dos brindes.</span></li>
            <li><PackageCheck aria-hidden="true" /><span><strong>2. A equipe confere</strong>Validamos arte, estoque, valor e prazo.</span></li>
            <li><MessageCircle aria-hidden="true" /><span><strong>3. Aprove no WhatsApp</strong>Você só confirma depois de revisar todos os detalhes.</span></li>
          </ol>
        </div>
      </section>

      {data.related.length ? (
        <section className="section-space related-section">
          <div className="container-shell">
            <div className="section-heading"><span className="eyebrow">Você também pode gostar</span><h2>Mais em {product.category}</h2></div>
            <div className={styles.relatedGrid}>
              {data.related.map((item) => <OutubroRosaProductCard key={item.publicId} product={item} />)}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
