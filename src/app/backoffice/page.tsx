import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackofficeBoard } from "@/components/BackofficeBoard";
import { getCurrentSession } from "@/lib/auth/server";
import { DEFAULT_USER_ROLE, isUserRole } from "@/lib/auth/roles";
import { canCancelOrders } from "@/lib/backoffice/access";

export const metadata: Metadata = { title: "Backoffice" };

export default async function BackofficePage() {
  const session = await getCurrentSession();
  if (!session) redirect("/");

  const storedRole = (session.user as typeof session.user & { role?: unknown }).role;
  const role = isUserRole(storedRole) ? storedRole : DEFAULT_USER_ROLE;
  if (role !== "vendedor" && role !== "admin") redirect("/");

  return <BackofficeBoard canCancel={canCancelOrders(role)} />;
}
