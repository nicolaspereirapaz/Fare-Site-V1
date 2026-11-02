import type { Conversation, Message } from "@/lib/atendimento/types";

/**
 * "Cérebro" que responde o cliente quando a conversa está com a IA.
 * Hoje: IA SIMULADA (regras fixas, sem custo e sem rede) só para testar o painel.
 * Próxima etapa: trocar pela IA de verdade (Hermes) mantendo esta mesma assinatura.
 */
export type BrainInput = { conversation: Conversation; messages: Message[]; now?: Date };
export type BrainResult = {
  reply: string | null;
  /** Pedir vendedor: a conversa vai para "Aguardando vendedor". */
  handoff?: { reason: string } | null;
  contactName?: string;
  summary?: string;
};
export type Brain = (input: BrainInput) => Promise<BrainResult>;

export const SIMULATED_AI_NAME = "IA de teste";

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Intent = "vendedor" | "documentos" | "3x4" | "horario" | "endereco" | "revelacao" | "brindes" | "grafica" | "preco" | "obrigado" | "saudacao" | null;

export function detectIntent(text: string): Intent {
  const t = fold(text);
  if (/\b(vendedor|vendedora|atendente|humano|pessoa de verdade|falar com alguem|falar com (uma )?pessoa)\b/.test(t)) return "vendedor";
  if (/3\s*x\s*4/.test(t)) return "3x4";
  if (/(visto|passaporte|documento|5\s*x\s*5|5\s*x\s*7)/.test(t)) return "documentos";
  if (/(horario|que horas|abre|fecha|funciona|aberto)/.test(t)) return "horario";
  if (/(endereco|onde fica|onde voces|localiza|como chego)/.test(t)) return "endereco";
  if (/(revela|10\s*x\s*15|9\s*x\s*12|13\s*x\s*18|imprimir (minhas )?fotos|impressao de fotos)/.test(t)) return "revelacao";
  if (/(brinde|caneca|caneta|garrafa|squeeze|agenda|caderno|mochila|kit)/.test(t)) return "brindes";
  if (/(cartao de visita|cartoes|panfleto|flyer|banner|lona|adesivo|convite|folder|grafica)/.test(t)) return "grafica";
  if (/(quanto custa|preco|valor|orcamento)/.test(t)) return "preco";
  if (/(obrigad|valeu|agradeco)/.test(t)) return "obrigado";
  if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa)\b/.test(t)) return "saudacao";
  return null;
}

const ANSWERS: Record<Exclude<Intent, null | "vendedor" | "saudacao">, string> = {
  "3x4": "A foto 3x4 sai em pacote de 6 fotos por R$ 30,00. Fazemos na hora, sem agendamento, durante o horário da loja.",
  documentos:
    "Fazemos fotos para documentos na hora, sem agendamento:\n• 3x4: 6 fotos por R$ 30,00\n• Visto americano 5x5: 4 fotos por R$ 35,00\n• Passaporte brasileiro 5x7: 4 fotos por R$ 35,00\n• Passaporte italiano 3,5x4,5: 6 fotos por R$ 35,00\nQual formato você precisa?",
  horario: "A loja abre de segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 13h. Fechamos aos domingos e feriados. Por aqui eu atendo 24h.",
  endereco: "Estamos na Rua do Rosário, 68, Centro, Jundiaí/SP.",
  revelacao:
    "Você pode enviar as fotos em qualidade original pelo site: https://www.farefoto.com.br/produtos/revelacao-de-fotos\nNa 10x15 ou 9x12, de 10 a 50 fotos sai R$ 3,00 cada (brilho ou fosco). Quantas fotos você quer revelar?",
  brindes: "Legal! Para o orçamento de brindes, me conta: qual produto, a quantidade, para quando precisa e se já tem o logo?",
  grafica: "Para orçar seu impresso, preciso de: quantidade, medidas, data desejada e se você já tem a arte pronta.",
  preco: "Claro! É sobre fotos, gráfica ou brindes? Me conta o que você precisa que eu passo o valor ou monto o orçamento.",
  obrigado: "Por nada! Se precisar de mais alguma coisa, é só chamar por aqui.",
};

const INTEREST_LABEL: Partial<Record<NonNullable<Intent>, string>> = {
  "3x4": "Foto 3x4",
  documentos: "Fotos para documentos",
  revelacao: "Revelação de fotos",
  brindes: "Brindes",
  grafica: "Gráfica",
};

