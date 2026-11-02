"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  FileText,
  Hand,
  Inbox,
  MessageSquareText,
  Send,
  Undo2,
  UserPlus,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import {
  CONVERSATION_STATUSES,
  CONVERSATION_STATUS_COLORS,
  CONVERSATION_STATUS_LABELS,
  isSellerStatus,
  type ConversationStatus,
} from "@/lib/atendimento/types";
import {
  ApiError,
  api,
  clockTime,
  displayName,
  formatPhone,
  initials,
  shortTime,
  waitingFor,
  WhatsAppText,
  type Conversation,
  type LinkedCustomer,
  type Message,
  type QuickReply,
  type StaffUser,
} from "@/components/staff/atendimento/shared";

export type ListFilter = "todas" | "minhas" | ConversationStatus;

const FILTERS: Array<{ id: ListFilter; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "aguardando_vendedor", label: "Aguardando" },
  { id: "minhas", label: "Minhas" },
  { id: "ia", label: "IA" },
  { id: "aguardando_orcamento", label: "Orçamento" },
  { id: "aguardando_cliente", label: "Ag. cliente" },
  { id: "finalizada", label: "Finalizadas" },
];

export const isMine = (conversation: Conversation, me: StaffUser) => isSellerStatus(conversation.status) && conversation.assignedStaffId === me.id;

export function matchesFilter(conversation: Conversation, filter: ListFilter, me: StaffUser) {
  if (filter === "todas") return conversation.status !== "finalizada";
  if (filter === "minhas") return isMine(conversation, me);
  return conversation.status === filter;
}

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function matchesQuery(conversation: Conversation, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(`${conversation.contactName} ${conversation.phone} ${conversation.lastMessagePreview} ${conversation.assignedStaffName ?? ""}`);
  return words.every((word) => haystack.includes(word));
}

export function StatusChip({ status, assigned }: { status: ConversationStatus; assigned?: string | null }) {
  const colors = CONVERSATION_STATUS_COLORS[status];
  return (
    <span className="at-chip" style={{ background: colors.bg, color: colors.fg }}>
      <span aria-hidden="true" className="at-chip-dot" style={{ background: colors.dot }} />
      {status === "em_atendimento" && assigned ? `Com ${assigned.split(" ")[0]}` : CONVERSATION_STATUS_LABELS[status]}
      {status !== "em_atendimento" && isSellerStatus(status) && assigned ? ` · ${assigned.split(" ")[0]}` : ""}
    </span>
  );
}

