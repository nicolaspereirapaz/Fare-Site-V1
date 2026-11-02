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
import { receiveCustomerMessage, recordCustomerMessage, runAi, sendStaffMessage, signedText } from "@/lib/atendimento/service";
import { createRealBrain, realAiConfig, summaryFrom, toWhatsAppFormat } from "@/lib/atendimento/hermesBrain";
import { detectIntent, extractName, simulatedBrain, type Brain } from "@/lib/atendimento/simulatedBrain";
import { deliverToWhatsApp, parseInbound, receiveWhatsAppMessage, tokenMatches } from "@/lib/atendimento/whatsapp";

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
    expect(messages.at(-1)?.body).toContain("Qual o seu nome?");

    await say(id, "Maria");
    messages = listMessages(db, id);
    expect(messages.at(-1)?.body).toBe("Prazer, Maria! A foto 3x4 sai em pacote de 6 fotos por R$ 30,00.");
    const conversation = getConversation(db, id);
    expect(conversation.contactName).toBe("Maria");
    expect(conversation.summary).toContain("Nome: Maria");
    expect(conversation.summary).toContain("Interesse: Foto 3x4");
    expect(conversation.status).toBe("ia");
  });

  it("pergunta o tamanho antes de dar preço e informa só o valor escolhido", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    await say(id, "Maria");
    await say(id, "preciso de foto pra passaporte");
    expect(listMessages(db, id).at(-1)?.body).toBe("Fazemos sim! Qual o tamanho da foto que você precisa?");
    await say(id, "5x7");
    expect(listMessages(db, id).at(-1)?.body).toBe("A foto 5x7 sai em pacote de 4 fotos por R$ 35,00.");

    await say(id, "quero revelar umas fotos");
    expect(listMessages(db, id).at(-1)?.body).toBe("Revelamos sim! Qual o tamanho das fotos?");
    await say(id, "10x15");
    expect(listMessages(db, id).at(-1)?.body).toBe("Quantas fotos você quer revelar?");
    await say(id, "40");
    expect(listMessages(db, id).at(-1)?.body).toBe("Na 10x15, para 40 fotos, sai R$ 3,00 cada.");
  });

  it("nenhuma resposta despeja a tabela inteira", async () => {
    const { id } = newConversation();
    for (const text of ["oi", "Ana", "foto para documento", "quero revelar fotos"]) await say(id, text);
    expect(listMessages(db, id).filter((message) => message.author === "ia").every((message) => !message.body.includes("•"))).toBe(true);
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

describe("aguardando orçamento / aguardando cliente", () => {
  it("continua com o vendedor, a IA fica calada e só ele responde", async () => {
    const { id } = newConversation();
    const moved = moveConversation(db, id, "aguardando_orcamento", ana);
    expect(moved.status).toBe("aguardando_orcamento");
    expect(moved.assignedStaffName).toBe("Ana Souza");
    let called = false;
    await say(id, "e aí, o orçamento?", async () => {
      called = true;
      return { reply: "x" };
    });
    expect(called).toBe(false);
    expect(getConversation(db, id).status).toBe("aguardando_orcamento");
    expect(getConversation(db, id).unread).toBe(1);
    expect(sendStaffMessage(db, id, ana, "Já estou terminando", { sign: true }).deliveredText).toContain("*Ana:*");
    expect(() => sendStaffMessage(db, id, bruno, "Oi", { sign: true })).toThrowError(AtendimentoError);
  });

  it("cliente responde em Aguardando cliente: volta para Em atendimento com o mesmo vendedor", async () => {
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    moveConversation(db, id, "aguardando_cliente", ana);
    await say(id, "Pode fazer sim!");
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("em_atendimento");
    expect(conversation.assignedStaffId).toBe(ana.id);
    expect(listMessages(db, id).some((message) => message.body.includes("voltou para Em atendimento"))).toBe(true);
  });

  it("outro vendedor só muda a etapa de conversa alheia com confirmação", () => {
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    expect(() => moveConversation(db, id, "aguardando_cliente", bruno)).toThrowError(AtendimentoError);
    expect(moveConversation(db, id, "aguardando_cliente", bruno, { force: true }).assignedStaffName).toBe("Bruno Lima");
  });

  it("dono volta a conversa para Em atendimento sem pedir confirmação", () => {
    const { id } = newConversation();
    moveConversation(db, id, "aguardando_orcamento", ana);
    const back = moveConversation(db, id, "em_atendimento", ana);
    expect(back.status).toBe("em_atendimento");
    expect(listMessages(db, id).at(-1)?.body).toContain("voltou a conversa");
  });
});

describe("IA real (serviço do Hermes)", () => {
  const config = { url: "http://ia.local", token: "segredo" };
  const reply = (body: object, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("só liga com URL e token", () => {
    expect(realAiConfig({})).toBeNull();
    expect(realAiConfig({ FARE_IA_URL: "http://x/", FARE_IA_TOKEN: "t" })).toEqual({ url: "http://x", token: "t" });
  });

  it("manda histórico sem avisos internos, com token, e usa nome/resumo/handoff", async () => {
    let sent: { url: string; headers: Record<string, string>; body: { messages: Array<{ author: string }> } } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      sent = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ reply: "Vou chamar um vendedor.", handoff: true, subject: "Quer falar com vendedor", name: "Maria", profile: { interests: ["revelação"], last_request: "40 fotos 10x15" } }));
    }) as unknown as typeof fetch;
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    returnToAi(db, id, ana, "Retirada amanhã");
    await say(id, "quero falar com vendedor", createRealBrain(config, fetcher));
    expect(sent!.url).toBe("http://ia.local/responder");
    expect(sent!.headers["x-fare-token"]).toBe("segredo");
    expect(sent!.body.messages.every((message) => message.author !== "sistema")).toBe(true);
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("aguardando_vendedor");
    expect(conversation.handoffReason).toBe("Quer falar com vendedor");
    expect(conversation.contactName).toBe("Maria");
    expect(conversation.summary).toContain("Nome: Maria · Interesse: revelação");
    expect(conversation.summary).toContain("Pedido: 40 fotos 10x15");
    expect(conversation.summary).toContain("Vendedor: Retirada amanhã");
  });

  it("falha da IA chama a equipe em vez de deixar o cliente sem resposta", async () => {
    const { id } = newConversation();
    await say(id, "oi", createRealBrain(config, reply({ error: "MODELO" }, 502)));
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("aguardando_vendedor");
    expect(conversation.handoffReason).toContain("falha técnica");
    expect(listMessages(db, id).filter((message) => message.author === "ia")).toHaveLength(0);
  });

  it("converte markdown do modelo para o formato do WhatsApp", () => {
    expect(toWhatsAppFormat("Fica **R$ 3,00 por foto**.\n- brilho\n- fosco")).toBe("Fica *R$ 3,00 por foto*.\n• brilho\n• fosco");
  });

  it("resumo preserva o anterior quando a IA não traz novidade", () => {
    expect(summaryFrom({ name: "", profile: {} }, "Nome: Ana · Interesse: Brindes\nPedido: 100 canecas", "Ana")).toBe("Nome: Ana · Interesse: Brindes\nPedido: 100 canecas");
  });
});

