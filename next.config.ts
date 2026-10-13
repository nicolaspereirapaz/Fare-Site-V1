import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite testar o site a partir de outros dispositivos da rede local.
  allowedDevOrigins: ["192.168.15.234", "127.0.0.1", "localhost"],
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
