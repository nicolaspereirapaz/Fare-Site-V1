import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StaffTopbar } from '@/components/staff/StaffTopbar';
import { StaffDocumentPage } from '@/components/staff/StaffDocumentPage';
import { canCancelOrders } from '@/lib/backoffice/access';
import { getStaffSession } from '@/lib/staff/server';
import '@/components/staff/quoteEditor.css';
import '@/components/staff/staffDocument.css';
export const metadata:Metadata={title:'Consultar orçamento'};
export default async function QuotePage({params}:{params:Promise<{id:string}>}){
 const session=await getStaffSession();if(!session)redirect('/equipe/entrar');
 const {id}=await params;
 return <><StaffTopbar name={session.user.name} role={session.user.role}/><StaffDocumentPage key={id} kind="quote" id={id} canCancel={canCancelOrders(session.user.role)}/></>;
}
