"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { spotChoices } from "@/lib/suppliers/spotOptionPicker";

/* Tipos vindos da API do editor (custo e estoque só para a equipe). */
type Customer = { ref: string; kind: "conta" | "painel"; name: string; company: string; phone: string; email: string; document: string; createdBy?: string; alsoUsedBy?: Array<{ name: string; by: string[] }> };
type Duplicate = Customer & { by: string[] };
type SpotOption = { id: string; tecnica: string; local: string; componente: string; area: string; cores: number; padrao: boolean };
type Product = {
  publicId: string; name: string; category: string; imageUrl: string; fareCode: string; supplierCode: string; supplier: string;
  variants: Array<{ label: string; cost: number; stock: number; imageUrl: string }>;
  spotOptions: SpotOption[];
};
type Tecnica = Record<string, unknown> & { tipo: string };
/* Valores digitados à mão ficam como texto ("1,25"); vazio = calculado pelo sistema. */
type Gravacao = { tecnica: Tecnica; local: string; custoOverride?: string };
type Manual = { costOverride?: string; priceOverride?: string };
type Item =
  | ({ id: string; source: "catalogo"; publicId: string; variant: string; quantity: number; gravacoes: Gravacao[] } & Manual)
  | ({ id: string; source: "avulso"; name: string; cost: number; quantity: number; gravacoes: Gravacao[] } & Manual);
type PreviewGravacao = { descricao: string; local: string; detalhe: string; custoUnitario: number; custoTotal: number; manual?: true };
type Preview =
  | { id: string; ok: true; unitPrice: number; total: number; cost: number; productCost: number; gravacoes: PreviewGravacao[]; stockWarning?: string; manual: { cost: boolean; price: boolean }; suggestedPrice: number }
  | { id: string; ok: false; error: string };
type Totals = { subtotal: number; discount: number; total: number; cost: number; margin: number; pending: number };
type DiscountForm = { type: "percent" | "value"; value: string };
const EMPTY_TOTALS: Totals = { subtotal: 0, discount: 0, total: 0, cost: 0, margin: 0, pending: 0 };
type EngravingForm = { itemId: string; index: number | null; tipo: string; local: string; largura: string; altura: string; spotId: string; nome: string; custo: string };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (value: number) => money.format(value).replace(/\u00a0/g, " ");
const parseNumber = (value: string) => (value.trim() ? Number(value.replace(/\./g, (dot, _o, all: string) => (all.includes(",") ? "" : dot)).replace(",", ".")) : NaN);
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
/** 1.5 → "1,50" (campo de dinheiro); só dígitos, vírgula e ponto ao digitar. */
const moneyInput = (value: number) => value.toFixed(2).replace(".", ",");
const cleanMoney = (value: string) => value.replace(/[^\d.,]/g, "").slice(0, 12);
type ServerGravacao = Omit<Gravacao, "custoOverride"> & { custoOverride?: number };
type ServerItem = Omit<Item, "costOverride" | "priceOverride" | "gravacoes"> & { costOverride?: number; priceOverride?: number; gravacoes: ServerGravacao[] };
/** Item salvo (números) → item do editor (texto nos campos digitados à mão). */
function fromServerItem(item: ServerItem): Item {
  const { costOverride, priceOverride, gravacoes, ...rest } = item;
  return {
    ...rest,
    ...(costOverride === undefined ? {} : { costOverride: moneyInput(costOverride) }),
    ...(priceOverride === undefined ? {} : { priceOverride: moneyInput(priceOverride) }),
    gravacoes: gravacoes.map(({ custoOverride, ...g }) => (custoOverride === undefined ? g : { ...g, custoOverride: moneyInput(custoOverride) })),
  } as Item;
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");

const TECNICAS = [
  { tipo: "laser", label: "Laser" },
  { tipo: "dtf-textil", label: "DTF Têxtil" },
  { tipo: "dtf-uv", label: "DTF UV" },
  { tipo: "spot", label: "Pelo fornecedor (Spot)" },
  { tipo: "manual", label: "Outra (custo digitado)" },
];

function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function highlight(text: string, query: string) {
  const word = query.trim().split(/\s+/)[0];
  if (!word) return text;
  const index = text.toLowerCase().indexOf(word.toLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + word.length)}</mark>{text.slice(index + word.length)}</>;
}

