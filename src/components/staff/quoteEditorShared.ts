"use client";

import { useEffect, useState } from "react";

/* Tipos e utilidades do editor de orçamentos da equipe (custo e estoque só para a equipe). */

export type Customer = { ref: string; kind: "conta" | "painel"; name: string; company: string; phone: string; email: string; document: string; createdBy?: string; professional?: boolean; alsoUsedBy?: Array<{ name: string; by: string[] }> };
export type Duplicate = Customer & { by: string[] };
export type SpotOption = { id: string; tecnica: string; local: string; componente: string; area: string; cores: number; padrao: boolean };
export type Product = {
  publicId: string; name: string; category: string; imageUrl: string; fareCode: string; supplierCode: string; supplier: string;
  /** Descrição do fornecedor (só vem na busca; orçamento salvo pode não ter). */
  description?: string;
  variants: Array<{ label: string; cost: number; stock: number; imageUrl: string }>;
  spotOptions: SpotOption[];
};
export type Tecnica = Record<string, unknown> & { tipo: string };
/* Valores digitados à mão ficam como texto ("1,25"); vazio = calculado pelo sistema. */
export type Gravacao = { tecnica: Tecnica; local: string; custoOverride?: string };
type Manual = { costOverride?: string; priceOverride?: string };
export type Item =
  | ({ id: string; source: "catalogo"; publicId: string; variant: string; quantity: number; gravacoes: Gravacao[] } & Manual)
  | ({ id: string; source: "avulso"; name: string; cost: number; transport?: number; quantity: number; gravacoes: Gravacao[]; mockup?: string } & Manual);
export type PreviewGravacao = { descricao: string; local: string; detalhe: string; custoUnitario: number; custoTotal: number; manual?: true };
export type PreviewOk = { id: string; ok: true; unitPrice: number; total: number; cost: number; productCost: number; gravacoes: PreviewGravacao[]; stockWarning?: string; manual: { cost: boolean; price: boolean }; suggestedPrice: number };
export type Preview = PreviewOk | { id: string; ok: false; error: string };
export type Totals = { subtotal: number; discount: number; total: number; cost: number; margin: number; pending: number };
export const EMPTY_TOTALS: Totals = { subtotal: 0, discount: 0, total: 0, cost: 0, margin: 0, pending: 0 };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (value: number) => money.format(value).replace(/\u00a0/g, " ");
export const parseNumber = (value: string) => (value.trim() ? Number(value.replace(/\./g, (dot, _o, all: string) => (all.includes(",") ? "" : dot)).replace(",", ".")) : NaN);
export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
/** 1.5 → "1,50"; 1.234 → "1,234" (não corta casas digitadas: reabrir e salvar não pode mudar o preço). */
export const moneyInput = (value: number) => {
  const text = String(Math.round(value * 1e6) / 1e6);
  const [whole, decimals = ""] = text.split(".");
  return `${whole},${decimals.padEnd(2, "0")}`;
};
export const cleanMoney = (value: string) => value.replace(/[^\d.,]/g, "").slice(0, 12);
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");

type ServerGravacao = Omit<Gravacao, "custoOverride"> & { custoOverride?: number };
/** Omit que preserva cada variação da união (catálogo / avulso). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ServerItem = DistributiveOmit<Item, "costOverride" | "priceOverride" | "gravacoes"> & { costOverride?: number; priceOverride?: number; gravacoes: ServerGravacao[] };
/** Item salvo (números) → item do editor (texto nos campos digitados à mão). */
export function fromServerItem(item: ServerItem): Item {
  const { costOverride, priceOverride, gravacoes, ...rest } = item;
  return {
    ...rest,
    ...(costOverride === undefined ? {} : { costOverride: moneyInput(costOverride) }),
    ...(priceOverride === undefined ? {} : { priceOverride: moneyInput(priceOverride) }),
    gravacoes: gravacoes.map(({ custoOverride, ...g }) => (custoOverride === undefined ? g : { ...g, custoOverride: moneyInput(custoOverride) })),
  } as Item;
}

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: response.ok, status: response.status, data: (await response.json().catch(() => ({}))) as T };
}

/** Resumo da gravação para a lista: "Laser · Corpo", "Transfer · Frente superior". */
export function engravingSummary(calc: PreviewGravacao | undefined, gravacao: Gravacao): string {
  const name = calc?.descricao ?? "Gravação";
  return gravacao.local && !name.includes(gravacao.local) ? `${name} · ${gravacao.local}` : name;
}
