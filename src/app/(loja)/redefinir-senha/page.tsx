import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/PasswordResetForms";

export const metadata: Metadata = { title: "Redefinir senha" };

type SearchParams = Promise<{ token?: string | string[]; error?: string | string[] }>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <section className="auth-page container-shell">
      <ResetPasswordForm error={first(params.error)} token={first(params.token)} />
    </section>
  );
}
