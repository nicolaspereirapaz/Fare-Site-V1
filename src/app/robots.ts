import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

/** Buscadores: loja aberta; área da equipe, conta, carrinho e links de fotos dos clientes fechados. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/equipe", "/backoffice", "/fotos/", "/carrinho", "/minha-conta", "/entrar", "/cadastro", "/esqueci-senha", "/redefinir-senha"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
