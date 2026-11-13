"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { MoneyField } from "@/components/staff/ProductConfigModal";
import { areaM2, GRAFICA_M2, graficaById, graficaImage, graficaItemName, graficaUnitPrice, type GraficaChoice, type GraficaId } from "@/components/staff/graficaItems";
import { brl, moneyInput, newId, parseNumber, type Item } from "@/components/staff/quoteEditorShared";

const m2 = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} m²`;
const cmInput = (text: string) => text.replace(/[^\d,]/g, "").replace(/,(?=.*,)/g, "").slice(0, 7);
const cmValue = (text: string) => Number(text.replace(",", "."));

/** Impressos por m² no orçamento/pedido: largura e altura em cm, preço por m² do produto (editável), pedido mínimo no item. */
export function GraficaConfigModal({ start, item, onSave, onClose }: {
  start: GraficaChoice;
  /** Item já na lista (editar); sem ele, adiciona um novo. */
  item?: Extract<Item, { source: "avulso" }>;
  onSave: (item: Item) => void;
  onClose: () => void;
}) {
  const [id] = useState(() => item?.id ?? newId());
  const [productId, setProductId] = useState<GraficaId>(start.id);
  const [color, setColor] = useState(start.color ?? graficaById(start.id).colors?.[0]?.name);
  const [width, setWidth] = useState(start.width ? String(start.width).replace(".", ",") : "");
  const [height, setHeight] = useState(start.height ? String(start.height).replace(".", ",") : "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const w = cmValue(width);
  const h = cmValue(height);
  const qty = Number.parseInt(quantity, 10) || 0;
  const sized = w > 0 && h > 0 && qty > 0;
  const calc = sized ? graficaUnitPrice(productId, w, h, qty) : null;
  // Preço salvo diferente do calculado = digitado pela equipe; igual = segue o cálculo ao mudar medidas/quantidade.
  const [priceOverride, setPriceOverride] = useState(() => {
    const saved = item?.priceOverride ? parseNumber(item.priceOverride) : NaN;
    const auto = start.width && start.height ? graficaUnitPrice(start.id, start.width, start.height, item?.quantity ?? 1).unit : NaN;
    return Number.isFinite(saved) && Math.abs(saved - auto) > 1e-9 ? item!.priceOverride! : "";
  });
  const unit = priceOverride ? parseNumber(priceOverride) : calc?.unit ?? NaN;
  const product = graficaById(productId);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstField.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const canSave = sized && Number.isFinite(unit) && unit >= 0;
  const total = canSave ? Math.round(unit * qty * 100) / 100 : null;
  const save = () => onSave({
    id, source: "avulso", name: graficaItemName({ id: productId, color, width: w, height: h }), cost: 0, quantity: qty, gravacoes: [],
    // Sempre com preço gravado: o servidor não conhece a regra do m² (custo zero daria preço zero).
    priceOverride: moneyInput(unit),
  });

  return (
    <div className="qe-scrim" role="presentation">
      <div aria-labelledby="qe-grafica-title" aria-modal="true" className="qe-modal" role="dialog">
        <header className="qe-modal-head">
          <h2 id="qe-grafica-title">Configuração do produto</h2>
          <button aria-label="Fechar" className="qe-modal-x" onClick={onClose} type="button"><X size={18} /></button>
        </header>

        <div className="qe-modal-body">
          <div className="qe-modal-main">
            <section className="qe-msec">
              <h3>Produto</h3>
              <div className="qe-mbox qe-photo-box">
                <div className="qe-field">
                  <span>Produto</span>
                  <div aria-label="Produto" className="qe-seg qe-grafica-seg" role="radiogroup">
                    {GRAFICA_M2.map((entry) => (
                      <button aria-checked={entry.id === productId} className={entry.id === productId ? "on" : undefined} key={entry.id}
                        onClick={() => {
                          if (entry.id === productId) return;
                          setProductId(entry.id);
                          setColor(graficaById(entry.id).colors?.[0]?.name);
                        }} role="radio" type="button">{entry.name}</button>
                    ))}
                  </div>
                </div>
                {product.colors ? (
                  <div className="qe-field">
                    <span>Cor</span>
                    <div aria-label="Cor" className="qe-seg qe-grafica-seg" role="radiogroup">
                      {product.colors.map((entry) => (
                        <button aria-checked={entry.name === color} className={entry.name === color ? "on" : undefined} key={entry.name}
                          onClick={() => setColor(entry.name)} role="radio" type="button">{entry.name}</button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="qe-mgrid">
                  <label className="qe-field">
                    <span>Largura (cm)</span>
                    <input className="qe-num" inputMode="decimal" onChange={(event) => setWidth(cmInput(event.target.value))} placeholder="Ex.: 100" ref={firstField} value={width} />
                  </label>
                  <label className="qe-field">
                    <span>Altura (cm)</span>
                    <input className="qe-num" inputMode="decimal" onChange={(event) => setHeight(cmInput(event.target.value))} placeholder="Ex.: 60" value={height} />
                  </label>
                  <label className="qe-field">
                    <span>Quantidade</span>
                    <input className="qe-num" inputMode="numeric" onChange={(event) => setQuantity(event.target.value.replace(/\D/g, "").slice(0, 6))} value={quantity} />
                  </label>
                </div>
                <div className="qe-mgrid">
                  <div className="qe-field">
                    <span>Área por peça</span>
                    <div className="qe-ro qe-num">{w > 0 && h > 0 ? m2(areaM2(w, h)) : "—"}</div>
                  </div>
                  <div className="qe-field">
                    <span>Área total</span>
                    <div className="qe-ro qe-num">{sized ? m2(areaM2(w, h) * qty) : "—"}</div>
                  </div>
                  <div className="qe-field">
                    <span>Valor do m²</span>
                    <div className="qe-ro qe-num">{brl(product.price)}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="qe-msec">
              <h3>Preço de venda</h3>
              <div className="qe-mbox">
                <div className="qe-mgrid">
                  <label className="qe-field">
                    <span>Preço por peça (R$)</span>
                    <MoneyField ariaLabel="Preço por peça" calculated={calc?.unit ?? null} className="qe-num qe-strong" onChange={setPriceOverride} value={priceOverride} />
                    <small className="qe-fhint">
                      {priceOverride && calc ? <button className="qe-reset" onClick={() => setPriceOverride("")} type="button">usar o calculado ({brl(calc.unit)})</button> : "área × valor do m², arredondado para cima · clique para alterar"}
                    </small>
                  </label>
                  <div className="qe-field">
                    <span>Total do item</span>
                    <div className="qe-ro qe-num">{total === null ? "—" : brl(total)}</div>
                  </div>
                  <div className="qe-field">
                    <span>Pedido mínimo</span>
                    <div className="qe-ro qe-num">{brl(product.minimum)}</div>
                  </div>
                </div>
                {calc?.minimum && !priceOverride ? <p className="qe-fhint qe-stock">Abaixo do mínimo: o valor por peça subiu para o item fechar pelo menos {brl(product.minimum)}.</p> : null}
              </div>
            </section>
            {!sized ? <p className="qe-fhint">Preencha largura, altura e quantidade para calcular.</p> : null}
          </div>

          <aside className="qe-modal-side">
            <div className="qe-mphoto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={product.name} src={graficaImage({ id: productId, color })} />
            </div>
            <p className="qe-mside-name">{sized ? graficaItemName({ id: productId, color, width: w, height: h }) : color ? `${product.name} ${color}` : product.name}</p>
            <p className="qe-fhint">Gráfica · {brl(product.price)} o m² · pedido mínimo {brl(product.minimum)}</p>
            <p className="qe-fhint">{product.text}</p>
          </aside>
        </div>

        <footer className="qe-modal-foot">
          <div className="qe-mfig"><span>Preço unit.</span><b>{canSave ? brl(unit) : "—"}</b></div>
          <div className="qe-mfig"><span>Total</span><b>{total === null ? "—" : brl(total)}</b></div>
          <button className="qe-btn qe-btn-secondary" onClick={onClose} type="button">Cancelar</button>
          <button className="qe-btn qe-btn-primary qe-madd" disabled={!canSave} onClick={save} type="button">
            <Plus aria-hidden="true" size={16} /> {item ? "Salvar produto" : "Adicionar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
