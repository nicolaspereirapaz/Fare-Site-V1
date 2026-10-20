/**
 * Ids do Google Analytics 4 (FARE_GA_ID, "G-XXXXXXX") e do Meta Pixel (FARE_META_PIXEL_ID, só números),
 * lidos do .env.local do servidor a cada página: trocar o id não exige novo build. Formato inválido = desligado.
 */
export function analyticsIds(env: Partial<Record<string, string>> = process.env) {
  const ga = env.FARE_GA_ID?.trim() ?? "";
  const pixel = env.FARE_META_PIXEL_ID?.trim() ?? "";
  return {
    gaId: /^G-[A-Z0-9]{4,20}$/.test(ga) ? ga : null,
    pixelId: /^\d{6,20}$/.test(pixel) ? pixel : null,
  };
}
