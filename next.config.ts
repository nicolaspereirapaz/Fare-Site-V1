import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacote autônomo para o servidor da loja (oraculo): .next/standalone + static + public.
  output: "standalone",
  // O rastreio do Next leva o .node do sharp mas não as DLLs do libvips ao lado dele (sem elas: ERR_DLOPEN_FAILED 126).
  outputFileTracingIncludes: { "/*": ["node_modules/@img/sharp-win32-x64/lib/**"] },
  // Nunca empacotar dados, segredos e arquivos locais (bancos com clientes e senhas, fotos, .env).
  outputFileTracingExcludes: { "/*": ["data/**", ".env*", "graphify-out/**", "dev-profile/**", "docs/**", "scripts/**"] },
  // Não anuncia a tecnologia do site ("X-Powered-By: Next.js").
  poweredByHeader: false,
  // Cabeçalhos de proteção em todas as páginas e APIs.
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        // Ninguém de fora coloca o site dentro de um iframe (clickjacking); a pré-visualização interna continua.
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        // O navegador não "adivinha" o tipo do arquivo (evita imagem enviada virar script).
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }];
  },
  // Permite testar o site a partir de outros dispositivos da rede local.
  allowedDevOrigins: ["192.168.15.234", "100.111.15.19", "127.0.0.1", "localhost"],
  images: {
    // As fotos dos brindes vêm dos fornecedores (XBZ, Spot e Asia Import).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.xbzbrindes.com.br",
        pathname: "/**",
      },
      { protocol: "https", hostname: "www.spotgifts.com.br", pathname: "/fotos/**" },
      { protocol: "https", hostname: "media.asiaimport.com.br", pathname: "/**" },
    ],
  },
};

export default nextConfig;
