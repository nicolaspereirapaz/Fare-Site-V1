"use client";

import { useProfessional } from "@/components/fotos/useProfessional";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock, Home, MessageCircle, Minus, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { fetchMyProfile, formatPhoneBR, saveMyContact } from "@/lib/account/profileClient";
import { requestCheckout } from "@/lib/requestCheckout";
import {
  clearPhotoOrder, deadline, groupOf, minimumIssues, paperLabel, PHOTO_PRODUCT_IMAGE, photoPayload, realLabel, setPhotos, summarize, usePhotoState,
} from "@/components/fotos/shared";
import "./cart.css";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (value: number) => currency.format(value);
const lineTotal = (unitPrice: number, quantity: number) => Math.round(unitPrice * quantity * 100) / 100;

const MAX_QUANTITY = 999_999;
const PHOTO_EDIT_HREF = "/produtos/revelacao-de-fotos/enviar";

type Delivery = "retirada" | "entrega";
type PhotoOrderResult = { code: string; url: string; summary: string[] };

/** Só o que o servidor precisa para montar os arquivos: o arquivo enviado e as escolhas do editor. */
const DELIVERY_TEXT: Record<Delivery, string> = {
  retirada: "Entrega: vou retirar na loja.",
  entrega: "Entrega: quero receber em casa (taxa combinada no WhatsApp).",
};

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

/**
 * Carrinho único: brindes (CartContext) e o pedido de fotos (memória da aba) juntos.
 * Finaliza só com "retirar ou receber" e o WhatsApp. Com brindes, o orçamento fica registrado no sistema
 * (Minha conta e equipe) e a mensagem leva também as fotos; só com fotos, abre o WhatsApp direto.
 */
