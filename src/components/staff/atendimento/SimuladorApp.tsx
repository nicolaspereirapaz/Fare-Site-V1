"use client";

import "@/components/staff/atendimento/atendimento.css";
import "@/components/staff/atendimento/atendimento-dark.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FlaskConical, Paperclip, Plus, Send, Smartphone } from "lucide-react";
import { MessageMediaView, uploadFile } from "@/components/staff/atendimento/media";
import type { MessageMedia } from "@/lib/atendimento/types";
import { api, clockTime, displayName, formatPhone, initials, WhatsAppText, type Conversation } from "@/components/staff/atendimento/shared";

type SimMessage = { seq: number; id: string; fromCustomer: boolean; text: string; media: MessageMedia | null; createdAt: string };

const SUGGESTIONS = ["Oi, boa tarde!", "Quanto custa a foto 3x4?", "Qual o horário de vocês?", "Quero orçamento de 100 canecas", "Quero falar com um vendedor"];

const randomPhone = () => `119${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

/** Simulador: a equipe faz o papel do cliente no "celular", sem WhatsApp conectado. */
export function SimuladorApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<{ conversations: Conversation[] }>("/api/atendimento/simulador").then((data) => {
        setConversations(data.conversations);
        return data.conversations;
      }),
    [],
  );

  useEffect(() => {
    load()
      .then((list) => setSelectedId((current) => current ?? list[0]?.id ?? null))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Erro ao carregar."));
    const timer = window.setInterval(() => void load().catch(() => undefined), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function create() {
    setError(null);
    try {
      const data = await api<{ conversation: Conversation }>("/api/atendimento/simulador", { method: "POST", body: { name, phone: phone.trim() || randomPhone() } });
      await load();
      setSelectedId(data.conversation.id);
      setName("");
      setPhone("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar.");
    }
  }

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  return (
    <div className="kb-page container-shell sim-page">
      <header className="kb-heading">
        <h1>Simulador de cliente</h1>
        <p>Teste o atendimento sem WhatsApp: escreva aqui como se fosse o cliente e acompanhe no painel de Atendimento.</p>
      </header>
      <div className="sim-layout">
        <aside className="sim-side">
          <section className="at-card">
            <h3>Novo cliente de teste</h3>
            <form
              className="at-form"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <label>
                Nome no WhatsApp (opcional)
                <input maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Maria" value={name} />
              </label>
              <label>
                Telefone (opcional)
                <input inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="Vazio = número fictício" value={phone} />
              </label>
              {error ? <p className="at-form-error" role="alert">{error}</p> : null}
              <button className="at-btn at-btn-orange at-btn-block" type="submit">
                <Plus aria-hidden="true" size={16} /> Criar e abrir conversa
              </button>
            </form>
          </section>
          <section className="at-card">
            <h3>Clientes de teste</h3>
            {conversations.length ? (
              <ul className="sim-list">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button className={conversation.id === selectedId ? "is-active" : undefined} onClick={() => setSelectedId(conversation.id)} type="button">
                      <span aria-hidden="true" className="at-avatar at-avatar-sm">{initials(displayName(conversation))}</span>
                      <span>
                        <strong>{displayName(conversation)}</strong>
                        <small>{formatPhone(conversation.phone)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="at-muted">Crie um cliente de teste para começar.</p>
            )}
          </section>
          <section className="at-card sim-tips">
            <h3><FlaskConical aria-hidden="true" size={15} /> Como testar</h3>
            <ol>
              <li>Abra o <a href="/equipe/atendimento" target="_blank">painel de Atendimento</a> em outra janela, lado a lado.</li>
              <li>Mande mensagens aqui. A IA responde como no WhatsApp (mesmas regras, FAQ e modelo do bot) — nada é enviado ao WhatsApp.</li>
              <li>Peça um vendedor: a conversa vai para <strong>Aguardando vendedor</strong> e o painel toca um aviso.</li>
              <li>No painel, assuma e responda: a mensagem aparece aqui, assinada.</li>
            </ol>
          </section>
        </aside>
        {selected ? <Phone conversation={selected} key={selected.id} /> : (
          <div className="sim-phone sim-phone-empty">
            <Smartphone aria-hidden="true" size={40} />
            <p>Crie ou escolha um cliente de teste.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Phone({ conversation }: { conversation: Conversation }) {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSeq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  const poll = useCallback(
    () =>
      api<{ messages: SimMessage[]; lastSeq: number; typing: boolean }>(`/api/atendimento/simulador/${conversation.id}?depois=${lastSeq.current}`).then((data) => {
        lastSeq.current = data.lastSeq;
        setTyping(data.typing);
        if (data.messages.length) setMessages((list) => [...list, ...data.messages.filter((message) => !list.some((entry) => entry.id === message.id))]);
      }),
    [conversation.id],
  );

  // O celular é recriado (key) a cada cliente; aqui só liga a busca de mensagens novas.
  useEffect(() => {
    void poll().catch(() => undefined);
    const timer = window.setInterval(() => void poll().catch(() => undefined), 1500);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, typing]);

  /** Cliente simulado manda fotos/arquivos (um por um; o texto digitado vai como legenda da 1ª). */
  async function sendFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length || sending) return;
    setSending(true);
    setError(null);
    try {
      for (const [index, file] of files.entries()) {
        await uploadFile(`/api/atendimento/upload/simulador/${conversation.id}`, file, { "x-caption": encodeURIComponent(index === 0 ? text.trim() : "") });
      }
      setText("");
      await poll();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  }

  async function send(value = text) {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/atendimento/simulador/${conversation.id}`, { method: "POST", body: { text: body } });
      setText("");
      await poll();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sim-phone-wrap">
      <div className="sim-phone" aria-label="Celular do cliente (simulado)">
        <header className="sim-phone-head">
          <ArrowLeft aria-hidden="true" size={18} />
          <span aria-hidden="true" className="sim-phone-logo">FF</span>
          <div>
            <strong>Fare Foto</strong>
            <small>conta comercial</small>
          </div>
        </header>
        <div className="sim-phone-chat" ref={scroller}>
          <div className="sim-phone-note">Você é: {displayName(conversation)} · {formatPhone(conversation.phone)}</div>
          {messages.map((message) => (
            <div className={`sim-msg${message.fromCustomer ? " is-mine" : ""}`} key={message.id}>
              <MessageMediaView message={message} />
              {message.text ? <WhatsAppText text={message.text} /> : null}
              <span className="sim-msg-time">{clockTime(message.createdAt)}</span>
            </div>
          ))}
          {typing ? <div className="sim-msg sim-typing" aria-live="polite">digitando…</div> : null}
        </div>
        <div className="sim-suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button disabled={sending} key={suggestion} onClick={() => void send(suggestion)} type="button">{suggestion}</button>
          ))}
        </div>
        {error ? <p className="at-form-error sim-error" role="alert">{error}</p> : null}
        <form
          className="sim-phone-input"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label aria-label="Mandar foto ou arquivo" className="sim-attach" title="Mandar fotos/arquivos como o cliente">
            <Paperclip aria-hidden="true" size={18} />
            <input
              disabled={sending}
              hidden
              multiple
              onChange={(event) => {
                void sendFiles(event.target.files);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          <input aria-label="Mensagem do cliente" onChange={(event) => setText(event.target.value)} placeholder="Mensagem" value={text} />
          <button aria-label="Enviar" disabled={!text.trim() || sending} type="submit">
            <Send aria-hidden="true" size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
