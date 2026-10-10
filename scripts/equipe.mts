/**
 * Contas da equipe (painel interno). Ninguém se cadastra pelo site: o administrador convida por aqui.
 *
 *   npm run equipe -- convidar "Nome Completo" email@farefoto.com.br admin|vendedor
 *   npm run equipe -- listar
 *   npm run equipe -- remover email@farefoto.com.br
 *
 * O convite gera um link de uso único (vale 48 h) para a pessoa criar a própria senha.
 * Convidar de novo a mesma pessoa serve para trocar o papel ou para "esqueci a senha".
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const load = (relative: string) => import(pathToFileURL(path.join(root, relative)).href);
const { inviteStaffMember, listStaffMembers, removeStaffMember, STAFF_INVITE_HOURS } = await load("src/lib/staff/members.ts");

const dbPath = process.env.STAFF_DATABASE_PATH ?? path.join(root, "data", "equipe.sqlite");
mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);

/** Mesmo endereço público usado nos links do site (BETTER_AUTH_URL do .env.local); sem ele, o padrão local. */
function siteUrl() {
  try {
    for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^BETTER_AUTH_URL=(.+)$/);
      if (match) return match[1].trim().replace(/\/$/, "");
    }
  } catch {
    // sem .env.local
  }
  return "http://localhost:3000";
}

const [command, ...args] = process.argv.slice(2);
const ROLE_LABEL: Record<string, string> = { admin: "Administrador", vendedor: "Vendedor" };

try {
  if (command === "convidar") {
    const [name, email, role] = args;
    if (!name || !email || !role) throw new Error('Uso: npm run equipe -- convidar "Nome" email admin|vendedor');
    const invite = inviteStaffMember(db, { name, email, role });
    console.log(`${invite.created ? "Convite criado" : "Novo convite (o anterior deixou de valer)"} para ${name} <${email.trim().toLowerCase()}> — ${ROLE_LABEL[role]}.`);
    console.log(`Link para criar a senha (vale ${STAFF_INVITE_HOURS} h, uso único):`);
    console.log(`  ${siteUrl()}/equipe/convite?token=${invite.token}`);
    console.log("Envie esse link só para a própria pessoa (WhatsApp ou e-mail).");
  } else if (command === "listar") {
    const members = listStaffMembers(db);
    if (!members.length) console.log("Nenhuma conta da equipe ainda.");
    for (const m of members) console.log(`- ${m.name} <${m.email}> — ${ROLE_LABEL[m.role] ?? m.role}${m.hasPassword ? "" : " (convite pendente)"}`);
  } else if (command === "remover") {
    const [email] = args;
    if (!email) throw new Error("Uso: npm run equipe -- remover email");
    console.log(removeStaffMember(db, email) ? `Acesso removido: ${email}` : `Ninguém da equipe com o e-mail ${email}.`);
  } else {
    console.log('Comandos: convidar "Nome" email admin|vendedor  |  listar  |  remover email');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.close();
}