export function CartView() {
  const router = useRouter();
  const { items, removeItem, updateQuantity } = useCart();
  const photoState = usePhotoState();
  const pro = useProfessional();
  const photoOrder = summarize(photoState.inCart ? photoState.photos : [], pro);
  const [delivery, setDelivery] = useState<Delivery>("retirada");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  /**
   * Nome e WhatsApp vêm do cadastro (obrigatórios ao criar a conta); o carrinho não pede de novo.
   * "sem-telefone": conta antiga sem WhatsApp, pede só o telefone uma vez e salva na conta.
   */
  const [account, setAccount] = useState<"carregando" | "sem-login" | "sem-telefone" | "ok">("carregando");
  const [pending, setPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  // Pedido de fotos já montado nesta tentativa: se o orçamento dos brindes falhar, não monta as fotos de novo.
  const photoOrderSent = useRef<PhotoOrderResult | null>(null);

  // Contato do pedido = dados da conta.
  useEffect(() => {
    let active = true;
    fetchMyProfile().then((profile) => {
      if (!active) return;
      if (!profile) return setAccount("sem-login");
      setName(profile.name);
      setPhone(profile.phone);
      setCompany(profile.tradeName || profile.companyName);
      setAccount(profile.phone ? "ok" : "sem-telefone");
    });
    return () => {
      active = false;
    };
  }, []);

  function changeDelivery(next: Delivery) {
    setDelivery(next);
    setCheckoutError(null);
  }

  function removePhotoLine(sizeId: string, paper: string) {
    setPhotos(photoState.photos.filter((photo) => !(photo.sizeId === sizeId && photo.paper === paper)));
  }

  async function finishOnWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutError(null);
    if (account === "sem-login") {
      router.push("/entrar?callbackURL=/carrinho");
      return;
    }
    setPending(true);
    const photos = photoState.inCart ? photoState.photos.filter((photo) => photo.copies > 0) : [];
    if (account === "sem-telefone") {
      // Conta antiga sem WhatsApp: salva agora no cadastro (não pede de novo nas próximas compras).
      const problem = await saveMyContact({ phone });
      if (problem) {
        setCheckoutError(problem);
        setPending(false);
        return;
      }
      setAccount("ok");
    }

    try {
      // 1) Fotos: o servidor monta a pasta do pedido (arquivos prontos, originais e o PED-XXXXXX.html).
      let photoOrder = photoOrderSent.current;
      if (photos.length && !photoOrder) {
        const response = await fetch("/api/fotos/pedidos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ customer: { name, phone, company }, delivery, photos: photos.map(photoPayload) }),
        });
        if (response.status === 401) {
          // As fotos ficam guardadas e voltam depois do login.
          router.push("/entrar?callbackURL=/carrinho");
          return;
        }
        const data = (await response.json()) as PhotoOrderResult & { error?: string };
        if (!response.ok) throw new Error(data.error || "Não foi possível montar o pedido de fotos.");
        photoOrder = data;
        photoOrderSent.current = data;
      }

      // 2) Só fotos: a mensagem do pedido já vem pronta do servidor.
      if (!items.length && photoOrder) {
        clearPhotoOrder();
        window.location.assign(photoOrder.url);
        return;
      }

      // 3) Com brindes: registra o orçamento; o pedido de fotos vai junto nas observações.
      const notes = [DELIVERY_TEXT[delivery], ...(photoOrder ? ["", ...photoOrder.summary] : [])].join("\n");
      idempotencyKey.current ??= typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await requestCheckout(
        { customer: { name, company, phone, notes }, items, idempotencyKey: idempotencyKey.current },
        fetch,
        "/api/quotes",
      );
      if ("requiresAuth" in result) {
        router.push("/entrar?callbackURL=/carrinho");
        return;
      }
      if (photoOrder) clearPhotoOrder();
      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Não foi possível finalizar agora.");
    } finally {
      setPending(false);
    }
  }

  const photoLineCount = photoOrder.sizes.reduce((sum, group) => sum + group.papers.length, 0);
  const lineCount = items.length + photoLineCount;

  if (!lineCount) {
    return (
      <div className="empty-cart">
        <div className="empty-cart-icon"><MessageCircle aria-hidden="true" /></div>
        <span className="eyebrow">Seu carrinho</span>
        <h1>Vamos montar seu pedido?</h1>
        <p>Escolha brindes, impressos ou envie suas fotos e finalize direto com a equipe pelo WhatsApp.</p>
        <div className="empty-cart-actions">
          <Link className="button button-primary button-large" href="/produtos/revelacao-de-fotos">Enviar minhas fotos</Link>
          <Link className="button button-secondary button-large" href="/brindes">Ver brindes</Link>
        </div>
      </div>
    );
  }

  const priced = items.filter((item) => typeof item.unitPrice === "number");
  const estimatedTotal = Math.round(
    (priced.reduce((sum, item) => sum + lineTotal(item.unitPrice as number, item.quantity), 0) + photoOrder.total) * 100,
  ) / 100;
  const hasUnpriced = priced.length < items.length;
  const photosToSend = photoState.inCart ? photoState.photos.filter((photo) => photo.copies > 0) : [];
  const uploading = photosToSend.filter((photo) => !photo.uploadId && photo.upload?.status !== "erro").length;
  const failed = photosToSend.filter((photo) => photo.upload?.status === "erro").length;
  const belowMinimum = minimumIssues(photosToSend);

  return (
    <div className="cart-layout">
      <section className="cart-items" aria-labelledby="cart-title">
        <div className="cart-title-row">
          <div>
            <span className="eyebrow">Seu carrinho</span>
            <h1 id="cart-title">Revise o seu pedido</h1>
          </div>
          <span>{lineCount} {lineCount === 1 ? "item" : "itens"}</span>
        </div>

        {photoOrder.sizes.flatMap((group) =>
          group.papers.map((line) => (
            <article className="cart-item cart-item-photos" key={`${group.size.id}-${line.paper}`}>
              <div className="cart-item-image cart-photo-image">
                <Image alt="" fill sizes="112px" src={PHOTO_PRODUCT_IMAGE[group.size.group]} />
              </div>
              <div className="cart-item-info">
                <div className="cart-item-heading">
                  <div>
                    <h2>{groupOf(group.size.group).item} {group.size.label}</h2>
                    <span className="cart-item-price">
                      {brl(group.price.unit)}/foto · <strong>Subtotal {brl(line.copies * group.price.unit)}</strong>
                    </span>
                  </div>
                  <button
                    aria-label={`Remover ${groupOf(group.size.group).item} ${group.size.label} papel ${paperLabel(line.paper)}`}
                    onClick={() => removePhotoLine(group.size.id, line.paper)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={18} />
                  </button>
                </div>
                <dl>
                  <div><dt>Papel</dt><dd>{paperLabel(line.paper)}</dd></div>
                  <div><dt>Fotos</dt><dd>{line.photos.length} {line.photos.length === 1 ? "foto" : "fotos"} · {line.copies} {line.copies === 1 ? "cópia" : "cópias"}</dd></div>
                  {realLabel(group.size) ? <div><dt>Tamanho real</dt><dd>{realLabel(group.size)}</dd></div> : null}
                </dl>
                <Link className="button button-secondary cart-photo-edit" href={PHOTO_EDIT_HREF}>
                  <Pencil aria-hidden="true" size={16} /> Editar fotos
                </Link>
              </div>
            </article>
          )),
        )}

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

        {priced.length || photoOrder.copies ? (
          <div className="cart-estimate">
            <span>Total estimado{hasUnpriced ? " (sem os itens sob consulta)" : ""}</span>
            <strong>{brl(estimatedTotal)}</strong>
            <small>Valores de referência. Personalização e frete de entrega são confirmados no WhatsApp.</small>
          </div>
        ) : null}

        <div className="cart-more-links">
          <Link className="back-link" href="/brindes">
            <ArrowLeft aria-hidden="true" size={17} /> Adicionar brindes
          </Link>
          <Link className="back-link" href={photoOrder.copies ? PHOTO_EDIT_HREF : "/produtos/revelacao-de-fotos"}>
            <Plus aria-hidden="true" size={17} /> {photoOrder.copies ? "Adicionar ou trocar fotos" : "Revelar fotos"}
          </Link>
        </div>
      </section>

      <aside className="checkout-card" id="finalizar">
        <span className="eyebrow">Finalizar</span>
        <h2>Finalize pelo WhatsApp</h2>
        <p>O pedido vai organizado na mensagem. A equipe confirma valores e prazo com você por lá.</p>

        <form onSubmit={finishOnWhatsApp}>
          <fieldset className="fp-delivery">
            <legend>Como quer receber?</legend>
            <label className={delivery === "retirada" ? "active" : ""}>
              <input checked={delivery === "retirada"} name="entrega" onChange={() => changeDelivery("retirada")} type="radio" />
              <Store aria-hidden="true" size={20} />
              <span><strong>Retirar na loja</strong><small>Avisamos pelo WhatsApp quando ficar pronto.</small></span>
            </label>
            <label className={delivery === "entrega" ? "active" : ""}>
              <input checked={delivery === "entrega"} name="entrega" onChange={() => changeDelivery("entrega")} type="radio" />
              <Home aria-hidden="true" size={20} />
              <span><strong>Receber em casa</strong><small>Entrega na região. Taxa combinada no WhatsApp.</small></span>
            </label>
          </fieldset>

          {account === "ok" ? (
            <p className="checkout-contact">
              Enviando como <strong>{name}</strong> · {phone}{" "}
              <Link className="text-link" href="/minha-conta/dados">Alterar no cadastro</Link>
            </p>
          ) : account === "sem-telefone" ? (
            <label><span>Seu WhatsApp (fica salvo no seu cadastro)</span><input inputMode="tel" required value={phone} onChange={(event) => setPhone(formatPhoneBR(event.target.value))} /></label>
          ) : account === "sem-login" ? (
            <p className="checkout-contact">Para finalizar, entre na sua conta (ou crie uma). Seu nome e WhatsApp vêm do cadastro.</p>
          ) : null}

          {failed ? (
            <p className="auth-error" role="alert">
              {failed === 1 ? "1 foto não foi enviada." : `${failed} fotos não foram enviadas.`} <Link href={PHOTO_EDIT_HREF}>Tente de novo nas suas fotos</Link>.
            </p>
          ) : null}
          {belowMinimum.length ? (
            <p className="auth-error" role="status">{belowMinimum.join(" ")} <Link href={PHOTO_EDIT_HREF}>Ajustar nas suas fotos</Link>.</p>
          ) : null}
          {checkoutError ? <p className="auth-error" role="alert">{checkoutError}</p> : null}
          <button className="button button-whatsapp button-large" disabled={pending || uploading > 0 || failed > 0 || belowMinimum.length > 0} type="submit">
            <MessageCircle aria-hidden="true" size={20} />{" "}
            {pending
              ? (photosToSend.length ? "Montando o pedido…" : "Enviando…")
              : uploading
                ? `Enviando fotos para a loja (faltam ${uploading})…`
                : "Finalizar no WhatsApp"}
          </button>
        </form>
        {photoOrder.copies ? (
          <p className="checkout-deadline"><Clock aria-hidden="true" size={15} /> Fotos: {deadline(photoOrder.sizes.flatMap((group) => group.photos)).toLowerCase()}</p>
        ) : null}
        <small>
          {items.length
            ? "O pedido também fica salvo em Minha conta → Orçamentos."
            : "Nenhum pagamento é feito pelo site."}
        </small>
      </aside>
    </div>
  );
}
