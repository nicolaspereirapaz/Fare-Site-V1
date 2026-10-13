"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";

type Technique = { tipo: string; label: string; info: string };
type SpotOption = { id: string; tecnica: string; local: string; componente: string; area: string; cores: number; padrao: boolean; faixas: Array<{ minimo: number; preco: number }> };
type ReadPayload = {
  item: { productName: string; quantity: number; selections: Record<string, string>; unitPrice: number | null; costing: { personalizacao: string | null; detalhe: string; por: string; em: string } | null };
  product: { name: string; category: string; supplier: string; cost: number | null; fareCode: string; supplierCode: string } | null;
  spotOptions: SpotOption[];
  techniques: Technique[];
  freteFornecedor: number;
  editable: boolean;
};
type Result = { descricao: string; detalhe: string; custoPersonalizacaoTotal: number; personalizacaoUnitaria: number; precoUnitarioFinal: number; totalCliente: number };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (value: number) => money.format(value).replace(/\u00a0/g, " ");
const parseNumber = (value: string) => (value.trim() ? Number(value.replace(/\./g, (m, o, all) => (all.includes(",") ? "" : m)).replace(",", ".")) : NaN);

function spotLabel(option: SpotOption, quantity: number) {
  const price = [...option.faixas].reverse().find((faixa) => quantity >= faixa.minimo)?.preco ?? option.faixas[0]?.preco ?? 0;
  const colors = option.cores > 1 ? ` · até ${option.cores} cores` : "";
  return `${option.tecnica} · ${option.local}${option.componente ? ` (${option.componente})` : ""} · ${option.area}${colors} — ${brl(price)}/peça`;
}

