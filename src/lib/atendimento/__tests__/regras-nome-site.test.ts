import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createConversation, getConversation, listMessages, runAtendimentoMigrations, setConversationCustomer } from "@/lib/atendimento/repository";
import { receiveCustomerMessage, runAi } from "@/lib/atendimento/service";
import { SITE_HELP_REPLY, SITE_ORDER_REPLY, simulatedBrain, statedName } from "@/lib/atendimento/simulatedBrain";
import { registeredNameFor } from "@/lib/atendimento/customer";
import { createRealBrain } from "@/lib/atendimento/hermesBrain";
import { parseInbound, receiveWhatsAppMessage } from "@/lib/atendimento/whatsapp";
import { createPanelCustomer, resolveCustomer } from "@/lib/customers/repository";

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  runAtendimentoMigrations(db);
});
const ana = { id: "staff-ana", name: "Ana Souza" };
const newConversation = () => createConversation(db, { channel: "simulador", phone: "(11) 98888-7777" });
const say = (id: string, text: string) => receiveCustomerMessage(db, id, text, simulatedBrain);
const lastAi = (id: string) => listMessages(db, id).filter((message) => message.author === "ia").at(-1)?.body;
/** Cadastro antigo, do tempo em que a mensagem recebida criava o cadastro com o nome do WhatsApp. */
const legacyAutoCustomer = (conversationId: string, name: string, phone: string) => {
  const created = createPanelCustomer(db, { name, phone }, { id: "atendimento-whatsapp", name: "Atendimento (WhatsApp)" });
  setConversationCustomer(db, conversationId, created.ref, created.name);
  return getConversation(db, conversationId);
};
const inbound = (externalId: string, phone: string, pushName: string) =>
  receiveWhatsAppMessage(db, parseInbound({ externalId, chatId: `${phone}@s.whatsapp.net`, phone, pushName, text: "oi" }));

describe("não pergunta o nome quando já sabe", () => {
  it("cliente disse o nome na primeira mensagem", async () => {
    const { id } = newConversation();
    await say(id, "Oi, aqui é a Maria, quero revelar fotos");
    expect(lastAi(id)).toBe("Olá, Maria! Sou o assistente virtual da Fare Foto. Revelamos sim! Qual o tamanho das fotos?");
    expect(getConversation(db, id).contactName).toBe("Maria");
  });

  it("número com cadastro: cumprimenta pelo nome do cadastro", async () => {
    const { id } = newConversation();
    const conversation = getConversation(db, id);
    const result = await simulatedBrain({
      conversation,
      registeredName: "Maria Souza",
      messages: [{ id: "m1", conversationId: id, seq: 1, author: "cliente", authorName: "", body: "oi", media: null, createdAt: new Date().toISOString() } as never],
    });
    expect(result.reply).toBe("Olá, Maria! Sou o assistente virtual da Fare Foto. Como posso ajudar?");
  });

  it("sem nome e sem cadastro continua perguntando", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    expect(lastAi(id)).toBe("Olá! Sou o assistente virtual da Fare Foto. Qual o seu nome?");
  });

  it("reconhece o nome dito no meio da frase", () => {
    expect(statedName("Boa tarde, meu nome é joana e queria fotos")).toBe("Joana");
    expect(statedName("sou a Pérola")).toBe("Pérola");
    expect(statedName("quero 20 fotos")).toBeNull();
  });

  it("cadastro feito pela equipe conta; sem cadastro ou cadastro antigo criado pelo nome do WhatsApp não", () => {
    createPanelCustomer(db, { name: "Maria Souza", phone: "(11) 98888-7777" }, ana);
    const withStaff = getConversation(db, inbound("W1", "5511988887777", "mary").conversationId);
    expect(registeredNameFor(db, withStaff)).toBe("Maria Souza");
    const none = getConversation(db, inbound("W2", "5511977776666", "euamobrecho").conversationId);
    expect(none.customerRef).toBeNull(); // mensagem recebida não cria mais cadastro sozinha
    expect(registeredNameFor(db, none)).toBeNull();
    const legacy = legacyAutoCustomer(none.id, "Euamobrecho", "(11) 97777-6666");
    expect(registeredNameFor(db, legacy)).toBeNull();
  });

  it("IA real recebe o nome do cadastro", async () => {
    createPanelCustomer(db, { name: "Maria Souza", phone: "(11) 98888-7777" }, ana);
    const { conversationId } = inbound("W3", "5511988887777", "mary");
    const bodies: Array<Record<string, unknown>> = [];
    const brain = createRealBrain({ url: "http://ia", token: "t" }, (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ reply: "Olá, Maria!", handoff: false, subject: "", name: "", profile: {} }));
    }) as unknown as typeof fetch);
    if (getConversation(db, conversationId).status === "ia") {
      await runAi(db, conversationId, brain, "IA");
      expect(bodies[0]?.registeredName).toBe("Maria Souza");
    } else {
      const result = await brain({ conversation: getConversation(db, conversationId), messages: listMessages(db, conversationId), registeredName: registeredNameFor(db, getConversation(db, conversationId)) });
      expect(result.reply).toBe("Olá, Maria!");
      expect(bodies[0]?.registeredName).toBe("Maria Souza");
    }
  });
});

