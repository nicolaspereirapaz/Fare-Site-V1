import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import type { SessionReader } from "@/lib/auth/session";
import { hasBackofficeAccess, resolveUserRole, type BackofficeSession } from "@/lib/backoffice/access";
import { isMockupFile, MOCKUPS_DIR, mockupPath, mockupUrl } from "@/lib/backoffice/mockupFiles";
import type { QuoteCartItem } from "@/lib/commerce";
import { replaceOrderItems } from "@/lib/orders/payments";
import { findOrderById } from "@/lib/orders/repository";
import { findQuoteById, replaceQuoteItems, type Quote } from "@/lib/quotes/repository";

type Kind = "quote" | "order";
export type MockupDeps = {
  getSession: SessionReader<BackofficeSession>;
  database: () => DatabaseSync;
  /** Foto original do produto (catálogo), sem o mockup. */
  productImageOf: (item: QuoteCartItem) => Promise<string | null>;
  /** Leitura da foto do fornecedor (troca nos testes). */
  fetchImage?: (url: string) => Promise<Response>;
};

const MAX_BYTES = 30 * 1024 * 1024;
const IMAGE_HOSTS = new Set(["cdn.xbzbrindes.com.br", "www.spotgifts.com.br", "media.asiaimport.com.br"]);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const kindOf = (value: unknown): Kind | null => (value === "quote" || value === "order" ? value : null);

function findDocument(db: DatabaseSync, kind: Kind, id: string) {
  return kind === "quote" ? findQuoteById(db, id) : findOrderById(db, id);
}

/** Grava o item com o mockup novo (ou sem); as regras de edição do orçamento/pedido continuam valendo. */
function saveMockup(db: DatabaseSync, kind: Kind, id: string, itemId: string, mockup: string | null) {
  const doc = findDocument(db, kind, id);
  if (!doc) throw new Error(kind === "quote" ? "Orçamento não encontrado." : "Pedido não encontrado.");
  const item = doc.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Item não encontrado.");
  const items = doc.items.map((entry) => {
    if (entry.id !== itemId) return entry;
    const next = { ...entry, mockup: mockup ?? undefined };
    if (!mockup) delete next.mockup;
    return next;
  });
  if (kind === "quote") {
    replaceQuoteItems(db, { quoteId: id, items, internalNotes: (doc as Quote).internalNotes, expectedUpdatedAt: doc.updatedAt });
  } else {
    replaceOrderItems(db, { orderId: id, items, expectedUpdatedAt: doc.updatedAt });
  }
  return item.mockup ?? null;
}

const dropFile = (file: string | null) => (file && isMockupFile(file) ? rm(mockupPath(file), { force: true }) : Promise.resolve());

/** Nome do arquivo baixado: código Fare + produto, sem caracteres que o Windows recusa. */
const downloadName = (item: QuoteCartItem, extension: string) =>
  `${[item.codes?.fare, item.productName, item.selections?.["Variação"]].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "produto"}.${extension}`;

export function createMockupHandlers(deps: MockupDeps) {
  async function staff(request: Request) {
    const session = await deps.getSession({ headers: request.headers });
    if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return json({ error: "FORBIDDEN" }, 403);
    return null;
  }

  return {
    /** Envia (ou troca) o mockup de um item: vira JPG e passa a ser a foto do item no painel e nos PDFs. */
    async upload(request: Request) {
      const denied = await staff(request);
      if (denied) return denied;
      const form = await request.formData().catch(() => null);
      const kind = kindOf(form?.get("kind"));
      const id = String(form?.get("id") ?? "");
      const itemId = String(form?.get("item") ?? "");
      const file = form?.get("file");
      if (!kind || !id || !itemId || !file || typeof file === "string") return json({ error: "INVALID_REQUEST", message: "Escolha a imagem do mockup." }, 400);
      if (file.size > MAX_BYTES) return json({ error: "INVALID_REQUEST", message: "Imagem muito grande (máximo 30 MB)." }, 400);
      let jpeg: Buffer;
      try {
        jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
          .rotate()
          .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch {
        return json({ error: "INVALID_REQUEST", message: "Envie uma imagem JPG, PNG ou WEBP." }, 400);
      }
      const name = `${randomUUID()}.jpg`;
      await mkdir(MOCKUPS_DIR, { recursive: true });
      await writeFile(mockupPath(name), jpeg);
      try {
        const previous = saveMockup(deps.database(), kind, id, itemId, name);
        await dropFile(previous);
      } catch (error) {
        await dropFile(name);
        return json({ error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Não foi possível salvar." }, 400);
      }
      return json({ mockupUrl: mockupUrl(name) });
    },

    /** Tira o mockup: o item volta a usar a foto do catálogo. */
    async remove(request: Request) {
      const denied = await staff(request);
      if (denied) return denied;
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const kind = kindOf(body?.kind);
      if (!kind || typeof body?.id !== "string" || typeof body.item !== "string") return json({ error: "INVALID_REQUEST" }, 400);
      try {
        await dropFile(saveMockup(deps.database(), kind, body.id, body.item, null));
      } catch (error) {
        return json({ error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Não foi possível remover." }, 400);
      }
      return json({ ok: true });
    },

    /** Mostra o mockup (só para a equipe; o cliente recebe a imagem dentro do PDF). */
    async serve(request: Request, file: string) {
      const denied = await staff(request);
      if (denied) return denied;
      if (!isMockupFile(file)) return json({ error: "NOT_FOUND" }, 404);
      const data = await readFile(mockupPath(file)).catch(() => null);
      if (!data) return json({ error: "NOT_FOUND" }, 404);
      return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
    },

    /** Baixa a foto original do produto (para a equipe editar e fazer o mockup). */
    async productPhoto(request: Request) {
      const denied = await staff(request);
      if (denied) return denied;
      const params = new URL(request.url).searchParams;
      const kind = kindOf(params.get("kind"));
      const doc = kind ? findDocument(deps.database(), kind, params.get("id") ?? "") : null;
      const item = doc?.items.find((entry) => entry.id === params.get("item"));
      if (!item) return json({ error: "NOT_FOUND", message: "Item não encontrado." }, 404);
      const source = await deps.productImageOf(item).catch(() => null);
      let data: Uint8Array<ArrayBuffer> | null = null;
      let type = "";
      if (source && /^\/images\/[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$/.test(source)) {
        const file = path.join(process.cwd(), "public", source);
        data = await readFile(file).then((buffer) => new Uint8Array(buffer)).catch(() => null);
        type = `image/${path.extname(file).slice(1).replace("jpg", "jpeg")}`;
      } else if (source && URL.canParse(source)) {
        const url = new URL(source);
        if (url.protocol === "https:" && IMAGE_HOSTS.has(url.hostname)) {
          const response = await (deps.fetchImage ?? ((target) => fetch(target, { redirect: "error", signal: AbortSignal.timeout(15000) })))(url.toString()).catch(() => null);
          type = response?.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
          if (response?.ok && /^image\/(png|jpeg|webp)$/.test(type)) data = new Uint8Array(await response.arrayBuffer());
        }
      }
      if (!data) return json({ error: "NOT_FOUND", message: "Este produto não tem foto para baixar." }, 404);
      const extension = type.slice("image/".length).replace("jpeg", "jpg");
      const name = downloadName(item, extension);
      return new Response(data, {
        headers: {
          "Content-Type": type,
          "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
          "Cache-Control": "no-store",
        },
      });
    },
  };
}
