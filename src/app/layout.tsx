import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { CartProvider } from "@/context/CartContext";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getCurrentSession } from "@/lib/auth/server";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Fare Foto — impressão, fotografia e personalizados",
    template: "%s | Fare Foto",
  },
  description:
    "Revelação de fotos, quadros, porta-retratos, materiais gráficos e brindes personalizados em Jundiaí.",
  icons: { icon: "/images/fare-foto-logo.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getCurrentSession();

  return (
    <html lang="pt-BR" className={`${dmSans.variable} ${outfit.variable}`}>
      <body>
        <CartProvider>
          <Header user={session ? { name: session.user.name } : null} />
          <main>{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