function tecnicaFromForm(form: EngravingForm): Tecnica | null {
  if (form.tipo === "laser") return { tipo: "laser" };
  if (form.tipo === "dtf-textil" || form.tipo === "dtf-uv") {
    const larguraCm = parseNumber(form.largura);
    const alturaCm = parseNumber(form.altura);
    return larguraCm > 0 && alturaCm > 0 ? { tipo: form.tipo, larguraCm, alturaCm } : null;
  }
  if (form.tipo === "spot") return form.spotId ? { tipo: "spot", opcaoId: form.spotId } : null;
  if (form.tipo === "manual") {
    const custoUnitario = parseNumber(form.custo);
    return form.nome.trim() && custoUnitario >= 0 ? { tipo: "manual", nome: form.nome.trim(), custoUnitario } : null;
  }
  return null;
}

function formFromGravacao(itemId: string, index: number | null, gravacao?: Gravacao, spotDefault = ""): EngravingForm {
  const t = gravacao?.tecnica ?? { tipo: "laser" };
  const str = (value: unknown) => (value === undefined || value === null ? "" : String(value).replace(".", ","));
  return {
    itemId, index, tipo: t.tipo, local: gravacao?.local ?? "",
    largura: str(t.larguraCm), altura: str(t.alturaCm), spotId: String(t.opcaoId ?? spotDefault), nome: String(t.nome ?? ""), custo: str(t.custoUnitario),
  };
}

async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as T };
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
        <input aria-label="Buscar cliente" autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Nome, empresa, WhatsApp ou CPF/CNPJ" value={query} />
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

