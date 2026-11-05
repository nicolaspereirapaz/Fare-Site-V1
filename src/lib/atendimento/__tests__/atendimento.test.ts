import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AtendimentoError,
  assumeConversation,
  createConversation,
  deleteQuickReply,
  finishConversation,
  getConversation,
  listMessages,
  knownTags,
  setTranscript,
  listContactMedia,
  listQuickReplies,
  setConversationTags,
  markAllConversationsRead,
  markConversationRead,
  markConversationUnread,
  moveConversation,
  returnToAi,
  runAtendimentoMigrations,
  saveQuickReply,
} from "@/lib/atendimento/repository";
import { addNote, queueIfAiOff, receiveCustomerMessage, recordCustomerMessage, runAi, sendStaffMessage, signedText } from "@/lib/atendimento/service";
import { aiEnabled, setAiEnabled } from "@/lib/atendimento/repository";
import { mkdtempSync, existsSync as fileExists, rmSync as removeDir } from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { createRealBrain, realAiConfig, summaryFrom, toWhatsAppFormat } from "@/lib/atendimento/hermesBrain";
import { detectIntent, extractName, simulatedBrain, type Brain } from "@/lib/atendimento/simulatedBrain";
import { deliverToWhatsApp, parseInbound, receiveWhatsAppMessage, tokenMatches } from "@/lib/atendimento/whatsapp";
import { acceptedMime, crc32, downloadOnlyMime, kindFromMime, mediaPath, mediaRetentionDays, pruneOldMedia, redoThumbs, safeFileName, saveMedia } from "@/lib/atendimento/media";
import { mediaZipPlan } from "@/lib/atendimento/mediaZip";
import { formatNumberList, parseNumberList } from "@/lib/atendimento/numberList";
import { groupMessages } from "@/lib/atendimento/albums";
import { searchMessages, snippetAround } from "@/lib/atendimento/search";
import { transcribeMessage, voiceConfig } from "@/lib/atendimento/transcribe";
import { startOfTodaySp, teamReport } from "@/lib/atendimento/report";
import { parseWhatsApp, stripWhatsApp } from "@/lib/atendimento/waFormat";
import { linkConversationCustomer } from "@/lib/atendimento/customer";
import { normalizeOutboundPhone, startWhatsAppConversation } from "@/lib/atendimento/whatsapp";
import { createPanelCustomer } from "@/lib/customers/repository";

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

  it("pedido de vendedor manda a conversa para Em atendimento", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    await say(id, "quero falar com um vendedor");
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("em_atendimento");
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

  it("qualquer pessoa da equipe responde; conversa com a IA vai para Em atendimento", () => {
    const { id } = newConversation();
    sendStaffMessage(db, id, ana, "Olá", { sign: true });
    expect(getConversation(db, id).status).toBe("em_atendimento");
    expect(sendStaffMessage(db, id, bruno, "Também estou aqui", { sign: true }).deliveredText).toBe("*Bruno:*\nTambém estou aqui");
    expect(listMessages(db, id).filter((message) => message.body.includes("entrou na conversa"))).toHaveLength(1);
  });

  it("responder conversa finalizada reabre em Em atendimento", () => {
    const { id } = newConversation();
    finishConversation(db, id, ana);
    sendStaffMessage(db, id, bruno, "Oi de novo", { sign: true });
    expect(getConversation(db, id).status).toBe("em_atendimento");
  });

  it("assinatura sai em negrito com o primeiro nome", () => {
    const { id } = newConversation();
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
    expect(moveConversation(db, id, "em_atendimento", ana).status).toBe("em_atendimento");
    expect(moveConversation(db, id, "aguardando_cliente", bruno).status).toBe("aguardando_cliente");
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
  it("a IA fica calada e qualquer pessoa da equipe responde", async () => {
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
    expect(sendStaffMessage(db, id, bruno, "Oi", { sign: true }).deliveredText).toContain("*Bruno:*");
    expect(getConversation(db, id).status).toBe("aguardando_orcamento");
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

  it("qualquer pessoa muda a etapa, sem confirmação", () => {
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    expect(moveConversation(db, id, "aguardando_cliente", bruno).status).toBe("aguardando_cliente");
    const back = moveConversation(db, id, "em_atendimento", ana);
    expect(back.status).toBe("em_atendimento");
    expect(listMessages(db, id).at(-1)?.body).toContain("moveu para Em atendimento");
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
    expect(conversation.status).toBe("em_atendimento");
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
    expect(conversation.status).toBe("em_atendimento");
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
    expect(again).toEqual({ conversationId: first.conversationId, duplicate: true, fromPhone: false });
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

  it("resposta digitada no celular entra como \"Celular\", para a IA e não é reenviada", async () => {
    const { conversationId: id } = receiveWhatsAppMessage(db, inbound("C1", "vocês abrem sábado?"));
    const phone = receiveWhatsAppMessage(db, inbound("C2", "Abrimos sim, até 13h.", { fromPhone: true }));
    expect(phone).toEqual({ conversationId: id, duplicate: false, fromPhone: true });
    const last = listMessages(db, id).filter((message) => message.author !== "sistema").at(-1);
    expect(last).toMatchObject({ author: "vendedor", authorName: "Celular", body: "Abrimos sim, até 13h.", delivery: "enviada" });
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("em_atendimento");
    expect(conversation.handoffReason).toBe("Respondido pelo celular");
    // IA não responde mais; e a mensagem do celular nunca volta para a ponte.
    expect(await runAi(db, id, async () => ({ reply: "não deveria" }))).toEqual([]);
    const ok = fakeBridge();
    await deliverToWhatsApp(db, listMessages(db, id), bridge, ok.fetcher);
    expect(ok.sent).toHaveLength(0);
  });

  it("eco do que o painel enviou (mesmo id) não entra de novo", async () => {
    const { conversationId: id } = receiveWhatsAppMessage(db, inbound("D1", "oi"));
    const ai = await runAi(db, id, async () => ({ reply: "Olá! Qual o seu nome?" }));
    await deliverToWhatsApp(db, ai, bridge, fakeBridge().fetcher); // ponte devolve messageId "WA1"
    expect(receiveWhatsAppMessage(db, inbound("WA1", "Olá! Qual o seu nome?", { fromPhone: true })).duplicate).toBe(true);
    expect(getConversation(db, id).status).toBe("ia");
  });

  it("vendedor já atendendo: resposta do celular entra sem mudar a etapa", () => {
    const { conversationId: id } = receiveWhatsAppMessage(db, inbound("E1", "oi"));
    assumeConversation(db, id, ana);
    receiveWhatsAppMessage(db, inbound("E2", "já te respondo", { fromPhone: true }));
    expect(getConversation(db, id)).toMatchObject({ status: "em_atendimento", assignedStaffId: ana.id });
  });

  it("simulador nunca sai pelo WhatsApp", async () => {
    const { id } = newConversation();
    await say(id, "oi");
    const ok = fakeBridge();
    await deliverToWhatsApp(db, listMessages(db, id), bridge, ok.fetcher);
    expect(ok.sent).toHaveLength(0);
  });
});

describe("mídias", () => {
  const photo = (name: string, extra: Partial<{ mime: string; kind: "imagem" | "documento" | "audio" }> = {}) => ({
    file: `x/${name}`,
    kind: extra.kind ?? ("imagem" as const),
    mime: extra.mime ?? "image/jpeg",
    name,
    size: 1000,
    hasThumb: true,
  });

  it("foto sem legenda vira mensagem, prévia \"📷 Foto\" e entra na lista do contato, numerada", () => {
    const first = receiveWhatsAppMessage(db, parseInbound({ externalId: "M1", chatId: "5511955554444@s.whatsapp.net", phone: "5511955554444", text: "" }, photo("a.jpg")));
    receiveWhatsAppMessage(db, parseInbound({ externalId: "M2", chatId: "5511955554444@s.whatsapp.net", phone: "5511955554444", text: "segue" }, photo("b.pdf", { mime: "application/pdf", kind: "documento" })));
    expect(() => parseInbound({ externalId: "M3", chatId: "5511955554444@s.whatsapp.net", phone: "5511955554444", text: "" })).toThrow(AtendimentoError);
    const conversation = getConversation(db, first.conversationId);
    expect(conversation.lastMessagePreview).toBe("segue");
    const media = listContactMedia(db, first.conversationId);
    expect(media.map((message) => [message.media?.name, message.body, message.mediaFile])).toEqual([
      ["a.jpg", "", "x/a.jpg"],
      ["b.pdf", "segue", "x/b.pdf"],
    ]);
    expect(listMessages(db, first.conversationId)[0].media).toEqual({ kind: "imagem", mime: "image/jpeg", name: "a.jpg", size: 1000, hasThumb: true });
  });

  it("plano do ZIP: números escolhidos, só fotos, só do cliente, nomes numerados sem repetir", () => {
    const at = (minute: number) => new Date(2026, 10, 2, 14, minute).toISOString();
    const item = (n: number, author: "cliente" | "vendedor", name: string, mime = "image/jpeg") =>
      ({ id: `m${n}`, author, createdAt: at(n), mediaFile: `c/${n}`, media: { kind: "imagem", mime, name, size: 1, hasThumb: false } }) as unknown as Parameters<typeof mediaZipPlan>[0][number];
    const all = [item(1, "cliente", "IMG.jpg"), item(2, "cliente", "IMG.jpg"), item(3, "vendedor", "orcamento.pdf", "application/pdf"), item(4, "cliente", "x.jpg"), item(5, "cliente", "y.jpg")];
    const plan = mediaZipPlan(all, { contactName: "Maria Souza", phone: "5511955554444" }, { numbers: parseNumberList("4-1", 5), onlyPhotos: false, onlyCustomer: false });
    expect(plan.entries.map((entry) => entry.name)).toEqual([
      "001 - 2026-11-02 14-01 - IMG.jpg",
      "002 - 2026-11-02 14-02 - IMG.jpg",
      "003 - 2026-11-02 14-03 - orcamento.pdf",
      "004 - 2026-11-02 14-04 - x.jpg",
    ]);
    expect(plan.zipName).toBe("midias-Maria-Souza-4444-1-4.zip");
    expect(mediaZipPlan(all, { contactName: "", phone: "5511955554444" }, { numbers: null, onlyPhotos: true, onlyCustomer: true }).entries.map((entry) => entry.file)).toEqual(["c/1", "c/2", "c/4", "c/5"]);
    const some = mediaZipPlan(all, { contactName: "Ana", phone: "5511955554444" }, { numbers: parseNumberList("1, 3-4", 5), onlyPhotos: false, onlyCustomer: false });
    expect(some.entries.map((entry) => entry.file)).toEqual(["c/1", "c/3", "c/4"]);
    expect(some.zipName).toBe("midias-Ana-4444-1_3-4.zip");
  });

  it("lista de números como na impressora", () => {
    expect([...parseNumberList("1-3, 8; 10 a 11 12", 20)]).toEqual([1, 2, 3, 8, 10, 11, 12]);
    expect([...parseNumberList("5 até 3, 2–2", 20)].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    expect([...parseNumberList("18-999999, 0, x, 7-", 20)]).toEqual([18, 19, 20]);
    expect(formatNumberList([8, 1, 2, 3, 5, 7])).toBe("1-3, 5, 7-8");
    expect(formatNumberList([])).toBe("");
  });

  it("CRC32 do ZIP e nomes de arquivo seguros", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(safeFileName("..\\..\\etc/pass:wd", "text/plain")).toBe("pass_wd");
    expect(safeFileName("", "image/jpeg")).toBe("arquivo.jpg");
    expect(safeFileName("Foto Final.JPG", "image/jpeg")).toBe("Foto Final.jpg");
  });
});

describe("álbum de fotos na conversa", () => {
  let n = 0;
  const msg = (author: "cliente" | "vendedor", minute: number, extra: { body?: string; mime?: string } = {}) =>
    ({
      seq: ++n,
      id: `m${n}`,
      conversationId: "c",
      author,
      authorName: author === "vendedor" ? "Ana" : "",
      body: extra.body ?? "",
      deliveredText: extra.body ?? "",
      delivery: "",
      deliveryError: null,
      media: extra.mime === "" ? null : { kind: "imagem", mime: extra.mime ?? "image/jpeg", name: "foto.jpg", size: 1, hasThumb: true },
      createdAt: new Date(2026, 10, 3, 10, minute).toISOString(),
    }) as Parameters<typeof groupMessages>[0][number];
  const shape = (blocks: ReturnType<typeof groupMessages>) => blocks.map((block) => (block.kind === "album" ? `album:${block.messages.length}` : "msg"));

  it("4+ fotos seguidas do mesmo autor viram um álbum; 3 continuam soltas", () => {
    expect(shape(groupMessages([msg("cliente", 0, { body: "oi", mime: "" }), msg("cliente", 1, { body: "essas" }), msg("cliente", 1), msg("cliente", 1), msg("cliente", 2), msg("cliente", 2)]))).toEqual(["msg", "album:5"]);
    expect(shape(groupMessages([msg("cliente", 0), msg("cliente", 0), msg("cliente", 0)]))).toEqual(["msg", "msg", "msg"]);
  });

  it("separa por autor, por legenda no meio, por PDF e por intervalo longo", () => {
    const blocks = groupMessages([
      ...[0, 0, 0, 0].map((m) => msg("cliente", m)),
      ...[1, 1, 1, 1].map((m) => msg("vendedor", m)),
      msg("cliente", 2), msg("cliente", 2), msg("cliente", 2, { body: "e essa" }), msg("cliente", 2), msg("cliente", 2),
      msg("cliente", 3, { mime: "application/pdf" }),
      msg("cliente", 4), msg("cliente", 4), msg("cliente", 20), msg("cliente", 20),
    ]);
    expect(shape(blocks)).toEqual(["album:4", "album:4", "msg", "msg", "msg", "msg", "msg", "msg", "msg", "msg", "msg", "msg"]);
    expect(blocks[1].previous?.author).toBe("cliente");
  });
});

describe("responder citando", () => {
  const chat = "5511933332222@s.whatsapp.net";
  const inboundMsg = (externalId: string, text: string, extra: Record<string, unknown> = {}) =>
    receiveWhatsAppMessage(db, parseInbound({ externalId, chatId: chat, phone: "5511933332222", text, ...extra }));

  it("cliente cita uma mensagem nossa: o painel liga as duas", async () => {
    const { conversationId: id } = inboundMsg("Q1", "oi");
    const [ai] = await runAi(db, id, async () => ({ reply: "Qual o tamanho?" }));
    await deliverToWhatsApp(db, [ai], { url: "http://p", token: "t" }, (async () => new Response(JSON.stringify({ messageId: "WA-AI-1" }))) as unknown as typeof fetch);
    inboundMsg("Q2", "10x15", { quotedId: "WA-AI-1" });
    expect(listMessages(db, id).at(-1)).toMatchObject({ body: "10x15", replyToId: ai.id });
    inboundMsg("Q3", "e essa?", { quotedId: "NAO-EXISTE" });
    expect(listMessages(db, id).at(-1)?.replyToId).toBeNull();
  });

  it("vendedor cita: a ponte recebe id, se foi nossa e o texto; mensagem de outro contato não é citada", async () => {
    const { conversationId: id } = inboundMsg("R1", "quero 20 fotos");
    const customerMessage = listMessages(db, id).at(-1)!;
    const other = newConversation();
    const foreign = addNote(db, other.id, ana, "outro contato");
    assumeConversation(db, id, ana);
    const reply = sendStaffMessage(db, id, ana, "Perfeito!", { sign: true, replyToId: customerMessage.id });
    const wrong = sendStaffMessage(db, id, ana, "teste", { sign: false, replyToId: foreign.id });
    expect([reply.replyToId, wrong.replyToId]).toEqual([customerMessage.id, null]);
    const bodies: Array<Record<string, unknown>> = [];
    await deliverToWhatsApp(db, [reply], { url: "http://p", token: "t" }, (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response("{}");
    }) as unknown as typeof fetch);
    expect(bodies[0].quote).toEqual({ id: "R1", fromMe: false, text: "quero 20 fotos" });
  });
});

describe("cadastro do site na conversa", () => {
  const inbound = (externalId: string, phone: string, pushName: string) =>
    receiveWhatsAppMessage(db, parseInbound({ externalId, chatId: `${phone}@s.whatsapp.net`, phone, pushName, text: "oi" }));

  it("número já cadastrado: usa o cadastro existente e o nome dele", () => {
    const maria = createPanelCustomer(db, { name: "Maria Souza", phone: "(11) 98888-7777" }, ana);
    const { conversationId } = inbound("W1", "5511988887777", "mary 🌸");
    const conversation = getConversation(db, conversationId);
    expect(conversation.customerRef).toBe(maria.ref);
    expect(conversation.customerName).toBe("Maria Souza");
    expect(conversation.contactName).toBe("Maria Souza");
  });

  it("sem cadastro: mensagem recebida não cria pré-cadastro (nem ao abrir a conversa)", () => {
    const { conversationId } = inbound("W2", "5511977776666", "euamobrecho");
    expect(getConversation(db, conversationId).customerRef).toBeNull();
    expect(linkConversationCustomer(db, conversationId).customerRef).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS n FROM fare_panel_customers").get()).toEqual({ n: 0 });
  });

  it("equipe abrindo pelo número com nome: cria o cadastro; sem nome, não inventa", () => {
    const { conversationId } = inbound("W4", "5511966665555", "");
    expect(linkConversationCustomer(db, conversationId, "", true).customerRef).toBeNull();
    expect(linkConversationCustomer(db, conversationId, "Joana", true).customerName).toBe("Joana");
  });
});

describe("nova conversa pelo número", () => {
  it("normaliza o número e não aceita número curto", () => {
    expect(normalizeOutboundPhone("(11) 98888-7777")).toBe("5511988887777");
    expect(normalizeOutboundPhone("+55 11 98888-7777")).toBe("5511988887777");
    expect(() => normalizeOutboundPhone("98888-7777")).toThrow(AtendimentoError);
  });

  it("confere na ponte, cria a conversa assumida por quem chamou e liga o cadastro", async () => {
    process.env.FARE_PONTE_URL = "http://ponte";
    process.env.FARE_PONTE_TOKEN = "t";
    try {
      let asked = "";
      const fetcher = (async (url: string, init: RequestInit) => {
        asked = `${url} ${String(init.body)}`;
        return new Response(JSON.stringify({ chatId: "5511955554444@s.whatsapp.net", phone: "5511955554444" }));
      }) as unknown as typeof fetch;
      const conversation = await startWhatsAppConversation(db, ana, { phone: "11 95555-4444", name: "Carla Dias" }, fetcher);
      expect(asked).toBe('http://ponte/fare/painel/numero {"phone":"5511955554444"}');
      expect(conversation).toMatchObject({ channel: "whatsapp", waChatId: "5511955554444@s.whatsapp.net", status: "em_atendimento", assignedStaffId: ana.id, contactName: "Carla Dias", customerName: "Carla Dias" });
      // Chamar de novo o mesmo número abre a mesma conversa.
      expect((await startWhatsAppConversation(db, ana, { phone: "5511955554444" }, fetcher)).id).toBe(conversation.id);

      const noWhatsApp = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
      await expect(startWhatsAppConversation(db, ana, { phone: "11 94444-3333" }, noWhatsApp)).rejects.toThrow("Esse número não tem WhatsApp.");
    } finally {
      delete process.env.FARE_PONTE_URL;
      delete process.env.FARE_PONTE_TOKEN;
    }
  });
});

describe("qualquer tipo de arquivo", () => {
  it("aceita todo tipo; só o que o WhatsApp mostra vai como foto/vídeo/áudio, o resto como documento", () => {
    for (const mime of ["application/x-msdownload", "application/vnd.rar", "image/vnd.adobe.photoshop", "application/octet-stream", "text/csv", "model/stl"]) expect(acceptedMime(mime)).toBe(true);
    expect(acceptedMime("")).toBe(false);
    expect(acceptedMime("nada")).toBe(false);
    expect(kindFromMime("image/jpeg")).toBe("imagem");
    expect(kindFromMime("image/heic")).toBe("documento");
    expect(kindFromMime("image/tiff")).toBe("documento");
    expect(kindFromMime("video/mp4")).toBe("video");
    expect(kindFromMime("video/x-matroska")).toBe("documento");
    expect(kindFromMime("audio/mpeg")).toBe("audio");
    expect(kindFromMime("audio/wav")).toBe("documento");
    expect(kindFromMime("application/zip")).toBe("documento");
  });

  it("página, SVG e script nunca abrem no site (só baixam)", () => {
    for (const mime of ["text/html", "image/svg+xml", "application/javascript", "application/xml"]) expect(downloadOnlyMime(mime)).toBe(true);
    for (const mime of ["image/jpeg", "application/pdf", "text/plain"]) expect(downloadOnlyMime(mime)).toBe(false);
  });
});

describe("formatação do WhatsApp", () => {
  it("aninha negrito e itálico (assinatura do celular) e respeita bordas de palavra", () => {
    expect(parseWhatsApp("*_Michelle:_* ")).toEqual([
      { type: "bold", children: [{ type: "italic", children: [{ type: "text", text: "Michelle:" }] }] },
      { type: "text", text: " " },
    ]);
    expect(parseWhatsApp("_Ana:_")).toEqual([{ type: "italic", children: [{ type: "text", text: "Ana:" }] }]);
    expect(parseWhatsApp("arquivo_final_2.jpg e 2*3*4")).toEqual([{ type: "text", text: "arquivo_final_2.jpg e 2*3*4" }]);
    expect(parseWhatsApp("~R$ 5~ agora *R$ 3*")).toEqual([
      { type: "strike", children: [{ type: "text", text: "R$ 5" }] },
      { type: "text", text: " agora " },
      { type: "bold", children: [{ type: "text", text: "R$ 3" }] },
    ]);
    expect(parseWhatsApp("veja https://farefoto.com.br/_x_ ok")[1]).toEqual({ type: "link", href: "https://farefoto.com.br/_x_" });
    expect(stripWhatsApp("*_Michelle:_* \nessa vai dar margem")).toBe("Michelle: \nessa vai dar margem");
  });
});

describe("IA ligada/desligada", () => {
  it("começa desligada; cliente escreve -> Em atendimento, sem resposta automática", () => {
    expect(aiEnabled(db)).toBe(false);
    const { id } = newConversation();
    recordCustomerMessage(db, id, "oi, tem foto 3x4?");
    expect(queueIfAiOff(db, id)).toBe(true);
    const conversation = getConversation(db, id);
    expect(conversation.status).toBe("em_atendimento");
    expect(conversation.handoffReason).toBe("Cliente escreveu (IA desligada)");
    expect(listMessages(db, id).filter((message) => message.author === "ia")).toHaveLength(0);
    expect(listMessages(db, id).at(-1)?.body).toBe("IA desligada: a conversa foi para Em atendimento.");
    // Outra mensagem: continua em Em atendimento, sem aviso repetido.
    recordCustomerMessage(db, id, "alô?");
    queueIfAiOff(db, id);
    expect(listMessages(db, id).filter((message) => message.author === "sistema")).toHaveLength(1);
  });

  it("ligada: quem chamou roda a IA normalmente", () => {
    setAiEnabled(db, true);
    expect(aiEnabled(db)).toBe(true);
    const { id } = newConversation();
    recordCustomerMessage(db, id, "oi");
    expect(queueIfAiOff(db, id)).toBe(false);
    expect(getConversation(db, id).status).toBe("ia");
    setAiEnabled(db, false);
    expect(aiEnabled(db)).toBe(false);
  });
});

describe("limpeza das mídias", () => {
  it("apaga o original com mais de 90 dias e mantém a miniatura; o recente fica", async () => {
    const dir = mkdtempSync(nodePath.join(os.tmpdir(), "atd-midias-"));
    process.env.FARE_ATENDIMENTO_MEDIA_DIR = dir;
    try {
      expect(mediaRetentionDays({} as NodeJS.ProcessEnv)).toBe(90);
      expect(mediaRetentionDays({ FARE_MIDIAS_DIAS: "0" } as unknown as NodeJS.ProcessEnv)).toBe(0);
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      const { id } = newConversation();
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
      const oldMedia = { ...(await saveMedia(png, { conversationId: id, name: "antiga.png", mime: "image/png" })), hasThumb: true };
      const old = recordCustomerMessage(db, id, "", oldMedia);
      vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
      const newMedia = { ...(await saveMedia(png, { conversationId: id, name: "nova.png", mime: "image/png" })), hasThumb: true };
      const fresh = recordCustomerMessage(db, id, "", newMedia);
      vi.useRealTimers();

      const result = await pruneOldMedia(db, 90, new Date("2026-11-03T12:00:00Z"));
      expect(result.pruned).toBe(1);
      expect(fileExists(mediaPath(oldMedia.file))).toBe(false);
      expect(fileExists(mediaPath(oldMedia.file, true))).toBe(true); // miniatura fica
      expect(fileExists(mediaPath(newMedia.file))).toBe(true);
      const messages = listMessages(db, id);
      expect(messages.find((message) => message.id === old.id)?.media?.pruned).toBe(true);
      expect(messages.find((message) => message.id === fresh.id)?.media?.pruned).toBeUndefined();
      // Rodar de novo não apaga mais nada.
      expect((await pruneOldMedia(db, 90, new Date("2026-11-03T12:00:00Z"))).pruned).toBe(0);
    } finally {
      vi.useRealTimers();
      delete process.env.FARE_ATENDIMENTO_MEDIA_DIR;
      removeDir(dir, { recursive: true, force: true });
    }
  });
});

describe("miniatura no formato da foto", () => {
  it("foto deitada fica deitada, em pé fica em pé; miniaturas antigas quadradas são refeitas", async () => {
    const { default: sharp } = await import("sharp");
    const photo = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#888" } }).png().toBuffer();
    const { id } = newConversation();
    const wide = await saveMedia(await photo(800, 400), { conversationId: id, name: "deitada.png", mime: "image/png" });
    const tall = await saveMedia(await photo(300, 900), { conversationId: id, name: "em-pe.png", mime: "image/png" });
    const size = async (file: string) => sharp(mediaPath(file, true)).metadata().then(({ width, height }) => [width, height]);
    expect(await size(wide.file)).toEqual([480, 240]);
    expect(await size(tall.file)).toEqual([160, 480]);
    await sharp(await photo(320, 320)).jpeg().toFile(mediaPath(tall.file, true)); // como as antigas
    expect(await redoThumbs([tall.file, "nao/existe.png"])).toBe(1);
    expect(await size(tall.file)).toEqual([160, 480]);
  });
});

describe("relatório da equipe", () => {
  afterEach(() => vi.useRealTimers());
  const at = (minutes: number) => vi.setSystemTime(new Date(Date.UTC(2026, 10, 3, 13, 0) + minutes * 60_000));

  it("volume, resolvidas pela IA, espera até o vendedor, por vendedor, esperas longas e horários", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    // 1) Resolvida só pela IA.
    const a = createConversation(db, { channel: "simulador", phone: "11900000001", contactName: "Ana Cliente" });
    await say(a.id, "oi");
    // 2) IA pede vendedor; Ana (equipe) responde em 4 min e finaliza.
    at(1);
    const b = createConversation(db, { channel: "simulador", phone: "11900000002", contactName: "Bia" });
    await say(b.id, "quero falar com vendedor");
    expect(getConversation(db, b.id).status).toBe("em_atendimento");
    at(5);
    assumeConversation(db, b.id, ana);
    sendStaffMessage(db, b.id, ana, "Oi Bia!", { sign: true });
    finishConversation(db, b.id, ana);
    // 3) Pede vendedor e Bruno só responde 25 min depois.
    at(10);
    const c = createConversation(db, { channel: "simulador", phone: "11900000003", contactName: "Caio" });
    await say(c.id, "quero falar com atendente");
    at(35);
    assumeConversation(db, c.id, bruno);
    sendStaffMessage(db, c.id, bruno, "Desculpe a demora", { sign: true });
    // 4) Ainda esperando há 15 min.
    at(40);
    const d = createConversation(db, { channel: "simulador", phone: "11900000004", contactName: "Duda" });
    await say(d.id, "preciso de um vendedor");
    at(55);

    const report = teamReport(db, { from: new Date(Date.UTC(2026, 10, 3, 12, 0)) });
    expect(report.totals).toMatchObject({ conversations: 4, resolvedByAi: 1, resolvedByAiPercent: 25, handoffs: 3, waitAverageMinutes: 14.5, waitMedianMinutes: 14.5, waitMaxMinutes: 25, staffMessages: 2 });
    expect(report.sellers).toEqual([
      { name: "Ana Souza", messages: 1, conversations: 1, handoffsAnswered: 1, waitAverageMinutes: 4, finished: 1 },
      { name: "Bruno Lima", messages: 1, conversations: 1, handoffsAnswered: 1, waitAverageMinutes: 25, finished: 0 },
    ]);
    expect(report.longWaits.map((item) => [item.contact, item.minutes, item.answeredBy, item.waiting])).toEqual([
      ["Caio", 25, "Bruno Lima", false],
      ["Duda", 15, null, true],
    ]);
    expect(report.hours[10]).toBe(4); // 13h UTC = 10h em São Paulo
  });

  it("início do dia em São Paulo", () => {
    expect(startOfTodaySp(new Date("2026-11-03T02:30:00Z")).toISOString()).toBe("2026-11-02T03:00:00.000Z");
    expect(startOfTodaySp(new Date("2026-11-03T15:45:10Z")).toISOString()).toBe("2026-11-03T03:00:00.000Z");
  });
});

describe("áudio", () => {
  const audio = { file: "x/a.ogg", kind: "audio" as const, mime: "audio/ogg", name: "audio.ogg", size: 10, hasThumb: false };

  it("IA real recebe a transcrição do áudio; a busca também acha pelo que foi falado", async () => {
    const { id } = newConversation();
    const message = recordCustomerMessage(db, id, "", audio);
    setTranscript(db, message.id, "ok", "quero revelar quarenta fotos dez por quinze");
    let sent: Array<{ text: string }> = [];
    const fetcher = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)).messages;
      return new Response(JSON.stringify({ reply: "Qual o seu nome?", handoff: false, subject: "", name: "", profile: {} }));
    }) as unknown as typeof fetch;
    await runAi(db, id, createRealBrain({ url: "http://ia", token: "t" }, fetcher));
    expect(sent.at(-1)?.text).toBe("[mandou um áudio; transcrição automática:] quero revelar quarenta fotos dez por quinze");
    expect(searchMessages(db, "quarenta fotos").map((hit) => hit.messageId)).toEqual([message.id]);
  });

  it("sem serviço configurado a transcrição fica \"falhou\" (o painel mostra para ouvir o áudio)", async () => {
    const { id } = newConversation();
    const message = recordCustomerMessage(db, id, "", audio);
    expect(voiceConfig({})).toBeNull();
    expect(voiceConfig({ FARE_IA_TOKEN: "t" })).toEqual({ url: "http://127.0.0.1:8652", token: "t" });
    expect(await transcribeMessage(db, message.id, null)).toBeNull();
    expect(listMessages(db, id).at(-1)).toMatchObject({ transcriptStatus: "falhou", transcript: "" });
  });
});

