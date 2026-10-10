import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/PasswordResetForms";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return <section className="auth-page container-shell"><ForgotPasswordForm /></section>;
}
