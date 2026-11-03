"use client";

import "@/components/staff/quoteEditor.css";
import "@/components/staff/atendimento/atendimento.css";
import "@/components/staff/atendimento/atendimento-dark.css";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BarChart3, Bell, BellOff, Bot, BotOff, FlaskConical, LayoutGrid, MessagesSquare, Search, TriangleAlert, Zap } from "lucide-react";
import { ConversationView, isMine, matchesQuery } from "@/components/staff/atendimento/ConversationView";
import { ConversationsKanban } from "@/components/staff/atendimento/ConversationsKanban";
import { QuickRepliesDialog } from "@/components/staff/atendimento/QuickRepliesDialog";
import { ThemeToggle } from "@/components/staff/atendimento/theme";
import { AiEnabledContext } from "@/components/staff/atendimento/aiStatus";
import { ApiError, api, displayName, playChime, type Conversation, type QuickReply, type StaffUser } from "@/components/staff/atendimento/shared";
import type { ConversationStatus } from "@/lib/atendimento/types";

type View = "conversas" | "quadro";

const noSubscribe = () => () => undefined;

/** Notificação do computador (se o vendedor permitiu); clicar abre a conversa. */
function notifyDesktop(items: Array<{ conversation: Conversation; title: string }>, onOpen: (id: string) => void) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  for (const { conversation, title } of items) {
    const notification = new Notification(title, { body: conversation.lastMessagePreview || conversation.handoffReason || "", tag: `atendimento-${conversation.id}` });
    notification.onclick = () => {
      window.focus();
      onOpen(conversation.id);
    };
  }
}
const readPermission = (): NotificationPermission | "unsupported" => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);

