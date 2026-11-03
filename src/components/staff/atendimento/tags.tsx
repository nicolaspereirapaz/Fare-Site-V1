"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { api, type Conversation } from "@/components/staff/atendimento/shared";

const PALETTE = [
  { background: "#f8e7df", color: "#8f3416" },
  { background: "#e3f3ea", color: "#0f5a3e" },
  { background: "#e9ebf3", color: "#1d2447" },
  { background: "#fbf0dc", color: "#7a4f0d" },
  { background: "#f3e6f5", color: "#6a2a77" },
  { background: "#e2f1f8", color: "#0d5470" },
];

/** Cor fixa por etiqueta (a mesma etiqueta sempre tem a mesma cor). */
export function tagColor(tag: string) {
  let hash = 0;
  for (const char of tag.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function TagChips({ tags, small = false }: { tags: string[]; small?: boolean }) {
  if (!tags.length) return null;
  return (
    <span className={`at-tags${small ? " is-small" : ""}`}>
      {tags.map((tag) => (
        <span className="at-tag" key={tag} style={tagColor(tag)}>
          {tag}
        </span>
      ))}
    </span>
  );
}

// Sugestões guardadas entre conversas (lidas uma vez; zeradas quando alguém muda uma etiqueta).
let suggestionsCache: string[] | null = null;
const rememberSuggestions = (list: string[] | null) => {
  suggestionsCache = list;
};

/** Etiquetas da conversa aberta: tirar no ×, pôr no "+ Etiqueta" (com sugestões). */
export function TagEditor({ conversation, onChanged }: { conversation: Conversation; onChanged: (conversation: Conversation) => void }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>(suggestionsCache ?? []);
  const [error, setError] = useState<string | null>(null);
  const listId = `at-tags-${conversation.id}`;

  async function save(tags: string[]) {
    setError(null);
    try {
      const data = await api<{ conversation: Conversation }>(`/api/atendimento/conversas/${conversation.id}`, { method: "PATCH", body: { action: "etiquetas", tags } });
      onChanged(data.conversation);
      rememberSuggestions(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar a etiqueta.");
    }
  }

  function open() {
    setAdding(true);
    if (!suggestionsCache) {
      void api<{ tags: string[] }>("/api/atendimento/etiquetas")
        .then((data) => {
          rememberSuggestions(data.tags);
          setSuggestions(data.tags);
        })
        .catch(() => undefined);
    }
  }

  function add() {
    const tag = value.trim();
    setValue("");
    setAdding(false);
    if (tag && !conversation.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) void save([...conversation.tags, tag]);
  }

  return (
    <span className="at-tags at-tag-editor">
      {conversation.tags.map((tag) => (
        <span className="at-tag" key={tag} style={tagColor(tag)}>
          {tag}
          <button aria-label={`Tirar a etiqueta ${tag}`} onClick={() => void save(conversation.tags.filter((item) => item !== tag))} type="button">
            <X aria-hidden="true" size={11} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          aria-label="Nova etiqueta"
          autoFocus
          className="at-tag-input"
          list={listId}
          maxLength={24}
          onBlur={add}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
            if (event.key === "Escape") {
              setValue("");
              setAdding(false);
            }
          }}
          placeholder="Etiqueta…"
          value={value}
        />
      ) : conversation.tags.length < 8 ? (
        <button className="at-tag-add" onClick={open} type="button">
          <Plus aria-hidden="true" size={12} /> Etiqueta
        </button>
      ) : null}
      <datalist id={listId}>
        {suggestions
          .filter((tag) => !conversation.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()))
          .map((tag) => (
            <option key={tag} value={tag} />
          ))}
      </datalist>
      {error ? <span className="at-form-error">{error}</span> : null}
    </span>
  );
}
