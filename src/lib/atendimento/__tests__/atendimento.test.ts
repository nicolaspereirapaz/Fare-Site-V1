import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AtendimentoError,
  assumeConversation,
  createConversation,
  deleteQuickReply,
  finishConversation,
  getConversation,
  listMessages,
  listQuickReplies,
  markConversationRead,
  moveConversation,
  returnToAi,
  runAtendimentoMigrations,
  saveQuickReply,
} from "@/lib/atendimento/repository";
import { receiveCustomerMessage, sendStaffMessage, signedText } from "@/lib/atendimento/service";
import { detectIntent, extractName, simulatedBrain, type Brain } from "@/lib/atendimento/simulatedBrain";

let db: DatabaseSync;
const ana = { id: "staff-ana", name: "Ana Souza" };
const bruno = { id: "staff-bruno", name: "Bruno Lima" };

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  runAtendimentoMigrations(db);
});

const newConversation = () => createConversation(db, { channel: "simulador", phone: "(11) 98888-7777" });
const say = (id: string, text: string, brain: Brain = simulatedBrain) => receiveCustomerMessage(db, id, text, brain);

describe("IA simulada", () => {
  it("pergunta o nome, guarda e responde o que o cliente já tinha pedido", async () => {
    const { id } = newConversation();
    await say(id, "quanto custa a foto 3x4?");
    let messages = listMessages(db, id);
    expect(messages.at(-1)?.body).toContain("Como posso te chamar?");

    await say(id, "Maria");
    messages = listMessages(db, id);
    expect(messages.at(-1)?.body).toMatch(/^Prazer, Maria! A foto 3x4 sai em pacote de 6 fotos por R\$ 30,00/);
    const conversation = getConversation(db, id);
    expect(conversation.contactName).toBe("Maria");
    expect(conversation.summary).toContain("Nome: Maria");
    expect(conversation.summary).toContain("Interesse: Foto 3x4");
    expect(conversation.status).toBe("ia");
  });

  it("pedido de vendedor manda a conversa para a fila", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    await say(id, "quero falar com um vendedor");
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("aguardando_vendedor");
    expect(conversation.waitingSince).not.toBeNull();
    expect(conversation.handoffReason).toContain("vendedor");
    expect(listMessages(db, id).some((message) => message.author === "sistema" && message.body.includes("A IA pediu um vendedor"))).toBe(true);
  });

  it("reconhece intenções e nomes", () => {
    expect(detectIntent("Qual o horário de vocês?")).toBe("horario");
    expect(detectIntent("preciso de foto pra passaporte")).toBe("documentos");
    expect(detectIntent("Quero 100 canecas")).toBe("brindes");
    expect(extractName("me chamo joão paulo")).toBe("João Paulo");
    expect(extractName("11 99999-0000")).toBeNull();
    expect(extractName("quanto custa a 3x4")).toBeNull();
  });
});

describe("vendedor e IA não respondem ao mesmo tempo", () => {
  it("depois de assumir, a IA fica calada", async () => {
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    let called = false;
    await say(id, "oi", async () => {
      called = true;
      return { reply: "não deveria" };
    });
    expect(called).toBe(false);
    expect(listMessages(db, id).filter((message) => message.author === "ia")).toHaveLength(0);
    expect(getConversation(db, id).unread).toBe(1);
  });

  it("resposta da IA é descartada se um vendedor assumiu enquanto ela pensava", async () => {
    const { id } = newConversation();
    await say(id, "oi", async () => {
      assumeConversation(db, id, ana);
      return { reply: "atrasada", handoff: { reason: "x" } };
    });
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("em_atendimento");
    expect(listMessages(db, id).some((message) => message.body === "atrasada")).toBe(false);
  });

  it("outro vendedor só assume com transferência explícita", () => {
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    expect(() => assumeConversation(db, id, bruno)).toThrowError(AtendimentoError);
    const moved = assumeConversation(db, id, bruno, { force: true });
    expect(moved.assignedStaffName).toBe("Bruno Lima");
    expect(listMessages(db, id).at(-1)?.body).toContain("no lugar de Ana Souza");
  });

  it("só quem assumiu responde; assinatura sai em negrito com o primeiro nome", () => {
    const { id } = newConversation();
    expect(() => sendStaffMessage(db, id, ana, "Olá", { sign: true })).toThrowError(/Assuma a conversa/);
    assumeConversation(db, id, ana);
    expect(() => sendStaffMessage(db, id, bruno, "Olá", { sign: true })).toThrowError(AtendimentoError);
    const signed = sendStaffMessage(db, id, ana, "Seu pedido está pronto", { sign: true });
    expect(signed.deliveredText).toBe("*Ana:*\nSeu pedido está pronto");
    expect(signed.body).toBe("Seu pedido está pronto");
    const plain = sendStaffMessage(db, id, ana, "Até logo", { sign: false });
    expect(plain.deliveredText).toBe("Até logo");
    expect(signedText("Carla", "x")).toBe("*Carla:*\nx");
  });

  it("devolver para a IA guarda o recado no resumo e a IA volta a responder", async () => {
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    returnToAi(db, id, ana, "Retirada combinada para amanhã");
    expect(getConversation(db, id).summary).toContain("Vendedor: Retirada combinada para amanhã");
    await say(id, "oi");
    expect(listMessages(db, id).at(-1)?.author).toBe("ia");
  });

  it("finalizada reabre com a IA quando o cliente volta a escrever", async () => {
    const { id } = newConversation();
    finishConversation(db, id, ana);
    await say(id, "oi de novo");
    expect(getConversation(db, id).status).toBe("ia");
  });

  it("arrastar no quadro vira a ação da coluna", () => {
    const { id } = newConversation();
    expect(moveConversation(db, id, "em_atendimento", ana).assignedStaffId).toBe(ana.id);
    expect(moveConversation(db, id, "aguardando_vendedor", ana).assignedStaffId).toBeNull();
    expect(moveConversation(db, id, "finalizada", ana).status).toBe("finalizada");
    expect(moveConversation(db, id, "ia", ana).status).toBe("ia");
  });

  it("lida zera o contador", async () => {
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    await say(id, "a");
    await say(id, "b");
    expect(getConversation(db, id).unread).toBe(2);
    markConversationRead(db, id);
    expect(getConversation(db, id).unread).toBe(0);
  });

  it("com a IA não acumula não lidas; ao pedir vendedor marca 1", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    await say(id, "Maria");
    expect(getConversation(db, id).unread).toBe(0);
    await say(id, "quero falar com um vendedor");
    expect(getConversation(db, id).unread).toBe(1);
  });
});

describe("mensagens rápidas", () => {
  it("vem com a lista inicial e não duplica ao migrar de novo", () => {
    const first = listQuickReplies(db).length;
    expect(first).toBeGreaterThan(5);
    runAtendimentoMigrations(db);
    expect(listQuickReplies(db)).toHaveLength(first);
  });

  it("cria, edita, impede atalho repetido e apaga", () => {
    const created = saveQuickReply(db, { shortcut: "/Pix ", title: "Pix", body: "Chave Pix: ..." });
    expect(created.shortcut).toBe("pix");
    expect(() => saveQuickReply(db, { shortcut: "pix", title: "Outro", body: "x" })).toThrowError(/já existe|Já existe/);
    const edited = saveQuickReply(db, { id: created.id, shortcut: "pix", title: "Pix da loja", body: "Chave nova" });
    expect(edited.title).toBe("Pix da loja");
    deleteQuickReply(db, created.id);
    expect(listQuickReplies(db).some((reply) => reply.shortcut === "pix")).toBe(false);
  });
});
