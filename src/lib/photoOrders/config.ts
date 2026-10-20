import path from "node:path";

/**
 * Onde ficam os arquivos dos pedidos. Na loja (oraculo), FARE_ORDERS_DIR aponta para D:\Digital, a mesma pasta
 * em que a equipe salva os pedidos do dia.
 * Estrutura (regra da loja: uma pasta por dia): <DD-MM>/<Nome Sobrenome - PED-XXXXXX>/<item>/arquivos + PED-XXXXXX.html
 */
export const ORDERS_DIR = process.env.FARE_ORDERS_DIR || path.join(process.cwd(), "data", "Pedidos");

/** Pasta do dia, como a equipe usa ("19-10"), no horário de Brasília. */
export function dayFolder(date = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${pick("day")}-${pick("month")}`;
}

/** Fotos enviadas que ainda não viraram pedido (o cliente ainda está montando ou desistiu). */
export const UPLOADS_DIR = process.env.FARE_PHOTO_UPLOADS_DIR || path.join(process.cwd(), "data", "envios-fotos");

/** Envio que nunca virou pedido é apagado depois de tantos dias. Pedidos finalizados nunca são apagados sozinhos. */
export const ABANDONED_UPLOAD_DAYS = Number(process.env.FARE_ABANDONED_UPLOAD_DAYS || 7);

/** Tamanho máximo de cada foto enviada (padrão 200 MB; fotos de celular e câmera ficam bem abaixo). */
export const MAX_UPLOAD_BYTES = Number(process.env.FARE_MAX_UPLOAD_MB || 200) * 1024 * 1024;

/** Máximo de pixels por foto (≈ 16.000 × 16.000): bloqueia "imagem-bomba" que travaria o servidor. 60×90 cm a 300 dpi ≈ 75 milhões. */
export const MAX_UPLOAD_PIXELS = 268_402_689;

/** ffmpeg converte para JPG o que a máquina não aceita (HEIC do iPhone, WEBP, AVIF…). */
export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

/** Resolução do arquivo pronto para imprimir. */
export const PRINT_DPI = 300;
