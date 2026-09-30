"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Info, LogIn, MessageCircle, PackageCheck, ShoppingBag, X } from "lucide-react";
import { formatProductName } from "@/lib/xbz";
import type { PublicCatalogProduct } from "@/lib/publicCatalog";
import { CAMPAIGN_REFERENCE_QUANTITY, unitPriceForQuantity, type CampaignQuantityPricing } from "@/lib/campaignPricing";
import { useCart } from "@/context/CartContext";

type DetailResponse = {
  product: PublicCatalogProduct;
  pricesVisible?: boolean;
  priceTiers?: Array<{ quantity: number; unitPrice: number }>;
  quantityPricing?: CampaignQuantityPricing | null;
  meta: { fetchedAt: string; cached: boolean };
  error?: string;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (value: number) => currency.format(value);

export function XbzProductDetail({ code }: { code: string }) {
  const router = useRouter();
  const { addItem, updateQuantity, items: cartItems } = useCart();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(CAMPAIGN_REFERENCE_QUANTITY);
  const [customMode, setCustomMode] = useState(false);
  const [customQuantity, setCustomQuantity] = useState("");
  const [toast, setToast] = useState<{ color: string; quantity: number; image: string } | null>(null);
  const [pulse, setPulse] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);


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
  const pricesVisible = Boolean(data?.pricesVisible);
  const tiers = data?.priceTiers ?? [];
  const pricing = data?.quantityPricing ?? null;
  const hasTable = pricesVisible && tiers.length > 0;
  // Com tabela: faixa escolhida ou "outra quantidade". Sem tabela: campo numérico simples.
  const orderQuantity = hasTable
    ? (customMode ? Number(customQuantity) || 0 : quantity)
    : Math.max(1, quantity);
  const unitPrice = pricesVisible && pricing && orderQuantity > 0 ? unitPriceForQuantity(pricing, orderQuantity) : null;

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
  const variantImage = selectedVariant.imageUrl || selectedProduct.imageUrl;
  const selections = {
    "Variação": selectedVariant.label,
    "Categoria": selectedProduct.category,
  };

  function putInCart() {
    addItem({
      productName: formatProductName(selectedProduct.name),
      slug: `brindes/${selectedProduct.publicId}`,
      quantity: orderQuantity,
      selections,
      // A arte é combinada na conversa do WhatsApp.
      artworkName: null,
      // Valor estimado pela regra oficial (custo × 2 + frete rateado); confirmado no orçamento.
      unitPrice,
      // Parâmetros públicos para o carrinho recalcular o valor ao mudar a quantidade.
      pricing: pricesVisible ? pricing : null,
      image: variantImage,
    });
  }

  const handleAddToCart = () => {
    if (orderQuantity < 1) return;
    putInCart();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ color: selectedVariant.label, quantity: orderQuantity, image: variantImage });
    toastTimer.current = setTimeout(() => setToast(null), 4200);
    setPulse((value) => value + 1);
  };

  // Leva direto ao formulário do carrinho. Se o mesmo brinde e cor já estão lá, só ajusta a
  // quantidade para a escolhida agora (não duplica nem soma).
  const handleFinish = () => {
    if (orderQuantity < 1) return;
    const slug = `brindes/${selectedProduct.publicId}`;
    const existing = cartItems.find((item) => item.slug === slug && item.selections?.["Variação"] === selectedVariant.label);
    if (existing) updateQuantity(existing.id, orderQuantity);
    else putInCart();
    router.push("/carrinho#finalizar");
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
            <div className="product-thumbnail-rail" aria-label="Cores do produto">
              {product.variants.map((item) => {
                const active = item.publicId === variant.publicId;
                return (
                  <button
                    aria-label={`Ver cor ${item.label}`}
                    aria-pressed={active}
                    className={`product-thumbnail product-thumbnail-button supplier-photo${active ? " active" : ""}`}
                    key={item.publicId}
                    onClick={() => {
                      setVariantId(item.publicId);
                      setImageFailed(false);
                    }}
                    title={item.label}
                    type="button"
                  >
                    {item.imageUrl ? (
                      <Image alt="" fill sizes="72px" src={item.imageUrl} unoptimized />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="product-main-image supplier-photo">
              {variantImage && !imageFailed ? (
                <Image
                  alt={`${formatProductName(product.name)} — ${variant.label}`}
                  fill
                  key={variantImage}
                  onError={() => setImageFailed(true)}
                  priority
                  sizes="(max-width: 900px) 100vw, 48vw"
                  src={variantImage}
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
                      setImageFailed(false);
                    }}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {hasTable ? (
              <fieldset className="quantity-range-group">
                <legend>Escolha a quantidade</legend>
                <div className="quantity-range-table">
                  <div className="quantity-range-head" aria-hidden="true">
                    <span>Quantidade</span>
                    <span>Valor por unidade</span>
                  </div>
                  {tiers.map((tier) => {
                    const selected = !customMode && quantity === tier.quantity;
                    return (
                      <label className={selected ? "quantity-range-row selected" : "quantity-range-row"} key={tier.quantity}>
                        <span>
                          <input
                            checked={selected}
                            name="gift-quantity"
                            onChange={() => {
                              setCustomMode(false);
                              setQuantity(tier.quantity);
                            }}
                            type="radio"
                          />
                          {tier.quantity} unidades
                        </span>
                        <strong>{brl(tier.unitPrice)}</strong>
                      </label>
                    );
                  })}
                  <label className={customMode ? "quantity-range-row selected" : "quantity-range-row"}>
                    <span>
                      <input
                        checked={customMode}
                        name="gift-quantity"
                        onChange={() => {
                          setCustomMode(true);
                        }}
                        type="radio"
                      />
                      Outra quantidade
                      <input
                        aria-label="Outra quantidade"
                        className="quantity-custom-input"
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(event) => {
                          setCustomMode(true);
                          setCustomQuantity(event.target.value.replace(/\D/g, "").replace(/^0+/, ""));
                        }}
                        onFocus={() => setCustomMode(true)}
                        placeholder="ex.: 300"
                        value={customQuantity}
                      />
                    </span>
                    <strong>{customMode && unitPrice !== null ? brl(unitPrice) : "Digite a quantidade"}</strong>
                  </label>
                </div>
              </fieldset>
            ) : (
              <div className="config-row">
                <label className="select-field">
                  <span>Quantidade</span>
                  <input
                    aria-label="Quantidade"
                    min={1}
                    onChange={(event) => {
                      const next = Number(event.target.value) || 1;
                      setQuantity(Math.max(1, next));
                    }}
                    type="number"
                    value={Math.max(1, quantity)}
                  />
                </label>
              </div>
            )}

          </div>

          <div className="quote-summary quote-summary-stacked">
            {unitPrice !== null ? (
              <div>
                <span>Valor estimado · {orderQuantity} {orderQuantity === 1 ? "unidade" : "unidades"}</span>
                <strong>{brl(unitPrice)}<small>/un.</small></strong>
                <small>Total estimado {brl(Math.round(unitPrice * orderQuantity * 100) / 100)}. Personalização e frete de entrega são confirmados no orçamento.</small>
              </div>
            ) : pricesVisible ? (
              <div>
                <span>Valor</span>
                <strong>{hasTable ? "Digite a quantidade" : "Sob consulta"}</strong>
                <small>A Fare Foto confirma personalização, prazo, valor e frete no atendimento.</small>
              </div>
            ) : (
              <div>
                <span>Preço para clientes</span>
                <strong>Entre para ver o valor</strong>
                <small>
                  <Link href="/entrar"><LogIn aria-hidden="true" size={14} /> Entre ou crie sua conta</Link> para ver a tabela de preços.
                </small>
              </div>
            )}
          </div>

          <div className="product-actions">
            <button
              className="button button-primary button-large"
              disabled={orderQuantity < 1}
              onClick={handleFinish}
              type="button"
            >
              <MessageCircle aria-hidden="true" size={19} />
              Finalizar pedido
            </button>
            <button
              className={`button button-secondary button-large product-add-button${pulse ? " pulse" : ""}`}
              disabled={orderQuantity < 1}
              key={pulse}
              onClick={handleAddToCart}
              type="button"
            >
              <ShoppingBag aria-hidden="true" size={19} />
              Adicionar ao carrinho
            </button>
          </div>

          {pricesVisible && unitPrice !== null ? (
            <div className="draft-notice" role="note">
              <Info aria-hidden="true" size={18} />
              <span>
                <strong>Valor estimado.</strong> Os preços exibidos são uma referência e podem mudar no orçamento
                final, conforme quantidade, personalização, cor escolhida e frete.
              </span>
            </div>
          ) : null}

          <p className="product-detail-note">
            <MessageCircle aria-hidden="true" size={16} /> Precisa de outra cor ou configuração?
            Fale com nossa equipe para montar seu pedido.
          </p>
        </div>
      </div>

      <div aria-live="polite" className={`cart-toast${toast ? " show" : ""}`} role="status">
        {toast ? (
          <>
            <span className="cart-toast-image supplier-photo">
              {toast.image ? <Image alt="" fill sizes="52px" src={toast.image} unoptimized /> : null}
              <i aria-hidden="true"><Check size={12} strokeWidth={3} /></i>
            </span>
            <span className="cart-toast-text">
              <strong>Adicionado ao carrinho</strong>
              <small>{formatProductName(product.name)} · {toast.color} · {toast.quantity} un.</small>
              <Link href="/carrinho">Ver carrinho →</Link>
            </span>
            <button aria-label="Fechar aviso" className="cart-toast-close" onClick={() => setToast(null)} type="button">
              <X aria-hidden="true" size={16} />
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
