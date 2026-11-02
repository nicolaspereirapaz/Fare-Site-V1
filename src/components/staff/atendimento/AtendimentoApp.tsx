"use client";

import "@/components/staff/quoteEditor.css";
import "@/components/staff/atendimento/atendimento.css";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, FlaskConical, LayoutGrid, MessagesSquare, Search, TriangleAlert, Zap } from "lucide-react";
import { ConversationView } from "@/components/staff/atendimento/ConversationView";
import { ConversationsKanban } from "@/components/staff/atendimento/ConversationsKanban";
import { QuickRepliesDialog } from "@/components/staff/atendimento/QuickRepliesDialog";
import { ApiError, api, displayName, playChime, type Conversation, type QuickReply, type StaffUser } from "@/components/staff/atendimento/shared";
import type { ConversationStatus } from "@/lib/atendimento/types";

type View = "conversas" | "quadro";

const noSubscribe = () => () => undefined;
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
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const permission = useSyncExternalStore(noSubscribe, readPermission, () => "default" as const);
  const [askedPermission, setAskedPermission] = useState<NotificationPermission | null>(null);
  const alerts = askedPermission ?? permission;
  const waitingIds = useRef<Set<string> | null>(null);

  const applyList = useCallback((data: { conversations: Conversation[] }) => {
      setConversations(data.conversations);
      setError(null);
      setLoaded(true);

      // Aviso: conversa que ENTROU agora em "Aguardando vendedor" (não avisa as que já estavam ao abrir a página).
      const waiting = data.conversations.filter((conversation) => conversation.status === "aguardando_vendedor");
      const previous = waitingIds.current;
      waitingIds.current = new Set(waiting.map((conversation) => conversation.id));
      if (previous) {
        const fresh = waiting.filter((conversation) => !previous.has(conversation.id));
        if (fresh.length) {
          playChime();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            for (const conversation of fresh) {
              const notification = new Notification(`${displayName(conversation)} quer falar com um vendedor`, {
                body: conversation.lastMessagePreview || conversation.handoffReason || "",
                tag: `atendimento-${conversation.id}`,
              });
              notification.onclick = () => {
                window.focus();
                setView("conversas");
                setSelectedId(conversation.id);
              };
            }
          }
        }
      }
  }, []);

  const refresh = useCallback(
    () =>
      api<{ conversations: Conversation[] }>("/api/atendimento/conversas")
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
    <div className={`kb-page container-shell at-page${view === "conversas" ? " at-page-inbox" : ""}`}>
      <header className="kb-heading at-heading">
        <h1>Atendimento</h1>
        <p>{view === "conversas" ? "Converse com os clientes do WhatsApp. A IA atende primeiro e chama a equipe quando precisa." : "Cada cliente em uma etapa. Arraste o cartão para assumir, devolver para a IA ou finalizar."}</p>
      </header>

      <div className="kb-toolbar at-toolbar">
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
            <input aria-label="Pesquisar conversas" onChange={(event) => setSearch(event.target.value)} placeholder="Nome, telefone ou mensagem" type="search" value={search} />
          </label>
          {alerts !== "granted" && alerts !== "unsupported" ? (
            <button className="at-btn at-toolbar-btn" onClick={() => void enableAlerts()} title="Avisar no computador quando um cliente pedir vendedor" type="button">
              {alerts === "denied" ? <BellOff aria-hidden="true" size={16} /> : <Bell aria-hidden="true" size={16} />}
              {alerts === "denied" ? "Avisos bloqueados" : "Ativar avisos"}
            </button>
          ) : null}
          <button className="at-btn at-toolbar-btn" onClick={() => setEditingReplies(true)} type="button">
            <Zap aria-hidden="true" size={16} /> Mensagens rápidas
          </button>
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
          conversations={conversations.filter((conversation) => !search || `${conversation.contactName} ${conversation.phone} ${conversation.lastMessagePreview}`.toLowerCase().includes(search.toLowerCase()))}
          onMove={(conversation, target) => void move(conversation, target)}
          onOpen={open}
        />
      )}

      {editingReplies ? <QuickRepliesDialog onChanged={setQuickReplies} onClose={closeReplies} quickReplies={quickReplies} /> : null}
    </div>
  );
}
