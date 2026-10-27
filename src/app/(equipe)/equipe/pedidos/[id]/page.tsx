import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { StaffTopbar } from '@/components/staff/StaffTopbar';
import { StaffDocumentPage } from '@/components/staff/StaffDocumentPage';
import { canCancelOrders } from '@/lib/backoffice/access';
import { getStaffSession } from '@/lib/staff/server';
import { database } from '@/lib/auth';
import { getPhotoOrderByOrderId } from '@/lib/photoOrders/repository';
import { PhotoOrderFiles } from '@/components/staff/fotos/PhotoOrderFiles';
import '@/components/staff/fotos/kanbanFotos.css';
import '@/components/staff/quoteEditor.css';
import '@/components/staff/staffDocument.css';
export const metadata:Metadata={title:'Consultar pedido'};
export default async function OrderPage({params}:{params:Promise<{id:string}>}){
 const session=await getStaffSession();if(!session)redirect('/equipe/entrar');
 const {id}=await params;
 const photos=getPhotoOrderByOrderId(database,id);
 return <><StaffTopbar name={session.user.name} role={session.user.role} current="quadro"/>
  <StaffDocumentPage key={id} kind="order" id={id} canCancel={canCancelOrders(session.user.role)}>{photos?<PhotoOrderFiles order={photos}/>:null}</StaffDocumentPage></>;
}
