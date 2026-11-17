"use client";

import { Plus, SmilePlus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { QUICK_REACTIONS } from "@/lib/atendimento/types";
import type { Message } from "@/components/staff/atendimento/shared";

/** Emojis mais usados no atendimento (sem biblioteca: os do sistema já aparecem coloridos). */
export const EMOJIS = (
  "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤪 🤗 🤭 🤔 🤩 🥳 😎 😏 😌 😴 😮 😯 😲 😳 🥺 😢 😭 😤 😡 🤯 😱 😬 🙄 😐 😶 😷 " +
  "👍 👎 👌 ✌️ 🤞 🤝 🙏 👏 🙌 👋 💪 👀 ☝️ 👉 👈 ✋ " +
  "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💕 💖 💯 " +
  "📷 📸 🖼️ 🎁 🎉 🎊 🎂 🎈 ✨ ⭐ 🌟 🔥 ✅ ❌ ⚠️ ⏰ 📅 📦 🚚 💰 💳 🧾 📍 📞 💬 📝 📌 🏆 🌹 🌸 ☀️ ☕"
).split(" ");

/** Fecha ao clicar fora ou apertar Esc. */
function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && onClose();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return ref;
}

export function EmojiGrid({ onPick, active }: { onPick: (emoji: string) => void; active?: string }) {
  return (
    <div className="at-emoji-grid" role="listbox" aria-label="Emojis">
      {EMOJIS.map((emoji) => (
        <button aria-selected={emoji === active} className={emoji === active ? "is-active" : undefined} key={emoji} onClick={() => onPick(emoji)} role="option" type="button">
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** Painel de emojis do campo de mensagem (fica aberto para escolher vários). */
export function EmojiPanel({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useDismiss(onClose);
  return (
    <div className="at-emoji-panel" ref={ref}>
      <EmojiGrid onPick={onPick} />
    </div>
  );
}

/** Botão do balão: abre as reações rápidas (e "+" para todos os emojis). Clicar na reação que já é sua tira. */
export function ReactButton({ message, onReact }: { message: Message; onReact?: (message: Message, emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!onReact) return null;
  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Reagir a esta mensagem"
        className="at-reply-btn at-react-btn"
        onClick={() => setOpen((value) => !value)}
        // O "clicar fora" da barra não pode fechar e o clique reabrir.
        onMouseDown={(event) => event.stopPropagation()}
        title="Reagir"
        type="button"
      >
        <SmilePlus aria-hidden="true" size={14} />
      </button>
      {open ? (
        <ReactBar
          current={message.reactions?.loja ?? ""}
          onClose={() => setOpen(false)}
          onPick={(emoji) => {
            setOpen(false);
            onReact(message, emoji === message.reactions?.loja ? "" : emoji);
          }}
        />
      ) : null}
    </>
  );
}

function ReactBar({ current, onPick, onClose }: { current: string; onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useDismiss(onClose);
  const [all, setAll] = useState(false);
  const [below, setBelow] = useState(false);
  // Sem espaço acima do balão (topo da conversa): abre para baixo.
  useLayoutEffect(() => {
    const bar = ref.current?.getBoundingClientRect();
    const box = ref.current?.closest(".at-messages")?.getBoundingClientRect();
    if (bar && box && bar.top < box.top) setBelow(true);
  }, [all, ref]);
  return (
    <div className={`at-react-bar${all ? " is-all" : ""}${below ? " is-below" : ""}`} ref={ref}>
      {all ? (
        <EmojiGrid active={current} onPick={onPick} />
      ) : (
        <div className="at-react-quick">
          {QUICK_REACTIONS.map((emoji) => (
            <button aria-label={emoji === current ? `Tirar ${emoji}` : `Reagir com ${emoji}`} className={emoji === current ? "is-active" : undefined} key={emoji} onClick={() => onPick(emoji)} type="button">
              {emoji}
            </button>
          ))}
          <button aria-label="Mais emojis" className="at-react-more" onClick={() => setAll(true)} type="button">
            <Plus aria-hidden="true" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

const WHO: Record<string, string> = { loja: "Fare Foto", cliente: "Cliente" };

/** Selo com as reações do balão (como no WhatsApp); passar o mouse mostra quem reagiu. */
export function ReactionChips({ messages }: { messages: Message[] }) {
  const entries = messages.flatMap((message) => Object.entries(message.reactions ?? {}));
  if (!entries.length) return null;
  const counts = new Map<string, number>();
  for (const [, emoji] of entries) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  const total = entries.length;
  return (
    <span className="at-reactions" title={entries.map(([who, emoji]) => `${WHO[who] ?? who}: ${emoji}`).join("\n")}>
      {[...counts.keys()].join("")}
      {total > 1 ? <small>{total}</small> : null}
    </span>
  );
}