describe("IA responde uma vez só", () => {
  it("duas mensagens seguidas enquanto a IA pensa geram UMA resposta, que vê as duas", async () => {
    const { id } = newConversation();
    let calls = 0;
    let release: () => void = () => undefined;
    const brain = async ({ messages }: { messages: Array<{ author: string; body: string }> }) => {
      calls += 1;
      if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
      return { reply: `vi ${messages.filter((message) => message.author === "cliente").length}` };
    };
    recordCustomerMessage(db, id, "oi");
    const first = runAi(db, id, brain);
    recordCustomerMessage(db, id, "tudo bem?");
    const second = runAi(db, id, brain);
    expect(await second).toEqual([]);
    release();
    await first;
    const ai = listMessages(db, id).filter((message) => message.author === "ia");
    expect(ai.map((message) => message.body)).toEqual(["vi 2"]);
  });
});

describe("WhatsApp pela ponte", () => {
  const bridge = { url: "http://ponte.local", token: "tk" };
  const inbound = (externalId: string, text: string, extra: Record<string, unknown> = {}) =>
    parseInbound({ externalId, chatId: "5511977776666@s.whatsapp.net", phone: "5511977776666", pushName: "Zé", text, ...extra });
  const fakeBridge = (status = 200) => {
    const sent: Array<{ url: string; token: string; body: { chatId: string; text: string } }> = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      sent.push({ url, token: (init.headers as Record<string, string>)["x-fare-token"], body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(status === 200 ? { messageId: `WA${sent.length}` } : { error: "Not connected to WhatsApp" }), { status });
    }) as unknown as typeof fetch;
    return { sent, fetcher };
  };

  it("valida a entrada e compara token", () => {
    expect(() => parseInbound({ externalId: "1", chatId: "123@g.us", phone: "5511977776666", text: "oi" })).toThrow(AtendimentoError);
    expect(() => parseInbound({ externalId: "1", chatId: "5511977776666@s.whatsapp.net", phone: "abc", text: "oi" })).toThrow(AtendimentoError);
    expect(tokenMatches("tk", "tk")).toBe(true);
    expect(tokenMatches("tx", "tk")).toBe(false);
    expect(tokenMatches(null, "tk")).toBe(false);
    expect(tokenMatches("tk", undefined)).toBe(false);
  });

  it("mesmo número cai na mesma conversa e mensagem repetida não duplica", () => {
    const first = receiveWhatsAppMessage(db, inbound("A1", "oi"));
    const again = receiveWhatsAppMessage(db, inbound("A1", "oi"));
    const second = receiveWhatsAppMessage(db, inbound("A2", "tudo bem?", { chatId: "999@lid" }));
    expect(again).toEqual({ conversationId: first.conversationId, duplicate: true });
    expect(second.conversationId).toBe(first.conversationId);
    const conversation = getConversation(db, first.conversationId);
    expect(conversation.channel).toBe("whatsapp");
    expect(conversation.waChatId).toBe("999@lid");
    expect(conversation.contactName).toBe("Zé");
    expect(listMessages(db, first.conversationId).map((message) => message.body)).toEqual(["oi", "tudo bem?"]);
  });

  it("resposta da IA e do vendedor saem pela ponte (assinada), e falha fica marcada para reenviar", async () => {
    const { conversationId: id } = receiveWhatsAppMessage(db, inbound("B1", "oi"));
    const ai = await runAi(db, id, async () => ({ reply: "Olá! Qual o seu nome?" }));
    const ok = fakeBridge();
    await deliverToWhatsApp(db, ai, bridge, ok.fetcher);
    expect(ok.sent).toEqual([{ url: "http://ponte.local/fare/painel/enviar", token: "tk", body: expect.objectContaining({ chatId: "5511977776666@s.whatsapp.net", text: "Olá! Qual o seu nome?" }) }]);
    expect(listMessages(db, id).at(-1)).toMatchObject({ delivery: "enviada", deliveryError: null });

    assumeConversation(db, id, ana);
    const staffMessage = sendStaffMessage(db, id, ana, "Oi, tudo bem?", { sign: true });
    const down = fakeBridge(503);
    await deliverToWhatsApp(db, [staffMessage], bridge, down.fetcher);
    expect(down.sent[0].body.text).toBe("*Ana:*\nOi, tudo bem?");
    expect(listMessages(db, id).at(-1)).toMatchObject({ delivery: "falhou", deliveryError: "Not connected to WhatsApp" });

    await deliverToWhatsApp(db, [staffMessage], bridge, ok.fetcher);
    expect(listMessages(db, id).at(-1)?.delivery).toBe("enviada");
    await deliverToWhatsApp(db, [staffMessage], bridge, ok.fetcher);
    expect(ok.sent).toHaveLength(2); // já enviada: não manda de novo
  });

  it("simulador nunca sai pelo WhatsApp", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    const ok = fakeBridge();
    await deliverToWhatsApp(db, listMessages(db, id), bridge, ok.fetcher);
    expect(ok.sent).toHaveLength(0);
  });
});