export function QuoteEditor({ quoteId }: { quoteId?: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [fixedCustomer, setFixedCustomer] = useState<{ name: string; company: string; phone: string; notes: string } | null>(null);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<Record<string, Preview>>({});
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [discount, setDiscount] = useState<DiscountForm>({ type: "percent", value: "" });
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [engraving, setEngraving] = useState<EngravingForm | null>(null);
  const [engravingCalc, setEngravingCalc] = useState<{ text: string; error?: boolean } | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [loose, setLoose] = useState<{ name: string; cost: string; quantity: string } | null>(null);
  const [loading, setLoading] = useState(Boolean(quoteId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [state, setState] = useState<{ updatedAt: string; status: string; createdBy: string | null } | null>(null);
  const idempotencyKey = useRef(`painel-${newId()}`);
  const productQueryDebounced = useDebounced(productQuery.trim(), 250);
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
        setFixedCustomer(payload.customer);
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

  // Busca de produto.
  useEffect(() => {
    let active = true;
    const run = productQueryDebounced.length >= 2
      ? fetch(`/api/backoffice/orcamento-editor/produtos?q=${encodeURIComponent(productQueryDebounced)}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<{ products?: Product[] }>)
        .then((payload) => payload.products ?? [])
        .catch(() => [] as Product[])
      : Promise.resolve([] as Product[]);
    run.then((list) => active && setProductResults(list));
    return () => {
      active = false;
    };
  }, [productQueryDebounced]);

  // Cálculo ao vivo da gravação sendo editada.
  const engravingKey = useDebounced(JSON.stringify(engraving), 250);
  useEffect(() => {
    const form = JSON.parse(engravingKey) as EngravingForm | null;
    if (!form) return;
    const item = items.find((entry) => entry.id === form.itemId);
    const tecnica = tecnicaFromForm(form);
    let active = true;
    const run = !item || !tecnica
      ? Promise.resolve(null)
      : postJson<{ preview?: Preview[] }>("/api/backoffice/orcamento-editor/previa", { items: [{ ...item, gravacoes: [{ tecnica, local: form.local }] }] });
    run.then((response) => {
      if (!active) return;
      const result = response?.data.preview?.[0];
      if (!result) return setEngravingCalc(null);
      if (!result.ok) return setEngravingCalc({ text: result.error, error: true });
      const g = result.gravacoes[0];
      // Preço por peça (laser, Spot): custo/peça e total. Folhas/metros (DTF): mostra a conta.
      const perPiece = /por peça/.test(g.detalhe);
      setEngravingCalc({ text: perPiece ? `Custo ${brl(g.custoUnitario)} por peça · ${brl(g.custoTotal)} no total` : `${g.detalhe ? `${g.detalhe} = ` : ""}${brl(g.custoTotal)} · ${brl(g.custoUnitario)} por peça` });
    }).catch(() => undefined);
    return () => {
      active = false;
    };
    // items muda junto quando o item muda; aqui só recalcula pelo formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engravingKey]);

  function updateItem(id: string, change: Partial<Item>) {
    setItems((list) => list.map((item) => (item.id === id ? ({ ...item, ...change } as Item) : item)));
  }

  function addProduct(product: Product) {
    setProducts((map) => ({ ...map, [product.publicId]: product }));
    const variant = product.variants.find((entry) => entry.stock >= 100) ?? product.variants[0];
    setItems((list) => [...list, { id: newId(), source: "catalogo", publicId: product.publicId, variant: variant?.label ?? "", quantity: 100, gravacoes: [] }]);
    setProductQuery("");
    setProductResults([]);
  }

  function addLoose() {
    if (!loose) return;
    const cost = parseNumber(loose.cost);
    const quantity = Number.parseInt(loose.quantity, 10);
    if (loose.name.trim().length < 2 || !(cost >= 0) || !(quantity > 0)) return;
    setItems((list) => [...list, { id: newId(), source: "avulso", name: loose.name.trim(), cost, quantity, gravacoes: [] }]);
    setLoose(null);
  }

  function openEngraving(item: Item, index: number | null) {
    const product = item.source === "catalogo" ? products[item.publicId] : undefined;
    const spotDefault = product?.spotOptions.find((option) => option.padrao)?.id ?? product?.spotOptions[0]?.id ?? "";
    const form = formFromGravacao(item.id, index, index === null ? undefined : item.gravacoes[index], spotDefault);
    if (index === null && product?.supplier === "spot" && spotDefault) form.tipo = "spot";
    setEngravingCalc(null);
    setEngraving(form);
  }

  function saveEngraving() {
    if (!engraving) return;
    const tecnica = tecnicaFromForm(engraving);
    if (!tecnica || engravingCalc?.error) return;
    const gravacao = { tecnica, local: engraving.local.trim() };
    setItems((list) => list.map((item) => {
      if (item.id !== engraving.itemId) return item;
      const gravacoes = engraving.index === null ? [...item.gravacoes, gravacao] : item.gravacoes.map((g, i) => (i === engraving.index ? gravacao : g));
      return { ...item, gravacoes };
    }));
    setEngraving(null);
  }

  async function submit() {
    setSaving(true);
    setSaveError(null);
    const body = quoteId
      ? { updatedAt: state?.updatedAt, internalNotes: notes, items, discount: discountBody }
      : { customerRef: customer?.ref, idempotencyKey: idempotencyKey.current, internalNotes: notes, items, discount: discountBody };
    const { ok, status, data } = await postJson<{ id?: string; message?: string; preview?: Preview[] }>(
      quoteId ? `/api/backoffice/orcamento-editor/${quoteId}` : "/api/backoffice/orcamento-editor",
      body,
      quoteId ? "PUT" : "POST",
    );
    setSaving(false);
    if (ok) {
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
  const canSubmit = editable && items.length > 0 && totals.pending === 0 && !discountError && (quoteId ? true : Boolean(customer)) && !saving;
  const marginPercent = totals.total > 0 ? Math.round((totals.margin / totals.total) * 100) : 0;
  const engravingItem = engraving ? items.find((item) => item.id === engraving.itemId) : undefined;
  const engravingProduct = engravingItem?.source === "catalogo" ? products[engravingItem.publicId] : undefined;
  const tecnicas = useMemo(
    () => TECNICAS.filter((t) => t.tipo !== "spot" || (engravingProduct?.supplier === "spot" && engravingProduct.spotOptions.length > 0)),
    [engravingProduct],
  );

  if (loading) return <main className="qe-page"><p className="qe-hint">Carregando orçamento…</p></main>;
  if (loadError) return <main className="qe-page"><p className="qe-error">{loadError}</p><Link className="qe-btn-text" href="/equipe?aba=orcamentos">Voltar aos orçamentos</Link></main>;

  return (
    <main className="qe-page">
      <div className="qe-crumb"><Link href="/equipe?aba=orcamentos">Orçamentos</Link> / {quoteId ? "Editar" : "Novo"}</div>
      <h1 className="qe-title">{quoteId ? "Editar orçamento" : "Novo orçamento"}</h1>
      {!editable ? <p className="qe-error">Este orçamento já foi fechado e não pode mais ser alterado.</p> : null}

      <div className="qe-layout">
        <div>
          <section className="qe-card">
            <h2>Cliente</h2>
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
              <div className="qe-cols"><span>Produto</span><span>Cor</span><span className="qe-r">Qtd.</span><span className="qe-r">Unitário</span><span className="qe-r">Total</span><span /></div>
            ) : <p className="qe-hint">Nenhum produto ainda. Busque no catálogo ou adicione um item fora do catálogo.</p>}

            {items.map((item) => {
              const product = item.source === "catalogo" ? products[item.publicId] : undefined;
              const variant = product?.variants.find((entry) => entry.label === (item.source === "catalogo" ? item.variant : "")) ?? product?.variants[0];
              const result = preview[item.id];
              const ok = result?.ok ? result : null;
              return (
                <div className="qe-item" key={item.id}>
                  <div className="qe-line">
                    <div className="qe-prod">
                      {product ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <span className="qe-thumb"><img alt="" src={variant?.imageUrl || product.imageUrl} /></span>
                      ) : <span className="qe-thumb qe-thumb-blank">avulso</span>}
                      <div>
                        <b>{productLabel(item)}</b>
                        <small>{product ? `${product.fareCode} · ${product.supplierCode}` : "Fora do catálogo"}</small>
                        <label className="qe-cost">
                          <span>Custo/peça R$</span>
                          <input
                            aria-label={`Custo por peça de ${productLabel(item)}`}
                            className={item.costOverride ? "is-manual" : undefined}
                            disabled={!editable}
                            inputMode="decimal"
                            onChange={(event) => updateItem(item.id, { costOverride: cleanMoney(event.target.value) || undefined })}
                            placeholder={moneyInput(item.source === "avulso" ? item.cost : variant?.cost ?? 0)}
                            title={item.costOverride ? "Custo digitado. Apague para voltar ao do catálogo." : "Custo do catálogo. Digite para alterar."}
                            value={item.costOverride ?? ""}
                          />
                        </label>
                      </div>
                    </div>
                    {product ? (
                      <select aria-label="Cor" disabled={!editable} onChange={(event) => updateItem(item.id, { variant: event.target.value })} value={item.source === "catalogo" ? item.variant : ""}>
                        {product.variants.map((entry) => <option key={entry.label} value={entry.label}>{entry.label}</option>)}
                      </select>
                    ) : <span />}
                    <input
                      aria-label="Quantidade"
                      className="qe-qty"
                      disabled={!editable}
                      inputMode="numeric"
                      onChange={(event) => updateItem(item.id, { quantity: Number.parseInt(event.target.value.replace(/\D/g, ""), 10) || 0 })}
                      value={item.quantity || ""}
                    />
                    <div className="qe-price">
                      <input
                        aria-label={`Preço por peça de ${productLabel(item)}`}
                        className={item.priceOverride ? "qe-money is-manual" : "qe-money"}
                        disabled={!editable}
                        inputMode="decimal"
                        onChange={(event) => updateItem(item.id, { priceOverride: cleanMoney(event.target.value) || undefined })}
                        placeholder={ok ? moneyInput(ok.suggestedPrice) : "—"}
                        title={item.priceOverride ? "Preço digitado. Apague para voltar ao calculado." : "Preço calculado. Digite para alterar."}
                        value={item.priceOverride ?? ""}
                      />
                      {item.priceOverride && ok && editable ? (
                        <button className="qe-reset" onClick={() => updateItem(item.id, { priceOverride: undefined })} title="Voltar ao preço calculado" type="button">
                          calculado {brl(ok.suggestedPrice)}
                        </button>
                      ) : null}
                    </div>
                    <span className="qe-r">{ok ? brl(ok.total) : "—"}</span>
                    {editable ? (
                      <button aria-label={`Remover ${productLabel(item)}`} className="qe-rm" onClick={() => setItems((list) => list.filter((entry) => entry.id !== item.id))} type="button"><X size={14} /></button>
                    ) : <span />}
                  </div>
                  {result && !result.ok ? <p className="qe-error qe-indent">{result.error}</p> : null}
                  {ok?.stockWarning ? <p className="qe-warn qe-indent">{ok.stockWarning}</p> : null}

                  <div className="qe-engr">
                    {item.gravacoes.map((gravacao, index) => {
                      const calc = ok?.gravacoes[index];
                      return (
                        <div className="qe-eline" key={index}>
                          <span><b>{calc?.descricao ?? "Gravação"}</b>{gravacao.local ? <span className="qe-muted"> · {gravacao.local}</span> : null}</span>
                          <label className="qe-cost qe-ecost">
                            <span>Custo/peça R$</span>
                            <input
                              aria-label={`Custo por peça da gravação ${calc?.descricao ?? ""}`}
                              className={gravacao.custoOverride ? "is-manual" : undefined}
                              disabled={!editable}
                              inputMode="decimal"
                              onChange={(event) => updateItem(item.id, {
                                gravacoes: item.gravacoes.map((g, i) => (i === index ? { ...g, custoOverride: cleanMoney(event.target.value) || undefined } : g)),
                              })}
                              placeholder={calc && !calc.manual ? moneyInput(calc.custoUnitario) : ""}
                              title={gravacao.custoOverride ? "Custo digitado. Apague para voltar ao calculado." : "Custo calculado. Digite para alterar."}
                              value={gravacao.custoOverride ?? ""}
                            />
                          </label>
                          {editable ? (
                            <span className="qe-eacts">
                              <button onClick={() => openEngraving(item, index)} type="button">Editar</button>
                              <button onClick={() => updateItem(item.id, { gravacoes: item.gravacoes.filter((_, i) => i !== index) })} type="button">Remover</button>
                            </span>
                          ) : <span />}
                        </div>
                      );
                    })}
                    {!item.gravacoes.length ? <span className="qe-none">Sem gravação</span> : null}
                    {editable && engraving?.itemId !== item.id ? (
                      <button className="qe-btn-text qe-add-g" onClick={() => openEngraving(item, null)} type="button">+ Adicionar gravação</button>
                    ) : null}
                  </div>

                  {engraving?.itemId === item.id ? (
                    <div className="qe-gform">
                      <div className="qe-gform-grid">
                        <label className="qe-field"><span>Gravação</span>
                          <select onChange={(event) => setEngraving({ ...engraving, tipo: event.target.value })} value={engraving.tipo}>
                            {tecnicas.map((t) => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
                          </select>
                        </label>
                        {engraving.tipo !== "spot" ? (
                          <label className="qe-field"><span>Local</span><input onChange={(event) => setEngraving({ ...engraving, local: event.target.value })} placeholder="Frente, verso, tampa…" value={engraving.local} /></label>
                        ) : null}
                        {engraving.tipo === "dtf-textil" || engraving.tipo === "dtf-uv" ? (
                          <>
                            <label className="qe-field"><span>Largura (cm)</span><input inputMode="decimal" onChange={(event) => setEngraving({ ...engraving, largura: event.target.value })} value={engraving.largura} /></label>
                            <label className="qe-field"><span>Altura (cm)</span><input inputMode="decimal" onChange={(event) => setEngraving({ ...engraving, altura: event.target.value })} value={engraving.altura} /></label>
                          </>
                        ) : null}
                        {engraving.tipo === "manual" ? (
                          <>
                            <label className="qe-field"><span>Nome</span><input onChange={(event) => setEngraving({ ...engraving, nome: event.target.value })} placeholder="Ex.: Silk 1 cor" value={engraving.nome} /></label>
                            <label className="qe-field"><span>Custo/peça</span><input inputMode="decimal" onChange={(event) => setEngraving({ ...engraving, custo: event.target.value })} placeholder="0,00" value={engraving.custo} /></label>
                          </>
                        ) : null}
                        {engraving.tipo === "spot" && engravingProduct ? (() => {
                          // Componente → Local → Técnica → Área → Nº de cores (cada um só com o que existe acima).
                          const choices = spotChoices(engravingProduct.spotOptions, { fromId: engraving.spotId });
                          return (
                            <div className="qe-spot">
                              {choices.levels.map((level) => (
                                <label className="qe-field" key={level.key}>
                                  <span>{level.label}</span>
                                  <select
                                    disabled={level.values.length === 1}
                                    onChange={(event) => {
                                      const next = spotChoices(engravingProduct.spotOptions, { fromId: engraving.spotId, [level.key]: event.target.value });
                                      if (next.option) setEngraving({ ...engraving, spotId: next.option.id });
                                    }}
                                    value={level.selected}
                                  >
                                    {level.values.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}
                                  </select>
                                </label>
                              ))}
                            </div>
                          );
                        })() : null}
                      </div>
                      <div className="qe-gcalc">
                        <p className={engravingCalc?.error ? "qe-error" : undefined}>{engravingCalc?.text ?? "Preencha para calcular."}</p>
                        <div>
                          <button className="qe-btn qe-btn-secondary" onClick={() => setEngraving(null)} type="button">Cancelar</button>
                          <button className="qe-btn qe-btn-primary" disabled={!tecnicaFromForm(engraving) || Boolean(engravingCalc?.error)} onClick={saveEngraving} type="button">Salvar gravação</button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {editable ? (
              loose ? (
                <div className="qe-gform qe-loose">
                  <div className="qe-loose-grid">
                    <label className="qe-field"><span>Item fora do catálogo</span><input autoFocus onChange={(event) => setLoose({ ...loose, name: event.target.value })} placeholder="Ex.: Banner lona 90 × 120 cm" value={loose.name} /></label>
                    <label className="qe-field"><span>Custo/peça</span><input inputMode="decimal" onChange={(event) => setLoose({ ...loose, cost: event.target.value })} placeholder="0,00" value={loose.cost} /></label>
                    <label className="qe-field"><span>Qtd.</span><input inputMode="numeric" onChange={(event) => setLoose({ ...loose, quantity: event.target.value })} value={loose.quantity} /></label>
                  </div>
                  <div className="qe-actions">
                    <button className="qe-btn qe-btn-secondary" onClick={() => setLoose(null)} type="button">Cancelar</button>
                    <button className="qe-btn qe-btn-primary" onClick={addLoose} type="button">Adicionar item</button>
                  </div>
                </div>
              ) : (
                <div className="qe-addbar">
                  <div className="qe-picker">
                    <div className="qe-search">
                      <Search aria-hidden="true" size={16} />
                      <input aria-label="Adicionar produto" onChange={(event) => setProductQuery(event.target.value)} placeholder="Adicionar produto — código Fare, código do fornecedor ou nome" value={productQuery} />
                    </div>
                    {productQuery.trim().length >= 2 ? (
                      <div className="qe-menu">
                        {productResults.map((product) => {
                          const cost = Math.min(...product.variants.map((variant) => variant.cost));
                          return (
                            <button className="qe-opt" key={product.publicId} onClick={() => addProduct(product)} type="button">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <span className="qe-thumb qe-thumb-sm"><img alt="" src={product.imageUrl} /></span>
                              <span><b>{product.name}</b><small>{product.fareCode} · {product.supplierCode} · custo {brl(cost)} · {product.variants.length} {product.variants.length === 1 ? "cor" : "cores"}</small></span>
                            </button>
                          );
                        })}
                        {!productResults.length ? <p className="qe-menu-empty">{productQueryDebounced === productQuery.trim() ? "Nenhum produto encontrado." : "Buscando…"}</p> : null}
                      </div>
                    ) : null}
                  </div>
                  <button className="qe-btn qe-btn-secondary" onClick={() => setLoose({ name: "", cost: "", quantity: "100" })} type="button">Item fora do catálogo</button>
                </div>
              )
            ) : null}
          </section>

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
          {totals.pending ? <p className="qe-error">{totals.pending === 1 ? "1 item precisa de correção." : `${totals.pending} itens precisam de correção.`}</p> : null}

          <div className="qe-internal">
            <p>Só a equipe vê</p>
            <div className="qe-sum-row"><span>Custo estimado</span><span>{brl(totals.cost)}</span></div>
            <div className="qe-sum-row"><span>Margem</span><span className="qe-margin">{brl(totals.margin)} · {marginPercent}%</span></div>
          </div>

          {items.some((item) => item.costOverride || item.priceOverride || item.gravacoes.some((g) => g.custoOverride)) ? (
            <p className="qe-manual-note"><span aria-hidden="true" className="qe-manual-dot" /> Valores com fundo laranja foram digitados à mão.</p>
          ) : null}
          <p className="qe-terms">Validade de 7 dias · produção em 7 dias após a aprovação da arte e o sinal de 50%.</p>
          {saveError ? <p className="qe-error">{saveError}</p> : null}
          {editable ? (
            <button className="qe-btn qe-btn-primary qe-submit" disabled={!canSubmit} onClick={submit} type="button">
              {saving ? "Salvando…" : quoteId ? "Salvar alterações" : "Criar orçamento"}
            </button>
          ) : null}
          {!quoteId && !customer ? <p className="qe-hint qe-center">Escolha o cliente para criar.</p> : null}
        </aside>
      </div>
    </main>
  );
}
