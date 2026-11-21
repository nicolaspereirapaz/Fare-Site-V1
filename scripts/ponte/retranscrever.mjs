// Transcreve de novo os áudios do Atendimento que ficaram "falhou" enquanto a voz não rodava no oraculo.
// Grava só transcript/transcript_status da própria mensagem (o mesmo que o site faz), um áudio por vez.
// Uso: node retranscrever.mjs [desde AAAA-MM-DD]. Ocupa a voz (~45 s por áudio): áudio novo espera. Muitos de uma vez, só fora do expediente.
import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { request } from "node:http";

// http.request em vez de fetch: o fetch do Node desiste em 300 s, e áudio longo leva mais que isso nesta CPU.
const transcrever = (body) =>
  new Promise((resolve, reject) => {
    const req = request("http://127.0.0.1:8652/transcrever", {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "content-length": body.length, "x-fare-token": token },
      timeout: 1_800_000,
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8").on("data", (chunk) => (raw += chunk)).on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error("resposta inválida")); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("30 min sem resposta"))).on("error", reject);
    req.end(body);
  });

const since = process.argv[2] || "2000-01-01";
const token = readFileSync("C:/FareFoto/voz/painel_ia.token", "utf8").trim();
const MEDIA = "C:/FareFoto/app/data/atendimento-midias";
const db = new DatabaseSync("C:/FareFoto/app/data/farefoto.sqlite");
db.exec("PRAGMA busy_timeout = 5000");
const rows = db.prepare("SELECT id, media_file FROM atd_messages WHERE media_kind = 'audio' AND transcript_status = 'falhou' AND media_file IS NOT NULL AND created_at >= ? ORDER BY created_at DESC").all(since);
const save = db.prepare("UPDATE atd_messages SET transcript = ?, transcript_status = 'ok' WHERE id = ? AND transcript_status = 'falhou'");
let ok = 0;
for (const row of rows) {
  const file = `${MEDIA}/${row.media_file}`;
  if (!existsSync(file)) { console.log(`${row.id}: arquivo não existe`); continue; }
  const started = Date.now();
  try {
    const data = await transcrever(readFileSync(file));
    save.run(String(data.text ?? "").trim().slice(0, 4000), row.id);
    ok += 1;
    console.log(`${row.id}: ok, ${String(data.text ?? "").length} letras em ${((Date.now() - started) / 1000).toFixed(0)} s`);
  } catch (error) {
    console.log(`${row.id}: falhou de novo (${error instanceof Error ? error.message : error})`);
  }
}
db.close();
console.log(`retranscritos ${ok} de ${rows.length}`);
