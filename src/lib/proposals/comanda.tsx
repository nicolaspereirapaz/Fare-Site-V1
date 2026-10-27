import { queuePdfForPrinting } from "@/lib/printQueue";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import sharp from "sharp";
import type { SessionReader } from "@/lib/auth/session";
import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import { mockupFileOf } from "@/lib/backoffice/mockupFiles";
import type { QuoteCartItem } from "@/lib/commerce";
import { orderCode } from "@/lib/orders/orderCode";
import { getOrderFinance, type OrderFinance } from "@/lib/orders/payments";
import { paymentPlan } from "@/lib/orders/paymentPlan";
import { findOrderById, type Order } from "@/lib/orders/repository";
import { buildOrderDocument, orderDeliveryAddress, type OrderDocument } from "./orderDocument";
import { registerFonts } from "./pdf";
import { brl } from "./proposal";

/** Comanda: etiqueta A5 colada no pacote do pedido (cliente, produtos, entrega e quanto falta pagar). */
export type Comanda = {
  doc: OrderDocument;
  createdBy: string | null;
  notes: string;
  delivery: { mode: "retirada" | "entrega"; date: string | null; time: string | null; address: string | null } | null;
  /** null = pagamento ainda não registrado. */
  payment: { total: number; paid: number; balance: number; onPickup: boolean; plan: ReturnType<typeof paymentPlan> } | null;
  images: Array<string | null>;
  printedAt: string;
};

const ASSETS = path.join(process.cwd(), "src", "assets");
const IMAGE_HOSTS = new Set(["cdn.xbzbrindes.com.br", "www.spotgifts.com.br", "media.asiaimport.com.br"]);
const dateBR = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
const dateTimeBR = (value: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(value);

/** Foto pequena do item (mockup, foto local ou do fornecedor) em JPG; o react-pdf não lê WEBP. */
async function thumbnail(source: string | null): Promise<string | null> {
  if (!source) return null;
  try {
    let data: Buffer | null = null;
    const mockup = mockupFileOf(source);
    if (mockup) data = await readFile(mockup);
    else if (/^\/images\/[a-zA-Z0-9_/-]+\.(png|jpe?g|webp)$/.test(source)) data = await readFile(path.join(process.cwd(), "public", source));
    else if (URL.canParse(source) && IMAGE_HOSTS.has(new URL(source).hostname) && source.startsWith("https://")) {
      const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(6000) });
      if (response.ok) data = Buffer.from(await response.arrayBuffer());
    }
    if (!data) return null;
    const jpeg = await sharp(data).resize({ width: 240, height: 240, fit: "inside" }).flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildComanda(order: Order, finance: OrderFinance | null, imageOf: (item: QuoteCartItem) => Promise<string | null>, now = new Date()): Promise<Comanda> {
  const sources = await Promise.all(order.items.map((item) => imageOf(item).catch(() => null)));
  const doc = buildOrderDocument(order, finance, { seller: "", siteUrl: "", imageOf: (item) => sources[order.items.indexOf(item)] ?? null });
  return {
    doc,
    createdBy: finance?.createdBy ?? null,
    notes: order.customer.notes?.trim() ?? "",
    delivery: finance ? { mode: finance.deliveryMode, date: finance.deliveryDate, time: finance.deliveryTime ?? null, address: orderDeliveryAddress(order, finance) } : null,
    payment: finance ? { total: doc.total, paid: finance.paidCents / 100, balance: Math.max(0, finance.balanceCents) / 100, onPickup: Boolean(finance.paymentOnPickup), plan: paymentPlan(finance) } : null,
    images: await Promise.all(doc.items.map((item) => thumbnail(item.imageUrl))),
    printedAt: dateTimeBR(now),
  };
}

const C = { ink: "#111111", navy: "#2B3854", orange: "#F65C2D", muted: "#5f6470", line: "#d9dbe1", soft: "#f3f4f7" };
const s = StyleSheet.create({
  page: { paddingTop: 22, paddingBottom: 18, paddingHorizontal: 24, fontFamily: "DM Sans", fontSize: 9.5, color: C.ink, lineHeight: 1.35 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: C.orange },
  logo: { width: 78, height: 37 },
  eyebrow: { fontSize: 7.5, fontWeight: 700, letterSpacing: 1.2, color: C.muted, textTransform: "uppercase" },
  code: { fontFamily: "Outfit", fontWeight: 700, fontSize: 24, lineHeight: 1.1, color: C.ink, textAlign: "right" },
  sub: { fontSize: 8, color: C.muted, textAlign: "right", marginTop: 2 },
  /** Pagamento: discreto, no pé da página (a comanda vai colada no pacote, à vista do cliente). */
  pay: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 0.75, borderColor: C.line, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10 },
  payStatus: { fontSize: 9.5, fontWeight: 700, marginTop: 2 },
  payDetail: { fontSize: 8, color: C.muted, textAlign: "right" },
  company: { fontSize: 7, color: C.muted, marginTop: 5, lineHeight: 1.3 },
  cols: { flexDirection: "row", marginTop: 14, paddingBottom: 12, borderBottomWidth: 0.75, borderBottomColor: C.line },
  col: { flex: 1, paddingRight: 10 },
  big: { fontSize: 13, fontWeight: 700, marginTop: 3 },
  line: { fontSize: 9, color: C.ink, marginTop: 1.5 },
  mutedLine: { fontSize: 8.5, color: C.muted, marginTop: 1.5 },
  items: { marginTop: 12 },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: 0.75, borderBottomColor: C.line },
  thumb: { width: 50, height: 50, objectFit: "contain", borderWidth: 0.75, borderColor: C.line, borderRadius: 5, marginRight: 10 },
  thumbSpace: { width: 50, height: 50, borderRadius: 5, backgroundColor: C.soft, marginRight: 10 },
  itemText: { flex: 1, paddingRight: 8 },
  itemName: { fontSize: 10.5, fontWeight: 700 },
  /** Colunas da lista: Qtd | Preço unit. | Preço total, alinhadas à direita. */
  head: { flexDirection: "row", alignItems: "flex-end", paddingBottom: 4, borderBottomWidth: 0.75, borderBottomColor: C.line },
  colQty: { width: 46, textAlign: "right" },
  colUnit: { width: 62, marginLeft: 12, textAlign: "right" },
  colTotal: { width: 70, marginLeft: 10, textAlign: "right" },
  /** Qtd, preço unit. e preço total: mesmo tamanho e peso. */
  money: { fontSize: 10, fontWeight: 700 },
  notes: { marginTop: 12, backgroundColor: C.soft, borderRadius: 6, padding: 9 },
  /** Empurra o rodapé para o pé da página. */
  spacer: { flexGrow: 1 },
  foot: { marginTop: 12, paddingTop: 6, borderTopWidth: 0.75, borderTopColor: C.line, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.muted },
});

