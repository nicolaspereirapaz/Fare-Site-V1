import type { SessionReader } from '@/lib/auth/session';
import { hasBackofficeAccess, resolveUserRole, type BackofficeSession, type OrderHistoryEntry } from '@/lib/backoffice/access';
import type { QuoteCartItem, QuoteCustomer } from '@/lib/commerce';
import type { OrderFinance } from '@/lib/orders/payments';
import { orderCode } from '@/lib/orders/orderCode';
import type { Order, PaymentMethod } from '@/lib/orders/repository';
import { discountLine, freightOf } from '@/lib/quotes/discount';
import { quoteCode } from '@/lib/quotes/quoteCode';
import type { Quote } from '@/lib/quotes/repository';

export type ProductCatalogInfo = { description: string; printingAreas: Array<{ technique: string; location: string; area: string }>; specs?: Array<{ label: string; value: string }> };
export type DocumentItem = QuoteCartItem & { imageUrl: string | null; catalogInfo?: ProductCatalogInfo | null };
export type StaffDocument = {
  kind: 'order' | 'quote'; id: string; code: string; status: string;
  customer: QuoteCustomer; items: DocumentItem[]; total: number | null;
  discount: { label: string; amount: number } | null;
  /** Frete cobrado (R$, 0 = a combinar). */
  freight?: number;
  createdAt: string; updatedAt: string; createdBy: string | null; internalNotes: string;
  finance: OrderFinance | null; paymentMethod: PaymentMethod | null;
  proposalSentAt: string | null; orderId: string | null; history: OrderHistoryEntry[];
  /** Entrega prevista do orçamento (pedido usa `finance`). */
  quoteDelivery?: { date: string | null; time: string | null } | null;
};

type DetailDeps = {
  kind: StaffDocument['kind']; getSession: SessionReader<BackofficeSession>;
  find: (id: string) => Order | Quote | null;
  finance?: (id: string) => OrderFinance | null;
  history?: (id: string) => OrderHistoryEntry[];
  imageOf: (item: QuoteCartItem) => Promise<string | null>;
  productOf?: (item: QuoteCartItem) => Promise<{ imageUrl: string | null; catalogInfo: ProductCatalogInfo | null }>;
};
const json = (body: unknown, status = 200) => Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
/** Snapshot interno completo, somente depois da autorização; não recalcula preços nem personalização. */
export function createDocumentDetailsHandler(deps: DetailDeps) {
  return async (request: Request, id: string) => {
    const session = await deps.getSession({headers:request.headers});
    if (!session) return json({error:'AUTH_REQUIRED'},401);
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return json({error:'FORBIDDEN'},403);
    const record=deps.find(id);
    if (!record) return json({error:deps.kind==='order'?'ORDER_NOT_FOUND':'QUOTE_NOT_FOUND'},404);
    const finance=deps.kind==='order'?deps.finance?.(id)??null:null;
    const quote=deps.kind==='quote'?record as Quote:null;
    const items=await Promise.all(record.items.map(async item=>{
      if(deps.productOf){const product=await deps.productOf(item).catch(()=>({imageUrl:null,catalogInfo:null}));return {...item,...product};}
      return {...item,imageUrl:await deps.imageOf(item).catch(()=>null)};
    }));
    const document:StaffDocument={
      kind:deps.kind,id:record.id,code:quote?quoteCode(record.id):orderCode(record.id),status:record.status,
      customer:record.customer,items,total:record.totalCents===null?null:record.totalCents/100,
      discount:discountLine(record.discount,record.items),freight:freightOf(record.discount),createdAt:record.createdAt,updatedAt:record.updatedAt,
      createdBy:quote?.createdBy??finance?.createdBy??null,internalNotes:quote?.internalNotes??finance?.internalNotes??'',
      finance,paymentMethod:quote?null:(record as Order).paymentMethod,
      proposalSentAt:quote?.proposalSentAt??null,orderId:quote?.orderId??null,history:deps.history?.(id)??[],
      quoteDelivery:quote?{date:quote.deliveryDate,time:quote.deliveryTime}:null,
    };
    return json({document});
  };
}
