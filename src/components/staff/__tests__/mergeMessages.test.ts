import { describe, expect, it } from "vitest";
import { mergeMessages } from "@/components/staff/atendimento/ConversationView";
import type { Message } from "@/lib/atendimento/types";

const msg = (seq: number, body: string, extra: Partial<Message> = {}) =>
  ({ seq, id: `m${seq}`, body, createdAt: `2026-11-23T13:38:0${seq}.000Z`, delivery: "pendente", ...extra }) as Message;

describe("mergeMessages", () => {
  it("mensagem que o envio já pôs na tela não duplica quando a consulta devolve de novo", () => {
    const afterSend = [msg(1, "Fica R$36,00"), msg(2, "Prefere papel fosco ou brilhante?")];
    const merged = mergeMessages(afterSend, [msg(2, "Prefere papel fosco ou brilhante?", { delivery: "enviada" }), msg(3, "Pix")]);
    expect(merged.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(merged[1].delivery).toBe("enviada");
  });
});