/** Painel da equipe: formar o preço de um item do orçamento (custo + personalização) × 2 + frete rateado. */
export function QuoteItemPricing({ quoteId, index, onBack, onSaved }: { quoteId: string; index: number; onBack: () => void; onSaved: () => void }) {
  const [data, setData] = useState<ReadPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [tipo, setTipo] = useState("nenhuma");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [spotId, setSpotId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualCost, setManualCost] = useState("");
  const [productCost, setProductCost] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const url = `/api/backoffice/quotes/${quoteId}/itens/${index}`;

  useEffect(() => {
    let active = true;
    fetch(url, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as ReadPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error === "QUOTE_NOT_FOUND" ? "Item não encontrado." : "Não foi possível abrir o item.");
        if (!active) return;
        setData(payload);
        setQuantity(String(payload.item.quantity));
        const preferred = payload.spotOptions.find((option) => option.padrao) ?? payload.spotOptions[0];
        if (preferred) setSpotId(preferred.id);
      })
      .catch((loadError: unknown) => active && setError(loadError instanceof Error ? loadError.message : "Erro inesperado."));
    return () => {
      active = false;
    };
  }, [url]);

  const body = useMemo(() => {
    const quantidade = Number.parseInt(quantity, 10);
    if (!Number.isInteger(quantidade) || quantidade <= 0) return null;
    let tecnica: Record<string, unknown> = { tipo };
    if (tipo === "dtf-textil" || tipo === "dtf-uv") {
      const larguraCm = parseNumber(width);
      const alturaCm = parseNumber(height);
      if (!(larguraCm > 0) || !(alturaCm > 0)) return null;
      tecnica = { tipo, larguraCm, alturaCm };
    }
    if (tipo === "spot") {
      if (!spotId) return null;
      tecnica = { tipo, opcaoId: spotId };
    }
    if (tipo === "manual") {
      const custoUnitario = parseNumber(manualCost);
      if (!manualName.trim() || !(custoUnitario >= 0)) return null;
      tecnica = { tipo, nome: manualName.trim(), custoUnitario };
    }
    const payload: Record<string, unknown> = { quantidade, tecnica };
    if (data && data.product?.cost == null) {
      const custoProduto = parseNumber(productCost);
      if (!(custoProduto >= 0)) return null;
      payload.custoProduto = custoProduto;
    }
    return payload;
  }, [data, height, manualCost, manualName, productCost, quantity, spotId, tipo, width]);

  // Simula no servidor a cada mudança (com uma pequena pausa enquanto digita).
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setSaved(false);
      if (!data || !body) {
        setResult(null);
        return;
      }
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(async (response) => {
          const payload = (await response.json()) as { result?: Result; message?: string };
          if (!active) return;
          if (!response.ok || !payload.result) {
            setResult(null);
            setCalcError(payload.message ?? "Não foi possível calcular.");
            return;
          }
          setCalcError(null);
          setResult(payload.result);
        })
        .catch(() => active && setCalcError("Sem conexão com o servidor."));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [body, data, url]);

  async function apply() {
    if (!body) return;
    setSaving(true);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, aplicar: true }) });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível salvar.");
      setSaved(true);
      onSaved();
    } catch (saveError) {
      setCalcError(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div className="backoffice-error" role="alert">
        <TriangleAlert aria-hidden="true" size={18} /> <span>{error}</span>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="backoffice-loading">
        <RefreshCw aria-hidden="true" size={22} />
        <p>Carregando item…</p>
      </div>
    );
  }

  const technique = data.techniques.find((entry) => entry.tipo === tipo);
  const quantityNumber = Number.parseInt(quantity, 10) || 0;
  const cost = data.product?.cost ?? (parseNumber(productCost) >= 0 ? parseNumber(productCost) : null);

  return (
    <div className="qp">
      <button className="qp-back" onClick={onBack} type="button">
        <ArrowLeft aria-hidden="true" size={15} /> Voltar ao orçamento
      </button>

      <header className="qp-head">
        <div>
          <h3>{data.item.productName}</h3>
          <small>
            {[data.product ? `${data.product.fareCode} · ${data.product.supplierCode}` : "Fora do catálogo", data.item.selections?.["Variação"]].filter(Boolean).join(" · ")}
          </small>
        </div>
        <dl className="qp-cost">
          <div>
            <dt>Custo do produto</dt>
            <dd>
              {data.product?.cost != null ? (
                brl(data.product.cost)
              ) : (
                <input aria-label="Custo do produto (R$)" inputMode="decimal" onChange={(event) => setProductCost(event.target.value)} placeholder="0,00" value={productCost} />
              )}
            </dd>
          </div>
          <div>
            <dt>Frete do fornecedor</dt>
            <dd>{brl(data.freteFornecedor)}</dd>
          </div>
        </dl>
      </header>

      <label className="qp-field qp-quantity">
        <span>Quantidade</span>
        <input aria-label="Quantidade" inputMode="numeric" onChange={(event) => setQuantity(event.target.value.replace(/\D/g, "").slice(0, 7))} value={quantity} />
      </label>

      <fieldset className="qp-techniques">
        <legend>Personalização</legend>
        <div className="qp-options">
          {data.techniques.map((entry) => (
            <label className={tipo === entry.tipo ? "qp-option active" : "qp-option"} key={entry.tipo}>
              <input checked={tipo === entry.tipo} name={`tecnica-${quoteId}-${index}`} onChange={() => setTipo(entry.tipo)} type="radio" value={entry.tipo} aria-label={entry.label} />
              <span>{entry.label}</span>
            </label>
          ))}
        </div>
        {technique?.info ? <p className="qp-info">{technique.info}</p> : null}

        {tipo === "dtf-textil" || tipo === "dtf-uv" ? (
          <div className="qp-row">
            <label className="qp-field">
              <span>Largura da arte (cm)</span>
              <input aria-label="Largura da arte (cm)" inputMode="decimal" onChange={(event) => setWidth(event.target.value)} placeholder="Ex.: 8" value={width} />
            </label>
            <span className="qp-times" aria-hidden="true">×</span>
            <label className="qp-field">
              <span>Altura da arte (cm)</span>
              <input aria-label="Altura da arte (cm)" inputMode="decimal" onChange={(event) => setHeight(event.target.value)} placeholder="Ex.: 5" value={height} />
            </label>
          </div>
        ) : null}

        {tipo === "spot" ? (
          <label className="qp-field">
            <span>Opção da Spot</span>
            <select aria-label="Opção da Spot" onChange={(event) => setSpotId(event.target.value)} value={spotId}>
              {data.spotOptions.map((option) => (
                <option key={option.id} value={option.id}>{spotLabel(option, quantityNumber)}</option>
              ))}
            </select>
          </label>
        ) : null}

        {tipo === "manual" ? (
          <div className="qp-row">
            <label className="qp-field qp-grow">
              <span>Nome da personalização</span>
              <input aria-label="Nome da personalização" maxLength={80} onChange={(event) => setManualName(event.target.value)} placeholder="Ex.: Silk 1 cor" value={manualName} />
            </label>
            <label className="qp-field">
              <span>Custo por peça (R$)</span>
              <input aria-label="Custo por peça (R$)" inputMode="decimal" onChange={(event) => setManualCost(event.target.value)} placeholder="0,00" value={manualCost} />
            </label>
          </div>
        ) : null}
      </fieldset>

      <section className="qp-result" aria-live="polite">
        {calcError ? (
          <p className="qp-error"><TriangleAlert aria-hidden="true" size={15} /> {calcError}</p>
        ) : result && cost !== null ? (
          <>
            {tipo !== "nenhuma" ? <p className="qp-detail">{result.detalhe}</p> : null}
            <table>
              <tbody>
                <tr><td>Produto (custo)</td><td>{brl(cost)} /un.</td></tr>
                {tipo !== "nenhuma" ? (
                  <tr><td>Personalização (custo)</td><td>{brl(result.personalizacaoUnitaria)} /un. · {brl(result.custoPersonalizacaoTotal)} total</td></tr>
                ) : null}
                <tr><td>(Custo + personalização) × 2</td><td>{brl((cost + result.personalizacaoUnitaria) * 2)} /un.</td></tr>
                <tr><td>Frete do fornecedor rateado</td><td>{brl(data.freteFornecedor / Math.max(1, quantityNumber))} /un.</td></tr>
              </tbody>
              <tfoot>
                <tr><td>Preço ao cliente</td><td><strong>{brl(result.precoUnitarioFinal)}</strong> /un.</td></tr>
                <tr><td>Total do item</td><td><strong>{brl(result.totalCliente)}</strong></td></tr>
              </tfoot>
            </table>
          </>
        ) : (
          <p className="qp-hint"><Calculator aria-hidden="true" size={15} /> Preencha os campos para calcular.</p>
        )}
      </section>

      {data.item.costing ? (
        <p className="qp-last">
          Preço atual: {data.item.unitPrice === null ? "sob consulta" : `${brl(data.item.unitPrice)}/un.`}
          {data.item.costing.personalizacao ? ` com ${data.item.costing.personalizacao}` : ""} — por {data.item.costing.por || "equipe"} em {new Date(data.item.costing.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>
      ) : null}

      <div className="qp-actions">
        {saved ? <span className="qp-saved"><CheckCircle2 aria-hidden="true" size={15} /> Salvo no orçamento</span> : null}
        <button className="kb-primary" disabled={!data.editable || !result || saving} onClick={apply} type="button">
          {saving ? "Salvando…" : "Aplicar no orçamento"}
        </button>
      </div>
      {!data.editable ? <p className="qp-info">Este orçamento já foi fechado; o preço não pode mais mudar.</p> : null}
    </div>
  );
}
