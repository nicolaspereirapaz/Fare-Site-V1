"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { spotChoices } from "@/lib/suppliers/spotOptionPicker";
import {
  brl,
  cleanMoney,
  moneyInput,
  newId,
  parseNumber,
  postJson,
  useDebounced,
  type Gravacao,
  type Item,
  type Preview,
  type Product,
  type Tecnica,
} from "@/components/staff/quoteEditorShared";

/**
 * Janela "Configuração do produto" (fluxo da brinde.me): produto e cor, quantidade, custo,
 * gravações (tabela da Fare ou do fornecedor) e preço; foto grande na lateral; Adicionar.
 * O preço é sempre calculado no servidor (prévia); aqui só se monta o rascunho.
 */

/** variant: cor já escolhida na busca (filtro de cor ou "Usar este produto" nos detalhes). */
export type ModalStart = { kind: "catalogo"; product: Product; item?: Item; variant?: string } | { kind: "avulso"; item?: Item };

type EngForm = {
  key: string;
  /** spot = tabela do fornecedor; propria = tabela da Fare (laser, DTF, outra). */
  mode: "spot" | "propria";
  tipo: string;
  local: string;
  largura: string;
  altura: string;
  spotId: string;
  nome: string;
  custo: string;
  custoOverride: string;
};

const OWN_TECNICAS = [
  { tipo: "laser", label: "Laser" },
  { tipo: "dtf-textil", label: "DTF Têxtil" },
  { tipo: "dtf-uv", label: "DTF UV" },
  { tipo: "manual", label: "Outra (custo digitado)" },
];

const str = (value: unknown) => (value === undefined || value === null ? "" : String(value).replace(".", ","));
const hasSpot = (product?: Product) => Boolean(product && product.supplier === "spot" && product.spotOptions.length > 0);
const spotDefault = (product?: Product) => product?.spotOptions.find((option) => option.padrao)?.id ?? product?.spotOptions[0]?.id ?? "";

function newEng(product?: Product): EngForm {
  return { key: newId(), mode: hasSpot(product) ? "spot" : "propria", tipo: "laser", local: "", largura: "", altura: "", spotId: spotDefault(product), nome: "", custo: "", custoOverride: "" };
}

function engFromGravacao(gravacao: Gravacao, product?: Product): EngForm {
  const t = gravacao.tecnica;
  const spot = t.tipo === "spot";
  return {
    key: newId(),
    mode: spot ? "spot" : "propria",
    tipo: spot ? "laser" : t.tipo,
    local: gravacao.local ?? "",
    largura: str(t.larguraCm),
    altura: str(t.alturaCm),
    spotId: spot ? String(t.opcaoId ?? "") : spotDefault(product),
    nome: String(t.nome ?? ""),
    custo: str(t.custoUnitario),
    custoOverride: gravacao.custoOverride ?? "",
  };
}

function tecnicaOf(form: EngForm): Tecnica | null {
  if (form.mode === "spot") return form.spotId ? { tipo: "spot", opcaoId: form.spotId } : null;
  if (form.tipo === "laser") return { tipo: "laser" };
  if (form.tipo === "dtf-textil" || form.tipo === "dtf-uv") {
    const larguraCm = parseNumber(form.largura);
    const alturaCm = parseNumber(form.altura);
    return larguraCm > 0 && alturaCm > 0 ? { tipo: form.tipo, larguraCm, alturaCm } : null;
  }
  if (form.tipo === "manual") {
    const custoUnitario = parseNumber(form.custo);
    return form.nome.trim() && custoUnitario >= 0 ? { tipo: "manual", nome: form.nome.trim(), custoUnitario } : null;
  }
  return null;
}

/**
 * Campo de valor editável como qualquer campo de texto: mostra sempre o valor em uso (o calculado ou o digitado).
 * Enquanto edita, guarda o texto local (apagar tudo não "volta" sozinho para o calculado).
 * Ao sair: vazio ou igual ao calculado = automático; valor digitado fica com fundo laranja.
 */
