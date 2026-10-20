import type { DatabaseSync } from "node:sqlite";

/** Linha do pedido de fotos: um tamanho + papel, com os arquivos já prontos na pasta. */
export type PhotoOrderLine = {
  sizeId: string;
  /** "Revelação 10 × 15 cm" */
  title: string;
  paper: string;
  /** Pasta do item dentro da pasta do pedido (ex.: "10x15 Brilho"). */
  folder: string;
  realSize: string | null;
  photos: number;
  copies: number;
  unitCents: number;
  totalCents: number;
  /** Arquivos prontos para imprimir, relativos à pasta do pedido. */
  files: Array<{ file: string; copies: number; original: string }>;
};

export type PhotoOrder = {
  id: string;
  /** Pedido do quadro (fare_orders) com o mesmo número: etapas, pagamento e documento da equipe. */
  orderId: string | null;
  code: string;
  userId: string;
  customerNumber: string;
  customer: { name: string; phone: string; company: string | null };
  delivery: "retirada" | "entrega";
  lines: PhotoOrderLine[];
  totalCents: number;
  photoCount: number;
  copies: number;
  /** Caminho completo da pasta do pedido no servidor. */
  folder: string;
  createdAt: string;
  filesDeletedAt: string | null;
};

export function ensurePhotoOrderTables(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fare_customer_numbers (
      number INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      folder_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fare_photo_orders (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      customer_number INTEGER NOT NULL REFERENCES fare_customer_numbers(number),
      customer_json TEXT NOT NULL,
      delivery TEXT NOT NULL CHECK (delivery IN ('retirada', 'entrega')),
      lines_json TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      photo_count INTEGER NOT NULL,
      copies INTEGER NOT NULL,
      folder TEXT NOT NULL,
      created_at TEXT NOT NULL,
      files_deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS fare_photo_orders_created ON fare_photo_orders (created_at DESC);
  `);
  const columns = (database.prepare("PRAGMA table_info(fare_photo_orders)").all() as Array<{ name: string }>).map((column) => column.name);
  if (!columns.includes("order_id")) database.exec("ALTER TABLE fare_photo_orders ADD COLUMN order_id TEXT");
}

export const formatCustomerNumber = (number: number) => `C${String(number).padStart(4, "0")}`;

/** Número do cliente (C0001…): criado no 1º pedido e nunca muda; a pasta dele também fica fixa. */
export function customerNumberFor(database: DatabaseSync, userId: string, folderName: string) {
  ensurePhotoOrderTables(database);
  const found = database.prepare("SELECT number, folder_name FROM fare_customer_numbers WHERE user_id = ?").get(userId) as { number: number; folder_name: string } | undefined;
  if (found) return { number: found.number, folderName: found.folder_name };
  database.prepare("INSERT INTO fare_customer_numbers (user_id, folder_name, created_at) VALUES (?, '', ?)").run(userId, new Date().toISOString());
  const created = database.prepare("SELECT number FROM fare_customer_numbers WHERE user_id = ?").get(userId) as { number: number };
  const name = `${folderName} - ${formatCustomerNumber(created.number)}`;
  database.prepare("UPDATE fare_customer_numbers SET folder_name = ? WHERE number = ?").run(name, created.number);
  return { number: created.number, folderName: name };
}

type Row = {
  id: string; order_id: string | null; code: string; user_id: string; customer_number: number; customer_json: string; delivery: "retirada" | "entrega";
  lines_json: string; total_cents: number; photo_count: number; copies: number; folder: string; created_at: string; files_deleted_at: string | null;
};
const fromRow = (row: Row): PhotoOrder => ({
  id: row.id, orderId: row.order_id ?? null, code: row.code, userId: row.user_id, customerNumber: formatCustomerNumber(row.customer_number),
  customer: JSON.parse(row.customer_json), delivery: row.delivery, lines: JSON.parse(row.lines_json), totalCents: row.total_cents,
  photoCount: row.photo_count, copies: row.copies, folder: row.folder, createdAt: row.created_at, filesDeletedAt: row.files_deleted_at,
});

export function insertPhotoOrder(database: DatabaseSync, order: Omit<PhotoOrder, "customerNumber" | "filesDeletedAt"> & { customerNumber: number }) {
  ensurePhotoOrderTables(database);
  database.prepare(`INSERT INTO fare_photo_orders
    (id, order_id, code, user_id, customer_number, customer_json, delivery, lines_json, total_cents, photo_count, copies, folder, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    order.id, order.orderId, order.code, order.userId, order.customerNumber, JSON.stringify(order.customer), order.delivery,
    JSON.stringify(order.lines), order.totalCents, order.photoCount, order.copies, order.folder, order.createdAt,
  );
}

export function codeExists(database: DatabaseSync, code: string) {
  ensurePhotoOrderTables(database);
  return Boolean(database.prepare("SELECT 1 FROM fare_photo_orders WHERE code = ?").get(code));
}

export function listPhotoOrders(database: DatabaseSync, limit = 200): PhotoOrder[] {
  ensurePhotoOrderTables(database);
  return (database.prepare("SELECT * FROM fare_photo_orders ORDER BY created_at DESC LIMIT ?").all(limit) as unknown as Row[]).map(fromRow);
}

export function getPhotoOrder(database: DatabaseSync, id: string): PhotoOrder | null {
  ensurePhotoOrderTables(database);
  const row = database.prepare("SELECT * FROM fare_photo_orders WHERE id = ?").get(id) as unknown as Row | undefined;
  return row ? fromRow(row) : null;
}

/** Pedido de fotos ligado a um pedido do quadro (para o atalho "Fotos e pasta" na página do pedido). */
export function getPhotoOrderByOrderId(database: DatabaseSync, orderId: string): PhotoOrder | null {
  ensurePhotoOrderTables(database);
  const row = database.prepare("SELECT * FROM fare_photo_orders WHERE order_id = ?").get(orderId) as unknown as Row | undefined;
  return row ? fromRow(row) : null;
}

export function markPhotoFilesDeleted(database: DatabaseSync, id: string) {
  database.prepare("UPDATE fare_photo_orders SET files_deleted_at = ? WHERE id = ?").run(new Date().toISOString(), id);
}