/** Tela "Conversas": lista à esquerda, conversa no meio e cliente à direita. */
export function ConversationView({
  me,
  conversations,
  selectedId,
  onSelect,
  quickReplies,
  onOpenQuickReplies,
  onConversationChanged,
  search,
}: {
  me: StaffUser;
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  quickReplies: QuickReply[];
  onOpenQuickReplies: () => void;
  onConversationChanged: (conversation: Conversation) => void;
  search: string;
}) {
  const [filter, setFilter] = useState<ListFilter>("todas");
  const now = useNow();
  // Quem espera vendedor fica no topo (o mais antigo primeiro); o resto, pela última mensagem.
  const visible = conversations
    .filter((conversation) => matchesFilter(conversation, filter, me) && matchesQuery(conversation, search))
    .sort((a, b) => {
      const aw = a.status === "aguardando_vendedor" ? 0 : 1;
      const bw = b.status === "aguardando_vendedor" ? 0 : 1;
      if (aw !== bw) return aw - bw;
      if (aw === 0) return (a.waitingSince ?? "").localeCompare(b.waitingSince ?? "");
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
  const counts = useMemo(() => {
    const result = Object.fromEntries([...FILTERS.map(({ id }) => [id, 0]), ["em_atendimento", 0]]) as Record<ListFilter, number>;
    for (const conversation of conversations) for (const { id } of FILTERS) if (matchesFilter(conversation, id, me)) result[id] += 1;
    return result;
  }, [conversations, me]);
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  return (
    <div className="at-inbox">
      <aside className="at-list" aria-label="Conversas">
        <div className="at-filters" role="tablist" aria-label="Filtrar conversas">
          {FILTERS.map(({ id, label }) => (
            <button aria-selected={filter === id} className={filter === id ? "active" : undefined} key={id} onClick={() => setFilter(id)} role="tab" type="button">
              {label}
              {counts[id] ? <span className={`at-filter-count${id === "aguardando_vendedor" ? " is-alert" : ""}`}>{counts[id]}</span> : null}
            </button>
          ))}
        </div>
        <div className="at-list-body">
          {visible.length === 0 ? (
            <div className="at-list-empty">
              <Inbox aria-hidden="true" size={22} />
              <p>{search ? "Nenhuma conversa encontrada." : "Nenhuma conversa aqui."}</p>
            </div>
          ) : (
            visible.map((conversation) => (
              <button
                aria-current={conversation.id === selectedId ? "true" : undefined}
                className={`at-item${conversation.id === selectedId ? " is-active" : ""}${conversation.status === "aguardando_vendedor" ? " is-waiting" : ""}`}
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                type="button"
              >
                <span aria-hidden="true" className="at-avatar">{initials(displayName(conversation))}</span>
                <span className="at-item-main">
                  <span className="at-item-top">
                    <strong>{displayName(conversation)}</strong>
                    <span className="at-item-time">{shortTime(conversation.lastMessageAt, now)}</span>
                  </span>
                  <span className="at-item-preview">
                    {conversation.lastMessageAuthor === "ia" ? <Bot aria-label="IA" size={13} /> : conversation.lastMessageAuthor === "vendedor" ? <UserRound aria-label="Vendedor" size={13} /> : null}
                    {conversation.lastMessagePreview || "Sem mensagens"}
                  </span>
                  <span className="at-item-bottom">
                    <StatusChip assigned={conversation.assignedStaffName} status={conversation.status} />
                    {conversation.status === "aguardando_vendedor" && conversation.waitingSince ? <span className="at-wait">{waitingFor(conversation.waitingSince, now)}</span> : null}
                    {conversation.channel === "simulador" ? <span className="at-sim-tag">Teste</span> : null}
                    {conversation.unread ? <span className="at-unread" aria-label={`${conversation.unread} não lidas`}>{conversation.unread}</span> : null}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {selected ? (
        <ChatPanel
          conversation={selected}
          key={selected.id}
          me={me}
          onChanged={onConversationChanged}
          onOpenQuickReplies={onOpenQuickReplies}
          quickReplies={quickReplies}
        />
      ) : (
        <section className="at-chat at-chat-empty">
          <MessageSquareText aria-hidden="true" size={34} />
          <h2>Escolha uma conversa</h2>
          <p>As conversas novas aparecem na lista. Quando a IA pedir um vendedor, você ouve um aviso.</p>
        </section>
      )}
    </div>
  );
}

function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

/** Conversa aberta: cabeçalho com ações, mensagens, campo de resposta e painel do cliente. */
function ChatPanel({
  conversation,
  me,
  quickReplies,
  onOpenQuickReplies,
  onChanged,
}: {
  conversation: Conversation;
  me: StaffUser;
  quickReplies: QuickReply[];
  onOpenQuickReplies: () => void;
  onChanged: (conversation: Conversation) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [customers, setCustomers] = useState<LinkedCustomer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const lastSeq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const now = useNow();

  // Carrega a conversa e depois busca só as mensagens novas a cada 2 s.
  useEffect(() => {
    let active = true;
    lastSeq.current = 0;
    async function load(first: boolean) {
      try {
        const data = await api<{ conversation: Conversation; messages: Message[]; customers?: LinkedCustomer[] }>(
          `/api/atendimento/conversas/${conversation.id}?depois=${lastSeq.current}${first ? "" : "&clientes=0"}`,
        );
        if (!active) return;
        if (data.messages.length) {
          lastSeq.current = data.messages[data.messages.length - 1].seq;
          setMessages((list) => (first ? data.messages : [...list, ...data.messages]));
        }
        if (data.customers) setCustomers(data.customers);
        if (data.conversation.unread) {
          const read = await api<{ conversation: Conversation }>(`/api/atendimento/conversas/${conversation.id}`, { method: "PATCH", body: { action: "lida" } });
          if (active) onChanged(read.conversation);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Erro ao carregar a conversa.");
      } finally {
        if (active && first) setLoading(false);
      }
    }
    void load(true);
    const timer = window.setInterval(() => void load(false), 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [conversation.id, onChanged]);

  useEffect(() => {
    const box = scroller.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [messages]);

  async function act(action: "assumir" | "devolver" | "fila" | "finalizar" | "mover", extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ conversation: Conversation }>(`/api/atendimento/conversas/${conversation.id}`, { method: "PATCH", body: { action, ...extra } });
      onChanged(data.conversation);
      setReturning(false);
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.code === "ASSIGNED_TO_OTHER") {
        if (window.confirm(`${actionError.detail || "Outro vendedor"} está atendendo este cliente. Assumir mesmo assim?`)) {
          setBusy(false);
          return act(action, { ...extra, force: true });
        }
      } else {
        setError(actionError instanceof Error ? actionError.message : "Erro inesperado.");
      }
    } finally {
      setBusy(false);
    }
  }

  const mine = isMine(conversation, me);
  const otherSeller = isSellerStatus(conversation.status) && !mine ? conversation.assignedStaffName : null;

  return (
    <>
      <section className="at-chat" aria-label={`Conversa com ${displayName(conversation)}`}>
        <header className="at-chat-head">
          <span aria-hidden="true" className="at-avatar at-avatar-lg">{initials(displayName(conversation))}</span>
          <div className="at-chat-title">
            <h2>{displayName(conversation)}</h2>
            <p>
              {formatPhone(conversation.phone)}
              {conversation.channel === "simulador" ? <span className="at-sim-tag">Teste</span> : null}
            </p>
          </div>
          <StatusChip assigned={conversation.assignedStaffName} status={conversation.status} />
          <div className="at-chat-actions">
            <label className="at-stage">
              <span>Etapa</span>
              <select
                disabled={busy}
                onChange={(event) => void act("mover", { status: event.target.value })}
                value={conversation.status}
              >
                {CONVERSATION_STATUSES.map((status) => (
                  <option key={status} value={status}>{CONVERSATION_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
            {!mine ? (
              <button className="at-btn at-btn-primary" disabled={busy} onClick={() => void act("assumir")} type="button">
                <Hand aria-hidden="true" size={16} /> Assumir
              </button>
            ) : null}
            {conversation.status !== "ia" ? (
              <button className="at-btn" disabled={busy} onClick={() => setReturning((open) => !open)} type="button">
                <Bot aria-hidden="true" size={16} /> Devolver para IA
              </button>
            ) : null}
            {conversation.status !== "finalizada" ? (
              <button className="at-btn at-btn-quiet" disabled={busy} onClick={() => void act("finalizar")} type="button">
                <CheckCircle2 aria-hidden="true" size={16} /> Finalizar
              </button>
            ) : null}
          </div>
        </header>

        {returning ? (
          <ReturnToAiForm busy={busy} onCancel={() => setReturning(false)} onConfirm={(note) => void act("devolver", { note })} />
        ) : null}
        {conversation.status === "aguardando_vendedor" ? (
          <div className="at-banner at-banner-alert">
            <Users aria-hidden="true" size={16} />
            <span>
              <strong>Cliente aguardando vendedor</strong>
              {conversation.waitingSince ? ` ${waitingFor(conversation.waitingSince, now)}` : ""}
              {conversation.handoffReason ? ` — ${conversation.handoffReason}` : ""}
            </span>
          </div>
        ) : null}
        {otherSeller ? (
          <div className="at-banner">
            <UserRound aria-hidden="true" size={16} />
            <span><strong>{otherSeller}</strong> está atendendo este cliente.</span>
          </div>
        ) : null}
        {error ? <div className="at-banner at-banner-error" role="alert">{error}</div> : null}

        <div
          className="at-messages"
          onScroll={(event) => {
            const box = event.currentTarget;
            stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
          }}
          ref={scroller}
        >
          {loading ? <p className="at-muted at-center">Carregando…</p> : null}
          {!loading && !messages.length ? <p className="at-muted at-center">Nenhuma mensagem ainda.</p> : null}
          {messages.map((message, index) => (
            <MessageBubble key={message.id} message={message} previous={messages[index - 1]} />
          ))}
        </div>

        <Composer
          conversation={conversation}
          me={me}
          mine={mine}
          onAssume={() => void act("assumir")}
          onOpenQuickReplies={onOpenQuickReplies}
          onSent={(message, updated) => {
            stickToBottom.current = true;
            lastSeq.current = Math.max(lastSeq.current, message.seq);
            setMessages((list) => (list.some((entry) => entry.id === message.id) ? list : [...list, message]));
            onChanged(updated);
          }}
          quickReplies={quickReplies}
        />
      </section>

      <CustomerPanel conversation={conversation} customers={customers} onCustomers={setCustomers} />
    </>
  );
}

function ReturnToAiForm({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <form
      className="at-return"
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(note);
      }}
    >
      <label>
        <span>Recado para a IA (opcional) — ela continua a conversa sabendo disso:</span>
        <input maxLength={400} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: retirada combinada para amanhã às 10h" value={note} />
      </label>
      <div>
        <button className="at-btn" onClick={onCancel} type="button">Cancelar</button>
        <button className="at-btn at-btn-primary" disabled={busy} type="submit">
          <Undo2 aria-hidden="true" size={16} /> Devolver para IA
        </button>
      </div>
    </form>
  );
}

function MessageBubble({ message, previous }: { message: Message; previous?: Message }) {
  const day = new Date(message.createdAt).toDateString();
  const showDay = !previous || new Date(previous.createdAt).toDateString() !== day;
  const dayLabel = showDay ? new Date(message.createdAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }) : null;
  if (message.author === "sistema") {
    return (
      <>
        {dayLabel ? <div className="at-day">{dayLabel}</div> : null}
        <div className="at-system">{message.body} · {clockTime(message.createdAt)}</div>
      </>
    );
  }
  const sameAuthor = previous && previous.author === message.author && previous.authorName === message.authorName && !showDay;
  const label = message.author === "ia" ? "IA" : message.author === "vendedor" ? message.authorName : null;
  return (
    <>
      {dayLabel ? <div className="at-day">{dayLabel}</div> : null}
      <div className={`at-bubble at-bubble-${message.author}${sameAuthor ? " is-grouped" : ""}`}>
        {label && !sameAuthor ? (
          <span className="at-bubble-author">
            {message.author === "ia" ? <Bot aria-hidden="true" size={12} /> : <UserRound aria-hidden="true" size={12} />} {label}
          </span>
        ) : null}
        <div className="at-bubble-text">
          <WhatsAppText text={message.author === "vendedor" ? message.body : message.body} />
        </div>
        <span className="at-bubble-time">
          {message.author === "vendedor" && message.deliveredText !== message.body ? "assinada · " : ""}
          {clockTime(message.createdAt)}
        </span>
      </div>
    </>
  );
}

const SIGN_KEY = "fare-atendimento-assinar";

/** Campo de resposta: Enter envia, Shift+Enter quebra linha, "/" abre as mensagens rápidas. */
function Composer({
  conversation,
  me,
  mine,
  quickReplies,
  onAssume,
  onOpenQuickReplies,
  onSent,
}: {
  conversation: Conversation;
  me: StaffUser;
  mine: boolean;
  quickReplies: QuickReply[];
  onAssume: () => void;
  onOpenQuickReplies: () => void;
  onSent: (message: Message, conversation: Conversation) => void;
}) {
  const [text, setText] = useState("");
  // O Composer só aparece depois que a lista carrega no navegador, então dá para ler a preferência já no início.
  const [sign, setSign] = useState(() => typeof window === "undefined" || window.localStorage.getItem(SIGN_KEY) !== "0");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  const slash = text.match(/^\/(\S*)$/);
  const query = pickerOpen ? "" : slash?.[1]?.toLowerCase() ?? null;
  const showPicker = pickerOpen || query !== null;
  const options = showPicker
    ? quickReplies.filter((reply) => !query || reply.shortcut.includes(query) || fold(reply.title).includes(fold(query))).slice(0, 8)
    : [];

  function choose(reply: QuickReply) {
    setText(reply.body);
    setPickerOpen(false);
    setHighlight(0);
    window.requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(reply.body.length, reply.body.length);
    });
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await api<{ message: Message; conversation: Conversation }>(`/api/atendimento/conversas/${conversation.id}/mensagens`, {
        method: "POST",
        body: { text: body, sign },
      });
      setText("");
      onSent(data.message, data.conversation);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (showPicker && options.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((index) => (index + 1) % options.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((index) => (index - 1 + options.length) % options.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(options[Math.min(highlight, options.length - 1)]);
        return;
      }
    }
    if (event.key === "Escape") setPickerOpen(false);
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  if (!mine) {
    return (
      <div className="at-composer at-composer-locked">
        <p>
          {conversation.status === "ia"
            ? "A IA está respondendo este cliente. Para escrever, assuma a conversa — a IA para na hora."
            : isSellerStatus(conversation.status)
              ? `${conversation.assignedStaffName ?? "Outro vendedor"} está com esta conversa (${CONVERSATION_STATUS_LABELS[conversation.status]}).`
              : "Assuma a conversa para responder o cliente."}
        </p>
        <button className="at-btn at-btn-primary" onClick={onAssume} type="button">
          <Hand aria-hidden="true" size={16} /> Assumir conversa
        </button>
      </div>
    );
  }

  return (
    <div className="at-composer">
      {showPicker ? (
        <div className="at-picker" role="listbox" aria-label="Mensagens rápidas">
          <div className="at-picker-head">
            <span>Mensagens rápidas</span>
            <button onClick={onOpenQuickReplies} type="button">Editar lista</button>
          </div>
          {options.length ? (
            options.map((reply, index) => (
              <button
                aria-selected={index === highlight}
                className={index === highlight ? "is-active" : undefined}
                key={reply.id}
                onClick={() => choose(reply)}
                onMouseEnter={() => setHighlight(index)}
                role="option"
                type="button"
              >
                <code>/{reply.shortcut}</code>
                <strong>{reply.title}</strong>
                <span>{reply.body}</span>
              </button>
            ))
          ) : (
            <p className="at-muted">Nenhuma mensagem com esse atalho.</p>
          )}
        </div>
      ) : null}
      {error ? <p className="at-composer-error" role="alert">{error}</p> : null}
      <div className="at-composer-row">
        <button aria-label="Mensagens rápidas" className="at-icon-btn" onClick={() => setPickerOpen((open) => !open)} title="Mensagens rápidas (ou digite /)" type="button">
          <Zap aria-hidden="true" size={18} />
        </button>
        <textarea
          aria-label="Mensagem"
          onChange={(event) => {
            setText(event.target.value);
            setHighlight(0);
            if (pickerOpen && event.target.value) setPickerOpen(false);
          }}
          onKeyDown={onKeyDown}
          placeholder="Digite a mensagem… ( / para mensagens rápidas)"
          ref={input}
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          value={text}
        />
        <button aria-label="Enviar" className="at-send" disabled={!text.trim() || sending} onClick={() => void send()} type="button">
          <Send aria-hidden="true" size={18} />
        </button>
      </div>
      <label className="at-sign">
        <input
          checked={sign}
          onChange={(event) => {
            setSign(event.target.checked);
            window.localStorage.setItem(SIGN_KEY, event.target.checked ? "1" : "0");
          }}
          type="checkbox"
        />
        Assinar como <strong>{me.name.split(" ")[0]}</strong>
        <span className="at-muted"> — o cliente vê “*{me.name.split(" ")[0]}:*” antes do texto</span>
      </label>
    </div>
  );
}

/** Painel do cliente: resumo da IA e cadastro/orçamentos/pedidos do site com o mesmo WhatsApp. */
function CustomerPanel({
  conversation,
  customers,
  onCustomers,
}: {
  conversation: Conversation;
  customers: LinkedCustomer[] | null;
  onCustomers: (customers: LinkedCustomer[]) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(conversation.contactName);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const data = await api<{ customers: LinkedCustomer[] }>(`/api/atendimento/conversas/${conversation.id}/cliente`, { method: "POST", body: { name, email } });
      onCustomers(data.customers);
      setCreating(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível cadastrar.");
    } finally {
      setSaving(false);
    }
  }

  const brl = (cents: number | null) => (cents === null ? "Sob consulta" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

  return (
    <aside className="at-customer" aria-label="Cliente">
      <section className="at-card">
        <h3>Resumo da IA</h3>
        {conversation.summary ? <p className="at-summary">{conversation.summary}</p> : <p className="at-muted">A IA ainda não reuniu informações deste cliente.</p>}
      </section>

      <section className="at-card">
        <h3>Cadastro no site</h3>
        {customers === null ? <p className="at-muted">Procurando…</p> : null}
        {customers?.length === 0 && !creating ? (
          <>
            <p className="at-muted">Nenhum cliente com o WhatsApp {formatPhone(conversation.phone)}.</p>
            <button
              className="at-btn at-btn-block"
              onClick={() => {
                setName((current) => current || conversation.contactName);
                setCreating(true);
              }}
              type="button"
            >
              <UserPlus aria-hidden="true" size={16} /> Cadastrar cliente
            </button>
          </>
        ) : null}
        {creating ? (
          <form
            className="at-form"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label>
              Nome
              <input onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            <label>
              E-mail (opcional)
              <input onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
            </label>
            <p className="at-muted">WhatsApp: {formatPhone(conversation.phone)}</p>
            {error ? <p className="at-form-error" role="alert">{error}</p> : null}
            <div className="at-form-actions">
              <button className="at-btn" onClick={() => setCreating(false)} type="button">Cancelar</button>
              <button className="at-btn at-btn-primary" disabled={saving} type="submit">Cadastrar</button>
            </div>
          </form>
        ) : null}
        {customers?.map((customer) => (
          <div className="at-linked" key={customer.ref}>
            <Link className="at-linked-name" href={`/equipe/clientes/${encodeURIComponent(customer.ref)}`}>
              {customer.name}
            </Link>
            <p className="at-muted">
              {customer.kind === "conta" ? "Conta no site" : "Cadastrado pela equipe"}
              {customer.company ? ` · ${customer.company}` : ""}
            </p>
            {customer.history.length ? (
              <ul className="at-history">
                {customer.history.map((entry) => (
                  <li key={entry.id}>
                    <Link href={entry.href}>
                      {entry.kind === "quote" ? <FileText aria-hidden="true" size={14} /> : <ClipboardList aria-hidden="true" size={14} />}
                      <span className="at-history-code">{entry.code}</span>
                      <span className="at-history-status">{entry.statusLabel}</span>
                      <span className="at-history-value">{brl(entry.totalCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="at-muted">Sem orçamentos ou pedidos.</p>
            )}
          </div>
        ))}
      </section>

      <section className="at-card at-card-actions">
        <Link className="at-btn at-btn-orange at-btn-block" href="/equipe/orcamentos/novo">
          <FileText aria-hidden="true" size={16} /> Novo orçamento
        </Link>
        <Link className="at-btn at-btn-block" href="/equipe/pedidos/novo">
          <ClipboardList aria-hidden="true" size={16} /> Novo pedido
        </Link>
      </section>
    </aside>
  );
}
