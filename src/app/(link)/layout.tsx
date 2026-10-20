import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import "../globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], display: "swap" });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Fare Foto", template: "%s | Fare Foto" },
  icons: { icon: "/images/fare-foto-simbolo.svg" },
  robots: { index: false, follow: false },
};

/** Páginas abertas por link da loja (sem menu, carrinho ou login): só a marca no topo. */
export default function LinkLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="pt-BR" className={`${dmSans.variable} ${outfit.variable}`}>
      <body>
        <header className="fp-link-top">
          <div className="container-shell">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Fare Foto" height={44} src="/images/fare-foto-logo-slogan.svg" width={82} />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