describe("busca nas mensagens", () => {
  it("acha sem acento e sem maiúscula, todas as palavras na mesma mensagem, ignora avisos do sistema", async () => {
    const a = createConversation(db, { channel: "simulador", phone: "11933334444", contactName: "Maria" });
    assumeConversation(db, a.id, ana);
    returnToAi(db, a.id, ana, "");
    recordCustomerMessage(db, a.id, "Quero REVELAÇÃO de 40 fotos para sábado");
    const b = createConversation(db, { channel: "simulador", phone: "11911112222", contactName: "João" });
    recordCustomerMessage(db, b.id, "revelacao urgente");
    addNote(db, b.id, ana, "Revelação paga no Pix");
    expect(searchMessages(db, "revelacao").map((hit) => hit.contactName).sort()).toEqual(["João", "João", "Maria"]);
    expect(searchMessages(db, "revelação sabado").map((hit) => hit.conversationId)).toEqual([a.id]);
    expect(searchMessages(db, "devolveu")).toEqual([]);
    expect(searchMessages(db, "a")).toEqual([]);
  });

  it("trecho em volta da palavra", () => {
    expect(snippetAround("x".repeat(100) + " Revelação " + "y".repeat(100), "revelacao", 10)).toBe("…xxxxxxxxx Revelação yyyyyyyyy…");
  });
});

