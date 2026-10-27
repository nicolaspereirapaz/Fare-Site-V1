"use client";

import { CustomerEdit } from "@/components/staff/CustomerEdit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PencilLine, Search, X } from "lucide-react";
import { ProductConfigModal, type ModalStart } from "@/components/staff/ProductConfigModal";
import { EMPTY_PICKER, ProductPickerModal, type PickedProduct, type PickerState } from "@/components/staff/ProductPickerModal";
import { PhotoConfigModal } from "@/components/staff/PhotoConfigModal";
import { photoFromName, photoTablePrice, type PhotoChoice } from "@/components/staff/photoItems";
import { AddressFields } from "@/components/staff/AddressFields";
import { EMPTY_ADDRESS } from "@/lib/customers/address";
import { paperLabel, PHOTO_PRODUCT_IMAGE, sizeById, SIZES, type SizeGroup } from "@/components/fotos/catalog";
import { QuoteCreatedDialog } from "@/components/staff/QuoteCreatedDialog";
import { quoteCode } from "@/lib/quotes/quoteCode";
import { orderCode } from "@/lib/orders/orderCode";

/** Mesma regra do servidor (ORDER_EDITABLE_STATUSES em lib/orders/payments). */
const ORDER_EDITABLE = ["aguardando_pagamento", "aguardando_arte", "criando_arte", "aguardando_producao", "em_producao", "aguardando_retirada", "aguardando_feedback"];
import { DirectOrderFields } from "@/components/staff/DirectOrderFields";
import type { ClosingChoice } from "@/components/staff/QuoteClosingFields";
import { deliveryLabel, EMPTY_PAYMENT_FORM, paidCents, paymentFormError, todayInBrazil, type PaymentForm } from "@/components/staff/paymentFieldsShared";
import {
  brl,
  EMPTY_TOTALS,
  engravingSummary,
  fromServerItem,
  initials,
  newId,
  parseNumber,
  postJson,
  useDebounced,
  type Customer,
  type Duplicate,
  type Item,
  type Preview,
  type Product,
  type ServerItem,
  type Totals,
} from "@/components/staff/quoteEditorShared";

type DiscountForm = { type: "percent" | "value"; value: string };

function highlight(text: string, query: string) {
  const word = query.trim().split(/\s+/)[0];
  if (!word) return text;
  const index = text.toLowerCase().indexOf(word.toLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + word.length)}</mark>{text.slice(index + word.length)}</>;
}

/* ------------------------------------------------------------------ cliente */

