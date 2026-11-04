import type { Conversation, Message } from "@/lib/atendimento/types";

/**
 * "Cérebro" que responde o cliente quando a conversa está com a IA.
 * Hoje: IA SIMULADA (regras fixas, sem custo e sem rede) só para testar o painel.
 * Próxima etapa: trocar pela IA de verdade (Hermes) mantendo esta mesma assinatura.
 */
export type BrainInput = { conversation: Conversation; messages: Message[]; now?: Date };
export type BrainResult = {
  reply: string | null;
  /** Pedir vendedor: a conversa vai para "Em atendimento" (não lida). */
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
  "3x4": "A foto 3x4 sai em pacote de 6 fotos por R$ 30,00.",
  documentos: "Fazemos sim! Qual o tamanho da foto que você precisa?",
  horario: "A loja abre de segunda a sexta, das 9h às 18h, e aos sábados, das 9h às 13h. Fechamos aos domingos e feriados. Por aqui eu atendo 24h.",
  endereco: "Estamos na Rua do Rosário, 68, Centro, Jundiaí/SP.",
  revelacao: "Revelamos sim! Qual o tamanho das fotos?",
  brindes: "Legal! Para o orçamento de brindes, me conta: qual produto, a quantidade, para quando precisa e se já tem o logo?",
  grafica: "Para orçar seu impresso, preciso de: quantidade, medidas, data desejada e se você já tem a arte pronta.",
  preco: "Claro! É sobre fotos, gráfica ou brindes? Me conta o que você precisa que eu passo o valor ou monto o orçamento.",
  obrigado: "Por nada! Se precisar de mais alguma coisa, é só chamar por aqui.",
};

// ---------- Preço: pergunta o que falta (tamanho, quantidade) antes de informar ----------

const DOC_PRICES: Array<[RegExp, string]> = [
  [/3\s*x\s*4\b/, "A foto 3x4 sai em pacote de 6 fotos por R$ 30,00."],
  [/3[,.]5\s*x\s*4[,.]5/, "A foto 3,5x4,5 sai em pacote de 6 fotos por R$ 35,00."],
  [/5\s*x\s*5/, "A foto 5x5 sai em pacote de 4 fotos por R$ 35,00."],
  [/5\s*x\s*7/, "A foto 5x7 sai em pacote de 4 fotos por R$ 35,00."],
];
const ASK_DOC_SIZE = "Qual o tamanho da foto que você precisa?";

const DEV_SIZES: Array<[RegExp, string, "pequena" | "grande"]> = [
  [/10\s*x\s*15/, "10x15", "pequena"],
  [/9\s*x\s*12/, "9x12", "pequena"],
  [/13\s*x\s*18/, "13x18", "grande"],
  [/15\s*x\s*21/, "15x21", "grande"],
];
/** [até quantidade, pequena (9x12/10x15), grande (13x18/15x21)] — tabela pública aprovada. */
const DEV_TIERS: Array<[number, number, number]> = [
  [1, 6, 9], [9, 3.5, 7], [50, 3, 6], [100, 2.5, 5], [250, 1.8, 4.5], [500, 1.5, 4], [999, 1.3, 3.5], [Infinity, 1, 2.5],
];
const ASK_DEV_SIZE = "Qual o tamanho das fotos?";
const ASK_DEV_QTY = "Quantas fotos você quer revelar?";
const brl = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;

/** Quantidade de fotos no texto, ignorando os números do tamanho ("50 fotos 10x15" → 50). */
export function extractQuantity(text: string): number | null {
  const withoutSizes = fold(text).replace(/\d+([,.]\d+)?\s*x\s*\d+([,.]\d+)?/g, " ");
  const match = withoutSizes.match(/\b(\d{1,5})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Continua a conversa de preço: se a IA perguntou o tamanho/quantidade, usa a resposta;
 * só informa o valor quando já sabe o tamanho (e, na revelação, a quantidade).
 */
export function priceFlow(customerTexts: string[], lastAiText: string): string | null {
  const last = fold(customerTexts.at(-1) ?? "");
  const recent = customerTexts.slice(-3).map(fold).join(" \n ");
  const askedDoc = lastAiText.includes(ASK_DOC_SIZE) || /qual o tamanho da foto que voce precisa/.test(fold(lastAiText));
  const askedDev = lastAiText.includes(ASK_DEV_SIZE) || lastAiText.includes(ASK_DEV_QTY);
  const docIntent = /(visto|passaporte|documento|3\s*x\s*4|5\s*x\s*5|5\s*x\s*7|3[,.]5\s*x\s*4[,.]5)/.test(last);
  const devIntent = /(revela|10\s*x\s*15|9\s*x\s*12|13\s*x\s*18|15\s*x\s*21|imprimir (minhas )?fotos|impressao de fotos)/.test(last);

  if (docIntent || askedDoc) {
    const found = DOC_PRICES.find(([pattern]) => pattern.test(last));
    if (found) return found[1];
    if (docIntent || askedDoc) return askedDoc ? `Não entendi o tamanho. ${ASK_DOC_SIZE}` : null;
  }
  if (devIntent || askedDev) {
    const size = DEV_SIZES.find(([pattern]) => pattern.test(askedDev ? recent : last));
    const quantity = extractQuantity(askedDev ? recent : last);
    if (!size) return askedDev && lastAiText.includes(ASK_DEV_SIZE) ? `Não entendi o tamanho. ${ASK_DEV_SIZE}` : devIntent ? `Revelamos sim! ${ASK_DEV_SIZE}` : null;
    if (!quantity) return ASK_DEV_QTY;
    const tier = DEV_TIERS.find(([upTo]) => quantity <= upTo)!;
    const unit = size[2] === "pequena" ? tier[1] : tier[2];
    return `Na ${size[1]}, para ${quantity} ${quantity === 1 ? "foto" : "fotos"}, sai ${brl(unit)} cada.`;
  }
  return null;
}

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
      const pendingText = customerMessages.slice(0, -1).map((message) => message.body).reverse().find((body) => detectIntent(body) === pending);
      const answer = pending ? (priceFlow([pendingText ?? ""], "") ?? ANSWERS[pending]) : "Em que posso te ajudar?";
      return {
        reply: `Prazer, ${name}! ${answer}`,
        contactName: name,
        summary: buildSummary(name, pending ? INTEREST_LABEL[pending] : undefined, conversation.summary),
      };
    }
    if (!intent || intent === "saudacao") return { reply: `Desculpe, não entendi. ${ASK_NAME}` };
  }

  const summary = knownName ? buildSummary(knownName, intent ? INTEREST_LABEL[intent] : undefined, conversation.summary) : conversation.summary;
  // Preço de fotos: pergunta tamanho/quantidade antes; informa só o valor do que foi escolhido.
  const price = priceFlow(customerMessages.map((message) => message.body), aiMessages.at(-1)?.body ?? "");
  if (price) return { reply: price, summary };
  if (intent && intent !== "saudacao") return { reply: ANSWERS[intent], summary };
  if (intent === "saudacao") return { reply: `Olá${knownName ? `, ${knownName}` : ""}! Em que posso te ajudar?`, summary };
  return {
    reply: "Entendi. Para eu te ajudar melhor: é sobre fotos, gráfica ou brindes? Se preferir, é só pedir que eu chamo um vendedor.",
    summary,
  };
};