describe("mensagens rápidas", () => {
  it("inclui Pix com a chave CNPJ e a chave sozinha para copiar", () => {
    const replies = listQuickReplies(db);
    expect(replies.find((reply) => reply.shortcut === "pix")?.body).toContain("50.344.377/0001-36");
    expect(replies.find((reply) => reply.shortcut === "chavepix")?.body).toBe("50344377000136");
  });

  it("Pix entra uma vez mesmo em banco que já tinha a primeira lista, e não volta se apagado", () => {
    const fresh = new DatabaseSync(":memory:");
    runAtendimentoMigrations(fresh);
    const pix = listQuickReplies(fresh).find((reply) => reply.shortcut === "pix")!;
    deleteQuickReply(fresh, pix.id);
    runAtendimentoMigrations(fresh);
    expect(listQuickReplies(fresh).some((reply) => reply.shortcut === "pix")).toBe(false);
  });

  it("vem com a lista inicial e não duplica ao migrar de novo", () => {
    const first = listQuickReplies(db).length;
    expect(first).toBeGreaterThan(5);
    runAtendimentoMigrations(db);
    expect(listQuickReplies(db)).toHaveLength(first);
  });

  it("cria, edita, impede atalho repetido e apaga", () => {
    const created = saveQuickReply(db, { shortcut: "/Frete ", title: "Frete", body: "O frete depende do CEP." });
    expect(created.shortcut).toBe("frete");
    expect(() => saveQuickReply(db, { shortcut: "frete", title: "Outro", body: "x" })).toThrowError(/Já existe/);
    const edited = saveQuickReply(db, { id: created.id, shortcut: "frete", title: "Frete e entrega", body: "Me passa o CEP?" });
    expect(edited.title).toBe("Frete e entrega");
    deleteQuickReply(db, created.id);
    expect(listQuickReplies(db).some((reply) => reply.shortcut === "frete")).toBe(false);
  });
});
