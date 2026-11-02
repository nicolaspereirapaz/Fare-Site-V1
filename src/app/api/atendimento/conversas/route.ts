import { listConversations } from "@/lib/atendimento/repository";
import { atendimentoDb, json, withStaff } from "@/lib/atendimento/server";

export const dynamic = "force-dynamic";

/** Todas as conversas (todos os vendedores veem todas), mais recentes primeiro. */
export const GET = withStaff(() => json({ conversations: listConversations(atendimentoDb()) }));
