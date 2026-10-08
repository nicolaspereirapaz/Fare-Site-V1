"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileWarning, MessageCircle, Minus, Plus, Trash2 } from "lucide-react";
import { BillingSummary } from "@/components/BillingSummary";
import { useCart } from "@/context/CartContext";
import type { AccountProfileData } from "@/lib/account/profile";
import { fetchMyProfile, formatPhoneBR } from "@/lib/account/profileClient";
import { requestCheckout } from "@/lib/requestCheckout";
import type { PaymentMethod } from "@/lib/orders/repository";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (value: number) => currency.format(value);
const lineTotal = (unitPrice: number, quantity: number) => Math.round(unitPrice * quantity * 100) / 100;

const MAX_QUANTITY = 999_999;

/**
 * Quantidade digitável no carrinho. Aceita só números; confirma com Enter ou ao sair do campo.
 * Vazio/zero volta para a quantidade atual.
 */
function QuantityInput({ quantity, label, onCommit }: { quantity: number; label: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(quantity);

  function commit() {
    const next = Math.min(MAX_QUANTITY, Number(draft));
    if (draft !== null && Number.isInteger(next) && next >= 1 && next !== quantity) onCommit(next);
    setDraft(null);
  }

  return (
    <input
      aria-label={label}
      className="quantity-stepper-input"
      inputMode="numeric"
      maxLength={6}
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
      onFocus={(event) => event.target.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          // Enter confirma e solta o campo (o blur confirma); o próximo clique seleciona tudo de novo.
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
      onMouseUp={(event) => event.preventDefault()}
      type="text"
      value={value}
    />
  );
}

export function CartView() {
  const router = useRouter();
  const { items, removeItem, updateQuantity } = useCart();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [pending, setPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const [profile, setProfile] = useState<AccountProfileData | null>(null);

  // Preenche com os dados da conta; só campos ainda vazios (não apaga o que o cliente digitou).
  useEffect(() => {
    let active = true;
    fetchMyProfile().then((profile) => {
      if (!active || !profile) return;
      setProfile(profile);
      setName((current) => current || profile.name);
      setPhone((current) => current || profile.phone);
      setCompany((current) => current || profile.tradeName || profile.companyName);
    });
    return () => {
      active = false;
    };
  }, []);

  async function finishOnWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setCheckoutError(null);

    try {
      idempotencyKey.current ??= typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await requestCheckout({
        customer: { name, company, phone, notes },
        items,
        paymentMethod,
        idempotencyKey: idempotencyKey.current,
      });
      if ("requiresAuth" in result) {
        router.push("/entrar?callbackURL=/carrinho");
        return;
      }
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Não foi possível finalizar agora.");
    } finally {
      setPending(false);
    }
  }

  if (!items.length) {
    return (
      <div className="empty-cart">
        <div className="empty-cart-icon"><MessageCircle aria-hidden="true" /></div>
        <span className="eyebrow">Seu carrinho</span>
        <h1>Vamos montar seu pedido?</h1>
        <p>Configure os produtos que deseja e finalize o orçamento diretamente com a equipe.</p>
        <Link className="button button-primary button-large" href="/produtos">
          Explorar produtos
        </Link>
      </div>
    );
  }

  const priced = items.filter((item) => typeof item.unitPrice === "number");
  const estimatedTotal = Math.round(priced.reduce((sum, item) => sum + lineTotal(item.unitPrice as number, item.quantity), 0) * 100) / 100;
  const hasUnpriced = priced.length < items.length;

  return (
    <div className="cart-layout">
      <section className="cart-items" aria-labelledby="cart-title">
        <div className="cart-title-row">
          <div>
            <span className="eyebrow">Seu carrinho</span>
            <h1 id="cart-title">Revise as configurações</h1>
          </div>
          <span>{items.length} {items.length === 1 ? "item" : "itens"}</span>
        </div>

        {items.map((item) => (
          <article className="cart-item" key={item.id}>
            <div className={item.slug.startsWith("brindes/") ? "cart-item-image supplier-photo" : "cart-item-image"}>
              <Image alt="" fill sizes="112px" src={item.image} />
            </div>
            <div className="cart-item-info">
              <div className="cart-item-heading">
                <div>
                  <h2>{item.productName}</h2>
                  {typeof item.unitPrice === "number" ? (
                    <span className="cart-item-price">
                      {brl(item.unitPrice)}/un. estimado · <strong>Subtotal {brl(lineTotal(item.unitPrice, item.quantity))}</strong>
                    </span>
                  ) : (
                    <span>Valor sob consulta</span>
                  )}
                </div>
                <button aria-label={`Remover ${item.productName}`} onClick={() => removeItem(item.id)} type="button">
                  <Trash2 aria-hidden="true" size={18} />
                </button>
              </div>
              <dl>
                {Object.entries(item.selections).map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
                <div><dt>Arte</dt><dd>{item.artworkName ?? "Enviar pelo WhatsApp"}</dd></div>
              </dl>
              {item.quantityRange ? (
                <div className="quantity-range-summary">Quantidade: {item.quantityRange}</div>
              ) : (
                <div className="quantity-stepper" aria-label={`Quantidade de ${item.productName}`}>
                  <button aria-label="Diminuir quantidade" onClick={() => updateQuantity(item.id, item.quantity - (item.pricing ? 10 : 1))} type="button">
                    <Minus aria-hidden="true" size={16} />
                  </button>
                  <QuantityInput
                    label={`Quantidade de ${item.productName}`}
                    onCommit={(value) => updateQuantity(item.id, value)}
                    quantity={item.quantity}
                  />
                  <button aria-label="Aumentar quantidade" onClick={() => updateQuantity(item.id, item.quantity + (item.pricing ? 10 : 1))} type="button">
                    <Plus aria-hidden="true" size={16} />
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}

        {priced.length ? (
          <div className="cart-estimate">
            <span>Total estimado{hasUnpriced ? " (sem os itens sob consulta)" : ""}</span>
            <strong>{brl(estimatedTotal)}</strong>
            <small>Valores de referência. Personalização e frete de entrega são confirmados no orçamento.</small>
          </div>
        ) : null}

        <Link className="back-link" href="/produtos">
          <ArrowLeft aria-hidden="true" size={17} /> Adicionar mais produtos
        </Link>
      </section>

      <aside className="checkout-card" id="finalizar">
        <span className="eyebrow">Finalizar orçamento</span>
        <h2>Envie o pedido para o WhatsApp</h2>
        <p>Os itens e as configurações serão organizados automaticamente na mensagem.</p>

        {profile ? <BillingSummary profile={profile} /> : null}

        <form onSubmit={finishOnWhatsApp}>
          <label><span>Nome</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Empresa (opcional)</span><input value={company} onChange={(event) => setCompany(event.target.value)} /></label>
          <label><span>WhatsApp para retorno</span><input inputMode="tel" required value={phone} onChange={(event) => setPhone(formatPhoneBR(event.target.value))} /></label>
          <label>
            <span>Forma de pagamento</span>
            <select
              required
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | "")}
            >
              <option value="">Selecione</option>
              <option value="pix">Pix</option>
              <option value="cartao_credito">Cartão de crédito</option>
              <option value="cartao_debito">Cartão de débito</option>
              <option value="boleto">Boleto</option>
              <option value="faturamento_empresa">Faturamento para empresa</option>
            </select>
          </label>
          <small className="payment-notice">Faturamento para empresa está sujeito à aprovação da Fare Foto.</small>
          <label><span>Observações (opcional)</span><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="file-reminder">
            <FileWarning aria-hidden="true" size={19} />
            <span>O nome da arte vai na mensagem. Anexe o arquivo na conversa do WhatsApp.</span>
          </div>
          {checkoutError ? <p className="auth-error" role="alert">{checkoutError}</p> : null}
          <button className="button button-whatsapp button-large" disabled={pending} type="submit">
            <MessageCircle aria-hidden="true" size={20} /> {pending ? "Criando pedido…" : "Criar pedido e abrir WhatsApp"}
          </button>
        </form>
        <small>Nenhum pagamento é realizado pelo site nesta versão.</small>
      </aside>
    </div>
  );
}
