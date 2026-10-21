/**
 * Cria/atualiza as tabelas de login (clientes e equipe) num servidor novo.
 *   node --no-warnings --import ./scripts/register-resolver.mjs --experimental-strip-types scripts/migrar-auth.mts <pasta data>
 * Só acrescenta o que falta; nunca apaga dados.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { getMigrations } from "better-auth/db/migration";

const root = process.cwd();
const load = (relative: string) => import(pathToFileURL(path.join(root, relative)).href);
const { buildAuthOptions } = await load("src/lib/auth/options.ts");
const { buildStaffAuthOptions } = await load("src/lib/staff/options.ts");

const dataDir = process.argv[2] ?? path.join(root, "data");
mkdirSync(dataDir, { recursive: true });
for (const [file, build] of [["farefoto.sqlite", buildAuthOptions], ["equipe.sqlite", buildStaffAuthOptions]] as const) {
  const db = new DatabaseSync(path.join(dataDir, file));
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(build(db));
  await runMigrations();
  console.log(`${file}: ${toBeCreated.length} tabelas novas, ${toBeAdded.length} com colunas novas`);
  db.close();
}
