import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QuoteEditor } from "@/components/staff/QuoteEditor";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { database } from "@/lib/auth";
import { resolveCustomer } from "@/lib/customers/repository";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/quoteEditor.css";
export const metadata: Metadata = { title: "Novo pedido" };
/** ?cliente=<ref>: já vem com o cliente (botão "Novo pedido" do atendimento). */
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const { cliente } = await searchParams;
  const customer = typeof cliente === "string" ? resolveCustomer(database, cliente.slice(0, 120)) : null;
  return <><StaffTopbar name={session.user.name} role={session.user.role} current="quadro" /><QuoteEditor initialCustomer={customer} mode="order" /></>;
}
