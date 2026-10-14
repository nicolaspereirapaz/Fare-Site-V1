import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QuoteEditor } from "@/components/staff/QuoteEditor";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/quoteEditor.css";
export const metadata: Metadata = { title: "Novo pedido" };
export default async function NewOrderPage() {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  return <><StaffTopbar name={session.user.name} role={session.user.role} /><QuoteEditor mode="order" /></>;
}
