/**
 * Preenche a mensagem rápida na hora de usar:
 *   {saudacao} -> "Bom dia" (5h-11h), "Boa tarde" (12h-17h) ou "Boa noite", pela hora do computador da equipe;
 *   {nome}     -> primeiro nome do cliente ("MARIA silva 🌸" -> "Maria"). Sem nome, some junto com a vírgula antes.
 */
export function fillQuickReply(body: string, name: string, now = new Date()) {
  const hour = now.getHours();
  const greeting = hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite";
  const first = (name.trim().split(/\s+/)[0] ?? "").replace(/[^\p{L}'-]/gu, "");
  const firstName = first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "";
  return body.replace(/\{saudacao\}/gi, greeting).replace(firstName ? /\{nome\}/gi : /,?[ \t]*\{nome\}/gi, firstName);
}
