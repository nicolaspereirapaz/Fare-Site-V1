import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StaffTopbar } from '@/components/staff/StaffTopbar';
import { StaffDocumentPage } from '@/components/staff/StaffDocumentPage';
import { canCancelOrders } from '@/lib/backoffice/access';
import { getStaffSession } from '@/lib/staff/server';
import { database } from '@/lib/auth';
import { getPhotoOrderByOrderId } from '@/lib/photoOrders/repository';
import Link from 'next/link';
import '@/components/staff/fotos/kanbanFotos.css';
import '@/components/staff/quoteEditor.css';
import '@/components/staff/staffDocument.css';
export const metadata:Metadata={title:'Consultar pedido'};
export default async function OrderPage({params}:{params:Promise<{id:string}>}){
 const session=await getStaffSession();if(!session)redirect('/equipe/entrar');
 const {id}=await params;
 const photos=getPhotoOrderByOrderId(database,id);
 return <><StaffTopbar name={session.user.name} role={session.user.role}/>
  {photos?<div className="pf-order-banner container-shell"><strong>Pedido de fotos</strong><span>{photos.photoCount} fotos · {photos.copies} cópias · pasta <code>{photos.folder}</code></span><Link href={`/equipe/fotos/${photos.id}`}>Ver fotos e pasta</Link></div>:null}
  <StaffDocumentPage key={id} kind="order" id={id} canCancel={canCancelOrders(session.user.role)}/></>;
}
