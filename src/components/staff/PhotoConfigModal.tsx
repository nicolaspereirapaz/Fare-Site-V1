"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { isListed, PHOTO_PRODUCT_IMAGE, SIZE_GROUPS, SIZES, sizeById, sizePriceHint } from "@/components/fotos/catalog";
import { CustomSizeForm } from "@/components/fotos/shared";
import { MoneyField } from "@/components/staff/ProductConfigModal";
import { photoItemName, photoTablePrice, type PhotoChoice } from "@/components/staff/photoItems";
import { brl, moneyInput, newId, parseNumber, type Item } from "@/components/staff/quoteEditorShared";

/** Foto no orçamento/pedido: quantidade de fotos e tamanho; preço da tabela do site (editável). O papel o cliente escolhe depois. */
export function PhotoConfigModal({ start, item, onSave, onClose, pro = false }: {
  start: PhotoChoice;
  /** Cliente profissional: preço da tabela profissional. */
  pro?: boolean;
  /** Item já na lista (editar); sem ele, adiciona um novo. */
  item?: Extract<Item, { source: "avulso" }>;
  onSave: (item: Item) => void;
  onClose: () => void;
}) {
  const [id] = useState(() => item?.id ?? newId());
  const [sizeId, setSizeId] = useState(start.sizeId);
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const qty = Number.parseInt(quantity, 10) || 0;
  const table = photoTablePrice(sizeId, qty, pro);
  // Preço salvo diferente da tabela = digitado pela equipe; igual = segue a tabela ao mudar a quantidade.
  const [priceOverride, setPriceOverride] = useState(() => {
    const saved = item?.priceOverride ? parseNumber(item.priceOverride) : NaN;
    return Number.isFinite(saved) && Math.abs(saved - photoTablePrice(start.sizeId, item?.quantity ?? 1, pro)) > 1e-9 ? item!.priceOverride! : "";
  });
  const unit = priceOverride ? parseNumber(priceOverride) : table;
  const size = sizeById(sizeId);
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

  const canSave = qty > 0 && Number.isFinite(unit) && unit >= 0;
  const save = () => onSave({
    id, source: "avulso", name: photoItemName({ sizeId }), cost: 0, quantity: qty, gravacoes: [],
    // Sempre com preço gravado: o servidor não conhece a tabela de fotos (custo zero daria preço zero).
    priceOverride: moneyInput(unit),
  });

  return (
    <div className="qe-scrim" role="presentation">
      <div aria-labelledby="qe-photo-title" aria-modal="true" className="qe-modal" role="dialog">
        <header className="qe-modal-head">
          <h2 id="qe-photo-title">Configuração da foto</h2>
          <button aria-label="Fechar" className="qe-modal-x" onClick={onClose} type="button"><X size={18} /></button>
        </header>

        <div className="qe-modal-body">
          <div className="qe-modal-main">
            <section className="qe-msec">
              <h3>Foto</h3>
              <div className="qe-mbox qe-photo-box">
                <label className="qe-field qe-photo-qty">
                  <span>Quantidade de fotos</span>
                  <input inputMode="numeric" onChange={(event) => setQuantity(event.target.value.replace(/\D/g, "").slice(0, 6))} ref={firstField} value={quantity} />
                </label>
                <div className="qe-field">
                  <span>Tipo</span>
                  <div aria-label="Tipo de foto" className="qe-seg" role="radiogroup">
                    {SIZE_GROUPS.map((group) => (
                      <button aria-checked={size.group === group.id} className={size.group === group.id ? "on" : undefined} key={group.id}
                        onClick={() => setSizeId(SIZES.find((entry) => entry.group === group.id)!.id)} role="radio" type="button">{group.label}</button>
                    ))}
                  </div>
                </div>
                <div className="qe-field">
                  <span>Tamanho</span>
                  <div aria-label="Tamanho" className="qe-pk-chips qe-photo-sizes" role="radiogroup">
                    {[...SIZES.filter((entry) => entry.group === size.group), ...(isListed(sizeId) ? [] : [size])].map((entry) => (
                      <button aria-checked={entry.id === sizeId} className={entry.id === sizeId ? "on" : undefined} key={entry.id} onClick={() => setSizeId(entry.id)} role="radio" type="button">
                        {entry.label.replace(" cm", "")}
                        {sizePriceHint(entry) ? <small>{sizePriceHint(entry)}</small> : null}
                      </button>
                    ))}
                  </div>
                  {/* Tamanho digitado: mesma regra do site (preço do tamanho em que cabe + acréscimo; grandes pela faixa). */}
                  <CustomSizeForm group={size.group} key={`${size.group}-${sizeId}`} onPick={setSizeId} value={sizeId} />
                </div>
                <div className="qe-mgrid">
                  <label className="qe-field">
                    <span>Preço por foto (R$)</span>
                    <MoneyField ariaLabel="Preço por foto" calculated={table} className="qe-num qe-strong" onChange={setPriceOverride} value={priceOverride} />
                    <small className="qe-fhint">
                      {priceOverride ? <button className="qe-reset" onClick={() => setPriceOverride("")} type="button">usar o da tabela ({brl(table)})</button> : "tabela do site · clique para alterar"}
                    </small>
                  </label>
                </div>
              </div>
            </section>
          </div>

          <aside className="qe-modal-side">
            <div className="qe-mphoto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" src={PHOTO_PRODUCT_IMAGE[size.group]} />
            </div>
            <p className="qe-mside-name">{photoItemName({ sizeId })}</p>
            <p className="qe-fhint">O papel (brilho ou fosco) o cliente escolhe ao enviar as fotos.</p>
          </aside>
        </div>

        <footer className="qe-modal-foot">
          <div className="qe-mfig"><span>Preço unit.</span><b>{canSave ? brl(unit) : "—"}</b></div>
          <div className="qe-mfig"><span>Total</span><b>{canSave ? brl(Math.round(unit * qty * 100) / 100) : "—"}</b></div>
          <button className="qe-btn qe-btn-secondary" onClick={onClose} type="button">Cancelar</button>
          <button className="qe-btn qe-btn-primary qe-madd" disabled={!canSave} onClick={save} type="button">
            <Plus aria-hidden="true" size={16} /> {item ? "Salvar foto" : "Adicionar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
