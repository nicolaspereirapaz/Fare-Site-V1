import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import "../globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Equipe — Fare Foto", template: "%s | Equipe Fare Foto" },
  // Área interna: fora dos buscadores.
  robots: { index: false, follow: false },
};

/** Área da equipe: layout próprio, sem o menu, carrinho e rodapé da loja. */
export default function StaffRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="pt-BR" className={`${dmSans.variable} ${outfit.variable}`}>
      <body className="staff-body">{children}</body>
    </html>
  );
}
