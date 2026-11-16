import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/atendimento/themeCookie";
import "../globals.css";
import "@/components/staff/atendimento/atendimento-dark.css";
import "@/components/staff/staff-dark.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Equipe — Fare Foto", template: "%s | Equipe Fare Foto" },
  // Área interna: fora dos buscadores.
  robots: { index: false, follow: false },
};

/** Área da equipe: layout próprio, sem o menu, carrinho e rodapé da loja. Tema claro/escuro (botão no topo) vale em todas as telas. */
export default async function StaffRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const dark = (await cookies()).get(THEME_COOKIE)?.value === "escuro";
  return (
    <html data-scroll-behavior="smooth" lang="pt-BR" className={`${dmSans.variable} ${outfit.variable}`}>
      <body className="staff-body atd-root" data-atd-theme={dark ? "dark" : "light"}>{children}</body>
    </html>
  );
}
