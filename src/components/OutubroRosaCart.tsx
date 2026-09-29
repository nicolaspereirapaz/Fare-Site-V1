"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Info, MessageCircle, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { formatCampaignPrice } from "@/components/OutubroRosaProductCard";
import { buildOutubroRosaQuoteUrl } from "@/lib/outubroRosaQuote";
import {
  cartItemColor, cartItemSubtotal, cartItemUnitPrice, readCampaignCart, summarizeCart,
  writeCampaignCart, type CampaignCartItem,
} from "@/lib/outubroRosaCart";
import { CAMPAIGN_HOME } from "@/lib/siteMode";
import styles from "@/app/campanhas/outubro-rosa/outubro-rosa.module.css";

const QUANTITY_STEP = 10;

function productHref(item: CampaignCartItem) {
  return item.slug.startsWith("campanhas/") ? `/${item.slug}` : CAMPAIGN_HOME;
}

/** Carrinho da campanha: revisar itens, ajustar quantidades e enviar o pedido pelo WhatsApp. */
export function OutubroRosaCart() {
  const [cart, setCart] = useState<CampaignCartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const load = () => { setCart(readCampaignCart()); setReady(true); };
    const timer = window.setTimeout(load, 0);
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key.includes("outubro-rosa")) load(); };
    window.addEventListener("storage", onStorage);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", onStorage); };
  }, []);

  function save(next: CampaignCartItem[]) {
    setCart(next);
    writeCampaignCart(next);
  }

  function setQuantity(id: string, quantity: number) {
    save(cart.map((item) => (item.id === id ? { ...item, quantity: Math.max(1, Math.min(999999, Math.round(quantity))) } : item)));
  }

  function commitDraft(item: CampaignCartItem) {
    const draft = drafts[item.id];
    if (draft === undefined) return;
    const value = Number(draft);
    if (Number.isFinite(value) && value >= 1) setQuantity(item.id, value);
    setDrafts((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
  }

  function remove(id: string) {
    save(cart.filter((item) => item.id !== id));
  }

  function clearAll() {
    if (window.confirm("Remover todos os itens do carrinho?")) save([]);
  }

  function finishOnWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) return;
    window.location.assign(buildOutubroRosaQuoteUrl({ name: name.trim(), company: company.trim(), phone: phone.trim(), notes: notes.trim() }, cart));
  }

  const summary = summarizeCart(cart);

  return (
    <section className={styles.cartPage}>
      <div className="container-shell">
        <Link className={styles.backLink} href={CAMPAIGN_HOME}><ArrowLeft aria-hidden="true" size={16} /> Continuar escolhendo brindes</Link>
        <div className={styles.cartTitle}>
          <span className="eyebrow">Seu pedido de orçamento</span>
          <h1>Carrinho Outubro Rosa</h1>
        </div>

        {!ready ? null : !cart.length ? (
          <div className={styles.cartEmpty}>
            <ShoppingBag aria-hidden="true" size={30} />
            <h2>Seu carrinho está vazio</h2>
            <p>Escolha os brindes da campanha, defina cor e quantidade e adicione ao carrinho.</p>
            <Link className="button button-primary button-large" href={CAMPAIGN_HOME}>Ver brindes do Outubro Rosa</Link>
          </div>
        ) : (
          <div className={styles.cartLayout}>
            <div>
              <div className={styles.cartListHead}>
                <span>{summary.lines} {summary.lines === 1 ? "produto" : "produtos"} · {summary.units.toLocaleString("pt-BR")} unidades</span>
                <button className={styles.clearCart} onClick={clearAll} type="button">Esvaziar carrinho</button>
              </div>
              <ul className={styles.cartList}>
                {cart.map((item) => {
                  const unit = cartItemUnitPrice(item);
                  const subtotal = cartItemSubtotal(item);
                  const color = cartItemColor(item);
                  const href = productHref(item);
                  return (
                    <li className={styles.cartRow} key={item.id}>
                      <Link aria-label={item.productName} className={styles.cartRowImage} href={href}>
                        {item.image ? <Image alt="" fill sizes="96px" src={item.image} unoptimized /> : null}
                      </Link>
                      <div className={styles.cartRowInfo}>
                        <h2><Link href={href}>{item.productName}</Link></h2>
                        {color ? <p>Cor: <strong>{color}</strong></p> : null}
                        <p>{unit !== null ? <>{formatCampaignPrice(unit)}<small>/un. estimado</small></> : "Valor sob consulta"}</p>
                      </div>
                      <div className={styles.cartRowQty}>
                        <span className={styles.cartRowLabel}>Quantidade</span>
                        <div className={styles.qtyStepper}>
                          <button aria-label={`Diminuir ${QUANTITY_STEP} unidades`} disabled={item.quantity <= 1} onClick={() => setQuantity(item.id, item.quantity - QUANTITY_STEP)} type="button"><Minus size={15} /></button>
                          <input
                            aria-label={`Quantidade de ${item.productName}`}
                            inputMode="numeric"
                            maxLength={6}
                            onBlur={() => commitDraft(item)}
                            onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value.replace(/\D/g, "") }))}
                            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitDraft(item); } }}
                            value={drafts[item.id] ?? String(item.quantity)}
                          />
                          <button aria-label={`Aumentar ${QUANTITY_STEP} unidades`} onClick={() => setQuantity(item.id, item.quantity + QUANTITY_STEP)} type="button"><Plus size={15} /></button>
                        </div>
                      </div>
                      <div className={styles.cartRowTotal}>
                        <span className={styles.cartRowLabel}>Subtotal</span>
                        <strong>{subtotal !== null ? formatCampaignPrice(subtotal) : "Sob consulta"}</strong>
                      </div>
                      <button aria-label={`Remover ${item.productName}`} className={styles.removeButton} onClick={() => remove(item.id)} type="button"><Trash2 size={17} /></button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <aside className={styles.cartAside}>
              <div className={styles.cartSummary}>
                <h2>Resumo</h2>
                <dl>
                  <div><dt>Produtos</dt><dd>{summary.lines}</dd></div>
                  <div><dt>Unidades</dt><dd>{summary.units.toLocaleString("pt-BR")}</dd></div>
                  <div className={styles.cartSummaryTotal}><dt>Total estimado</dt><dd>{summary.total > 0 ? formatCampaignPrice(summary.total) : "Sob consulta"}</dd></div>
                </dl>
                {summary.hasUnpriced && summary.total > 0 ? <small>Sem os itens com valor sob consulta.</small> : null}
                <p className={styles.estimateNotice} role="note">
                  <Info aria-hidden="true" size={16} />
                  <span><strong>Valor estimado.</strong> Personalização, frete e prazo são confirmados no orçamento final pelo WhatsApp.</span>
                </p>
              </div>

              <form className={styles.quoteForm} onSubmit={finishOnWhatsApp}>
                <h2>Enviar pedido pelo WhatsApp</h2>
                <p>Montamos a mensagem com todos os itens. Você revisa antes de enviar.</p>
                <label><span>Nome</span><input autoComplete="name" onChange={(event) => setName(event.target.value)} required value={name} /></label>
                <label><span>Empresa (opcional)</span><input autoComplete="organization" onChange={(event) => setCompany(event.target.value)} value={company} /></label>
                <label><span>WhatsApp para retorno</span><input autoComplete="tel" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="(11) 90000-0000" required value={phone} /></label>
                <label><span>Observações (opcional)</span><textarea onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: data do evento, cores do logo…" rows={3} value={notes} /></label>
                <button className="button button-whatsapp button-large" type="submit"><MessageCircle size={19} /> Solicitar orçamento</button>
                <small>Nenhum pagamento é realizado neste site.</small>
              </form>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
