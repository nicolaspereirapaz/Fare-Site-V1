"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PencilLine, Search, X } from "lucide-react";
import { ProductConfigModal, type ModalStart } from "@/components/staff/ProductConfigModal";
import { EMPTY_PICKER, ProductPickerModal, type PickedProduct, type PickerState } from "@/components/staff/ProductPickerModal";
import { QuoteCreatedDialog } from "@/components/staff/QuoteCreatedDialog";
import { quoteCode } from "@/lib/quotes/quoteCode";
import { DirectOrderFields } from "@/components/staff/DirectOrderFields";
import { dateLabel, EMPTY_PAYMENT_FORM, paidCents, paymentFormError, todayInBrazil, type PaymentForm } from "@/components/staff/paymentFieldsShared";
import {
  brl,
  EMPTY_TOTALS,
  engravingSummary,
  fromServerItem,
  initials,
  newId,
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

function CustomerPicker({ onPick }: { onPick: (customer: Customer) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", phone: "", email: "", document: "" });
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
    setForm({ name: digits.length >= 8 ? "" : query.trim(), company: "", phone: digits.length >= 8 ? query.trim() : "", email: "", document: "" });
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
    const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
    return (
      <div className="qe-newclient">
        <div className="qe-grid-3">
          <label className="qe-field"><span>Nome</span><input autoFocus onChange={set("name")} value={form.name} /></label>
          <label className="qe-field"><span>Empresa (opcional)</span><input onChange={set("company")} value={form.company} /></label>
          <label className="qe-field"><span>WhatsApp</span><input inputMode="tel" onChange={set("phone")} placeholder="(11) 90000-0000" value={form.phone} /></label>
          <label className="qe-field"><span>E-mail (opcional)</span><input inputMode="email" onChange={set("email")} value={form.email} /></label>
          <label className="qe-field"><span>CPF/CNPJ (opcional)</span><input onChange={set("document")} value={form.document} /></label>
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
          <button className="qe-btn qe-btn-secondary" onClick={() => setCreating(false)} type="button">Voltar</button>
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

export function QuoteEditor({ quoteId, mode = "quote" }: { quoteId?: string; mode?: "quote" | "order" }) {
  const router = useRouter();
  const isOrder = mode === "order";
  const [payment, setPayment] = useState<PaymentForm>(() => ({ ...EMPTY_PAYMENT_FORM, paidAt: todayInBrazil() }));
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [fixedCustomer, setFixedCustomer] = useState<{ name: string; company: string; phone: string; notes: string } | null>(null);
  /** Orçamento já salvo sem cliente: dá para escolher agora. */
  const [needsCustomer, setNeedsCustomer] = useState(false);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [discount, setDiscount] = useState<DiscountForm>({ type: "percent", value: "" });
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalStart | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Produtos marcados na busca que ainda vão ser configurados (o atual está em `modal`). */
  const [queue, setQueue] = useState<{ rest: PickedProduct[]; total: number } | null>(null);
  /** Busca e filtros da janela "Escolha o produto" continuam ao reabrir (vários produtos seguidos). */
  const [pickerState, setPickerState] = useState<PickerState>(EMPTY_PICKER);
  const [loading, setLoading] = useState(Boolean(quoteId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Orçamento acabou de ser criado: mostra a prévia do PDF antes de voltar ao quadro. */
  const [created, setCreated] = useState<string | null>(null);
  const [state, setState] = useState<{ updatedAt: string; status: string; createdBy: string | null } | null>(null);
  const idempotencyKey = useRef(`painel-${newId()}`);
  const editable = !state || ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"].includes(state.status);

  // Abrir orçamento existente.
  useEffect(() => {
    if (!quoteId) return;
    let active = true;
    fetch(`/api/backoffice/orcamento-editor/${quoteId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error === "QUOTE_NOT_FOUND" ? "Orçamento não encontrado." : "Não foi possível abrir o orçamento.");
        if (!active) return;
        setItems((payload.items as ServerItem[]).map(fromServerItem));
        setProducts(payload.products ?? {});
        setNotes(payload.internalNotes ?? "");
        if (payload.discount) setDiscount({ type: payload.discount.type, value: String(payload.discount.value).replace(".", ",") });
        if (payload.hasCustomer === false) setNeedsCustomer(true);
        else setFixedCustomer(payload.customer);
        setState({ updatedAt: payload.updatedAt, status: payload.status, createdBy: payload.createdBy });
      })
      .catch((error: unknown) => active && setLoadError(error instanceof Error ? error.message : "Erro inesperado."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [quoteId]);

  // Prévia do preço no servidor a cada mudança dos itens ou do desconto.
  const discountBody = discount.value.trim() ? discount : null;
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

  function editItem(item: Item) {
    if (item.source === "avulso") return setModal({ kind: "avulso", item });
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
    if (isOrder && (!customer || paymentFormError(payment, Math.round(totals.total * 100)))) return;
    setSaving(true);
    setSaveError(null);
    const body = quoteId
      ? { updatedAt: state?.updatedAt, internalNotes: notes, items, discount: discountBody, ...(needsCustomer && customer ? { customerRef: customer.ref } : {}) }
      : { customerRef: customer?.ref, idempotencyKey: idempotencyKey.current, internalNotes: notes, items, discount: discountBody,
        ...(isOrder ? {
          paymentMethod: payment.paymentMethod,
          payment: { amountCents: paidCents(payment.paid), paidAt: (paidCents(payment.paid) ?? 0) > 0 ? payment.paidAt : null },
          installments: payment.paymentMethod === "cartao_credito" ? Number(payment.installments) : null,
          dueDate: ["boleto", "faturamento_empresa"].includes(payment.paymentMethod) ? payment.dueDate || null : null,
          deliveryDate: payment.deliveryDate || null, deliveryMode: payment.deliveryMode,
        } : {}),
      };
    const { ok, status, data } = await postJson<{ id?: string; orderStatus?: string; message?: string; preview?: Preview[] }>(
      isOrder ? "/api/backoffice/pedido-editor" : quoteId ? `/api/backoffice/orcamento-editor/${quoteId}` : "/api/backoffice/orcamento-editor",
      body,
      quoteId ? "PUT" : "POST",
    );
    setSaving(false);
    if (ok) {
      if (isOrder) {
        router.push(data.orderStatus === "aguardando_pagamento" ? "/equipe?aba=orcamentos" : "/equipe?aba=pedidos");
        router.refresh();
        return;
      }
      if (!quoteId && data.id) {
        setCreated(data.id);
        return;
      }
      router.push("/equipe?aba=orcamentos");
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
  const paymentError = isOrder ? paymentFormError(payment, Math.round(totals.total * 100)) : null;
  const receivedCents = paidCents(payment.paid) ?? 0;
  const canSubmit = editable && items.length > 0 && totals.pending === 0 && !discountError && !saving && (!isOrder || (customer && !changingCustomer && !paymentError));
  const marginPercent = totals.total > 0 ? Math.round((totals.margin / totals.total) * 100) : 0;

  if (loading) return <main className="qe-page"><p className="qe-hint">Carregando orçamento…</p></main>;
  if (loadError) return <main className="qe-page"><p className="qe-error">{loadError}</p><Link className="qe-btn-text" href="/equipe?aba=orcamentos">Voltar aos orçamentos</Link></main>;

  return (
    <main className="qe-page">
      <div className="qe-crumb"><Link href={isOrder ? "/equipe?aba=pedidos" : "/equipe?aba=orcamentos"}>{isOrder ? "Pedidos" : "Orçamentos"}</Link> / {quoteId ? "Editar" : "Novo"}</div>
      <h1 className="qe-title">{isOrder ? "Novo pedido" : quoteId ? "Editar orçamento" : "Novo orçamento"}</h1>
      {!editable ? <p className="qe-error">Este orçamento já foi fechado e não pode mais ser alterado.</p> : null}

      <div className="qe-layout">
        <div>
          <section className="qe-card">
            <h2>Cliente{isOrder ? <span className="qe-optional">obrigatório</span> : !fixedCustomer ? <span className="qe-optional">opcional</span> : null}</h2>
            {fixedCustomer ? (
              <div className="qe-client">
                <div className="qe-initials">{initials(fixedCustomer.name)}</div>
                <div>
                  <b>{fixedCustomer.name}{fixedCustomer.company ? ` · ${fixedCustomer.company}` : ""}</b>
                  <small>{fixedCustomer.phone || "Sem WhatsApp"}{state?.createdBy ? ` · feito por ${state.createdBy}` : " · pedido pelo site"}</small>
                  {fixedCustomer.notes ? <small>Observação do cliente: {fixedCustomer.notes}</small> : null}
                </div>
              </div>
            ) : customer && !changingCustomer ? (
              <div className="qe-client">
                <div className="qe-initials">{initials(customer.name)}</div>
                <div>
                  <b>{customer.name}{customer.company ? ` · ${customer.company}` : ""}</b>
                  <small>{[customer.document, customer.phone, customer.email].filter(Boolean).join(" · ")}{customer.kind === "conta" ? " · conta no site" : ""}</small>
                </div>
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
              return (
                <div className="qe-item" key={item.id}>
                  <div className="qe-line qe-line-list">
                    <div className="qe-prod">
                      {product ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <span className="qe-thumb qe-thumb-md"><img alt="" src={variant?.imageUrl || product.imageUrl} /></span>
                      ) : <span className="qe-thumb qe-thumb-md qe-thumb-blank">avulso</span>}
                      <div>
                        <b>{productLabel(item)}</b>
                        <small>{product ? `${product.fareCode} · ${product.supplierCode}` : "Fora do catálogo"}</small>
                        <small>
                          {ok ? `Custo ${brl(ok.productCost)}/un.` : ""}
                          {item.costOverride ? <span className="qe-hand"> digitado</span> : null}
                        </small>
                        {item.gravacoes.length ? (
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
                      {item.priceOverride ? <small className="qe-hand qe-block">digitado</small> : null}
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

          {isOrder ? <DirectOrderFields onChange={setPayment} value={payment} /> : null}
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
                <span>{productLabel(item)} · {item.quantity.toLocaleString("pt-BR")} un.</span>
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

          {totals.discount > 0 ? (
            <>
              <div className="qe-sum-row"><span>Subtotal</span><span>{brl(totals.subtotal)}</span></div>
              <div className="qe-sum-row qe-sum-discount">
                <span>Desconto{discount.type === "percent" ? ` (${discount.value.replace(".", ",")}%)` : ""}</span>
                <span>− {brl(totals.discount)}</span>
              </div>
            </>
          ) : null}
          <div className="qe-sum-row"><span>Frete</span><span>A combinar</span></div>
          <div className="qe-sum-total"><span>Total</span><b>{brl(totals.total)}</b></div>
          {isOrder ? <>
            <div className="qe-sum-row"><span>Já pago</span><span>{brl(receivedCents / 100)}</span></div>
            <div className="qe-sum-row"><span>Falta pagar</span><span className="qe-payment-debt">{brl(Math.max(0, Math.round(totals.total * 100) - receivedCents) / 100)}</span></div>
            <div className="qe-sum-row"><span>Entrega prevista</span><span>{dateLabel(payment.deliveryDate)}</span></div>
          </> : null}
          {totals.pending ? <p className="qe-error">{totals.pending === 1 ? "1 item precisa de correção." : `${totals.pending} itens precisam de correção.`}</p> : null}

          <div className="qe-internal">
            <p>Só a equipe vê</p>
            <div className="qe-sum-row"><span>Custo estimado</span><span>{brl(totals.cost)}</span></div>
            <div className="qe-sum-row"><span>Margem</span><span className="qe-margin">{brl(totals.margin)} · {marginPercent}%</span></div>
          </div>

          {!isOrder ? <p className="qe-terms">Validade de 7 dias · produção em 7 dias após a aprovação da arte e o sinal de 50%.</p> : null}
          {paymentError ? <p className="qe-error">{paymentError}</p> : null}
          {saveError ? <p className="qe-error">{saveError}</p> : null}
          {editable ? (
            <button className="qe-btn qe-btn-primary qe-submit" disabled={!canSubmit} onClick={submit} type="button">
              {saving ? "Salvando…" : isOrder ? "Criar pedido" : quoteId ? "Salvar alterações" : "Criar orçamento"}
            </button>
          ) : null}
          {!fixedCustomer && !customer ? <p className="qe-hint qe-center">{isOrder ? "Selecione o cliente para criar o pedido." : "Sem cliente, fica como “Cliente a definir”. Dá para escolher depois."}</p> : null}
        </aside>
      </div>

      {pickerOpen ? <ProductPickerModal initial={pickerState} onClose={closePicker} onPick={chooseProducts} onStateChange={setPickerState} /> : null}
      {created ? (
        <QuoteCreatedDialog
          code={quoteCode(created)}
          onClose={() => {
            router.push(`/equipe?aba=orcamentos&novo=${encodeURIComponent(created)}`);
            router.refresh();
          }}
          quoteId={created}
        />
      ) : null}
      {modal ? <ProductConfigModal key={modal.item?.id ?? (modal.kind === "catalogo" ? modal.product.publicId : "avulso")} onClose={closeModal} onSave={saveFromModal} queue={queue && queue.total > 1 ? { position: queue.total - queue.rest.length, total: queue.total, onSkip: skipQueued } : undefined} start={modal} /> : null}
    </main>
  );
}
