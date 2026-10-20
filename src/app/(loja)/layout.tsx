import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { headers } from "next/headers";
import { Analytics } from "@/components/Analytics";
import { CartProvider } from "@/context/CartContext";
import { CampaignFooter, CampaignHeader } from "@/components/CampaignChrome";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { analyticsIds } from "@/lib/analytics";
import { getCurrentSession } from "@/lib/auth/server";
import { getMenuCategories } from "@/lib/menuCategoriesServer";
import { CAMPAIGN_SITE_HEADER } from "@/lib/siteMode";
import "../globals.css";

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
  icons: { icon: "/images/fare-foto-simbolo.svg" },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Campanha isolada: sem login, sessão, menu ou carrinho geral (o proxy marca a requisição).
  if ((await headers()).get(CAMPAIGN_SITE_HEADER) === "campaign") {
    return (
      <html data-scroll-behavior="smooth" lang="pt-BR" className={`${dmSans.variable} ${outfit.variable}`}>
        <body>
          <CampaignHeader />
          <main>{children}</main>
          <CampaignFooter />
          <Analytics {...analyticsIds()} />
        </body>
      </html>
    );
  }

  const [session, categories] = await Promise.all([getCurrentSession(), getMenuCategories()]);

  return (
    <html data-scroll-behavior="smooth" lang="pt-BR" className={`${dmSans.variable} ${outfit.variable}`}>
      <body>
        <CartProvider>
          <Header categories={categories} user={session ? { name: session.user.name } : null} />
          <main>{children}</main>
          <Footer />
        </CartProvider>
        <Analytics {...analyticsIds()} />
      </body>
    </html>
  );
}
