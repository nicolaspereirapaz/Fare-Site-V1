"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, FileUp, Info, ShoppingBag } from "lucide-react";
import type { Product } from "@/data/products";
import { useCart } from "@/context/CartContext";

export function ProductConfigurator({ product }: { product: Product }) {
  const { addItem } = useCart();
  const initialSelections = useMemo(
    () =>
      Object.fromEntries(
        product.options.map((option) => [option.id, option.values[0]?.id ?? ""]),
      ),
    [product.options],
  );
  const [selections, setSelections] = useState<Record<string, string>>(initialSelections);
  const [quantity, setQuantity] = useState(product.quantities[0]);
  const [quantityRangeId, setQuantityRangeId] = useState(product.quantityRanges?.[0]?.id ?? "");
  const [artworkName, setArtworkName] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const selectedLabels = useMemo(
    () =>
      Object.fromEntries(
        product.options.map((option) => {
          const selected = option.values.find((value) => value.id === selections[option.id]);
          return [option.label, selected?.label ?? "A definir"];
        }),
      ),
    [product.options, selections],
  );

  function handleAddToCart() {
    const quantityRange = product.quantityRanges?.find((range) => range.id === quantityRangeId);
    addItem({
      productName: product.name,
      slug: product.slug,
      quantity: quantityRange?.min ?? quantity,
      quantityRange: quantityRange?.label,
      selections: selectedLabels,
      artworkName,
      unitPrice: product.startingPrice,
      image: product.image,
    });
    setAdded(true);
  }

  return (
    <div className="product-configurator">
      <div className="config-heading">
        <span className="eyebrow">Configure seu produto</span>
        <h1>{product.name}</h1>
        <p>{product.shortDescription}</p>
      </div>

      <div className="draft-notice" role="note">
        <Info aria-hidden="true" size={18} />
        <span>
          Opções iniciais para montar o pedido. Disponibilidade, valor e prazo são
          confirmados pela equipe no WhatsApp.
        </span>
      </div>

      <div className="config-stack">
        {product.options.map((option, optionIndex) => (
          <fieldset className="option-group" key={option.id}>
            <legend>
              <span>{String(optionIndex + 1).padStart(2, "0")}</span>
              {option.label}
            </legend>
            {option.helper ? <p>{option.helper}</p> : null}
            {option.control === "select" ? (
              <select
                aria-label={option.label}
                className="product-option-select"
                value={selections[option.id]}
                onChange={(event) => {
                  setSelections((current) => ({ ...current, [option.id]: event.target.value }));
                  setAdded(false);
                }}
              >
                {option.values.map((value) => (
                  <option key={value.id} value={value.id}>{value.label}</option>
                ))}
              </select>
            ) : (
              <div className={option.control === "size" ? "option-grid size-option-grid" : "option-grid"}>
                {option.values.map((value) => {
                  const selected = selections[option.id] === value.id;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`${option.control === "size" ? "option-button size-option-button" : "option-button"}${selected ? " selected" : ""}`}
                      key={value.id}
                      onClick={() => {
                        setSelections((current) => ({ ...current, [option.id]: value.id }));
                        setAdded(false);
                      }}
                      type="button"
                    >
                      {option.control === "size" ? <span aria-hidden="true" className="size-outline" /> : null}
                      {value.label}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        ))}

        {product.quantityRanges ? (
          <fieldset className="quantity-range-group">
            <legend>Escolha a quantidade</legend>
            <div className="quantity-range-table">
              <div className="quantity-range-head" aria-hidden="true">
                <span>Faixa de quantidade</span>
                <span>Valor</span>
              </div>
              {product.quantityRanges.map((range) => (
                <label className={quantityRangeId === range.id ? "quantity-range-row selected" : "quantity-range-row"} key={range.id}>
                  <span>
                    <input
                      checked={quantityRangeId === range.id}
                      name="quantity-range"
                      onChange={() => {
                        setQuantityRangeId(range.id);
                        setAdded(false);
                      }}
                      type="radio"
                    />
                    {range.label}
                  </span>
                  <strong>Sob consulta</strong>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="config-row">
            <label className="select-field">
              <span>Quantidade</span>
              <select
                aria-label="Quantidade"
                value={quantity}
                onChange={(event) => {
                  setQuantity(Number(event.target.value));
                  setAdded(false);
                }}
              >
                {product.quantities.map((value) => (
                  <option value={value} key={value}>
                    {value} {value === 1 ? "unidade" : "unidades"}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="upload-field">
          <input
            aria-label="Enviar arte agora (opcional)"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.ai,.cdr,.svg"
            onChange={(event) => {
              setArtworkName(event.target.files?.[0]?.name ?? null);
              setAdded(false);
            }}
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
          <span>Valor do pedido</span>
          <strong>Sob consulta</strong>
          <small>Confirmaremos valor, prazo e retirada ou entrega.</small>
        </div>
        <button className="button button-primary button-large" type="button" onClick={handleAddToCart}>
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
    </div>
  );
}
