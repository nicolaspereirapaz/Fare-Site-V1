import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ORDEM_STATUS_PEDIDO,
  TransicaoStatusPedidoInvalidaError,
  type StatusPedido,
} from "@/lib/backoffice/orderStatus";
import {
  createOrder,
  findOrderById,
  listAllOrders,
  listOrderStatusHistory,
  listOrdersByUser,
  runOrderMigrations,
  updateOrderStatus,
  OrderNotFoundError,
  type CreateOrderInput,
} from "@/lib/orders/repository";

const baseInput: CreateOrderInput = {
  userId: "user-1",
  idempotencyKey: "checkout-abc-123",
  customer: { name: "Ana", phone: "11999999999" },
  paymentMethod: "pix",
  items: [{
    id: "item-1",
    productName: "Foto 10x15",
    slug: "foto-10x15",
    quantity: 2,
    selections: { Papel: "Fosco" },
    artworkName: null,
    unitPrice: 2.5,
  }],
};

type ConcurrentTransitionResult = {
  outcome: "updated" | "error";
  name?: string;
};

function createTransitionWorker(
  scriptPath: string,
  databasePath: string,
  orderId: string,
  nextStatus: StatusPedido,
) {
  const viteNodePath = path.join(process.cwd(), "node_modules", "vite-node", "vite-node.mjs");
  const child = spawn(process.execPath, [
    viteNodePath,
    "--root",
    process.cwd(),
    "--config",
    path.join(process.cwd(), "vitest.config.ts"),
    scriptPath,
    databasePath,
    orderId,
    nextStatus,
    `actor-${nextStatus}`,
  ], {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdout = "";
  let stderr = "";
  let readyResolved = false;

  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const ready = new Promise<void>((resolve, reject) => {
    const readUntilReady = (chunk: string) => {
      stdout += chunk;
      if (/READY\r?\n/.test(stdout)) {
        readyResolved = true;
        resolve();
      }
    };

    child.stdout.on("data", readUntilReady);
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!readyResolved) {
        reject(new Error(`Worker exited before becoming ready (code ${code}). ${stderr}`));
      }
    });
  });

  const completed = new Promise<ConcurrentTransitionResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}. ${stderr}`));
        return;
      }

      const resultLine = stdout
        .split(/\r?\n/)
        .findLast((line) => line.startsWith("{"));

      if (!resultLine) {
        reject(new Error(`Worker returned no result. ${stderr}`));
        return;
      }

      resolve(JSON.parse(resultLine) as ConcurrentTransitionResult);
    });
  });
  void completed.catch(() => undefined);

  return {
    ready,
    run() {
      child.stdin.end("GO\n");
      return completed;
    },
    stop() {
      if (child.exitCode === null) child.kill();
    },
  };
}

describe("repositório de pedidos", () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    runOrderMigrations(database);
  });

  afterEach(() => database.close());

  it("pedidos com as situações antigas migram para as novas sem perder dados", () => {
    const legacy = new DatabaseSync(":memory:");
    legacy.exec(`
      CREATE TABLE fare_orders (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, customer_snapshot TEXT NOT NULL,
        items_snapshot TEXT NOT NULL, payment_method TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('aguardando_pagamento', 'pagamento_confirmado', 'aguardando_personalizacao',
          'personalizacao_em_aprovacao', 'personalizacao_aprovada', 'em_producao', 'pronto_para_envio',
          'em_transporte_ou_retirada', 'concluido', 'cancelado')),
        total_cents INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (user_id, idempotency_key));
    `);
    const insert = legacy.prepare("INSERT INTO fare_orders VALUES (?, 'u1', ?, '{\"name\":\"Ana\"}', '[]', 'pix', ?, 100, '2026-10-01', '2026-10-01')");
    insert.run("a", "k1", "pagamento_confirmado");
    insert.run("b", "k2", "personalizacao_aprovada");
    insert.run("c", "k3", "em_producao");
    insert.run("d", "k4", "em_transporte_ou_retirada");
    insert.run("e", "k5", "aguardando_pagamento");

    runOrderMigrations(legacy);

    expect(["a", "b", "c", "d", "e"].map((id) => findOrderById(legacy, id)?.status)).toEqual([
      "aguardando_arte", "aguardando_producao", "em_producao", "aguardando_retirada", "aguardando_pagamento",
    ]);
    expect(findOrderById(legacy, "a")).toMatchObject({ customer: { name: "Ana" }, totalCents: 100 });
  });

  it("pedido de orçamento pago pode nascer direto em Criando arte", () => {
    const order = createOrder(database, baseInput, { initialStatus: "criando_arte" });
    expect(order.status).toBe("criando_arte");
  });

  it("migra de forma idempotente e persiste snapshot, pagamento, status e total", () => {
    expect(() => runOrderMigrations(database)).not.toThrow();

    const order = createOrder(database, baseInput);

    expect(order).toMatchObject({
      userId: "user-1",
      idempotencyKey: "checkout-abc-123",
      paymentMethod: "pix",
      status: "aguardando_pagamento",
      totalCents: 500,
      customer: baseInput.customer,
      items: baseInput.items,
    });
    expect(order.id).toMatch(/^0001-[0-9a-f-]{36}$/);
  });

  it("mantém total nulo quando algum preço está sob consulta", () => {
    const order = createOrder(database, {
      ...baseInput,
      items: [{ ...baseInput.items[0], unitPrice: null }],
    });

    expect(order.totalCents).toBeNull();
  });

  it("reutiliza o pedido para a mesma chave do mesmo usuário sem duplicar", () => {
    const first = createOrder(database, baseInput);
    const repeated = createOrder(database, baseInput);

    expect(repeated.id).toBe(first.id);
    expect(listOrdersByUser(database, "user-1")).toHaveLength(1);
  });

  it("restringe a idempotência ao usuário e lista somente os pedidos dele", () => {
    const first = createOrder(database, baseInput);
    const other = createOrder(database, { ...baseInput, userId: "user-2" });

    expect(other.id).not.toBe(first.id);
    expect(listOrdersByUser(database, "user-1").map((order) => order.id)).toEqual([first.id]);
    expect(listOrdersByUser(database, "user-2").map((order) => order.id)).toEqual([other.id]);
  });
});

describe("camada de dados do backoffice", () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    runOrderMigrations(database);
  });

  afterEach(() => {
    vi.useRealTimers();
    database.close();
  });

  it("migra a tabela de auditoria de forma idempotente", () => {
    expect(() => runOrderMigrations(database)).not.toThrow();
    expect(() => runOrderMigrations(database)).not.toThrow();
  });

  it("migra o historico legado para um ordinal autoincremental sem perder a ordem de insercao", () => {
    const created = createOrder(database, baseInput);
    database.exec(`
      DROP INDEX fare_order_status_history_order_idx;
      DROP TABLE fare_order_status_history;
      CREATE TABLE fare_order_status_history (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES fare_orders(id),
        previous_status TEXT NOT NULL,
        next_status TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    const insertLegacyHistory = database.prepare(`
      INSERT INTO fare_order_status_history (
        id, order_id, previous_status, next_status, actor_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertLegacyHistory.run(
      "z-primeiro",
      created.id,
      "aguardando_pagamento",
      "criando_arte",
      "vendedor-1",
      "2026-09-28T12:00:00.000Z",
    );
    insertLegacyHistory.run(
      "a-segundo",
      created.id,
      "criando_arte",
      "em_producao",
      "vendedor-1",
      "2026-09-28T12:00:00.000Z",
    );

    runOrderMigrations(database);
    runOrderMigrations(database);

    const columns = database.prepare(`
      PRAGMA table_info(fare_order_status_history)
    `).all() as unknown as Array<{ name: string; type: string; pk: number }>;
    expect(columns).toContainEqual(expect.objectContaining({ name: "ordinal", type: "INTEGER", pk: 1 }));
    expect(listOrderStatusHistory(database, created.id).map((entry) => entry.id)).toEqual([
      "z-primeiro",
      "a-segundo",
    ]);
  });

  it("persiste no CHECK de status exatamente a fonte canonica", () => {
    const row = database.prepare(`
      SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'fare_orders'
    `).get() as { sql: string };
    const statusCheck = row.sql.match(
      /\bstatus\b[^,]*\bCHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)\s*\)/i,
    )?.[1];
    const persistedStatuses = Array.from(
      statusCheck?.matchAll(/'((?:''|[^'])*)'/g) ?? [],
      ([, status]) => status.replace(/''/g, "'"),
    );

    expect(persistedStatuses).toEqual([...ORDEM_STATUS_PEDIDO]);
  });

  it("lista todos os pedidos de todos os usuários, mais recente primeiro", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
    const first = createOrder(database, baseInput);
    vi.setSystemTime(new Date("2026-09-28T12:00:00.001Z"));
    const second = createOrder(database, { ...baseInput, userId: "user-2", idempotencyKey: "checkout-xyz-456" });

    const orders = listAllOrders(database);

    expect(orders.map((order) => order.id)).toEqual([second.id, first.id]);
  });

  it("encontra um pedido pelo id ou devolve null", () => {
    const created = createOrder(database, baseInput);

    expect(findOrderById(database, created.id)).toMatchObject({ id: created.id });
    expect(findOrderById(database, "id-inexistente")).toBeNull();
  });

  it("avança o status do pedido, grava auditoria e devolve o pedido atualizado", () => {
    const created = createOrder(database, baseInput);

    const updated = updateOrderStatus(database, {
      orderId: created.id,
      nextStatus: "aguardando_arte",
      actorId: "vendedor-1",
    });

    expect(updated.status).toBe("aguardando_arte");
    expect(findOrderById(database, created.id)).toMatchObject({ status: "aguardando_arte" });

    const history = listOrderStatusHistory(database, created.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      orderId: created.id,
      previousStatus: "aguardando_pagamento",
      nextStatus: "aguardando_arte",
      actorId: "vendedor-1",
    });
  });

  it("rejeita transição fora da lista permitida e não grava auditoria", () => {
    const created = createOrder(database, baseInput);

    expect(() =>
      updateOrderStatus(database, {
        orderId: created.id,
        nextStatus: "concluido",
        actorId: "vendedor-1",
      }),
    ).toThrow(TransicaoStatusPedidoInvalidaError);

    expect(listOrderStatusHistory(database, created.id)).toHaveLength(0);
  });

  it("faz rollback do status quando a gravacao da auditoria falha", () => {
    const created = createOrder(database, baseInput);
    database.exec(`
      CREATE TRIGGER falhar_auditoria
      BEFORE INSERT ON fare_order_status_history
      BEGIN
        SELECT RAISE(FAIL, 'falha de auditoria');
      END;
    `);

    expect(() =>
      updateOrderStatus(database, {
        orderId: created.id,
        nextStatus: "aguardando_arte",
        actorId: "vendedor-1",
      }),
    ).toThrow("falha de auditoria");

    expect(findOrderById(database, created.id)).toMatchObject({ status: "aguardando_pagamento" });
    expect(listOrderStatusHistory(database, created.id)).toHaveLength(0);
  });

  it("trata compare-and-swap sem linha alterada como transicao invalida", () => {
    const created = createOrder(database, baseInput);
    database.exec(`
      CREATE TRIGGER ignorar_compare_and_swap
      BEFORE UPDATE OF status ON fare_orders
      BEGIN
        SELECT RAISE(IGNORE);
      END;
    `);

    expect(() =>
      updateOrderStatus(database, {
        orderId: created.id,
        nextStatus: "aguardando_arte",
        actorId: "vendedor-1",
      }),
    ).toThrow(TransicaoStatusPedidoInvalidaError);

    expect(findOrderById(database, created.id)).toMatchObject({ status: "aguardando_pagamento" });
    expect(listOrderStatusHistory(database, created.id)).toHaveLength(0);
  });

  it("rejeita atualização de pedido inexistente", () => {
    expect(() =>
      updateOrderStatus(database, {
        orderId: "id-inexistente",
        nextStatus: "aguardando_arte",
        actorId: "vendedor-1",
      }),
    ).toThrow(OrderNotFoundError);
  });

  it("devolve o histórico de status em ordem cronológica", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
    const created = createOrder(database, baseInput);
    updateOrderStatus(database, { orderId: created.id, nextStatus: "aguardando_arte", actorId: "vendedor-1" });
    updateOrderStatus(database, { orderId: created.id, nextStatus: "criando_arte", actorId: "vendedor-1" });

    const history = listOrderStatusHistory(database, created.id);

    expect(new Set(history.map((entry) => entry.createdAt))).toEqual(new Set(["2026-09-28T12:00:00.000Z"]));
    expect(history.map((entry) => entry.nextStatus)).toEqual([
      "aguardando_arte",
      "criando_arte",
    ]);
  });

  it("serializa duas transicoes concorrentes em conexoes ao mesmo arquivo", async () => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "fare-orders-concurrency-"));
    const databasePath = path.join(temporaryDirectory, "orders.sqlite");
    const workerPath = path.join(temporaryDirectory, "transition-worker.ts");
    const workers: ReturnType<typeof createTransitionWorker>[] = [];

    try {
      const repositoryUrl = pathToFileURL(
        path.join(process.cwd(), "src", "lib", "orders", "repository.ts"),
      ).href;
      writeFileSync(workerPath, `
        import { DatabaseSync } from "node:sqlite";
        import { updateOrderStatus, type UpdateOrderStatusInput } from ${JSON.stringify(repositoryUrl)};

        const [databasePath, orderId, nextStatus, actorId] = process.argv.slice(2);
        const database = new DatabaseSync(databasePath);
        database.exec("PRAGMA busy_timeout = 5000");
        process.stdout.write("READY\\n");

        process.stdin.once("data", () => {
          try {
            updateOrderStatus(database, {
              orderId,
              nextStatus,
              actorId,
            } as UpdateOrderStatusInput);
            process.stdout.write(JSON.stringify({ outcome: "updated" }) + "\\n");
          } catch (error) {
            process.stdout.write(JSON.stringify({
              outcome: "error",
              name: error instanceof Error ? error.name : "UnknownError",
            }) + "\\n");
          } finally {
            database.close();
          }
        });
      `, "utf8");

      const setupDatabase = new DatabaseSync(databasePath);
      const created = createOrder(setupDatabase, baseInput);
      const statusesAteTransporte: StatusPedido[] = [
        "aguardando_arte",
        "criando_arte",
        "aguardando_producao",
        "em_producao",
        "aguardando_retirada",
      ];
      for (const nextStatus of statusesAteTransporte) {
        updateOrderStatus(setupDatabase, { orderId: created.id, nextStatus, actorId: "setup" });
      }
      setupDatabase.close();

      workers.push(
        createTransitionWorker(workerPath, databasePath, created.id, "aguardando_feedback"),
        createTransitionWorker(workerPath, databasePath, created.id, "em_producao"),
      );
      await Promise.all(workers.map((worker) => worker.ready));
      const results = await Promise.all(workers.map((worker) => worker.run()));

      expect(results.map((result) => result.outcome).sort()).toEqual(["error", "updated"]);
      expect(results.find((result) => result.outcome === "error")?.name)
        .toBe("TransicaoStatusPedidoInvalidaError");

      const verificationDatabase = new DatabaseSync(databasePath);
      const persisted = findOrderById(verificationDatabase, created.id);
      const history = listOrderStatusHistory(verificationDatabase, created.id);
      verificationDatabase.close();

      expect(["aguardando_feedback", "em_producao"]).toContain(persisted?.status);
      expect(history).toHaveLength(statusesAteTransporte.length + 1);
      expect(history.at(-1)).toMatchObject({
        previousStatus: "aguardando_retirada",
        nextStatus: persisted?.status,
      });
    } finally {
      workers.forEach((worker) => worker.stop());
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 20_000);
});
