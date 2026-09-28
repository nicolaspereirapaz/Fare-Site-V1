import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite testar o site a partir de outros dispositivos da rede local.
  allowedDevOrigins: ["192.168.15.234", "127.0.0.1", "localhost"],
  images: {
    // As fotos dos brindes são servidas pelo CDN do fornecedor XBZ.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.xbzbrindes.com.br",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