/** Nome curto e sem números: "maria", "Sou o João Paulo" → "Maria", "João Paulo". */
export function extractName(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^(meu nome (e|é)|me chamo|sou o|sou a|sou|aqui (e|é) (o|a)?|eu sou (o|a)?)\s+/i, "")
    .replace(/[.!,]+$/g, "")
    .trim();
  if (!cleaned || /\d/.test(cleaned) || cleaned.split(/\s+/).length > 3 || cleaned.length > 40) return null;
  if (detectIntent(cleaned) && detectIntent(cleaned) !== "saudacao") return null;
  if (/^(oi|ola|olá|bom dia|boa tarde|boa noite)$/i.test(cleaned)) return null;
  return cleaned
    .split(/\s+/)
    .map((word) => (word.length > 2 ? word[0].toLocaleUpperCase("pt-BR") + word.slice(1).toLocaleLowerCase("pt-BR") : word.toLocaleLowerCase("pt-BR")))
    .join(" ");
}

const ASK_NAME = "Qual o seu nome?";

/** Resumo simples "Nome: X · Interesse: Y" mantido pela IA simulada. */
function buildSummary(name: string, interest: string | undefined, previous: string) {
  const oldInterest = previous.match(/Interesse: ([^\n·]+)/)?.[1]?.trim();
  const parts = [`Nome: ${name}`];
  const finalInterest = interest ?? oldInterest;
  if (finalInterest) parts.push(`Interesse: ${finalInterest}`);
  const notes = previous.split("\n").filter((line) => line.startsWith("Vendedor:"));
  return [parts.join(" · "), ...notes].join("\n");
}

/** IA SIMULADA: segue o roteiro aprovado (pergunta o nome, responde o FAQ, chama vendedor quando pedido). */
export const simulatedBrain: Brain = async ({ conversation, messages }) => {
  const customerMessages = messages.filter((message) => message.author === "cliente");
  const last = customerMessages.at(-1);
  if (!last) return { reply: null };
  const aiMessages = messages.filter((message) => message.author === "ia");
  const knownName = conversation.summary.match(/^Nome: ([^·\n]+)/)?.[1]?.trim() ?? null;
  const intent = detectIntent(last.body);

  if (intent === "vendedor") {
    const who = knownName ? `${knownName}, ` : "";
    return {
      reply: `Certo, ${who}já chamei um vendedor para continuar com você. Assim que alguém estiver livre, responde por aqui.`,
      handoff: { reason: "Cliente pediu para falar com um vendedor." },
      summary: knownName ? buildSummary(knownName, undefined, conversation.summary) : conversation.summary,
    };
  }

  // Primeira resposta: apresentação e pergunta do nome (abertura aprovada).
  if (!aiMessages.length) {
    return { reply: `Olá! Sou o assistente virtual da Fare Foto. ${ASK_NAME}` };
  }

  // Esperando o nome: a última mensagem da IA perguntou.
  if (!knownName && aiMessages.at(-1)?.body.includes(ASK_NAME)) {
    const name = extractName(last.body);
    if (name) {
      // Se o cliente já tinha dito o que queria antes do nome, responde agora.
      const pending = customerMessages
        .slice(0, -1)
        .map((message) => detectIntent(message.body))
        .find((found): found is keyof typeof ANSWERS => Boolean(found) && found !== "saudacao" && found !== "obrigado" && found !== "vendedor");
      const answer = pending ? ANSWERS[pending] : "Em que posso te ajudar?";
      return {
        reply: `Prazer, ${name}! ${answer}`,
        contactName: name,
        summary: buildSummary(name, pending ? INTEREST_LABEL[pending] : undefined, conversation.summary),
      };
    }
    if (!intent || intent === "saudacao") return { reply: `Desculpe, não entendi. ${ASK_NAME}` };
  }

  const summary = knownName ? buildSummary(knownName, intent ? INTEREST_LABEL[intent] : undefined, conversation.summary) : conversation.summary;
  if (intent && intent !== "saudacao") return { reply: ANSWERS[intent], summary };
  if (intent === "saudacao") return { reply: `Olá${knownName ? `, ${knownName}` : ""}! Em que posso te ajudar?`, summary };
  return {
    reply: "Entendi. Para eu te ajudar melhor: é sobre fotos, gráfica ou brindes? Se preferir, é só pedir que eu chamo um vendedor.",
    summary,
  };
};
