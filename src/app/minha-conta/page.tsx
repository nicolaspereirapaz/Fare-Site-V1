import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountOverview } from "@/components/AccountOverview";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentSession } from "@/lib/auth/server";
import { DEFAULT_USER_ROLE, isUserRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/entrar");

  const storedRole = (session.user as typeof session.user & { role?: unknown }).role;
  const role = isUserRole(storedRole) ? storedRole : DEFAULT_USER_ROLE;

  return (
    <section className="account-section">
      <AccountOverview user={{
        name: session.user.name,
        email: session.user.email,
        role,
      }} />
      <div className="account-sign-out container-shell"><SignOutButton /></div>
    </section>
  );
}
