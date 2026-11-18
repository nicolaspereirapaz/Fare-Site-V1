// Ponto de restauração dos bancos do site (roda no oraculo pela tarefa "FareFoto Backup", a cada 3 horas).
// Sempre UM ponto só (D:/Backups/FareFoto/ponto-restauracao), sobrescrito a cada rodada.
// VACUUM INTO tira uma cópia consistente mesmo com o site ligado (leitura só).
// O ponto novo é montado ao lado e só troca o antigo se tudo deu certo: uma falha no meio não apaga o último ponto bom.
import { DatabaseSync } from "node:sqlite";
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA = process.env.FARE_DATA_DIR || "C:/FareFoto/app/data";
const DEST = process.env.FARE_BACKUP_DIR || "D:/Backups/FareFoto";
const target = path.join(DEST, "ponto-restauracao");
const next = `${target}.novo`;
const old = `${target}.antigo`;

rmSync(next, { recursive: true, force: true });
mkdirSync(next, { recursive: true });
for (const file of readdirSync(DATA).filter((name) => name.endsWith(".sqlite"))) {
  const out = path.join(next, file).replaceAll("'", "''");
  const db = new DatabaseSync(path.join(DATA, file), { readOnly: true });
  try { db.exec(`VACUUM INTO '${out}'`); } finally { db.close(); }
  const check = new DatabaseSync(path.join(next, file), { readOnly: true });
  try {
    const ok = check.prepare("PRAGMA quick_check").get();
    if (Object.values(ok)[0] !== "ok") throw new Error(`cópia de ${file} com defeito: ${JSON.stringify(ok)}`);
  } finally { check.close(); }
}
if (existsSync(path.join(DATA, "mockups"))) cpSync(path.join(DATA, "mockups"), path.join(next, "mockups"), { recursive: true });
if (existsSync(path.join(DATA, "..", ".env.local"))) cpSync(path.join(DATA, "..", ".env.local"), path.join(next, "env.local"));
const when = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
writeFileSync(path.join(next, "feito-em.txt"), `${when}\r\nOrigem: ${DATA}\r\n`);

// Troca: atual -> .antigo, novo -> atual, apaga .antigo.
rmSync(old, { recursive: true, force: true });
if (existsSync(target)) renameSync(target, old);
renameSync(next, target);
rmSync(old, { recursive: true, force: true });

// Pastas antigas por data (política anterior, diária) somem depois de 14 dias, sem criar novas.
const limit = Date.now() - 14 * 86_400_000;
for (const name of readdirSync(DEST)) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name) && Date.parse(`${name}T12:00:00Z`) < limit) rmSync(path.join(DEST, name), { recursive: true, force: true });
}
console.log(`${new Date().toISOString()} ponto de restauração ok: ${target} (${readdirSync(target).join(", ")})`);