function PaymentBox({ payment }: { payment: Comanda["payment"] }) {
  const status = !payment ? "Não registrado" : payment.balance <= 0 ? "Pago" : `Falta pagar ${brl(payment.balance)}`;
  return (
    <View style={s.pay} wrap={false}>
      <View>
        <Text style={s.eyebrow}>Pagamento</Text>
        <Text style={s.payStatus}>{status}</Text>
      </View>
      <View>
        {payment ? <Text style={s.payDetail}>Total {brl(payment.total)} · Pago {brl(payment.paid)}</Text> : <Text style={s.payDetail}>Confira com o atendente.</Text>}
        {payment?.plan.receipts.map((r, i) => <Text key={i} style={s.payDetail}>Pago {r.label} · {r.amount}</Text>)}
        {payment?.plan.remainder ? <Text style={s.payDetail}>{payment.plan.remainder.label} · {payment.plan.remainder.amount}</Text> : null}
      </View>
    </View>
  );
}

export function ComandaDocument({ comanda, logo }: { comanda: Comanda; logo: string }) {
  const { doc, delivery } = comanda;
  const customer = doc.customer;
  return (
    <Document title={`Comanda ${doc.code}`} author="Fare Foto">
      <Page size="A5" style={s.page}>
        <View style={s.top}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image não tem alt */}
            <Image src={logo} style={s.logo} />
            <Text style={s.company}>{doc.company.document}</Text>
            <Text style={[s.company, { marginTop: 0 }]}>{doc.company.address}</Text>
          </View>
          <View>
            <Text style={[s.eyebrow, { textAlign: "right" }]}>Comanda do pedido</Text>
            <Text style={s.code}>{doc.code}</Text>
            <Text style={s.sub}>{doc.issuedAt}{comanda.createdBy ? ` · por ${comanda.createdBy}` : ""}</Text>
          </View>
        </View>

        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.eyebrow}>Cliente</Text>
            <Text style={s.big}>{customer.name || customer.company || "Cliente não informado"}</Text>
            {customer.company && customer.name ? <Text style={s.line}>{customer.company}</Text> : null}
            {customer.phone ? <Text style={s.line}>{customer.phone}</Text> : null}
          </View>
          <View style={[s.col, { paddingRight: 0 }]}>
            <Text style={s.eyebrow}>{delivery?.mode === "entrega" ? "Entrega" : "Retirada"}</Text>
            <Text style={s.big}>{delivery?.date ? `${dateBR(delivery.date)}${delivery.time ? ` às ${delivery.time}` : ""}` : "Data a combinar"}</Text>
            <Text style={s.line}>{delivery ? (delivery.mode === "entrega" ? "Entregar ao cliente" : "Retirada na loja") : "Forma de entrega não informada"}</Text>
            {delivery?.address ? <Text style={s.mutedLine}>{delivery.address}</Text> : null}
          </View>
        </View>

        <View style={s.items}>
          <View style={s.head}>
            <Text style={[s.eyebrow, { flex: 1 }]}>Produtos ({doc.items.length})</Text>
            <Text style={[s.eyebrow, s.colQty]}>Qtd</Text>
            <Text style={[s.eyebrow, s.colUnit]}>Preço unit.</Text>
            <Text style={[s.eyebrow, s.colTotal]}>Preço total</Text>
          </View>
          {doc.items.map((item, index) => (
            <View key={index} style={s.item} wrap={false}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image não tem alt */}
              {comanda.images[index] ? <Image src={comanda.images[index]!} style={s.thumb} /> : <View style={s.thumbSpace} />}
              <View style={s.itemText}>
                <Text style={s.itemName}>{item.name}</Text>
                {/* Foto: tamanho e papel em destaque (é o que a produção precisa). */}
                {item.unitLabel && item.specs?.[0] ? <Text style={s.line}>Tamanho {item.specs[0]} · {item.color ?? "Papel a definir"}</Text>
                  : [item.code, item.color].filter(Boolean).length ? <Text style={s.mutedLine}>{[item.code, item.color].filter(Boolean).join(" · ")}</Text> : null}
                {item.engravings.map((engraving, i) => <Text key={i} style={s.line}>{engraving}</Text>)}
              </View>
              <Text style={[s.money, s.colQty]}>{item.quantity}</Text>
              <Text style={[s.money, s.colUnit]}>{brl(item.unitPrice)}</Text>
              <Text style={[s.money, s.colTotal]}>{brl(item.total)}</Text>
            </View>
          ))}
        </View>

        {comanda.notes ? <View style={s.notes} wrap={false}><Text style={s.eyebrow}>Observações</Text><Text style={[s.line, { marginTop: 3 }]}>{comanda.notes}</Text></View> : null}

        <View style={s.spacer} />
        <PaymentBox payment={comanda.payment} />
        <View style={s.foot} wrap={false}>
          <Text>{doc.company.name} · WhatsApp {doc.company.whatsapp}</Text>
          <Text>Impresso em {comanda.printedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderComandaPdf(comanda: Comanda): Promise<Buffer> {
  registerFonts();
  // Logo como data URL: caminho de arquivo no Windows ("C:\...") é lido como URL pelo react-pdf.
  const logo = `data:image/png;base64,${(await readFile(path.join(ASSETS, "proposal-logo.png"))).toString("base64")}`;
  return renderToBuffer(<ComandaDocument comanda={comanda} logo={logo} />);
}

type ComandaDeps = {
  getSession: SessionReader<{ user: { id: string; role?: unknown } }>;
  database: () => DatabaseSync;
  imageOf: (item: QuoteCartItem) => Promise<string | null>;
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** PDF A5 da comanda (só equipe). */
export function createComandaHandler(deps: ComandaDeps) {
  return async (request: Request, id: string) => {
    const session = await deps.getSession({ headers: request.headers });
    if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return json({ error: "FORBIDDEN" }, 403);
    const db = deps.database();
    const order = findOrderById(db, id);
    if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);
    let pdf: Buffer;
    try {
      pdf = await renderComandaPdf(await buildComanda(order, getOrderFinance(db, id), deps.imageOf));
    } catch (error) {
      return json({ error: "CANNOT_DOCUMENT", message: error instanceof Error ? error.message : "Não foi possível gerar a comanda." }, 409);
    }
    if (request.method === "POST") {
      // Imprimir direto: vai para a fila da loja (o oraculo imprime na WF-7840, gaveta 1).
      try {
        const pages = await queuePdfForPrinting(pdf, `Comanda-${orderCode(order.id)}`);
        return json({ queued: pages });
      } catch (error) {
        return json({ error: "PRINT_FAILED", message: error instanceof Error ? error.message : "Não foi possível imprimir." }, 503);
      }
    }
    const inline = new URL(request.url).searchParams.get("ver") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="Comanda-${orderCode(order.id)}.pdf"`, "Cache-Control": "no-store" },
    });
  };
}
