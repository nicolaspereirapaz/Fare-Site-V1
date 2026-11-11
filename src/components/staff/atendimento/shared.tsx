"use client";

import { Fragment, type ReactNode } from "react";
import type { Conversation, Message, QuickReply } from "@/lib/atendimento/types";
import type { LinkedCustomer } from "@/lib/atendimento/customer";
import { parseWhatsApp, stripWhatsApp, type WaNode } from "@/lib/atendimento/waFormat";

export { stripWhatsApp };

export type { Conversation, Message, QuickReply, LinkedCustomer };

export type StaffUser = { id: string; name: string; role: string };

const ERROR_TEXT: Record<string, string> = {
  AUTH_REQUIRED: "Sua sessão expirou. Entre de novo na área da equipe.",
  CONVERSATION_NOT_FOUND: "Conversa não encontrada.",
};

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly detail: string | null) {
    super(message);
  }
}

/** fetch JSON da API do atendimento; erro vira ApiError com a frase pronta para mostrar. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: init?.method ?? "GET",
    cache: "no-store",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string; detail?: string | null };
  if (!response.ok) {
    const code = payload.error ?? "INTERNAL";
    throw new ApiError(code, ERROR_TEXT[code] ?? payload.message ?? "Não foi possível concluir a operação.", payload.detail ?? null);
  }
  return payload;
}

/** "11987654321" → "(11) 98765-4321"; com 55 na frente também. */
export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

export const displayName = (conversation: Pick<Conversation, "contactName" | "phone">) => conversation.contactName || formatPhone(conversation.phone);
/** "Adriele · Imobiliária Previsível" quando o cadastro tem empresa. */
export const nameWithCompany = (conversation: Pick<Conversation, "contactName" | "phone" | "customerCompany">) =>
  conversation.customerCompany ? `${displayName(conversation)} · ${conversation.customerCompany}` : displayName(conversation);

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "#";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** Hora para a lista: "14:05" hoje, "ontem", "02/11" antes disso. */
export function shortTime(iso: string, now = new Date()) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "ontem";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** "há 3 min", "há 1 h 20 min". */
export function waitingFor(iso: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

/** Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~ e links clicáveis. */
export function WhatsAppText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {formatLine(line)}
          {index < lines.length - 1 ? <br /> : null}
        </Fragment>
      ))}
    </>
  );
}

function formatLine(line: string): ReactNode[] {
  return renderNodes(parseWhatsApp(line));
}

/** *negrito*, _itálico_, ~riscado~, ```mono``` (aninhados, como no WhatsApp) e links. */
function renderNodes(nodes: WaNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return <Fragment key={index}>{node.text}</Fragment>;
    if (node.type === "link") return <a href={node.href} key={index} rel="noreferrer" target="_blank">{node.href}</a>;
    const children = renderNodes(node.children);
    if (node.type === "bold") return <strong key={index}>{children}</strong>;
    if (node.type === "italic") return <em key={index}>{children}</em>;
    if (node.type === "strike") return <s key={index}>{children}</s>;
    return <code className="at-mono" key={index}>{children}</code>;
  });
}

/** Bipe curto (sem arquivo de áudio) para avisar que um cliente pediu vendedor. */
export function playChime() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    const notes = [880, 1320];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const start = context.currentTime + index * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
    window.setTimeout(() => void context.close(), 1000);
  } catch {
    // navegador sem áudio: segue sem som
  }
}