describe("pré-cadastro com o nome dito à IA", () => {
  const ia = async (id: string, contactName: string) => runAi(db, id, async () => ({ reply: "Prazer!", contactName }), "IA");

  it("sem cadastro: cria o pré-cadastro com o nome que o cliente escreveu; depois passa a contar", async () => {
    const { conversationId } = inbound("P0", "5511977774444", "zezinho");
    expect(getConversation(db, conversationId).customerRef).toBeNull();
    await receiveCustomerMessage(db, conversationId, "sou a Paula", async () => ({ reply: null }));
    await ia(conversationId, "Paula");
    const conversation = getConversation(db, conversationId);
    expect(conversation.customerName).toBe("Paula");
    expect(registeredNameFor(db, conversation)).toBe("Paula");
    expect(resolveCustomer(db, conversation.customerRef!)).toMatchObject({ name: "Paula", createdBy: "Atendimento (IA)", phone: "(11) 97777-4444" });
  });

  it("troca o cadastro antigo automático (nome do WhatsApp) pelo nome que o cliente escreveu; depois passa a contar", async () => {
    const { conversationId } = inbound("P1", "5511977776666", "euamobrecho");
    legacyAutoCustomer(conversationId, "Euamobrecho", "(11) 97777-6666");
    expect(getConversation(db, conversationId).customerName).toBe("Euamobrecho");
    await receiveCustomerMessage(db, conversationId, "carla", async () => ({ reply: null }));
    await ia(conversationId, "Carla");
    const conversation = getConversation(db, conversationId);
    expect(conversation.customerName).toBe("Carla");
    expect(registeredNameFor(db, conversation)).toBe("Carla");
    const cadastro = resolveCustomer(db, conversation.customerRef!);
    expect(cadastro).toMatchObject({ name: "Carla", createdBy: "Atendimento (IA)" });
  });

  it("não usa nome que o cliente não escreveu (ex.: nome de exibição)", async () => {
    const { conversationId } = inbound("P2", "5511977775555", "Bia Store");
    await receiveCustomerMessage(db, conversationId, "quero fotos", async () => ({ reply: null }));
    await ia(conversationId, "Bia");
    expect(getConversation(db, conversationId).customerRef).toBeNull();
  });

  it("não mexe em cadastro da equipe nem no sobrenome já completado", async () => {
    createPanelCustomer(db, { name: "Maria Souza", phone: "(11) 98888-7777" }, ana);
    const { conversationId } = inbound("P3", "5511988887777", "mary");
    await receiveCustomerMessage(db, conversationId, "aqui é a Mari", async () => ({ reply: null }));
    await ia(conversationId, "Mari");
    expect(getConversation(db, conversationId).customerName).toBe("Maria Souza");
  });
});

describe("pedido pelo site", () => {
  it("orienta a enviar pelo site", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    await say(id, "Maria");
    await say(id, "como faço o pedido?");
    expect(lastAi(id)).toBe(SITE_ORDER_REPLY);
    expect(SITE_ORDER_REPLY).toContain("https://www.farefoto.com.br/produtos/revelacao-de-fotos");
    expect(getConversation(db, id).status).toBe("ia");
  });

  it("com dificuldade no site: pode mandar pelo WhatsApp e vai para o vendedor", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    await say(id, "Maria");
    await say(id, "não consegui enviar pelo site");
    expect(lastAi(id)).toBe("Sem problema! Pode enviar por aqui mesmo pelo WhatsApp, que um vendedor vai te atender.");
    expect(lastAi(id)).toBe(SITE_HELP_REPLY);
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("em_atendimento"); // pedido de vendedor vai para Em atendimento (regra do master)
    expect(conversation.handoffReason).toContain("dificuldade no site");
  });
});