describe("notas internas e etiquetas", () => {
  it("nota: qualquer um da equipe escreve, não muda prévia/não lidas, não vai à IA nem ao WhatsApp e não trava a IA", async () => {
    const { conversationId: id } = receiveWhatsAppMessage(db, parseInbound({ externalId: "N1", chatId: "5511944443333@s.whatsapp.net", phone: "5511944443333", text: "quanto custa?" }));
    const before = getConversation(db, id);
    const note = addNote(db, id, bruno, "Cliente antigo, dar desconto");
    expect(note).toMatchObject({ author: "nota", authorName: "Bruno Lima", deliveredText: "" });
    const after = getConversation(db, id);
    expect([after.lastMessagePreview, after.unread]).toEqual([before.lastMessagePreview, before.unread]);
    let seen: string[] = [];
    const created = await runAi(db, id, async ({ messages }) => {
      seen = messages.map((message) => message.author);
      return { reply: "Qual o tamanho?" };
    });
    expect(created).toHaveLength(1); // a nota (última) não impede a IA de responder o cliente
    const sent: string[] = [];
    await deliverToWhatsApp(db, [note], { url: "http://p", token: "t" }, (async (_url: string, init: RequestInit) => {
      sent.push(String(init.body));
      return new Response("{}");
    }) as unknown as typeof fetch);
    expect(sent).toHaveLength(0);
    expect(seen).toContain("nota"); // a IA recebe a lista, mas o conector real tira notas (ver hermesBrain)
    expect(() => addNote(db, id, ana, "  ")).toThrow(AtendimentoError);
  });

  it("etiquetas: sem repetir, até 8, 24 letras; sugestões trazem as usadas primeiro", () => {
    const { id } = newConversation();
    const conversation = setConversationTags(db, id, ["Urgente", "urgente", "  Pago  ", "x".repeat(40), 7, "", "a", "b", "c", "d", "e", "f"]);
    expect(conversation.tags).toEqual(["Urgente", "Pago", "x".repeat(24), "7", "a", "b", "c", "d"]);
    const other = newConversation();
    setConversationTags(db, other.id, ["Casamento", "Pago"]);
    expect(knownTags(db).slice(0, 3)).toEqual(["Pago", "Urgente", "x".repeat(24)]);
    expect(knownTags(db)).toContain("Revelação");
    expect(knownTags(db).filter((tag) => tag.toLowerCase() === "urgente")).toHaveLength(1);
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

describe("sem a etapa Aguardando vendedor", () => {
  it("conversas antigas nessa etapa passam para Em atendimento", () => {
    const { id } = newConversation();
    db.prepare("UPDATE atd_conversations SET status = 'aguardando_vendedor' WHERE id = ?").run(id);
    runAtendimentoMigrations(db);
    expect(getConversation(db, id).status).toBe("em_atendimento");
  });
});

describe("marcar como não lida", () => {
  it("volta a bolinha sem perder a contagem que já tinha", async () => {
    const { id } = newConversation();
    assumeConversation(db, id, ana);
    markConversationUnread(db, id);
    expect(getConversation(db, id).unread).toBe(1);
    await say(id, "a");
    await say(id, "b");
    markConversationUnread(db, id);
    expect(getConversation(db, id).unread).toBe(3);
    markConversationRead(db, id);
    expect(getConversation(db, id).unread).toBe(0);
  });

  it("marcar todas como lidas zera todas as conversas", () => {
    const first = newConversation().id;
    const second = newConversation().id;
    markConversationUnread(db, first);
    markConversationUnread(db, second);
    markAllConversationsRead(db);
    expect([getConversation(db, first).unread, getConversation(db, second).unread]).toEqual([0, 0]);
  });
});
