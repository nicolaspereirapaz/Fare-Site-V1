"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, FileText, Info, MessageCircle, PackageCheck, ShoppingBag } from "lucide-react";
import type { PublicCatalogProduct } from "@/lib/publicCatalog";
import { formatProductName } from "@/lib/xbz";
import { CAMPAIGN_REFERENCE_QUANTITY, unitPriceForQuantity, type CampaignQuantityPricing } from "@/lib/campaignPricing";
import { appendCampaignCartItem, OUTUBRO_ROSA_CART_PATH } from "@/lib/outubroRosaCart";
import { formatCampaignPrice, OutubroRosaProductCard } from "@/components/OutubroRosaProductCard";
import styles from "@/app/campanhas/outubro-rosa/outubro-rosa.module.css";

type PriceTier = { quantity: number; unitPrice: number };
type DetailResponse = {
  product: PublicCatalogProduct;
  priceTiers: PriceTier[];
  quantityPricing: CampaignQuantityPricing | null;
  related: PublicCatalogProduct[];
  error?: string;
};

/**
 * Página de produto da campanha no mesmo layout da Revelação de Fotos:
 * miniaturas + foto grande, opções em botões, tabela de quantidade com valor
 * e o resumo escuro com "Adicionar ao carrinho".
 */
export function OutubroRosaProductDetail({ code }: { code: string }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(CAMPAIGN_REFERENCE_QUANTITY);
  const [customQuantity, setCustomQuantity] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [added, setAdded] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

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
  const tiers = data?.priceTiers ?? [];
  const isCustom = customMode;
  // Em "Outra quantidade" vale o número digitado (0 enquanto o campo estiver vazio).
  const orderQuantity = isCustom ? Number(customQuantity) || 0 : quantity;
  const selectedTier = isCustom ? undefined : tiers.find((tier) => tier.quantity === quantity);
  const referencePrice = typeof product.startingPrice === "number" ? product.startingPrice : null;
  // Outra quantidade: mesmo cálculo da tabela (frete rateado pela quantidade digitada).
  const customPrice = isCustom && data?.quantityPricing ? unitPriceForQuantity(data.quantityPricing, orderQuantity) : null;
  const hasExactPrice = Boolean(selectedTier) || customPrice !== null;
  const displayPrice = selectedTier?.unitPrice ?? customPrice ?? referencePrice;
  const mainImage = variant.imageUrl || product.imageUrl;
  const imageOk = (url: string) => Boolean(url) && !failedImages[url];
  const markFailed = (url: string) => setFailedImages((current) => ({ ...current, [url]: true }));
  const selectedVariant = variant;

  function chooseVariant(id: string) {
    setVariantId(id);
    setAdded(false);
  }

  function chooseTier(value: number) {
    setQuantity(value);
    setCustomMode(false);
    setAdded(false);
  }

  function chooseCustom() {
    // Campo começa vazio (placeholder "ex.: 300"): o cliente digita direto, sem apagar nada.
    setCustomMode(true);
    setAdded(false);
  }

  function handleAddToCart() {
    if (orderQuantity < 1) return;
    appendCampaignCartItem({
      productName: name,
      slug: `campanhas/outubro-rosa/${product!.publicId}`,
      quantity: orderQuantity,
      color: selectedVariant.label,
      pricing: data?.quantityPricing ?? null,
      selections: {
        Cor: selectedVariant.label,
        Categoria: product!.category,
        ...(displayPrice !== null
          ? { "Valor estimado": `${hasExactPrice ? "" : "a partir de "}${formatCampaignPrice(displayPrice)}/un. (ref. ${hasExactPrice ? orderQuantity : CAMPAIGN_REFERENCE_QUANTITY} un.)` }
          : {}),
      },
      artworkName: null,
      unitPrice: null,
      image: mainImage,
    });
    setAdded(true);
  }


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
              <div className={`product-gallery ${styles.gallery}`}>
                {/* Miniaturas: uma por cor; clicar troca a foto e a cor escolhida. */}
                <div aria-label="Cores do produto" className={styles.thumbRail}>
                  {product.variants.map((item) => {
                    const url = item.imageUrl || product.imageUrl;
                    const active = item.publicId === variant.publicId;
                    return (
                      <button
                        aria-label={`Ver cor ${item.label}`}
                        aria-pressed={active}
                        className={`product-thumbnail ${styles.detailImage} ${styles.thumbButton}${active ? ` ${styles.thumbActive}` : ""}`}
                        key={item.publicId}
                        onClick={() => chooseVariant(item.publicId)}
                        title={item.label}
                        type="button"
                      >
                        {imageOk(url) ? <Image alt="" fill onError={() => markFailed(url)} sizes="72px" src={url} unoptimized /> : null}
                      </button>
                    );
                  })}
                </div>
                <div className={`product-main-image ${styles.detailImage}`}>
                  {imageOk(mainImage) ? (
                    <Image alt={`${name} — ${variant.label}`} fill key={mainImage} onError={() => markFailed(mainImage)} priority sizes="(max-width: 900px) 100vw, 48vw" src={mainImage} unoptimized />
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
                <span className="eyebrow">Configure seu produto</span>
                <h1>{name}</h1>
                <p>Brinde da seleção Outubro Rosa, personalizado pela Fare Foto para a sua campanha.</p>
              </div>

              <div className="draft-notice" role="note">
                <Info aria-hidden="true" size={18} />
                <span>Opções iniciais para montar o pedido. Disponibilidade, valor e prazo são confirmados pela equipe no WhatsApp.</span>
              </div>

              <div className="config-stack">
                <fieldset className="option-group">
                  <legend>Cor <small className={styles.legendValue}>{variant.label}</small></legend>
                  <div className={`option-grid ${styles.colorGrid}`}>
                    {product.variants.map((item) => (
                      <button
                        aria-pressed={item.publicId === variant.publicId}
                        className={`option-button ${styles.colorButton}${item.publicId === variant.publicId ? " selected" : ""}`}
                        key={item.publicId}
                        onClick={() => chooseVariant(item.publicId)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="quantity-range-group">
                  <legend>Escolha a quantidade</legend>
                  <div className="quantity-range-table">
                    <div aria-hidden="true" className="quantity-range-head"><span>Quantidade</span><span>Valor por unidade</span></div>
                    {tiers.map((tier) => {
                      const active = !isCustom && quantity === tier.quantity;
                      return (
                        <label className={active ? "quantity-range-row selected" : "quantity-range-row"} key={tier.quantity}>
                          <span>
                            <input checked={active} name="quantity-range" onChange={() => chooseTier(tier.quantity)} type="radio" />
                            {tier.quantity} unidades
                          </span>
                          <strong>{formatCampaignPrice(tier.unitPrice)}</strong>
                        </label>
                      );
                    })}
                    <label className={isCustom ? "quantity-range-row selected" : "quantity-range-row"}>
                      <span>
                        <input checked={isCustom} name="quantity-range" onChange={chooseCustom} type="radio" />
                        Outra quantidade
                        <input
                          aria-label="Outra quantidade"
                          className={styles.customQuantity}
                          inputMode="numeric"
                          maxLength={6}
                          onChange={(event) => {
                            setCustomMode(true);
                            setCustomQuantity(event.target.value.replace(/\D/g, "").replace(/^0+/, ""));
                            setAdded(false);
                          }}
                          onFocus={chooseCustom}
                          placeholder="ex.: 300"
                          type="text"
                          value={isCustom ? customQuantity : ""}
                        />
                      </span>
                      <strong>{customPrice !== null ? formatCampaignPrice(customPrice) : data?.quantityPricing ? "Digite a quantidade" : "Sob consulta"}</strong>
                    </label>
                  </div>
                </fieldset>
              </div>

              <div className="quote-summary">
                <div>
                  <span>{displayPrice === null ? "Valor do pedido" : hasExactPrice ? `Valor estimado · ${orderQuantity} ${orderQuantity === 1 ? "unidade" : "unidades"}` : "A partir de"}</span>
                  <strong>{displayPrice === null ? "Sob consulta" : <>{formatCampaignPrice(displayPrice)}<small className={styles.perUnit}>/un.</small></>}</strong>
                  <small>
                    {displayPrice !== null && hasExactPrice
                      ? `Total estimado ${formatCampaignPrice(displayPrice * orderQuantity)}. Confirmaremos valor, prazo e entrega.`
                      : "Confirmaremos valor, prazo e retirada ou entrega."}
                  </small>
                </div>
                <button className="button button-primary button-large" disabled={orderQuantity < 1} onClick={handleAddToCart} type="button">
                  <ShoppingBag aria-hidden="true" size={19} /> Adicionar ao carrinho
                </button>
              </div>

              <p className={`${styles.estimateNotice} ${styles.detailNotice}`} role="note">
                <Info aria-hidden="true" size={16} />
                <span><strong>Valor estimado.</strong> Os preços exibidos são uma referência e podem mudar no orçamento final, conforme quantidade, personalização, cor escolhida e frete.</span>
              </p>

              {added ? (
                <div className="added-message" role="status">
                  <Check aria-hidden="true" size={19} />
                  <span>Adicionado ao carrinho Outubro Rosa.</span>
                  <Link href={OUTUBRO_ROSA_CART_PATH}>Ver carrinho</Link>
                </div>
              ) : null}
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
            <div className={styles.grid}>
              {data.related.map((item) => <OutubroRosaProductCard key={item.publicId} product={item} />)}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
