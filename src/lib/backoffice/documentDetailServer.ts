import { database } from '@/lib/auth';
import { staffDatabase } from '@/lib/staff/auth';
import { readStaffSession } from '@/lib/staff/server';
import { createDocumentDetailsHandler } from '@/lib/backoffice/documentDetails';
import { findOrderById, listOrderStatusHistory } from '@/lib/orders/repository';
import { getOrderFinance } from '@/lib/orders/payments';
import { findQuoteById } from '@/lib/quotes/repository';
import { documentImageOf, documentProductOf } from '@/lib/proposals/catalogImages';
const getSession=readStaffSession;
export const readOrderDocument=createDocumentDetailsHandler({kind:'order',getSession,find:id=>findOrderById(database,id),finance:id=>getOrderFinance(database,id),imageOf:documentImageOf,productOf:documentProductOf,history:id=>listOrderStatusHistory(database,id).map(entry=>{
 const row=staffDatabase.prepare('SELECT name FROM user WHERE id = ?').get(entry.actorId) as {name:string}|undefined;
 return {status:entry.nextStatus,from:entry.previousStatus,at:entry.createdAt,by:entry.actorId==='temporary-open-admin'?'Acesso temporário — sem autenticação':row?.name??'Equipe'};
})});
export const readQuoteDocument=createDocumentDetailsHandler({kind:'quote',getSession,find:id=>findQuoteById(database,id),imageOf:documentImageOf,productOf:documentProductOf});
