import { describe, expect, it } from "vitest";
import { fillQuickReply } from "@/lib/atendimento/quickReplyFill";

const at = (hour: number) => new Date(2026, 10, 12, hour, 30);

describe("fillQuickReply", () => {
  it("troca {saudacao} pela hora e {nome} pelo primeiro nome", () => {
    expect(fillQuickReply("{saudacao}, {nome}, tudo bem?", "MARIA silva 🌸", at(9))).toBe("Bom dia, Maria, tudo bem?");
    expect(fillQuickReply("{saudacao}, {nome}, tudo sim e você?", "joão", at(14))).toBe("Boa tarde, João, tudo sim e você?");
    expect(fillQuickReply("{saudacao}!", "Ana", at(19))).toBe("Boa noite!");
    expect(fillQuickReply("{saudacao}!", "Ana", at(2))).toBe("Boa noite!");
  });

  it("sem nome tira o {nome} e a vírgula antes", () => {
    expect(fillQuickReply("{saudacao}, {nome}, tudo bem?", "", at(11))).toBe("Bom dia, tudo bem?");
    expect(fillQuickReply("{saudacao}, {nome}, tudo bem?", "🌸", at(12))).toBe("Boa tarde, tudo bem?");
  });

  it("mensagem sem marcadores fica igual", () => {
    expect(fillQuickReply("Como posso ajudar?", "Ana", at(10))).toBe("Como posso ajudar?");
  });
});