/** startCreating: abre direto no cadastro (botão "Novo cliente" da página Clientes). */
export function CustomerPicker({ onPick, startCreating = false, onCancel }: { onPick: (customer: Customer) => void; startCreating?: boolean; onCancel?: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(startCreating);
  const [form, setForm] = useState({ name: "", company: "", phone: "", email: "", document: "", address: EMPTY_ADDRESS });
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounced = useDebounced(query.trim(), 200);

  useEffect(() => {
    let active = true;
    const run = debounced
      ? fetch(`/api/backoffice/orcamento-editor/clientes?q=${encodeURIComponent(debounced)}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<{ customers?: Customer[] }>)
        .then((payload) => payload.customers ?? [])
        .catch(() => [] as Customer[])
      : Promise.resolve([] as Customer[]);
    run.then((list) => active && setResults(list));
    return () => {
      active = false;
    };
  }, [debounced]);

  function startCreate() {
    const digits = query.replace(/\D/g, "");
    setForm({ name: digits.length >= 8 ? "" : query.trim(), company: "", phone: digits.length >= 8 ? query.trim() : "", email: "", document: "", address: EMPTY_ADDRESS });
    setDuplicates([]);
    setError(null);
    setCreating(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setDuplicates([]);
    const { ok, status, data } = await postJson<{ customer?: Customer; matches?: Duplicate[]; message?: string }>("/api/backoffice/orcamento-editor/clientes", form);
    setSaving(false);
    if (ok && data.customer) return onPick(data.customer);
    if (status === 409 && data.matches) return setDuplicates(data.matches);
    setError(data.message ?? "Não foi possível cadastrar.");
  }

  if (creating) {
    const set = (key: Exclude<keyof typeof form, "address">) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
    return (
      <div className="qe-newclient">
        <div className="qe-grid-3">
          <label className="qe-field"><span>Nome</span><input autoFocus onChange={set("name")} value={form.name} /></label>
          <label className="qe-field"><span>Empresa (opcional)</span><input onChange={set("company")} value={form.company} /></label>
          <label className="qe-field"><span>WhatsApp</span><input inputMode="tel" onChange={set("phone")} placeholder="(11) 90000-0000" value={form.phone} /></label>
          <label className="qe-field"><span>E-mail (opcional)</span><input inputMode="email" onChange={set("email")} value={form.email} /></label>
          <label className="qe-field"><span>CPF/CNPJ (opcional)</span><input onChange={set("document")} value={form.document} /></label>
          <AddressFields onChange={(update) => setForm((current) => ({ ...current, address: update(current.address) }))} value={form.address} />
        </div>
        {error ? <p className="qe-error">{error}</p> : null}
        {duplicates.length ? (
          <div className="qe-dup" role="alert">
            <b>Este cliente já está cadastrado.</b> Use o cadastro existente para não duplicar.
            {duplicates.map((match) => (
              <div className="qe-client qe-client-sm" key={match.ref}>
                <div className="qe-initials">{initials(match.name)}</div>
                <div>
                  <b>{match.name}{match.company ? ` · ${match.company}` : ""}</b>
                  <small>Mesmo {match.by.join(" e ")} · {match.kind === "conta" ? "conta no site" : `cadastrado por ${match.createdBy ?? "equipe"}`}</small>
                </div>
                <button className="qe-btn qe-btn-secondary" onClick={() => onPick(match)} type="button">Usar este</button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="qe-actions">
          <button className="qe-btn qe-btn-secondary" onClick={() => (onCancel ? onCancel() : setCreating(false))} type="button">{onCancel ? "Cancelar" : "Voltar"}</button>
          <button className="qe-btn qe-btn-primary" disabled={saving} onClick={save} type="button">{saving ? "Salvando…" : "Salvar cliente"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="qe-picker">
      <div className="qe-search">
        <Search aria-hidden="true" size={16} />
        <input aria-label="Buscar cliente" onChange={(event) => setQuery(event.target.value)} placeholder="Nome, empresa, WhatsApp ou CPF/CNPJ" value={query} />
      </div>
      {query.trim() ? (
        <div className="qe-menu" role="listbox">
          {results.map((customer) => (
            <button className="qe-opt" key={customer.ref} onClick={() => onPick(customer)} role="option" type="button" aria-selected="false">
              <span className="qe-initials">{initials(customer.name)}</span>
              <span>
                <b>{highlight(customer.name, query)}{customer.company ? <> · {highlight(customer.company, query)}</> : null}</b>
                <small>{[customer.document, customer.phone, customer.email].filter(Boolean).join(" · ") || "Sem contato"}</small>
              </span>
            </button>
          ))}
          {!results.length && debounced === query.trim() ? <p className="qe-menu-empty">Nenhum cliente encontrado.</p> : null}
          <button className="qe-opt qe-opt-new" onClick={startCreate} type="button"><span className="qe-plus">+</span>Cadastrar novo cliente</button>
        </div>
      ) : (
        <p className="qe-hint">Digite para buscar.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

export function QuoteEditor({ quoteId, orderId, mode = "quote" }: { quoteId?: string; orderId?: string; mode?: "quote" | "order" }) {
  const router = useRouter();
  /** Editando pedido já criado: pagamento e entrega ficam na página do pedido. */
  const editingOrder = Boolean(orderId);
  const isOrder = mode === "order" || editingOrder;
  const docId = quoteId ?? orderId;
  const [paidOnServer, setPaidOnServer] = useState(0);
  const [payment, setPayment] = useState<PaymentForm>(() => ({ ...EMPTY_PAYMENT_FORM, paid: "", paidAt: todayInBrazil() }));
  const [paymentChoice, setPaymentChoice] = useState<ClosingChoice>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [fixedCustomer, setFixedCustomer] = useState<{ name: string; company: string; phone: string; notes: string } | null>(null);
  const [fixedCustomerRef, setFixedCustomerRef] = useState<string | null>(null);
  const [fixedProfessional, setFixedProfessional] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(false);
  // Cliente profissional (cadastro pelo convite): fotos pela tabela profissional.
  const professional = fixedCustomer ? fixedProfessional : Boolean(customer?.professional);
  /** Orçamento já salvo sem cliente: dá para escolher agora. */
  const [needsCustomer, setNeedsCustomer] = useState(false);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [notes, setNotes] = useState("");
  /** Entrega prevista do orçamento (vira a sugestão ao fechar). */
  const [delivery, setDelivery] = useState({ date: "", time: "" });
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [discount, setDiscount] = useState<DiscountForm>({ type: "percent", value: "" });
  const [discountError, setDiscountError] = useState<string | null>(null);
  /** Frete cobrado do cliente (R$, vazio = a combinar). */
  const [freight, setFreight] = useState("");
  const [modal, setModal] = useState<ModalStart | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Configuração de foto aberta (nova ou editando um item de foto da lista). */
  const [photoModal, setPhotoModal] = useState<{ start: PhotoChoice; item?: Extract<Item, { source: "avulso" }> } | null>(null);
  /** Produtos marcados na busca que ainda vão ser configurados (o atual está em `modal`). */
  const [queue, setQueue] = useState<{ rest: PickedProduct[]; total: number } | null>(null);
  /** Busca e filtros da janela "Escolha o produto" continuam ao reabrir (vários produtos seguidos). */
  const [pickerState, setPickerState] = useState<PickerState>(EMPTY_PICKER);
  const [loading, setLoading] = useState(Boolean(docId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Orçamento acabou de ser criado: mostra a prévia do HTML antes de voltar ao quadro. */
  // Depois de salvar: prévia do documento do cliente na tela.
  const [created, setCreated] = useState<{ kind: "quote" | "order"; id: string; verb: "criado" | "salvo"; tab: string } | null>(null);
  const [state, setState] = useState<{ updatedAt: string; status: string; createdBy: string | null } | null>(null);
  const idempotencyKey = useRef(`painel-${newId()}`);
  const editable = !state || (editingOrder ? ORDER_EDITABLE : ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"]).includes(state.status);

  // Abrir orçamento ou pedido existente.
  useEffect(() => {
    if (!docId) return;
    let active = true;
    fetch(editingOrder ? `/api/backoffice/pedido-editor/${docId}` : `/api/backoffice/orcamento-editor/${docId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(editingOrder
          ? payload.error === "ORDER_NOT_FOUND" ? "Pedido não encontrado." : "Não foi possível abrir o pedido."
          : payload.error === "QUOTE_NOT_FOUND" ? "Orçamento não encontrado." : "Não foi possível abrir o orçamento.");
        if (!active) return;
        setItems((payload.items as ServerItem[]).map(fromServerItem));
        setProducts(payload.products ?? {});
        setNotes(payload.internalNotes ?? "");
        setDelivery({ date: payload.deliveryDate ?? "", time: payload.deliveryTime ?? "" });
        if (payload.discount) {
          setDiscount({ type: payload.discount.type, value: payload.discount.value ? String(payload.discount.value).replace(".", ",") : "" });
          setFreight(payload.discount.freight ? String(payload.discount.freight).replace(".", ",") : "");
        }
        if (payload.hasCustomer === false) setNeedsCustomer(true);
        else { setFixedCustomer(payload.customer); setFixedCustomerRef(payload.customerRef ?? null); setFixedProfessional(Boolean(payload.customerProfessional)); }
        setState({ updatedAt: payload.updatedAt, status: payload.status, createdBy: payload.createdBy });
        if (editingOrder) setPaidOnServer(payload.paidCents ?? 0);
      })
      .catch((error: unknown) => active && setLoadError(error instanceof Error ? error.message : "Erro inesperado."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [docId, editingOrder]);

  // Prévia do preço no servidor a cada mudança dos itens ou do desconto.
  const discountBody = discount.value.trim() || freight.trim() ? { ...discount, freight } : null;
  const itemsKey = useDebounced(JSON.stringify({ items, discount: discountBody }), 300);
  useEffect(() => {
    const { items: list, discount: sentDiscount } = JSON.parse(itemsKey) as { items: Item[]; discount: DiscountForm | null };
    let active = true;
    const run = list.length
      ? postJson<{ preview?: Preview[]; totals?: Totals; discountError?: string }>("/api/backoffice/orcamento-editor/previa", { items: list, discount: sentDiscount })
      : Promise.resolve({ ok: true, status: 200, data: { preview: [] as Preview[], totals: EMPTY_TOTALS, discountError: undefined } });
    run.then(({ data }) => {
      if (!active || !data.preview || !data.totals) return;
      setPreview(Object.fromEntries(data.preview.map((entry) => [entry.id, entry])));
      setTotals(data.totals);
      setDiscountError(data.discountError ?? null);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [itemsKey]);

  /** Abre a configuração do próximo produto da fila (ou fecha, se acabou). */
  const openNext = useCallback((pending: PickedProduct[], total: number) => {
    const [next, ...rest] = pending;
    setQueue(next ? { rest, total } : null);
    setModal(next ? { kind: "catalogo", product: next.product, variant: next.variant } : null);
  }, []);

  /** Escolheu produtos na janela de busca: configura um por vez, na ordem do clique (só entram na lista ao clicar em Adicionar). */
  const chooseProducts = useCallback((picked: PickedProduct[]) => {
    if (!picked.length) return;
    setProducts((map) => ({ ...map, ...Object.fromEntries(picked.map(({ product }) => [product.publicId, product])) }));
    setPickerOpen(false);
    openNext(picked, picked.length);
  }, [openNext]);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  /** Aba Fotos: abre a configuração já no tipo escolhido (revelação começa no 10 × 15). */
  const choosePhoto = useCallback((group: SizeGroup) => {
    setPickerOpen(false);
    setPhotoModal({ start: { sizeId: group === "revelacao" ? "10x15" : SIZES.find((size) => size.group === group)!.id } });
  }, []);
  const closePhotoModal = useCallback(() => setPhotoModal(null), []);

  function editItem(item: Item) {
    if (item.source === "avulso") {
      const photo = photoFromName(item.name);
      return photo ? setPhotoModal({ start: photo, item }) : setModal({ kind: "avulso", item });
    }
    const product = products[item.publicId];
    if (product) setModal({ kind: "catalogo", product, item });
  }

  /** Cancelar/Esc encerra a fila; o que já foi adicionado fica. */
  const closeModal = useCallback(() => {
    setModal(null);
    setQueue(null);
  }, []);
  const saveFromModal = useCallback((item: Item) => {
    setItems((list) => (list.some((entry) => entry.id === item.id) ? list.map((entry) => (entry.id === item.id ? item : entry)) : [...list, item]));
    if (queue) openNext(queue.rest, queue.total);
    else setModal(null);
  }, [queue, openNext]);
  const skipQueued = useCallback(() => queue && openNext(queue.rest, queue.total), [queue, openNext]);

  async function submit() {
    if (isOrder && !editingOrder && (!customer || !payment.paid.trim() || paymentFormError(payment, Math.round(totals.total * 100)))) return;
    const pickup = paymentChoice === "pickup";
    const quoteDelivery = isOrder ? {} : { deliveryDate: delivery.date || null, deliveryTime: delivery.date && delivery.time ? delivery.time : null };
    setSaving(true);
    setSaveError(null);
    const body = docId
      ? { updatedAt: state?.updatedAt, internalNotes: notes, items, discount: discountBody, ...quoteDelivery, ...(needsCustomer && customer ? { customerRef: customer.ref } : {}) }
      : { customerRef: customer?.ref, idempotencyKey: idempotencyKey.current, internalNotes: notes, items, discount: discountBody, ...quoteDelivery,
        ...(isOrder ? {
          // Mesmas regras de "Fechar Orçamento": pagar na retirada = sem recebimento agora, retirada na loja.
          paymentMethod: pickup ? "pix" : payment.paymentMethod, paymentOnPickup: pickup,
          payment: { amountCents: paidCents(payment.paid), paidAt: (paidCents(payment.paid) ?? 0) > 0 ? payment.paidAt : null },
          installments: !pickup && payment.paymentMethod === "cartao_credito" ? Number(payment.installments) : null,
          dueDate: !pickup && ["boleto", "faturamento_empresa"].includes(payment.paymentMethod) ? payment.dueDate || null : null,
          deliveryDate: payment.deliveryDate || null, deliveryMode: pickup ? "retirada" : payment.deliveryMode,
          deliveryTime: payment.deliveryDate && payment.deliveryTime ? payment.deliveryTime : null,
          deliveryAddress: !pickup && payment.deliveryMode === "entrega" ? payment.deliveryAddress : null,
        } : {}),
      };
    const { ok, status, data } = await postJson<{ id?: string; orderStatus?: string; message?: string; preview?: Preview[] }>(
      editingOrder ? `/api/backoffice/pedido-editor/${orderId}` : isOrder ? "/api/backoffice/pedido-editor" : quoteId ? `/api/backoffice/orcamento-editor/${quoteId}` : "/api/backoffice/orcamento-editor",
      body,
      docId ? "PUT" : "POST",
    );
    setSaving(false);
    if (ok) {
      const tab = isOrder && data.orderStatus !== "aguardando_pagamento" ? "pedidos" : "orcamentos";
      const id = data.id ?? docId;
      if (id) {
        setCreated({ kind: isOrder ? "order" : "quote", id, verb: docId ? "salvo" : "criado", tab });
        return;
      }
      router.push(`/equipe?aba=${tab}`);
      router.refresh();
      return;
    }
    if (status === 422 && data.preview) {
      setPreview(Object.fromEntries(data.preview.map((entry) => [entry.id, entry])));
      setSaveError("Corrija os itens marcados.");
      return;
    }
    setSaveError(data.message ?? (status === 409 ? "Outra pessoa alterou este orçamento. Abra de novo." : "Não foi possível salvar."));
  }

  const productLabel = (item: Item) => (item.source === "catalogo" ? products[item.publicId]?.name ?? "Produto" : item.name);
  // Cliente é opcional: sem ele o orçamento fica "Cliente a definir".
  // Valor ainda não escolhido não é erro: o botão só fica bloqueado até escolher.
  const paymentError = isOrder && !editingOrder && payment.paid.trim() ? paymentFormError(payment, Math.round(totals.total * 100)) : null;
  const receivedCents = editingOrder ? paidOnServer : paidCents(payment.paid) ?? 0;
  // Pedido editado não pode ficar com total abaixo do que já foi recebido.
  const belowPaid = editingOrder && Math.round(totals.total * 100) < paidOnServer;
  const canSubmit = editable && items.length > 0 && totals.pending === 0 && !discountError && !saving && !belowPaid
    && (!isOrder || editingOrder || (customer && !changingCustomer && payment.paid.trim() && !paymentError));
  const marginPercent = totals.total > 0 ? Math.round((totals.margin / totals.total) * 100) : 0;

  if (loading) return <main className="qe-page"><p className="qe-hint">{editingOrder ? "Carregando pedido…" : "Carregando orçamento…"}</p></main>;
  if (loadError) return <main className="qe-page"><p className="qe-error">{loadError}</p><Link className="qe-btn-text" href={editingOrder ? "/equipe?aba=pedidos" : "/equipe?aba=orcamentos"}>{editingOrder ? "Voltar aos pedidos" : "Voltar aos orçamentos"}</Link></main>;

  return (
    <main className="qe-page">
      <div className="qe-crumb"><Link href={isOrder ? "/equipe?aba=pedidos" : "/equipe?aba=orcamentos"}>{isOrder ? "Pedidos" : "Orçamentos"}</Link> / {docId ? <><Link href={editingOrder ? `/equipe/pedidos/${docId}` : `/equipe/orcamentos/${docId}/consulta`}>{editingOrder ? orderCode(docId) : quoteCode(docId)}</Link> / Editar</> : "Novo"}</div>
      <h1 className="qe-title">{editingOrder ? `Editar pedido ${orderCode(orderId!)}` : isOrder ? "Novo pedido" : quoteId ? `Editar orçamento ${quoteCode(quoteId)}` : "Novo orçamento"}</h1>
      {!editable ? <p className="qe-error">{editingOrder ? "Este pedido já foi concluído ou cancelado e não pode mais ser alterado." : "Este orçamento já foi fechado e não pode mais ser alterado."}</p> : null}
      {editingOrder && editable ? <p className="qe-hint">Pagamento e entrega ficam na página do pedido. Aqui você altera itens, desconto e observação.</p> : null}

      <div className="qe-layout">
        <div>
          <section className="qe-card">
            <h2>Cliente{isOrder && !editingOrder ? <span className="qe-optional">obrigatório</span> : !fixedCustomer ? <span className="qe-optional">opcional</span> : null}</h2>
            {editingCustomer && (fixedCustomerRef || customer) ? (
              <CustomerEdit
                customerRef={fixedCustomerRef ?? customer!.ref}
                onCancel={() => setEditingCustomer(false)}
                onSaved={(saved) => {
                  setEditingCustomer(false);
                  if (fixedCustomer) setFixedCustomer({ ...fixedCustomer, name: saved.name, company: saved.company, phone: saved.phone });
                  else setCustomer(saved);
                }}
              />
            ) : fixedCustomer ? (
              <div className="qe-client">
                <div className="qe-initials">{initials(fixedCustomer.name)}</div>
                <div>
                  <b>{fixedCustomer.name}{fixedCustomer.company ? ` · ${fixedCustomer.company}` : ""}</b>
                  <small>{fixedCustomer.phone || "Sem WhatsApp"}{state?.createdBy ? ` · feito por ${state.createdBy}` : " · pedido pelo site"}</small>
                  {fixedCustomer.notes ? <small>Observação do cliente: {fixedCustomer.notes}</small> : null}
                </div>
                {fixedCustomerRef ? <button className="qe-btn-text" onClick={() => setEditingCustomer(true)} type="button">Editar</button> : null}
              </div>
            ) : customer && !changingCustomer ? (
              <div className="qe-client">
                <div className="qe-initials">{initials(customer.name)}</div>
                <div>
                  <b>{customer.name}{customer.company ? ` · ${customer.company}` : ""}</b>
                  <small>{[customer.document, customer.phone, customer.email].filter(Boolean).join(" · ")}{customer.kind === "conta" ? " · conta no site" : ""}</small>
                </div>
                <button className="qe-btn-text" onClick={() => setEditingCustomer(true)} type="button">Editar</button>
                <button className="qe-btn-text" onClick={() => setChangingCustomer(true)} type="button">Trocar</button>
              </div>
            ) : (
              <CustomerPicker onPick={(picked) => { setCustomer(picked); setChangingCustomer(false); }} />
            )}
            {customer && !changingCustomer && !fixedCustomer && customer.alsoUsedBy?.length ? (
              <p className="qe-note-warn">
                {customer.alsoUsedBy.map((other) => `${other.by.join(" e ")} também está no cadastro de ${other.name}`).join("; ")}. Confira se é a mesma pessoa.
              </p>
            ) : null}
          </section>

          <section className="qe-card">
            <h2>Produtos</h2>
            {items.length ? (
              <div className="qe-cols qe-cols-list"><span>Produto</span><span>Cor</span><span className="qe-r">Qtd.</span><span className="qe-r">Unitário</span><span className="qe-r">Total</span><span /></div>
            ) : <p className="qe-hint">Nenhum produto ainda. Busque abaixo e configure cor, quantidade e gravação.</p>}

            {items.map((item) => {
              const product = item.source === "catalogo" ? products[item.publicId] : undefined;
              const variant = product?.variants.find((entry) => entry.label === (item.source === "catalogo" ? item.variant : ""));
              const result = preview[item.id];
              const ok = result?.ok ? result : null;
              const photo = item.source === "avulso" ? photoFromName(item.name) : null;
              // Foto sempre grava o preço; só é "especial" quando difere da tabela do site.
              const specialPhotoPrice = photo && item.priceOverride ? Math.abs(parseNumber(item.priceOverride) - photoTablePrice(photo.sizeId, item.quantity, professional)) > 0.004 : false;
              return (
                <div className="qe-item" key={item.id}>
                  <div className="qe-line qe-line-list">
                    <div className="qe-prod">
                      {product ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <span className="qe-thumb qe-thumb-md"><img alt="" src={variant?.imageUrl || product.imageUrl} /></span>
                      ) : photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <span className="qe-thumb qe-thumb-md"><img alt="" src={PHOTO_PRODUCT_IMAGE[sizeById(photo.sizeId).group]} /></span>
                      ) : item.source === "avulso" && item.mockup ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <span className="qe-thumb qe-thumb-md"><img alt="" src={`/api/backoffice/mockups/${item.mockup}`} /></span>
                      ) : <span className="qe-thumb qe-thumb-md qe-thumb-blank">avulso</span>}
                      <div>
                        <b>{productLabel(item)}</b>
                        {/* Custo fica na configuração do item e no resumo; aqui só o que identifica o item. */}
                        <small>{product ? `${product.fareCode} · ${product.supplierCode}` : photo ? (photo.paper ? `Papel ${paperLabel(photo.paper)}` : "Papel: o cliente escolhe no link") : "Fora do catálogo"}</small>
                        {photo ? null : item.gravacoes.length ? (
                          <ul className="qe-glist">
                            {item.gravacoes.map((gravacao, index) => {
                              const calc = ok?.gravacoes[index];
                              return (
                                <li key={index}>
                                  {engravingSummary(calc, gravacao)}
                                  {calc ? <span className="qe-muted"> · {brl(calc.custoUnitario)}/un.</span> : null}
                                  {gravacao.custoOverride ? <span className="qe-hand"> digitado</span> : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : <small className="qe-faint">Sem gravação</small>}
                      </div>
                    </div>
                    <span className="qe-cell">{item.source === "catalogo" ? item.variant : "—"}</span>
                    <span className="qe-r">{item.quantity.toLocaleString("pt-BR")}</span>
                    <span className="qe-r qe-unit">
                      {ok ? brl(ok.unitPrice) : "—"}
                      {photo ? (specialPhotoPrice ? <small className="qe-hand qe-block">preço especial</small> : null) : item.priceOverride ? <small className="qe-hand qe-block">digitado</small> : null}
                    </span>
                    <span className="qe-r">{ok ? brl(ok.total) : "—"}</span>
                    {editable ? (
                      <span className="qe-row-acts">
                        <button aria-label={`Editar ${productLabel(item)}`} className="qe-rm qe-edit" onClick={() => editItem(item)} title="Editar" type="button"><PencilLine size={15} /></button>
                        <button aria-label={`Remover ${productLabel(item)}`} className="qe-rm" onClick={() => setItems((list) => list.filter((entry) => entry.id !== item.id))} title="Remover" type="button"><X size={15} /></button>
                      </span>
                    ) : <span />}
                  </div>
                  {result && !result.ok ? <p className="qe-error qe-indent-md">{result.error}</p> : null}
                  {ok?.stockWarning ? <p className="qe-warn qe-indent-md">{ok.stockWarning}</p> : null}
                </div>
              );
            })}

            {editable ? (
              <div className="qe-addbar">
                <button className="qe-btn qe-btn-primary qe-addprod" onClick={() => setPickerOpen(true)} type="button">
                  <Search aria-hidden="true" size={16} /> Adicionar produto
                </button>
                <button className="qe-btn qe-btn-secondary" onClick={() => setModal({ kind: "avulso" })} type="button">Item fora do catálogo</button>
              </div>
            ) : null}
          </section>

          {isOrder && !editingOrder ? <DirectOrderFields choice={paymentChoice} onChange={setPayment} onChoice={setPaymentChoice} total={totals.total} value={payment} /> : null}
          {/* Link para o cliente mandar as fotos: já no orçamento (as fotos viram itens com o preço da tabela). */}
          {!isOrder || editingOrder ? (
            <section className="qe-card">
              <h2>Fotos do cliente</h2>
              {docId && editable ? <p className="qe-fhint">O link para o cliente enviar as fotos fica na <Link href={editingOrder ? `/equipe/pedidos/${docId}` : `/equipe/orcamentos/${docId}/consulta`}>página {editingOrder ? "do pedido" : "do orçamento"}</Link>, junto da proposta.</p>
                : docId ? <p className="qe-fhint">Este documento não aceita mais fotos.</p>
                : <p className="qe-fhint">Salve o orçamento para gerar o link em que o cliente envia as fotos.</p>}
            </section>
          ) : null}
          <section className="qe-card">
            <h2>Observações internas</h2>
            <textarea disabled={!editable} onChange={(event) => setNotes(event.target.value)} placeholder="Só a equipe vê." value={notes} />
          </section>
        </div>

        <aside className="qe-card qe-aside">
          <h2>Resumo</h2>
          {items.map((item) => {
            const result = preview[item.id];
            return (
              <div className="qe-sum-row" key={item.id}>
                <span>{productLabel(item)} · {item.quantity.toLocaleString("pt-BR")} {item.source === "avulso" && photoFromName(item.name) ? (item.quantity === 1 ? "cópia" : "cópias") : "un."}</span>
                <span>{result?.ok ? brl(result.total) : "—"}</span>
              </div>
            );
          })}
          <div className="qe-discount">
            <span className="qe-discount-label" id="qe-discount-label">Desconto no total</span>
            <div className="qe-discount-row">
              <div aria-labelledby="qe-discount-label" className="qe-seg" role="radiogroup">
                {([["percent", "%"], ["value", "R$"]] as const).map(([type, label]) => (
                  <button
                    aria-checked={discount.type === type}
                    className={discount.type === type ? "on" : undefined}
                    disabled={!editable}
                    key={type}
                    onClick={() => setDiscount({ type, value: "" })}
                    role="radio"
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                aria-label={discount.type === "percent" ? "Desconto em porcentagem" : "Desconto em reais"}
                disabled={!editable}
                inputMode="decimal"
                onChange={(event) => setDiscount({ ...discount, value: event.target.value.replace(/[^\d.,]/g, "") })}
                placeholder={discount.type === "percent" ? "0" : "0,00"}
                value={discount.value}
              />
            </div>
            {discountError ? <p className="qe-error">{discountError}</p> : null}
          </div>

          <div className="qe-discount">
            <span className="qe-discount-label" id="qe-freight-label">Frete</span>
            <div className="qe-discount-row">
              <input
                aria-labelledby="qe-freight-label"
                disabled={!editable}
                inputMode="decimal"
                onChange={(event) => setFreight(event.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="A combinar"
                value={freight}
              />
            </div>
          </div>

          {totals.discount > 0 || totals.freight > 0 ? <div className="qe-sum-row"><span>Subtotal</span><span>{brl(totals.subtotal)}</span></div> : null}
          {totals.discount > 0 ? (
            <div className="qe-sum-row qe-sum-discount">
              <span>Desconto{discount.type === "percent" ? ` (${discount.value.replace(".", ",")}%)` : ""}</span>
              <span>− {brl(totals.discount)}</span>
            </div>
          ) : null}
          {totals.freight > 0 ? <div className="qe-sum-row"><span>Frete</span><span>{brl(totals.freight)}</span></div> : null}
          <div className="qe-sum-total"><span>Total</span><b>{brl(totals.total)}</b></div>
          {!isOrder ? (
            <div className="qe-discount qe-delivery">
              <span className="qe-discount-label">Entrega prevista</span>
              <div className="qe-discount-row">
                <input aria-label="Data de entrega" disabled={!editable} onChange={(event) => setDelivery({ ...delivery, date: event.target.value })} type="date" value={delivery.date} />
                <input aria-label="Horário de entrega (opcional)" disabled={!editable || !delivery.date} onChange={(event) => setDelivery({ ...delivery, time: event.target.value })} type="time" value={delivery.time} />
              </div>
            </div>
          ) : null}
          {isOrder ? <>
            <div className="qe-sum-row"><span>Já pago</span><span>{brl(receivedCents / 100)}</span></div>
            <div className="qe-sum-row"><span>Falta pagar</span><span className="qe-payment-debt">{brl(Math.max(0, Math.round(totals.total * 100) - receivedCents) / 100)}</span></div>
            {editingOrder ? null : <div className="qe-sum-row"><span>Entrega prevista</span><span>{deliveryLabel(payment.deliveryDate, payment.deliveryTime)}</span></div>}
          </> : null}
          {totals.pending ? <p className="qe-error">{totals.pending === 1 ? "1 item precisa de correção." : `${totals.pending} itens precisam de correção.`}</p> : null}

          <div className="qe-internal">
            <p>Só a equipe vê</p>
            <div className="qe-sum-row"><span>Custo estimado</span><span>{brl(totals.cost)}</span></div>
            <div className="qe-sum-row"><span>Margem</span><span className="qe-margin">{brl(totals.margin)} · {marginPercent}%</span></div>
          </div>

          {!isOrder ? <p className="qe-terms">Validade de 7 dias · produção em 7 dias após a aprovação da arte e o sinal de 50%.</p> : null}
          {paymentError ? <p className="qe-error">{paymentError}</p> : null}
          {belowPaid ? <p className="qe-error">O total não pode ficar menor que o já recebido ({brl(paidOnServer / 100)}).</p> : null}
          {saveError ? <p className="qe-error">{saveError}</p> : null}
          {editable ? (
            <button className="qe-btn qe-btn-primary qe-submit" disabled={!canSubmit} onClick={submit} type="button">
              {saving ? "Salvando…" : docId ? "Salvar alterações" : isOrder ? "Criar pedido" : "Criar orçamento"}
            </button>
          ) : null}
          {isOrder && !editingOrder && customer && !payment.paid.trim() ? <p className="qe-hint qe-center">Escolha quanto o cliente pagou para criar o pedido.</p> : null}
          {!fixedCustomer && !customer ? <p className="qe-hint qe-center">{isOrder ? "Selecione o cliente para criar o pedido." : "Sem cliente, fica como “Cliente a definir”. Dá para escolher depois."}</p> : null}
        </aside>
      </div>

      {pickerOpen ? <ProductPickerModal initial={pickerState} onClose={closePicker} onPick={chooseProducts} onPickPhoto={choosePhoto} onStateChange={setPickerState} /> : null}
      {photoModal ? (
        <PhotoConfigModal
          pro={professional}
          item={photoModal.item}
          key={photoModal.item?.id ?? "nova-foto"}
          onClose={closePhotoModal}
          onSave={(item) => {
            setItems((list) => (list.some((entry) => entry.id === item.id) ? list.map((entry) => (entry.id === item.id ? item : entry)) : [...list, item]));
            setPhotoModal(null);
          }}
          start={photoModal.start}
        />
      ) : null}
      {created ? (
        <QuoteCreatedDialog
          code={created.kind === "order" ? orderCode(created.id) : quoteCode(created.id)}
          kind={created.kind}
          onClose={() => {
            router.push(`/equipe?aba=${created.tab}&novo=${encodeURIComponent(created.id)}`);
            router.refresh();
          }}
          quoteId={created.id}
          verb={created.verb}
        />
      ) : null}
      {modal ? <ProductConfigModal key={modal.item?.id ?? (modal.kind === "catalogo" ? modal.product.publicId : "avulso")} onClose={closeModal} onSave={saveFromModal} queue={queue && queue.total > 1 ? { position: queue.total - queue.rest.length, total: queue.total, onSkip: skipQueued } : undefined} start={modal} /> : null}
    </main>
  );
}
