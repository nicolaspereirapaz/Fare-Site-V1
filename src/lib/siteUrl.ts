/** Endereço público do site (robots, sitemap). No oraculo pode mudar com FARE_SITE_URL. */
export const siteUrl = () => (process.env.FARE_SITE_URL || "https://www.farefoto.com.br").replace(/\/+$/, "");
