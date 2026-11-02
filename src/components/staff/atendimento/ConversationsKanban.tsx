"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { Bot, UserRound } from "lucide-react";
import { KanbanBoard, KanbanColumn } from "@/components/backofficeShared";
import { CONVERSATION_STATUSES, CONVERSATION_STATUS_COLORS, CONVERSATION_STATUS_LABELS, isSellerStatus, type ConversationStatus } from "@/lib/atendimento/types";
import { displayName, formatPhone, initials, shortTime, waitingFor, type Conversation } from "@/components/staff/atendimento/shared";

const EMPTY: Record<ConversationStatus, string> = {
  ia: "Nenhum cliente com a IA agora.",
  aguardando_vendedor: "Ninguém esperando. 🎉",
  em_atendimento: "Arraste para cá para assumir.",
  aguardando_orcamento: "Conversas esperando o orçamento ficar pronto.",
  aguardando_cliente: "Conversas esperando resposta do cliente.",
  finalizada: "Arraste para cá para finalizar.",
};

/** Finalizadas ficam no quadro por 24 h (depois só na lista "Finalizadas"). */
const FINISHED_VISIBLE_MS = 24 * 60 * 60 * 1000;

/** Quadro das conversas: arrastar muda a etapa (assumir, devolver para IA, fila, finalizar). */
export function ConversationsKanban({
  conversations,
  busyIds,
  onMove,
  onOpen,
}: {
  conversations: Conversation[];
  busyIds: ReadonlySet<string>;
  onMove: (conversation: Conversation, target: ConversationStatus) => void;
  onOpen: (id: string) => void;
}) {
  const [now] = useState(() => Date.now());
  const visible = conversations.filter((conversation) => conversation.status !== "finalizada" || now - new Date(conversation.updatedAt).getTime() < FINISHED_VISIBLE_MS);
  return (
    <KanbanBoard
      canDrop={(cardId, column) => conversations.find((entry) => entry.id === cardId)?.status !== column}
      className="kb-board-6 at-board"
      onMove={(cardId, column) => {
        const conversation = conversations.find((entry) => entry.id === cardId);
        if (conversation && conversation.status !== column) onMove(conversation, column as ConversationStatus);
      }}
      renderOverlay={(cardId) => {
        const conversation = conversations.find((entry) => entry.id === cardId);
        return conversation ? <CardBody conversation={conversation} /> : null;
      }}
    >
      {CONVERSATION_STATUSES.map((status) => {
        const column = visible
          .filter((conversation) => conversation.status === status)
          // Na fila, quem espera há mais tempo fica em cima.
          .sort((a, b) => (status === "aguardando_vendedor" ? (a.waitingSince ?? "").localeCompare(b.waitingSince ?? "") : b.lastMessageAt.localeCompare(a.lastMessageAt)));
        return (
          <KanbanColumn color={CONVERSATION_STATUS_COLORS[status].dot} count={column.length} empty={EMPTY[status]} id={status} key={status} title={CONVERSATION_STATUS_LABELS[status]}>
            {column.map((conversation) => (
              <ConversationCard busy={busyIds.has(conversation.id)} conversation={conversation} key={conversation.id} onOpen={() => onOpen(conversation.id)} />
            ))}
          </KanbanColumn>
        );
      })}
    </KanbanBoard>
  );
}

function ConversationCard({ conversation, busy, onOpen }: { conversation: Conversation; busy: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: conversation.id, disabled: busy });
  return (
    <article
      {...attributes}
      {...listeners}
      aria-label={`${displayName(conversation)} — abrir conversa`}
      aria-roledescription="cartão arrastável"
      className={`kb-card at-card-kb${isDragging ? " is-ghosted" : ""}${busy ? " is-busy" : ""}${conversation.status === "aguardando_vendedor" ? " is-waiting" : ""}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter") onOpen();
        else listeners?.onKeyDown?.(event);
      }}
      ref={setNodeRef}
    >
      <CardBody conversation={conversation} />
    </article>
  );
}

function CardBody({ conversation }: { conversation: Conversation }) {
  const name = displayName(conversation);
  return (
    <>
      <div className="at-kb-head">
        <span aria-hidden="true" className="at-avatar at-avatar-sm">{initials(name)}</span>
        <div className="at-kb-name">
          <strong>{name}</strong>
          <span>{formatPhone(conversation.phone)}</span>
        </div>
        {conversation.unread ? <span className="at-unread">{conversation.unread}</span> : null}
      </div>
      <p className="at-kb-preview">
        {conversation.lastMessageAuthor === "ia" ? <Bot aria-label="IA" size={12} /> : conversation.lastMessageAuthor === "vendedor" ? <UserRound aria-label="Vendedor" size={12} /> : null}
        {conversation.lastMessagePreview || "Sem mensagens"}
      </p>
      {conversation.status === "aguardando_vendedor" && conversation.handoffReason ? <p className="at-kb-reason">{conversation.handoffReason}</p> : null}
      <div className="kb-card-meta">
        {conversation.channel === "simulador" ? <span className="at-sim-tag">Teste</span> : null}
        {isSellerStatus(conversation.status) && conversation.assignedStaffName ? <span className="at-kb-seller"><UserRound aria-hidden="true" size={12} /> {conversation.assignedStaffName.split(" ")[0]}</span> : null}
        <span className="kb-meta">
          {conversation.status === "aguardando_vendedor" && conversation.waitingSince ? `Esperando ${waitingFor(conversation.waitingSince)}` : shortTime(conversation.lastMessageAt)}
        </span>
      </div>
    </>
  );
}
