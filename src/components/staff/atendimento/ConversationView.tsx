"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Hand,
  Images,
  Inbox,
  Mic,
  Paperclip,
  MessageSquareText,
  Send,
  Reply,
  Search,
  Smartphone,
  StickyNote,
  Trash2,
  Undo2,
  UserPlus,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { MediaDialog } from "@/components/staff/atendimento/MediaDialog";
import { PhotoViewer } from "@/components/staff/atendimento/PhotoViewer";
import { TagChips, TagEditor } from "@/components/staff/atendimento/tags";
import { formatSeconds, useRecorder } from "@/components/staff/atendimento/recorder";
import { useAiEnabled } from "@/components/staff/atendimento/aiStatus";
import { ContactAvatar } from "@/components/staff/atendimento/ContactAvatar";
import { groupMessages } from "@/lib/atendimento/albums";
import { foldText, type MessageHit } from "@/lib/atendimento/search";
import { formatBytes, mediaUrl, MessageMediaView, uploadFile } from "@/components/staff/atendimento/media";
import {
  CONVERSATION_STATUSES,
  CONVERSATION_STATUS_COLORS,
  CONVERSATION_STATUS_LABELS,
  isSellerStatus,
  type ConversationStatus,
} from "@/lib/atendimento/types";
import { stripWhatsApp,
  ApiError,
  api,
  clockTime,
  displayName,
  formatPhone,
  shortTime,
  waitingFor,
  WhatsAppText,
  type Conversation,
  type LinkedCustomer,
  type Message,
  type QuickReply,
  type StaffUser,
} from "@/components/staff/atendimento/shared";

export type ListFilter = "todas" | "nao_lidas" | "minhas" | ConversationStatus;

