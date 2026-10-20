// Backup diário dos bancos do site (roda no oraculo pela tarefa "FareFoto Backup").
// VACUUM INTO tira uma cópia consistente mesmo com o site ligado (leitura só).
import { DatabaseSync } from "node:sqlite";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const DATA = process.env.FARE_DATA_DIR || "C:/FareFoto/app/data";
const DEST = process.env.FARE_BACKUP_DIR || "D:/Backups/FareFoto";
const KEEP_DAYS = Number(process.env.FARE_BACKUP_DAYS || 14);

const day = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // 2026-10-20
const target = path.join(DEST, day);
rmSync(target, { recursive: true, force: true }); // rodou 2x no dia: fica a mais nova
mkdirSync(target, { recursive: true });

for (const file of readdirSync(DATA).filter((name) => name.endsWith(".sqlite"))) {
  const out = path.join(target, file).replaceAll("'", "''");
  new DatabaseSync(path.join(DATA, file), { readOnly: true }).exec(`VACUUM INTO '${out}'`);
}
if (existsSync(path.join(DATA, "mockups"))) cpSync(path.join(DATA, "mockups"), path.join(target, "mockups"), { recursive: true });
if (existsSync(path.join(DATA, "..", ".env.local"))) cpSync(path.join(DATA, "..", ".env.local"), path.join(target, "env.local"));

// Apaga backups mais velhos que KEEP_DAYS (só pastas com nome de data).
const limit = Date.now() - KEEP_DAYS * 86_400_000;
for (const name of readdirSync(DEST)) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name) && Date.parse(`${name}T12:00:00Z`) < limit) rmSync(path.join(DEST, name), { recursive: true, force: true });
}
console.log(`${new Date().toISOString()} backup ok: ${target} (${readdirSync(target).join(", ")})`);