/** Página Atendimento: lista de conversas (estilo WhatsApp Web) ou quadro Kanban, com avisos de "cliente pediu vendedor". */
export function AtendimentoApp({ me, initialView, initialConversation }: { me: StaffUser; initialView: View; initialConversation?: string }) {
  const [view, setView] = useState<View>(initialView);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversation ?? null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [editingReplies, setEditingReplies] = useState(false);
  const [search, setSearch] = useState("");
  const [aiOn, setAiOn] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  async function toggleAi() {
    const next = !aiOn;
    if (next && !window.confirm("Ligar a IA? Ela vai responder sozinha os clientes que estiverem em \"IA atendendo\".")) return;
    setAiBusy(true);
    try {
      setAiOn((await api<{ aiEnabled: boolean }>("/api/atendimento/config", { method: "PATCH", body: { aiEnabled: next } })).aiEnabled);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Não foi possível mudar a IA.");
    } finally {
      setAiBusy(false);
    }
  }
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const permission = useSyncExternalStore(noSubscribe, readPermission, () => "default" as const);
  const [askedPermission, setAskedPermission] = useState<NotificationPermission | null>(null);
  const alerts = askedPermission ?? permission;
  const waitingIds = useRef<Set<string> | null>(null);
  const unreadById = useRef<Map<string, number> | null>(null);
  const selectedRef = useRef<string | null>(selectedId);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const openFromAlert = useCallback((id: string) => {
    setView("conversas");
    setSelectedId(id);
  }, []);

  const applyList = useCallback((data: { conversations: Conversation[]; aiEnabled?: boolean }) => {
      setConversations(data.conversations);
      if (typeof data.aiEnabled === "boolean") setAiOn(data.aiEnabled);
      setError(null);
      setLoaded(true);

      // Aviso para o vendedor: cliente de uma conversa DELE escreveu (e ele não está com ela aberta na tela).
      const previousUnread = unreadById.current;
      unreadById.current = new Map(data.conversations.map((conversation) => [conversation.id, conversation.unread]));
      if (previousUnread) {
        const mineWithNews = data.conversations.filter(
          (conversation) =>
            isMine(conversation, me) &&
            conversation.unread > (previousUnread.get(conversation.id) ?? 0) &&
            (document.hidden || selectedRef.current !== conversation.id),
        );
        if (mineWithNews.length) {
          playChime();
          notifyDesktop(mineWithNews.map((conversation) => ({ conversation, title: `${displayName(conversation)} respondeu` })), openFromAlert);
        }
      }

      // Aviso: conversa que ENTROU agora em "Aguardando vendedor" (não avisa as que já estavam ao abrir a página).
      const waiting = data.conversations.filter((conversation) => conversation.status === "aguardando_vendedor");
      const previous = waitingIds.current;
      waitingIds.current = new Set(waiting.map((conversation) => conversation.id));
      if (previous) {
        const fresh = waiting.filter((conversation) => !previous.has(conversation.id));
        if (fresh.length) {
          playChime();
          notifyDesktop(fresh.map((conversation) => ({ conversation, title: `${displayName(conversation)} quer falar com um vendedor` })), openFromAlert);
        }
      }
  }, [me, openFromAlert]);



  const refresh = useCallback(
    () =>
      api<{ conversations: Conversation[]; aiEnabled: boolean }>("/api/atendimento/conversas")
        .then(applyList)
        .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Erro ao carregar as conversas.")),
    [applyList],
  );

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    api<{ quickReplies: QuickReply[] }>("/api/atendimento/respostas")
      .then((data) => setQuickReplies(data.quickReplies))
      .catch(() => undefined);
  }, []);

  // Título da aba com quantos clientes esperam vendedor.
  const waitingCount = conversations.filter((conversation) => conversation.status === "aguardando_vendedor").length;
  useEffect(() => {
    document.title = `${waitingCount ? `(${waitingCount}) ` : ""}Atendimento | Equipe Fare Foto`;
  }, [waitingCount]);

  const onConversationChanged = useCallback((updated: Conversation) => {
    setConversations((list) => list.map((conversation) => (conversation.id === updated.id ? updated : conversation)));
  }, []);
  const openReplies = useCallback(() => setEditingReplies(true), []);
  const closeReplies = useCallback(() => setEditingReplies(false), []);

  function changeView(next: View) {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "quadro") url.searchParams.set("visao", "quadro");
    else url.searchParams.delete("visao");
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  function open(id: string) {
    setSelectedId(id);
    changeView("conversas");
  }

  async function move(conversation: Conversation, target: ConversationStatus, force = false): Promise<void> {
    setBusyIds((ids) => new Set(ids).add(conversation.id));
    setConversations((list) => list.map((entry) => (entry.id === conversation.id ? { ...entry, status: target } : entry)));
    try {
      const data = await api<{ conversation: Conversation }>(`/api/atendimento/conversas/${conversation.id}`, { method: "PATCH", body: { action: "mover", status: target, force } });
      onConversationChanged(data.conversation);
    } catch (moveError) {
      if (moveError instanceof ApiError && moveError.code === "ASSIGNED_TO_OTHER" && window.confirm(`${moveError.detail || "Outro vendedor"} está atendendo este cliente. Assumir mesmo assim?`)) {
        setBusyIds((ids) => {
          const next = new Set(ids);
          next.delete(conversation.id);
          return next;
        });
        return move(conversation, target, true);
      }
      if (!(moveError instanceof ApiError && moveError.code === "ASSIGNED_TO_OTHER")) setError(moveError instanceof Error ? moveError.message : "Erro inesperado.");
      await refresh();
    } finally {
      setBusyIds((ids) => {
        const next = new Set(ids);
        next.delete(conversation.id);
        return next;
      });
    }
  }

  async function enableAlerts() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setAskedPermission(permission);
    if (permission === "granted") playChime();
  }

  return (
    <AiEnabledContext.Provider value={aiOn}>
    <div className={`kb-page container-shell at-page${view === "conversas" ? " at-page-inbox" : ""}`}>
      <div className="kb-toolbar at-toolbar">
        <h1 className="at-title">Atendimento</h1>
        <div aria-label="Visualização" className="kb-tabs" role="tablist">
          <button aria-selected={view === "conversas"} className={view === "conversas" ? "active" : undefined} onClick={() => changeView("conversas")} role="tab" type="button">
            <MessagesSquare aria-hidden="true" size={16} /> Conversas
            {waitingCount ? <span className="at-filter-count is-alert">{waitingCount}</span> : null}
          </button>
          <button aria-selected={view === "quadro"} className={view === "quadro" ? "active" : undefined} onClick={() => changeView("quadro")} role="tab" type="button">
            <LayoutGrid aria-hidden="true" size={16} /> Quadro
          </button>
        </div>
        <div className="kb-new-actions">
          <label className="kb-search">
            <Search aria-hidden="true" size={16} />
            <input aria-label="Pesquisar conversas" onChange={(event) => setSearch(event.target.value)} placeholder="Nome, telefone, etiqueta ou texto das mensagens" type="search" value={search} />
          </label>
          {alerts !== "granted" && alerts !== "unsupported" ? (
            <button className="at-btn at-toolbar-btn" onClick={() => void enableAlerts()} title="Avisar no computador quando um cliente pedir vendedor" type="button">
              {alerts === "denied" ? <BellOff aria-hidden="true" size={16} /> : <Bell aria-hidden="true" size={16} />}
              {alerts === "denied" ? "Avisos bloqueados" : "Ativar avisos"}
            </button>
          ) : null}
          <button
            aria-pressed={aiOn}
            className={`at-btn at-toolbar-btn at-ai-toggle${aiOn ? " is-on" : ""}`}
            disabled={aiBusy || me.role !== "admin"}
            onClick={() => void toggleAi()}
            title={me.role === "admin" ? (aiOn ? "A IA responde os clientes. Clique para desligar." : "Só vendedores respondem. Clique para ligar a IA.") : "Só administradores ligam ou desligam a IA."}
            type="button"
          >
            {aiOn ? <Bot aria-hidden="true" size={16} /> : <BotOff aria-hidden="true" size={16} />} IA {aiOn ? "ligada" : "desligada"}
          </button>
          <ThemeToggle />
          <button className="at-btn at-toolbar-btn" onClick={() => setEditingReplies(true)} type="button">
            <Zap aria-hidden="true" size={16} /> Mensagens rápidas
          </button>
          <a className="kb-new-quote" href="/equipe/atendimento/relatorio">
            <BarChart3 aria-hidden="true" size={16} /> Relatório
          </a>
          <a className="kb-new-quote" href="/equipe/atendimento/simulador" rel="noopener" target="_blank">
            <FlaskConical aria-hidden="true" size={16} /> Simulador
          </a>
        </div>
      </div>

      {error ? (
        <div className="backoffice-error" role="alert">
          <TriangleAlert aria-hidden="true" size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {!loaded ? (
        <p className="at-muted at-center">Carregando conversas…</p>
      ) : view === "conversas" ? (
        <ConversationView
          conversations={conversations}
          me={me}
          onConversationChanged={onConversationChanged}
          onOpenQuickReplies={openReplies}
          onSelect={setSelectedId}
          quickReplies={quickReplies}
          search={search}
          selectedId={selectedId}
        />
      ) : (
        <ConversationsKanban
          busyIds={busyIds}
          conversations={conversations.filter((conversation) => matchesQuery(conversation, search))}
          onMove={(conversation, target) => void move(conversation, target)}
          onOpen={open}
        />
      )}

      {editingReplies ? <QuickRepliesDialog onChanged={setQuickReplies} onClose={closeReplies} quickReplies={quickReplies} /> : null}
    </div>
    </AiEnabledContext.Provider>
  );
}