const FILTERS: Array<{ id: ListFilter; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "nao_lidas", label: "Não lidas" },
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
  if (filter === "nao_lidas") return conversation.unread > 0;
  return conversation.status === filter;
}

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function matchesQuery(conversation: Conversation, query: string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold(`${conversation.contactName} ${conversation.phone} ${conversation.lastMessagePreview} ${conversation.assignedStaffName ?? ""} ${conversation.tags.join(" ")}`);
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
  // Busca dentro das mensagens (a partir de 3 letras), com pausa para não buscar a cada tecla.
  const query = search.trim();
  const [found, setFound] = useState<{ query: string; hits: MessageHit[] }>({ query: "", hits: [] });
  const [focus, setFocus] = useState<{ conversationId: string; messageId: string; at: number } | null>(null);
  useEffect(() => {
    if (query.length < 3) return;
    const timer = window.setTimeout(() => {
      api<{ hits: MessageHit[] }>(`/api/atendimento/busca?q=${encodeURIComponent(query)}`)
        .then((data) => setFound({ query, hits: data.hits }))
        .catch(() => setFound({ query, hits: [] }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);
  const hits = query.length >= 3 && found.query === query ? found.hits : [];
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
              {counts[id] ? <span className={`at-filter-count${id === "aguardando_vendedor" || id === "nao_lidas" ? " is-alert" : ""}`}>{counts[id]}</span> : null}
            </button>
          ))}
        </div>
        <div className="at-list-body">
          {visible.length === 0 && !hits.length ? (
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
                <ContactAvatar channel={conversation.channel} conversationId={conversation.id} name={displayName(conversation)} />
                <span className="at-item-main">
                  <span className="at-item-top">
                    <strong>{displayName(conversation)}</strong>
                    <span className="at-item-time">{shortTime(conversation.lastMessageAt, now)}</span>
                  </span>
                  <span className="at-item-preview">
                    {conversation.lastMessageAuthor === "ia" ? <Bot aria-label="IA" size={13} /> : conversation.lastMessageAuthor === "vendedor" ? <UserRound aria-label="Vendedor" size={13} /> : null}
                    {stripWhatsApp(conversation.lastMessagePreview) || "Sem mensagens"}
                  </span>
                  <span className="at-item-bottom">
                    <StatusChip assigned={conversation.assignedStaffName} status={conversation.status} />
                    {conversation.status === "aguardando_vendedor" && conversation.waitingSince ? <span className="at-wait">{waitingFor(conversation.waitingSince, now)}</span> : null}
                    {conversation.channel === "simulador" ? <span className="at-sim-tag">Teste</span> : null}
                    <TagChips small tags={conversation.tags} />
                    {conversation.unread ? <span className="at-unread" aria-label={`${conversation.unread} não lidas`}>{conversation.unread}</span> : null}
                  </span>
                </span>
              </button>
            ))
          )}
          {hits.length ? (
            <div className="at-hits">
              <p className="at-hits-title">Nas mensagens ({hits.length}{hits.length >= 30 ? "+" : ""})</p>
              {hits.map((hit) => (
                <button
                  className={`at-hit${focus?.messageId === hit.messageId ? " is-active" : ""}`}
                  key={hit.messageId}
                  onClick={() => {
                    onSelect(hit.conversationId);
                    setFocus({ conversationId: hit.conversationId, messageId: hit.messageId, at: Date.now() });
                  }}
                  type="button"
                >
                  <span className="at-item-top">
                    <strong>{hit.contactName || formatPhone(hit.phone)}</strong>
                    <span className="at-item-time">{shortTime(hit.createdAt, now)}</span>
                  </span>
                  <span className="at-hit-snippet">
                    {hit.author === "nota" ? <StickyNote aria-label="Nota interna" size={12} /> : null}
                    <Highlighted query={query} text={stripWhatsApp(hit.snippet)} />
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </aside>

      {selected ? (
        <ChatPanel
          conversation={selected}
          focus={focus && focus.conversationId === selected.id ? focus : null}
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
/** Rola até a mensagem e faz ela piscar (citação, busca). */
function jumpToMessage(id: string) {
  const element = document.getElementById(`msg-${id}`);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("is-flash");
  window.setTimeout(() => element.classList.remove("is-flash"), 1600);
}

/** Texto com as palavras procuradas marcadas. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const words = foldText(query).split(/\s+/).filter((word) => word.length >= 2);
  if (!words.length) return <>{text}</>;
  const folded = foldText(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const word of words) {
    for (let index = folded.indexOf(word); index >= 0; index = folded.indexOf(word, index + 1)) marks.fill(true, index, index + word.length);
  }
  const parts: Array<{ text: string; mark: boolean }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const last = parts[parts.length - 1];
    if (last && last.mark === marks[index]) last.text += text[index];
    else parts.push({ text: text[index], mark: marks[index] });
  }
  return <>{parts.map((part, index) => (part.mark ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}</>;
}

function ChatPanel({
  conversation,
  focus,
  me,
  quickReplies,
  onOpenQuickReplies,
  onChanged,
}: {
  conversation: Conversation;
  focus: { messageId: string; at: number } | null;
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
  const [aiThinking, setAiThinking] = useState(false);
  const aiOn = useAiEnabled();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const blocks = useMemo(() => groupMessages(messages), [messages]);
  const photos = useMemo(() => messages.filter((message) => message.media?.mime.startsWith("image/")), [messages]);
  const openPhoto = (id: string) => setViewerIndex(Math.max(0, photos.findIndex((photo) => photo.id === id)));
  const resend = (id: string) => void act("reenviar", { messageId: id });
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const lookup = (id: string) => byId.get(id);
  const jumpTo = jumpToMessage;
  // Veio da busca da lista: depois de carregar, vai até a mensagem encontrada.
  useEffect(() => {
    if (loading || !focus) return;
    const timer = window.setTimeout(() => jumpToMessage(focus.messageId), 80);
    return () => window.clearTimeout(timer);
  }, [loading, focus]);
  // Busca dentro desta conversa.
  const [finding, setFinding] = useState(false);
  const [findText, setFindText] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const findMatches = useMemo(() => {
    const words = foldText(findText).split(/\s+/).filter((word) => word.length >= 2);
    if (!words.length) return [] as Message[];
    return messages.filter((message) => message.author !== "sistema" && words.every((word) => foldText(`${message.body} ${message.transcript}`).includes(word))).reverse();
  }, [findText, messages]);
  const goToMatch = (index: number, list = findMatches) => {
    if (!list.length) return;
    const next = (index + list.length) % list.length;
    setFindIndex(next);
    jumpToMessage(list[next].id);
  };

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
        const data = await api<{
          conversation: Conversation;
          messages: Message[];
          customers?: LinkedCustomer[];
          aiThinking?: boolean;
          deliveries?: Array<Pick<Message, "id" | "delivery" | "deliveryError">>;
          transcripts?: Array<Pick<Message, "id" | "transcript" | "transcriptStatus">>;
        }>(
          `/api/atendimento/conversas/${conversation.id}?depois=${lastSeq.current}${first ? "" : "&clientes=0"}`,
        );
        if (!active) return;
        if (data.messages.length) {
          lastSeq.current = data.messages[data.messages.length - 1].seq;
          setMessages((list) => (first ? data.messages : [...list, ...data.messages]));
        }
        if (data.customers) setCustomers(data.customers);
        setAiThinking(Boolean(data.aiThinking));
        const deliveries = new Map((data.deliveries ?? []).map((entry) => [entry.id, entry]));
        if (deliveries.size) {
          setMessages((list) =>
            list.some((message) => deliveries.has(message.id) && deliveries.get(message.id)!.delivery !== message.delivery)
              ? list.map((message) => (deliveries.has(message.id) ? { ...message, ...deliveries.get(message.id)! } : message))
              : list,
          );
        }
        // Transcrição chega depois do áudio: atualiza o balão.
        const transcripts = new Map((data.transcripts ?? []).map((entry) => [entry.id, entry]));
        if (transcripts.size) {
          setMessages((list) =>
            list.some((message) => transcripts.has(message.id) && transcripts.get(message.id)!.transcriptStatus !== message.transcriptStatus)
              ? list.map((message) => (transcripts.has(message.id) ? { ...message, ...transcripts.get(message.id)! } : message))
              : list,
          );
        }
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

  async function act(action: "assumir" | "devolver" | "fila" | "finalizar" | "mover" | "reenviar", extra: Record<string, unknown> = {}) {
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

  // Citar só quem pode responder (quem assumiu a conversa).
  const quoteProps = { lookup, onJump: jumpTo, onReply: mine ? setReplyTo : undefined };

  return (
    <>
      <section className="at-chat" aria-label={`Conversa com ${displayName(conversation)}`}>
        <header className="at-chat-head">
          <ContactAvatar channel={conversation.channel} conversationId={conversation.id} name={displayName(conversation)} size="lg" />
          <div className="at-chat-title">
            <h2>{displayName(conversation)}</h2>
            <p>
              {formatPhone(conversation.phone)}
              {conversation.channel === "simulador" ? <span className="at-sim-tag">Teste</span> : null}
            </p>
            <TagEditor conversation={conversation} onChanged={onChanged} />
          </div>
          <StatusChip assigned={conversation.assignedStaffName} status={conversation.status} />
          <div className="at-chat-actions">
            <button aria-label="Procurar nesta conversa" aria-pressed={finding} className="at-btn at-btn-quiet" onClick={() => setFinding((open) => !open)} title="Procurar nesta conversa" type="button">
              <Search aria-hidden="true" size={16} />
            </button>
            <button className="at-btn at-btn-quiet" onClick={() => setMediaOpen(true)} title="Fotos e arquivos do contato (baixar em lote)" type="button">
              <Images aria-hidden="true" size={16} /> Mídias
            </button>
            <label className="at-stage">
              <span>Etapa</span>
              <select
                disabled={busy}
                onChange={(event) => void act("mover", { status: event.target.value })}
                value={conversation.status}
              >
                {CONVERSATION_STATUSES.map((status) => (
                  <option disabled={status === "ia" && !aiOn && conversation.status !== "ia"} key={status} value={status}>
                    {CONVERSATION_STATUS_LABELS[status]}
                    {status === "ia" && !aiOn ? " (desligada)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {!mine ? (
              <button className="at-btn at-btn-primary" disabled={busy} onClick={() => void act("assumir")} type="button">
                <Hand aria-hidden="true" size={16} /> Assumir
              </button>
            ) : null}
            {conversation.status !== "ia" && aiOn ? (
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

        {finding ? (
          <div className="at-find" role="search">
            <Search aria-hidden="true" size={15} />
            <input
              aria-label="Procurar nesta conversa"
              autoFocus
              onChange={(event) => {
                const value = event.target.value;
                setFindText(value);
                const words = foldText(value).split(/\s+/).filter((word) => word.length >= 2);
                const list = words.length ? messages.filter((message) => message.author !== "sistema" && words.every((word) => foldText(`${message.body} ${message.transcript}`).includes(word))).reverse() : [];
                goToMatch(0, list);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "ArrowDown") {
                  event.preventDefault();
                  goToMatch(findIndex + (event.shiftKey ? -1 : 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  goToMatch(findIndex - 1);
                }
                if (event.key === "Escape") setFinding(false);
              }}
              placeholder="Procurar nesta conversa…"
              value={findText}
            />
            <span className="at-muted">{findText.trim().length >= 2 ? (findMatches.length ? `${Math.min(findIndex + 1, findMatches.length)} de ${findMatches.length}` : "nada encontrado") : ""}</span>
            <button aria-label="Anterior (mais nova)" className="at-icon-btn" disabled={!findMatches.length} onClick={() => goToMatch(findIndex - 1)} type="button">
              <ChevronUp aria-hidden="true" size={16} />
            </button>
            <button aria-label="Próxima (mais antiga)" className="at-icon-btn" disabled={!findMatches.length} onClick={() => goToMatch(findIndex + 1)} type="button">
              <ChevronDown aria-hidden="true" size={16} />
            </button>
            <button aria-label="Fechar a busca" className="at-icon-btn" onClick={() => setFinding(false)} type="button">
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        ) : null}
        {mediaOpen ? <MediaDialog conversation={conversation} customers={customers} onClose={() => setMediaOpen(false)} /> : null}
        {viewerIndex !== null && photos.length ? (
          <PhotoViewer index={Math.min(viewerIndex, photos.length - 1)} onClose={() => setViewerIndex(null)} onIndex={setViewerIndex} photos={photos} />
        ) : null}
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
          {blocks.map((block) =>
            block.kind === "album" ? (
              <AlbumBubble key={block.messages[0].id} messages={block.messages} onOpenPhoto={openPhoto} onResend={resend} previous={block.previous} {...quoteProps} />
            ) : (
              <MessageBubble key={block.message.id} message={block.message} onOpenPhoto={openPhoto} onResend={resend} previous={block.previous} {...quoteProps} />
            ),
          )}
          {aiThinking ? <div className="at-bubble at-bubble-ia at-typing" aria-live="polite"><Bot aria-hidden="true" size={12} /> IA digitando…</div> : null}
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
            setReplyTo(null);
          }}
          onCancelReply={() => setReplyTo(null)}
          quickReplies={quickReplies}
          replyTo={replyTo}
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

function DeliveryMark({ message, onResend }: { message: Message; onResend: (id: string) => void }) {
  if (message.delivery === "pendente") return <span className="at-delivery">enviando… · </span>;
  if (message.delivery === "enviada") return <span className="at-delivery is-sent" title="Enviada no WhatsApp">✓ </span>;
  if (message.delivery === "falhou") {
    return (
      <span className="at-delivery is-failed" title={message.deliveryError ?? "Falha no envio"}>
        não enviada ·{" "}
        <button className="at-resend" onClick={() => onResend(message.id)} type="button">
          reenviar
        </button>{" "}
        ·{" "}
      </span>
    );
  }
  return null;
}

function dayLabelFor(message: Message, previous?: Message) {
  const day = new Date(message.createdAt).toDateString();
  const showDay = !previous || new Date(previous.createdAt).toDateString() !== day;
  return showDay ? new Date(message.createdAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" }) : null;
}

function AuthorLabel({ message }: { message: Message }) {
  const fromPhone = message.author === "vendedor" && message.authorName === "Celular";
  const label = message.author === "ia" ? "IA" : fromPhone ? "Celular (WhatsApp)" : message.author === "vendedor" ? message.authorName : null;
  if (!label) return null;
  return (
    <span className="at-bubble-author">
      {message.author === "ia" ? <Bot aria-hidden="true" size={12} /> : fromPhone ? <Smartphone aria-hidden="true" size={12} /> : <UserRound aria-hidden="true" size={12} />} {label}
    </span>
  );
}

type QuoteProps = { lookup: (id: string) => Message | undefined; onJump: (id: string) => void; onReply?: (message: Message) => void };

const MEDIA_SNIPPET: Record<string, string> = { imagem: "📷 Foto", video: "🎥 Vídeo", audio: "🎤 Áudio", documento: "📄 Documento", figurinha: "Figurinha" };
export const snippetOf = (message: Message) => stripWhatsApp(message.body) || (message.media ? MEDIA_SNIPPET[message.media.kind] : "") || "Mensagem";
const whoOf = (message: Message) => (message.author === "cliente" ? "Cliente" : message.author === "ia" ? "IA" : message.authorName || "Equipe");

/** Trecho da mensagem citada, dentro do balão (clicar leva até a original). */
function QuotedSnippet({ id, lookup, onJump }: { id: string | null } & Pick<QuoteProps, "lookup" | "onJump">) {
  if (!id) return null;
  const quoted = lookup(id);
  return (
    <button className="at-quote" disabled={!quoted} onClick={() => onJump(id)} title="Ir para a mensagem citada" type="button">
      <strong>{quoted ? whoOf(quoted) : "Mensagem"}</strong>
      <span>{quoted ? snippetOf(quoted) : "Mensagem antiga"}</span>
    </button>
  );
}

function ReplyButton({ message, onReply }: { message: Message; onReply?: (message: Message) => void }) {
  if (!onReply) return null;
  return (
    <button aria-label="Responder citando esta mensagem" className="at-reply-btn" onClick={() => onReply(message)} title="Responder citando" type="button">
      <Reply aria-hidden="true" size={14} />
    </button>
  );
}

/** Lote de fotos seguidas: mosaico 2×2; a 4ª mostra "+N"; clicar abre o visualizador. */
function AlbumBubble({
  messages,
  previous,
  onOpenPhoto,
  onResend,
  lookup,
  onJump,
  onReply,
}: { messages: Message[]; previous?: Message; onOpenPhoto: (id: string) => void; onResend: (id: string) => void } & QuoteProps) {
  const first = messages[0];
  const last = messages[messages.length - 1];
  const dayLabel = dayLabelFor(first, previous);
  const sameAuthor = previous && !dayLabel && previous.author === first.author && previous.authorName === first.authorName;
  const failed = messages.filter((message) => message.delivery === "falhou");
  const pending = messages.some((message) => message.delivery === "pendente");
  const allSent = messages.every((message) => message.delivery === "enviada");
  const extra = messages.length - 4;
  return (
    <>
      {dayLabel ? <div className="at-day">{dayLabel}</div> : null}
      <div className={`at-bubble at-bubble-${first.author} at-album${sameAuthor ? " is-grouped" : ""}`} id={`msg-${first.id}`}>
        <ReplyButton message={first} onReply={onReply} />
        {!sameAuthor ? <AuthorLabel message={first} /> : null}
        <QuotedSnippet id={first.replyToId} lookup={lookup} onJump={onJump} />
        <div className="at-album-grid">
          {messages.slice(0, 4).map((message, index) => (
            <button
              aria-label={index === 3 && extra > 0 ? `Ver as ${messages.length} fotos` : `Ver foto ${index + 1} de ${messages.length}`}
              className="at-album-tile"
              key={message.id}
              onClick={() => onOpenPhoto(message.id)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida pela API */}
              <img alt="" loading="lazy" src={mediaUrl(message.id, { mini: Boolean(message.media?.hasThumb) })} />
              {index === 3 && extra > 0 ? <span className="at-album-more">+{extra}</span> : null}
            </button>
          ))}
        </div>
        {first.body ? (
          <div className="at-bubble-text">
            <WhatsAppText text={first.body} />
          </div>
        ) : null}
        <span className="at-bubble-time">
          {messages.length} fotos ·{" "}
          {failed.length ? (
            <span className="at-delivery is-failed" title={failed[0].deliveryError ?? "Falha no envio"}>
              {failed.length} não enviada{failed.length > 1 ? "s" : ""} ·{" "}
              <button className="at-resend" onClick={() => failed.forEach((message) => onResend(message.id))} type="button">
                reenviar
              </button>{" "}
              ·{" "}
            </span>
          ) : pending ? (
            <span className="at-delivery">enviando… · </span>
          ) : allSent ? (
            <span className="at-delivery is-sent" title="Enviadas no WhatsApp">✓ </span>
          ) : null}
          {clockTime(last.createdAt)}
        </span>
      </div>
    </>
  );
}

function MessageBubble({
  message,
  previous,
  onResend,
  onOpenPhoto,
  lookup,
  onJump,
  onReply,
}: { message: Message; previous?: Message; onResend: (id: string) => void; onOpenPhoto: (id: string) => void } & QuoteProps) {
  const dayLabel = dayLabelFor(message, previous);
  const showDay = Boolean(dayLabel);
  if (message.author === "nota") {
    return (
      <>
        {dayLabel ? <div className="at-day">{dayLabel}</div> : null}
        <div className="at-note">
          <span className="at-note-head">
            <StickyNote aria-hidden="true" size={12} /> Nota interna · {message.authorName} · {clockTime(message.createdAt)}
          </span>
          <WhatsAppText text={message.body} />
        </div>
      </>
    );
  }
  if (message.author === "sistema") {
    return (
      <>
        {dayLabel ? <div className="at-day">{dayLabel}</div> : null}
        <div className="at-system">{message.body} · {clockTime(message.createdAt)}</div>
      </>
    );
  }
  const sameAuthor = previous && previous.author === message.author && previous.authorName === message.authorName && !showDay;
  return (
    <>
      {dayLabel ? <div className="at-day">{dayLabel}</div> : null}
      <div className={`at-bubble at-bubble-${message.author}${sameAuthor ? " is-grouped" : ""}`} id={`msg-${message.id}`}>
        <ReplyButton message={message} onReply={onReply} />
        {!sameAuthor ? <AuthorLabel message={message} /> : null}
        <QuotedSnippet id={message.replyToId} lookup={lookup} onJump={onJump} />
        <MessageMediaView message={message} onOpen={onOpenPhoto} />
        {message.body ? (
          <div className="at-bubble-text">
            <WhatsAppText text={message.body} />
          </div>
        ) : null}
        <span className="at-bubble-time">
          {message.author === "vendedor" && message.deliveredText !== message.body ? "assinada · " : ""}
          <DeliveryMark message={message} onResend={onResend} />
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
  replyTo,
  onCancelReply,
}: {
  conversation: Conversation;
  me: StaffUser;
  mine: boolean;
  quickReplies: QuickReply[];
  onAssume: () => void;
  onOpenQuickReplies: () => void;
  onSent: (message: Message, conversation: Conversation) => void;
  replyTo: Message | null;
  onCancelReply: () => void;
}) {
  const [text, setText] = useState("");
  // O Composer só aparece depois que a lista carrega no navegador, então dá para ler a preferência já no início.
  const [sign, setSign] = useState(() => typeof window === "undefined" || window.localStorage.getItem(SIGN_KEY) !== "0");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [original, setOriginal] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  // Nota interna: só a equipe vê (não vai ao cliente nem à IA). Quem não assumiu a conversa também pode anotar.
  const [noteMode, setNoteMode] = useState(false);
  // Mensagem rápida escolhida que tem anexo (vai junto, com o texto como legenda).
  const [quickMedia, setQuickMedia] = useState<QuickReply | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const recorder = useRecorder();
  const aiOn = useAiEnabled();

  /** Para a gravação e manda como mensagem de voz. */
  async function sendRecording() {
    const file = await recorder.stop(true);
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      const data = await uploadFile<{ message: Message; conversation: Conversation }>(`/api/atendimento/upload/conversas/${conversation.id}`, file, {
        "x-sign": "0",
        ...(replyTo ? { "x-reply-to": replyTo.id } : {}),
      });
      onSent(data.message, data.conversation);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Não foi possível enviar o áudio.");
    } finally {
      setSending(false);
    }
  }

  const addFiles = (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []).filter((file) => file.size > 0);
    if (picked.length) setFiles((current) => [...current, ...picked].slice(0, 50));
  };

  /** Fotos/arquivos um por um, na ordem; o texto digitado vai como legenda da primeira. */
  async function sendFiles() {
    if (!files.length || sending) return;
    setSending(true);
    setError(null);
    const caption = text.trim();
    let sent = 0;
    try {
      for (const file of files) {
        setProgress(`Enviando ${sent + 1} de ${files.length}…`);
        const data = await uploadFile<{ message: Message; conversation: Conversation }>(`/api/atendimento/upload/conversas/${conversation.id}`, file, {
          "x-caption": encodeURIComponent(sent === 0 ? caption : ""),
          "x-sign": sign ? "1" : "0",
          "x-original": original && file.type.startsWith("image/") ? "1" : "0",
          ...(sent === 0 && replyTo ? { "x-reply-to": replyTo.id } : {}),
        });
        sent += 1;
        onSent(data.message, data.conversation);
      }
      setFiles([]);
      setText("");
    } catch (sendError) {
      setFiles((current) => current.slice(sent));
      setError(`${sent ? `${sent} enviado(s). ` : ""}${sendError instanceof Error ? sendError.message : "Não foi possível enviar."}`);
    } finally {
      setProgress(null);
      setSending(false);
      input.current?.focus();
    }
  }

  const slash = text.match(/^\/(\S*)$/);
  const query = pickerOpen ? "" : slash?.[1]?.toLowerCase() ?? null;
  const showPicker = pickerOpen || query !== null;
  const options = showPicker
    ? quickReplies.filter((reply) => !query || reply.shortcut.includes(query) || fold(reply.title).includes(fold(query))).slice(0, 8)
    : [];

  function choose(reply: QuickReply) {
    setText(reply.body);
    setQuickMedia(reply.media ? reply : null);
    setPickerOpen(false);
    setHighlight(0);
    window.requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(reply.body.length, reply.body.length);
    });
  }

  async function send() {
    if (files.length && !noteMode) return sendFiles();
    const body = text.trim();
    if ((!body && !(quickMedia && !noteMode)) || sending) return;
    setSending(true);
    setError(null);
    try {
      const data = await api<{ message: Message; conversation: Conversation }>(`/api/atendimento/conversas/${conversation.id}/mensagens`, {
        method: "POST",
        body: noteMode ? { text: body, note: true } : { text: body, sign, replyTo: replyTo?.id, quickReplyId: quickMedia?.id },
      });
      setQuickMedia(null);
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

  if (!mine && !noteMode) {
    return (
      <div className="at-composer at-composer-locked">
        <p>
          {conversation.status === "ia" && !aiOn
            ? "A IA está desligada: quando o cliente escrever, a conversa vai para a fila de vendedores. Para escrever agora, assuma a conversa."
            : conversation.status === "ia"
            ? "A IA está respondendo este cliente. Para escrever, assuma a conversa — a IA para na hora."
            : isSellerStatus(conversation.status)
              ? `${conversation.assignedStaffName ?? "Outro vendedor"} está com esta conversa (${CONVERSATION_STATUS_LABELS[conversation.status]}).`
              : "Assuma a conversa para responder o cliente."}
        </p>
        <span className="at-order-actions">
          <button className="at-btn" onClick={() => setNoteMode(true)} title="Anotação só para a equipe" type="button">
            <StickyNote aria-hidden="true" size={16} /> Nota interna
          </button>
          <button className="at-btn at-btn-primary" onClick={onAssume} type="button">
            <Hand aria-hidden="true" size={16} /> Assumir conversa
          </button>
        </span>
      </div>
    );
  }

  return (
    <div
      className="at-composer"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        addFiles(event.dataTransfer.files);
      }}
    >
      {files.length && !noteMode ? (
        <div className="at-attach-tray">
          <div className="at-attach-head">
            <strong>{files.length} arquivo(s) para enviar</strong>
            <span className="at-muted">{formatBytes(files.reduce((sum, file) => sum + file.size, 0))} · o texto digitado vai como legenda da 1ª</span>
            <button className="at-btn at-btn-quiet" disabled={sending} onClick={() => setFiles([])} type="button">
              Cancelar
            </button>
          </div>
          <ul>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>{file.name}</span>
                <small>{formatBytes(file.size)}</small>
                <button aria-label={`Tirar ${file.name}`} disabled={sending} onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} type="button">
                  <X aria-hidden="true" size={14} />
                </button>
              </li>
            ))}
          </ul>
          {files.some((file) => file.type.startsWith("image/")) ? (
            <label className="at-check">
              <input checked={original} onChange={(event) => setOriginal(event.target.checked)} type="checkbox" /> Fotos em qualidade original (vão como documento, sem a compressão do WhatsApp)
            </label>
          ) : null}
          {progress ? <p className="at-muted" aria-live="polite">{progress}</p> : null}
        </div>
      ) : null}
      {quickMedia?.media && !noteMode ? (
        <div className="at-replying at-quick-attach">
          <Paperclip aria-hidden="true" size={15} />
          <span>
            <strong>Anexo da mensagem rápida /{quickMedia.shortcut}</strong>
            <small>{quickMedia.media.name} · o texto vai como legenda</small>
          </span>
          <button aria-label="Não enviar o anexo" onClick={() => setQuickMedia(null)} type="button">
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}
      {replyTo && !noteMode ? (
        <div className="at-replying">
          <Reply aria-hidden="true" size={15} />
          <span>
            <strong>Respondendo {replyTo.author === "cliente" ? "o cliente" : replyTo.author === "ia" ? "a IA" : replyTo.authorName}</strong>
            <small>{snippetOf(replyTo)}</small>
          </span>
          <button aria-label="Cancelar a citação" onClick={onCancelReply} type="button">
            <X aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}
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
                <strong>
                  {reply.title}
                  {reply.media ? <Paperclip aria-label="com anexo" className="at-picker-clip" size={12} /> : null}
                </strong>
                <span>{reply.body}</span>
              </button>
            ))
          ) : (
            <p className="at-muted">Nenhuma mensagem com esse atalho.</p>
          )}
        </div>
      ) : null}
      {error || recorder.error ? <p className="at-composer-error" role="alert">{error ?? recorder.error}</p> : null}
      {recorder.recording ? (
        <div className="at-composer-row at-recording" aria-live="polite">
          <span className="at-rec-dot" aria-hidden="true" />
          <span>
            Gravando <strong>{formatSeconds(recorder.seconds)}</strong> <small className="at-muted">(até 5 min)</small>
          </span>
          <button className="at-btn at-btn-quiet" onClick={() => void recorder.stop(false)} type="button">
            <Trash2 aria-hidden="true" size={16} /> Cancelar
          </button>
          <button aria-label="Enviar áudio" className="at-send" onClick={() => void sendRecording()} type="button">
            <Send aria-hidden="true" size={18} />
          </button>
        </div>
      ) : (
      <div className="at-composer-row">
        <button aria-label="Mensagens rápidas" className="at-icon-btn" onClick={() => setPickerOpen((open) => !open)} title="Mensagens rápidas (ou digite /)" type="button">
          <Zap aria-hidden="true" size={18} />
        </button>
        <button
          aria-label="Nota interna"
          aria-pressed={noteMode}
          className={`at-icon-btn${noteMode ? " is-note" : ""}`}
          onClick={() => setNoteMode((on) => !on)}
          title={noteMode ? "Voltar a responder o cliente" : "Nota interna (só a equipe vê)"}
          type="button"
        >
          <StickyNote aria-hidden="true" size={18} />
        </button>
        {!noteMode ? (
          <button aria-label="Enviar foto ou arquivo" className="at-icon-btn" onClick={() => filePicker.current?.click()} title="Enviar fotos ou arquivos (ou arraste/cole aqui)" type="button">
            <Paperclip aria-hidden="true" size={18} />
          </button>
        ) : null}
        <input
          hidden
          multiple
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
          ref={filePicker}
          type="file"
        />
        <textarea
          aria-label="Mensagem"
          onChange={(event) => {
            setText(event.target.value);
            setHighlight(0);
            if (pickerOpen && event.target.value) setPickerOpen(false);
          }}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              addFiles(event.clipboardData.files);
            }
          }}
          className={noteMode ? "at-note-mode" : undefined}
          placeholder={noteMode ? "Nota interna — só a equipe vê…" : files.length ? "Legenda (opcional)…" : "Digite a mensagem… ( / para mensagens rápidas)"}
          ref={input}
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          value={text}
        />
        {!noteMode && !text.trim() && !files.length && !quickMedia ? (
          <button aria-label="Gravar áudio" className="at-send at-mic" disabled={sending} onClick={() => void recorder.start()} title="Gravar áudio (vai como mensagem de voz)" type="button">
            <Mic aria-hidden="true" size={18} />
          </button>
        ) : (
          <button aria-label={noteMode ? "Salvar nota" : "Enviar"} className={`at-send${noteMode ? " is-note" : ""}`} disabled={(!text.trim() && !(quickMedia && !noteMode) && (!files.length || noteMode)) || sending} onClick={() => void send()} type="button">
            <Send aria-hidden="true" size={18} />
          </button>
        )}
      </div>
      )}
      {noteMode ? (
        <p className="at-sign at-note-hint">
          <StickyNote aria-hidden="true" size={13} /> Nota interna: fica só no painel. O cliente e a IA não veem.
          {!mine ? " Para responder o cliente, assuma a conversa." : null}
        </p>
      ) : (
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
      )}
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
