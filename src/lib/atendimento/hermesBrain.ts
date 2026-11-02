import type { Brain, BrainResult } from "@/lib/atendimento/simulatedBrain";
import type { Message } from "@/lib/atendimento/types";

/**
 * IA REAL: o mesmo "cérebro" do bot do WhatsApp (regras, FAQ, horário e modelo da Fare Foto),
 * servido pelo Hermes no próprio PC (extensions/fare_atendimento/painel_ia.py). Sem ferramentas.
 * Configuração em .env.local: FARE_IA_URL e FARE_IA_TOKEN. Sem elas, o painel usa a IA de teste.
 */
export const REAL_AI_NAME = "IA";

type ServiceAnswer = {
  reply: string;
  handoff: boolean;
  subject: string;
  name: string;
  profile: { interests?: unknown; preferences?: unknown; last_request?: unknown };
};

export function realAiConfig(env: Record<string, string | undefined> = process.env) {
  const url = env.FARE_IA_URL?.trim().replace(/\/$/, "");
  const token = env.FARE_IA_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : []);

/** Resumo legível para o vendedor; mantém os recados da equipe ("Vendedor: ..."). */
export function summaryFrom(answer: Pick<ServiceAnswer, "name" | "profile">, previous: string, knownName: string) {
  const name = answer.name || knownName;
  const interests = list(answer.profile?.interests);
  const preferences = list(answer.profile?.preferences);
  const lastRequest = typeof answer.profile?.last_request === "string" ? answer.profile.last_request.trim() : "";
  const oldInterest = previous.match(/Interesse: ([^\n·]+)/)?.[1]?.trim();
  const oldRequest = previous.match(/^Pedido: (.+)$/m)?.[1]?.trim();
  const first = [name ? `Nome: ${name}` : "", interests.length ? `Interesse: ${interests.join(", ")}` : oldInterest ? `Interesse: ${oldInterest}` : ""].filter(Boolean).join(" · ");
  const lines = [
    first,
    preferences.length ? `Preferências: ${preferences.join(", ")}` : "",
    lastRequest || oldRequest ? `Pedido: ${lastRequest || oldRequest}` : "",
    ...previous.split("\n").filter((line) => line.startsWith("Vendedor:")),
  ];
  return lines.filter(Boolean).join("\n");
}

/** Markdown do modelo -> formatação do WhatsApp (**negrito** vira *negrito*; títulos e listas com "-" ficam simples). */
export function toWhatsAppFormat(text: string) {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
    .replace(/__([^_\n]+)__/g, "_$1_")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .trim();
}

const toServiceMessages = (messages: Message[]) =>
  messages
    .filter((message) => message.author !== "sistema")
    .map((message) => ({ author: message.author, text: message.body, name: message.author === "vendedor" ? message.authorName : undefined }));

export function createRealBrain(config: { url: string; token: string }, fetcher: typeof fetch = fetch): Brain {
  return async ({ conversation, messages }): Promise<BrainResult> => {
    let answer: ServiceAnswer;
    try {
      const response = await fetcher(`${config.url}/responder`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-fare-token": config.token },
        body: JSON.stringify({ messages: toServiceMessages(messages), summary: conversation.summary, contactName: conversation.contactName }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`IA respondeu ${response.status}`);
      answer = (await response.json()) as ServiceAnswer;
    } catch (error) {
      // Sem IA: não deixa o cliente sem resposta em silêncio — chama a equipe.
      console.error("[atendimento] IA real indisponível:", error instanceof Error ? error.message : error);
      return { reply: null, handoff: { reason: "A IA não conseguiu responder (falha técnica). Responda o cliente." } };
    }
    const reply = toWhatsAppFormat(answer.reply ?? "") || null;
    return {
      reply,
      handoff: answer.handoff ? { reason: answer.subject || "A IA pediu um vendedor." } : null,
      contactName: answer.name || undefined,
      summary: summaryFrom(answer, conversation.summary, conversation.contactName),
    };
  };
}
