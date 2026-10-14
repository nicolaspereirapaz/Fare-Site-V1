import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createDirectOrder, getOrderFinance } from "@/lib/orders/payments";
import { listOrderStatusHistory } from "@/lib/orders/repository";

const directInput = {
  userId: "customer", idempotencyKey: "direct", customer: { name: "Ana", phone: "11999999999" },
  items: [{ id: "photo", productName: "Foto", slug: "foto", quantity: 1, selections: {}, artworkName: null, unitPrice: 18 }],
  paymentMethod: "pix" as const, actorId: "staff", actorName: "Maria", internalNotes: "",
  deliveryDate: null, deliveryMode: "retirada" as const, installments: null, dueDate: null,
  payment: { amountCents: 0, paidAt: null },
};

function worker(script: string, dbPath: string, input: unknown) {
  const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules/vite-node/vite-node.mjs"),
    "--root", process.cwd(), "--config", path.join(process.cwd(), "vitest.config.ts"), script, dbPath, JSON.stringify(input)],
  { cwd: process.cwd(), stdio: "pipe" });
  let output = "";
  let errors = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => { errors += chunk; });
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", chunk => { output += chunk; if (output.includes("READY")) resolve(); });
    child.once("error", reject);
    child.once("exit", code => { if (!output.includes("READY")) reject(new Error(`worker exit=${code}: ${errors}`)); });
  });
  const done = new Promise<{ ok: boolean; error?: string; id?: string }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => {
      if (code !== 0) return reject(new Error(`worker exit=${code}: ${errors}`));
      const result = output.split(/\r?\n/).findLast(line => line.startsWith("{"));
      if (!result) return reject(new Error(`worker sem resultado: ${output} ${errors}`));
      resolve(JSON.parse(result));
    });
  });
  void done.catch(() => undefined);
  return { ready, run() { child.stdin.end("GO\n"); return done; }, stop() { if (child.exitCode === null) child.kill(); } };
}

describe("concorrência financeira em conexões SQLite reais", () => {
  it.each(["mesma-chave", "acima-saldo", "criação"])("serializa %s sem duplicar ou ultrapassar saldo", async scenario => {
    const directory = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), "fare-direct-concurrency-"));
    const dbPath = path.join(directory, "finance.sqlite");
    const script = path.join(directory, "worker.ts");
    const workers: ReturnType<typeof worker>[] = [];
    try {
      const moduleUrl = pathToFileURL(path.join(process.cwd(), "src/lib/orders/payments.ts")).href;
      writeFileSync(script, `
        import { DatabaseSync } from "node:sqlite";
        import { createDirectOrder, recordOrderPayment } from ${JSON.stringify(moduleUrl)};
        const [dbPath, raw] = process.argv.slice(2);
        const db = new DatabaseSync(dbPath);
        db.exec("PRAGMA busy_timeout = 5000");
        process.stdout.write("READY\\n");
        process.stdin.once("data", () => {
          try {
            const input = JSON.parse(raw);
            const result = input.orderId ? recordOrderPayment(db, input) : createDirectOrder(db, input);
            process.stdout.write(JSON.stringify({ ok: true, id: result.id }) + "\\n");
          } catch (error) {
            process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + "\\n");
          } finally { db.close(); }
        });
      `, "utf8");
      const setup = new DatabaseSync(dbPath);
      // Initialize the schema, but no orders for the concurrent creation case.
      getOrderFinance(setup, "missing");
      const orderId = scenario === "criação" ? null : createDirectOrder(setup, directInput).id;
      setup.close();
      const receipt = { orderId, idempotencyKey: "receipt", amountCents: 1000, paymentMethod: "pix",
        paidAt: "2026-10-14", actorId: "staff", actorName: "Maria" };
      workers.push(worker(script, dbPath, scenario === "criação" ? directInput : receipt),
        worker(script, dbPath, scenario === "criação" ? directInput : { ...receipt, idempotencyKey: scenario === "acima-saldo" ? "other" : "receipt" }));
      await Promise.all(workers.map(w => w.ready));
      const results = await Promise.all(workers.map(w => w.run()));
      const db = new DatabaseSync(dbPath);
      try {
        if (scenario === "criação") {
          expect(results.every(r => r.ok)).toBe(true);
          expect(results[0].id).toBe(results[1].id);
          expect(db.prepare("SELECT count(*) AS n FROM fare_orders").get()).toMatchObject({ n: 1 });
          expect(listOrderStatusHistory(db, results[0].id!)).toHaveLength(1);
        } else {
          expect(results.filter(r => r.ok)).toHaveLength(scenario === "acima-saldo" ? 1 : 2);
          if (scenario === "acima-saldo") expect(results.find(r => !r.ok)?.error).toMatch(/saldo/);
          expect(getOrderFinance(db, orderId!)).toMatchObject({ paidCents: 1000, balanceCents: 800 });
          expect(getOrderFinance(db, orderId!)?.payments).toHaveLength(1);
          expect(listOrderStatusHistory(db, orderId!)).toHaveLength(2);
        }
      } finally { db.close(); }
    } finally {
      workers.forEach(w => w.stop());
      rmSync(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