export function MoneyField({ value, calculated, onChange, ariaLabel, className = "" }: {
  value: string;
  calculated: number | null;
  onChange: (next: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value || (calculated !== null ? moneyInput(calculated) : ""));
  return (
    <input
      aria-label={ariaLabel}
      className={`${className}${value ? " is-manual" : ""}`.trim()}
      inputMode="decimal"
      onBlur={() => {
        const text = (draft ?? value).trim();
        const number = parseNumber(text);
        if (!text || !Number.isFinite(number) || (calculated !== null && Math.abs(number - calculated) < 1e-9)) onChange("");
        else onChange(moneyInput(number));
        setDraft(null);
      }}
      onChange={(event) => {
        const text = cleanMoney(event.target.value);
        setDraft(text);
        const number = parseNumber(text);
        if (text && Number.isFinite(number)) onChange(text);
      }}
      onFocus={(event) => {
        setDraft(shown);
        event.currentTarget.select();
      }}
      value={shown}
    />
  );
}

/** Na gravação "Outra", o custo já é digitado no próprio formulário. */
const allowsCostOverride = (form: EngForm) => !(form.mode === "propria" && form.tipo === "manual");

/** Fila de produtos marcados na busca: posição atual, total e "Pular" (descarta este e vai ao próximo). */
export type ConfigQueue = { position: number; total: number; onSkip: () => void };

export function ProductConfigModal({ start, onSave, onClose, queue }: { start: ModalStart; onSave: (item: Item) => void; onClose: () => void; queue?: ConfigQueue }) {
  const editing = start.item;
  const product = start.kind === "catalogo" ? start.product : undefined;
  const firstField = useRef<HTMLSelectElement & HTMLInputElement>(null);

  const [id] = useState(() => editing?.id ?? newId());
  const [variant, setVariant] = useState(() => {
    if (editing?.source === "catalogo") return editing.variant;
    const chosen = start.kind === "catalogo" ? start.variant : undefined;
    if (chosen && product?.variants.some((entry) => entry.label === chosen)) return chosen;
    return (product?.variants.find((entry) => entry.stock >= 100) ?? product?.variants[0])?.label ?? "";
  });
  const [quantity, setQuantity] = useState(String(editing?.quantity ?? 100));
  const [name, setName] = useState(editing?.source === "avulso" ? editing.name : "");
  const [looseCost, setLooseCost] = useState(editing?.source === "avulso" ? moneyInput(editing.cost) : "");
  const [costOverride, setCostOverride] = useState(editing?.costOverride ?? "");
  const [priceOverride, setPriceOverride] = useState(editing?.priceOverride ?? "");
  const [engs, setEngs] = useState<EngForm[]>(() => editing?.gravacoes.map((gravacao) => engFromGravacao(gravacao, product)) ?? []);
  /** Prévia do servidor e o rascunho exato que a gerou (rede lenta não pode liberar preço antigo). */
  const [result, setResult] = useState<{ key: string; preview: Preview } | null>(null);

  // Esc fecha; a página de trás não rola com a janela aberta.
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

  const qty = Number.parseInt(quantity.replace(/\D/g, ""), 10) || 0;
  const forms = engs.map((form) => ({ form, tecnica: tecnicaOf(form) }));
  const incomplete = forms.some((entry) => !entry.tecnica);
  const filled = forms.filter((entry): entry is { form: EngForm; tecnica: Tecnica } => Boolean(entry.tecnica));
  const gravacoes: Gravacao[] = filled.map(({ form, tecnica }) => ({
    tecnica,
    local: form.mode === "spot" ? "" : form.local.trim(),
    ...(form.custoOverride && allowsCostOverride(form) ? { custoOverride: form.custoOverride } : {}),
  }));
  const draft: Item = product
    ? { id, source: "catalogo", publicId: product.publicId, variant, quantity: qty, gravacoes, ...(costOverride ? { costOverride } : {}), ...(priceOverride ? { priceOverride } : {}) }
    : { id, source: "avulso", name: name.trim(), cost: parseNumber(looseCost), quantity: qty, gravacoes, ...(priceOverride ? { priceOverride } : {}) };
  const draftKey = JSON.stringify(draft);
  const debouncedKey = useDebounced(draftKey, 300);

  // Prévia do item no servidor (preço, custo das gravações, estoque).
  useEffect(() => {
    const item = JSON.parse(debouncedKey) as Item;
    let active = true;
    const valid = item.quantity > 0 && (item.source === "catalogo" || (item.name.length >= 2 && Number(item.cost) >= 0));
    const run = valid
      ? postJson<{ preview?: Preview[] }>("/api/backoffice/orcamento-editor/previa", { items: [item] }).then(({ data }) => data.preview?.[0] ?? null)
      : Promise.resolve(null);
    run.then((preview) => active && setResult(preview ? { key: debouncedKey, preview } : null)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [debouncedKey]);

  const fresh = result && result.key === draftKey ? result.preview : null;
  const ok = fresh?.ok ? fresh : null;
  const suggested = result?.preview.ok ? result.preview.suggestedPrice : null;
  const calcOf = (key: string) => {
    const index = filled.findIndex((entry) => entry.form.key === key);
    return index >= 0 ? ok?.gravacoes[index] : undefined;
  };
  const current = product?.variants.find((entry) => entry.label === variant);
  const photo = current?.imageUrl || product?.imageUrl || "";
  const looseValid = product ? true : name.trim().length >= 2 && parseNumber(looseCost) >= 0;
  const canSave = qty > 0 && !incomplete && looseValid && Boolean(ok);
  const setEng = (key: string, change: Partial<EngForm>) => setEngs((list) => list.map((form) => (form.key === key ? { ...form, ...change } : form)));
  const margin = ok ? ok.total - ok.cost : 0;

  return (
    <div className="qe-scrim" role="presentation">
      <div aria-labelledby="qe-modal-title" aria-modal="true" className="qe-modal" role="dialog">
        <header className="qe-modal-head">
          <h2 id="qe-modal-title">Configuração do produto{queue ? <span className="qe-queue-pos"> {queue.position} de {queue.total}</span> : null}</h2>
          <button aria-label="Fechar" className="qe-modal-x" onClick={onClose} type="button"><X size={18} /></button>
        </header>

        <div className="qe-modal-body">
          <div className="qe-modal-main">
            <section className="qe-msec">
              <h3>Produto</h3>
              <div className="qe-mbox">
                {product ? (
                  <div className="qe-mgrid">
                    <div className="qe-field qe-mspan-2">
                      <span>Produto</span>
                      <div className="qe-ro qe-ro-prod"><b>{product.name}</b><small>{product.fareCode} · {product.supplierCode}</small></div>
                    </div>
                    <label className="qe-field">
                      <span>Cor</span>
                      <select onChange={(event) => setVariant(event.target.value)} ref={firstField} value={variant}>
                        {product.variants.map((entry) => <option key={entry.label} value={entry.label}>{entry.label}</option>)}
                      </select>
                    </label>
                  </div>
                ) : (
                  <label className="qe-field">
                    <span>Item fora do catálogo</span>
                    <input onChange={(event) => setName(event.target.value)} placeholder="Ex.: Banner lona 90 × 120 cm" ref={firstField} value={name} />
                  </label>
                )}

                <div className="qe-mgrid">
                  <label className="qe-field">
                    <span>Quantidade</span>
                    <input inputMode="numeric" onChange={(event) => setQuantity(event.target.value.replace(/\D/g, "").slice(0, 7))} value={quantity} />
                  </label>
                  {product ? (
                    <label className="qe-field">
                      <span>Custo por peça (R$)</span>
                      <MoneyField ariaLabel="Custo por peça do produto" calculated={current?.cost ?? null} className="qe-num" onChange={setCostOverride} value={costOverride} />
                      <small className="qe-fhint">
                        {costOverride ? <button className="qe-reset" onClick={() => setCostOverride("")} type="button">usar o do catálogo ({brl(current?.cost ?? 0)})</button> : "do catálogo · clique para alterar"}
                      </small>
                    </label>
                  ) : (
                    <label className="qe-field">
                      <span>Custo por peça (R$)</span>
                      <input className="qe-num" inputMode="decimal" onChange={(event) => setLooseCost(cleanMoney(event.target.value))} placeholder="0,00" value={looseCost} />
                    </label>
                  )}
                  <div className="qe-field">
                    <span>Custo total do produto</span>
                    <div className="qe-ro qe-num">{ok ? brl(ok.productCost * qty) : "—"}</div>
                  </div>
                </div>
                {current ? (
                  <p className={current.stock < qty ? "qe-warn qe-stock" : "qe-fhint qe-stock"}>
                    Em estoque nesta cor: {current.stock.toLocaleString("pt-BR")} un.{current.stock < qty ? " — menos que a quantidade" : ""}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="qe-msec">
              <h3>Gravação</h3>
              {engs.map((form, index) => {
                const calc = calcOf(form.key);
                const tecnica = tecnicaOf(form);
                return (
                  <div className="qe-mbox qe-ebox" key={form.key}>
                    <div className="qe-ebox-head">
                      <b>Gravação {index + 1}</b>
                      {hasSpot(product) ? (
                        <div aria-label="Tabela da gravação" className="qe-seg" role="radiogroup">
                          {([["propria", "Tabela da Fare"], ["spot", "Tabela do fornecedor"]] as const).map(([mode, label]) => (
                            <button aria-checked={form.mode === mode} className={form.mode === mode ? "on" : undefined} key={mode} onClick={() => setEng(form.key, { mode, custoOverride: "" })} role="radio" type="button">{label}</button>
                          ))}
                        </div>
                      ) : null}
                      <button aria-label={`Remover gravação ${index + 1}`} className="qe-rm qe-ebox-rm" onClick={() => setEngs((list) => list.filter((entry) => entry.key !== form.key))} type="button"><Trash2 size={15} /></button>
                    </div>

                    {form.mode === "spot" && product ? (
                      <div className="qe-mgrid">
                        {spotChoices(product.spotOptions, { fromId: form.spotId }).levels.map((level) => (
                          <label className="qe-field" key={level.key}>
                            <span>{level.label}</span>
                            <select
                              disabled={level.values.length === 1}
                              onChange={(event) => {
                                const next = spotChoices(product.spotOptions, { fromId: form.spotId, [level.key]: event.target.value });
                                if (next.option) setEng(form.key, { spotId: next.option.id });
                              }}
                              value={level.selected}
                            >
                              {level.values.map((value) => <option key={value.value} value={value.value}>{value.label}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="qe-mgrid">
                        <label className="qe-field">
                          <span>Técnica</span>
                          <select onChange={(event) => setEng(form.key, { tipo: event.target.value, custoOverride: "" })} value={form.tipo}>
                            {OWN_TECNICAS.map((t) => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
                          </select>
                        </label>
                        <label className="qe-field">
                          <span>Local</span>
                          <input onChange={(event) => setEng(form.key, { local: event.target.value })} placeholder="Frente, verso, tampa…" value={form.local} />
                        </label>
                        {form.tipo === "dtf-textil" || form.tipo === "dtf-uv" ? (
                          <div className="qe-mpair">
                            <label className="qe-field"><span>Largura (cm)</span><input className="qe-num" inputMode="decimal" onChange={(event) => setEng(form.key, { largura: event.target.value })} value={form.largura} /></label>
                            <label className="qe-field"><span>Altura (cm)</span><input className="qe-num" inputMode="decimal" onChange={(event) => setEng(form.key, { altura: event.target.value })} value={form.altura} /></label>
                          </div>
                        ) : null}
                        {form.tipo === "manual" ? (
                          <div className="qe-mpair">
                            <label className="qe-field"><span>Nome</span><input onChange={(event) => setEng(form.key, { nome: event.target.value })} placeholder="Ex.: Silk 1 cor" value={form.nome} /></label>
                            <label className="qe-field"><span>Custo/peça (R$)</span><input className="qe-num" inputMode="decimal" onChange={(event) => setEng(form.key, { custo: cleanMoney(event.target.value) })} placeholder="0,00" value={form.custo} /></label>
                          </div>
                        ) : null}
                      </div>
                    )}

                    <div className="qe-ebox-foot">
                      <span className="qe-fhint">
                        {!tecnica ? "Preencha para calcular." : calc ? `${calc.detalhe && !/por peça|digitado/.test(calc.detalhe) ? `${calc.detalhe} · ` : ""}${brl(calc.custoTotal)} no total` : "Calculando…"}
                      </span>
                      {allowsCostOverride(form) ? (
                        <label className="qe-cost">
                          <span>Custo/peça R$</span>
                          <MoneyField
                            ariaLabel={`Custo por peça da gravação ${index + 1}`}
                            calculated={calc && !calc.manual ? calc.custoUnitario : null}
                            onChange={(next) => setEng(form.key, { custoOverride: next })}
                            value={form.custoOverride}
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <button className="qe-btn-text qe-add-g" onClick={() => setEngs((list) => [...list, newEng(product)])} type="button">+ Adicionar gravação</button>
            </section>

            <section className="qe-msec">
              <h3>Preço de venda</h3>
              <div className="qe-mbox">
                <div className="qe-mgrid">
                  <label className="qe-field">
                    <span>Preço por peça (R$)</span>
                    <MoneyField ariaLabel="Preço por peça" calculated={suggested} className="qe-num qe-strong" onChange={setPriceOverride} value={priceOverride} />
                    <small className="qe-fhint">
                      {priceOverride && suggested !== null ? <button className="qe-reset" onClick={() => setPriceOverride("")} type="button">usar o calculado ({brl(suggested)})</button> : "calculado · clique para alterar"}
                    </small>
                  </label>
                  <div className="qe-field">
                    <span>Custo total do item</span>
                    <div className="qe-ro qe-num">{ok ? brl(ok.cost) : "—"}</div>
                  </div>
                  <div className="qe-field">
                    <span>Margem do item</span>
                    <div className={margin < 0 ? "qe-ro qe-num qe-neg" : "qe-ro qe-num qe-pos"}>{ok ? `${brl(margin)} · ${ok.total > 0 ? Math.round((margin / ok.total) * 100) : 0}%` : "—"}</div>
                  </div>
                </div>
              </div>
            </section>
            {fresh && !fresh.ok ? <p className="qe-error">{fresh.error}</p> : null}
            {incomplete ? <p className="qe-error">Complete ou remova a gravação para adicionar.</p> : null}
          </div>

          <aside className="qe-modal-side">
            <div className="qe-mphoto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {photo ? <img alt={product ? `${product.name} — ${variant}` : ""} src={photo} /> : <span>{product ? "Produto sem foto." : "Item fora do catálogo"}</span>}
            </div>
            {product ? (
              <>
                <p className="qe-mside-name">{product.name}</p>
                <p className="qe-fhint">{product.fareCode} · {product.category}</p>
                <div className="qe-mcolors">
                  <span>Cores e estoque</span>
                  <ul>
                    {product.variants.map((entry) => (
                      <li key={entry.label}>
                        <button className={entry.label === variant ? "on" : undefined} onClick={() => setVariant(entry.label)} type="button">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {entry.imageUrl ? <img alt="" src={entry.imageUrl} /> : <i />}
                          <span>{entry.label}</span>
                          <small>{entry.stock.toLocaleString("pt-BR")} un.</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </aside>
        </div>

        <footer className="qe-modal-foot">
          <div className="qe-mfig"><span>Preço unit.</span><b>{ok ? brl(ok.unitPrice) : "—"}</b></div>
          <div className="qe-mfig"><span>Total</span><b>{ok ? brl(ok.total) : "—"}</b></div>
          <button className="qe-btn qe-btn-secondary" onClick={onClose} type="button">Cancelar</button>
          {queue ? <button className="qe-btn qe-btn-secondary qe-skip" onClick={queue.onSkip} type="button">Pular</button> : null}
          <button className="qe-btn qe-btn-primary qe-madd" disabled={!canSave} onClick={() => onSave(draft)} type="button">
            <Plus aria-hidden="true" size={16} /> {editing ? "Salvar produto" : queue && queue.position < queue.total ? "Adicionar e próximo" : "Adicionar"}
          </button>
        </footer>
      </div>
    </div>
  );
}
