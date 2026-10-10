import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentSession } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  if (await getCurrentSession()) redirect("/minha-conta");

  return <section className="auth-page container-shell"><AuthForm mode="sign-up" /></section>;
}
