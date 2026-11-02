/**
 * Atendimento (WhatsApp + IA + vendedores).
 * Cada conversa fica em UMA etapa do quadro; a IA só responde na etapa "ia".
 */
export const CONVERSATION_STATUSES = ["ia", "aguardando_vendedor", "em_atendimento", "aguardando_orcamento", "aguardando_cliente", "finalizada"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  ia: "IA atendendo",
  aguardando_vendedor: "Aguardando vendedor",
  em_atendimento: "Em atendimento",
  aguardando_orcamento: "Aguardando orçamento",
  aguardando_cliente: "Aguardando cliente",
  finalizada: "Finalizada",
};

/** Etapas em que a conversa é de um vendedor (a IA fica calada e só ele responde). */
export const SELLER_STATUSES = ["em_atendimento", "aguardando_orcamento", "aguardando_cliente"] as const satisfies readonly ConversationStatus[];
export const isSellerStatus = (status: ConversationStatus) => (SELLER_STATUSES as readonly string[]).includes(status);

/** Mesmas cores do quadro de pedidos (bolinha, fundo e texto da etiqueta). */
export const CONVERSATION_STATUS_COLORS: Record<ConversationStatus, { dot: string; bg: string; fg: string }> = {
  ia: { dot: "#8b93c4", bg: "#eff0f7", fg: "#1d2447" },
  aguardando_vendedor: { dot: "#d4532a", bg: "#f8e7df", fg: "#8f3416" },
  em_atendimento: { dot: "#167b55", bg: "#e3f3ea", fg: "#0f5a3e" },
  aguardando_orcamento: { dot: "#b7791f", bg: "#fbf0dc", fg: "#7a4f0d" },
  aguardando_cliente: { dot: "#2c3561", bg: "#e9ebf3", fg: "#1d2447" },
  finalizada: { dot: "#8e9196", bg: "#eeeff1", fg: "#3f4248" },
};

export const isConversationStatus = (value: unknown): value is ConversationStatus =>
  typeof value === "string" && (CONVERSATION_STATUSES as readonly string[]).includes(value);

/** simulador = conversa de teste criada no painel; whatsapp = cliente real (etapa futura). */
export type Channel = "simulador" | "whatsapp";

export type Conversation = {
  id: string;
  channel: Channel;
  phone: string;
  /** Conversa do WhatsApp: destino exato na ponte (ex.: 5511...@s.whatsapp.net ou ...@lid). */
  waChatId: string | null;
  contactName: string;
  status: ConversationStatus;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  /** Resumo que a IA mantém (nome, interesse, pendência). */
  summary: string;
  /** Motivo do pedido de vendedor (quando a IA passa a conversa). */
  handoffReason: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageAuthor: AuthorKind | null;
  /** Mensagens do cliente ainda não abertas pela equipe. */
  unread: number;
  /** Quando entrou em "Aguardando vendedor" (para mostrar há quanto tempo espera). */
  waitingSince: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthorKind = "cliente" | "ia" | "vendedor" | "sistema";

export type Message = {
  /** Sequência crescente: o painel pede só o que veio depois do último número que já tem. */
  seq: number;
  id: string;
  conversationId: string;
  author: AuthorKind;
  authorName: string;
  /** Texto escrito (sem assinatura). */
  body: string;
  /** Texto exatamente como o cliente recebe (com assinatura do vendedor, quando houver). */
  deliveredText: string;
  /** Só WhatsApp: "" (não se aplica), pendente, enviada ou falhou. */
  delivery: Delivery;
  deliveryError: string | null;
  createdAt: string;
};

export type Delivery = "" | "pendente" | "enviada" | "falhou";

export type QuickReply = {
  id: string;
  /** Atalho sem a barra: "pix" é usado digitando /pix. */
  shortcut: string;
  title: string;
  body: string;
  updatedAt: string;
};
