"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, FileWarning, MessageCircle, Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { requestCheckout } from "@/lib/requestCheckout";

export function CartView() {
  const router = useRouter();
  const { items, removeItem, updateQuantity } = useCart();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function finishOnWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setCheckoutError(null);

    try {
      const result = await requestCheckout({ customer: { name, company, phone, notes }, items });
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
            <div className="cart-item-image">
              <Image alt="" fill sizes="112px" src={item.image} />
            </div>
            <div className="cart-item-info">
              <div className="cart-item-heading">
                <div>
                  <h2>{item.productName}</h2>
                  <span>Valor sob consulta</span>
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
                  <button aria-label="Diminuir quantidade" onClick={() => updateQuantity(item.id, item.quantity - 1)} type="button">
                    <Minus aria-hidden="true" size={16} />
                  </button>
                  <span>{item.quantity}</span>
                  <button aria-label="Aumentar quantidade" onClick={() => updateQuantity(item.id, item.quantity + 1)} type="button">
                    <Plus aria-hidden="true" size={16} />
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}

        <Link className="back-link" href="/produtos">
          <ArrowLeft aria-hidden="true" size={17} /> Adicionar mais produtos
        </Link>
      </section>

      <aside className="checkout-card">
        <span className="eyebrow">Finalizar orçamento</span>
        <h2>Envie o pedido para o WhatsApp</h2>
        <p>Os itens e as configurações serão organizados automaticamente na mensagem.</p>

        <form onSubmit={finishOnWhatsApp}>
          <label><span>Nome</span><input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span>Empresa (opcional)</span><input value={company} onChange={(event) => setCompany(event.target.value)} /></label>
          <label><span>WhatsApp para retorno</span><input inputMode="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label><span>Observações (opcional)</span><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <div className="file-reminder">
            <FileWarning aria-hidden="true" size={19} />
            <span>O nome da arte vai na mensagem. Anexe o arquivo na conversa do WhatsApp.</span>
          </div>
          {checkoutError ? <p className="auth-error" role="alert">{checkoutError}</p> : null}
          <button className="button button-whatsapp button-large" disabled={pending} type="submit">
            <MessageCircle aria-hidden="true" size={20} /> {pending ? "Verificando conta…" : "Finalizar no WhatsApp"}
          </button>
        </form>
        <small>Nenhum pagamento é realizado pelo site nesta versão.</small>
      </aside>
    </div>
  );
}
