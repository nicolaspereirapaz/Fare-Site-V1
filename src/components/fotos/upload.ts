// Envio das fotos para o servidor da loja: começa assim que a foto entra no pedido, 3 por vez,
// com o progresso no card. O arquivo vai inteiro, sem limite de tamanho; o servidor converte HEIC & cia.
import { onPhotosAdded, patchPhoto, photoStore } from "@/components/fotos/store";

export type SentPhoto = { id: string; width: number; height: number; convertedFrom: string | null };

const MAX_PARALLEL = 3;
/** Arquivo de cada foto, guardado até o envio terminar (para poder tentar de novo). */
const files = new Map<string, { blob: Blob; name: string }>();
const waiting: string[] = [];
let running = 0;

/** POST do arquivo cru (sem multipart), com progresso. */
export function uploadBlob(blob: Blob, name: string, onProgress?: (fraction: number) => void): Promise<SentPhoto> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/fotos/envios");
    request.setRequestHeader("x-file-name", encodeURIComponent(name));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      try {
        const data = JSON.parse(request.responseText) as SentPhoto & { error?: string };
        if (request.status >= 200 && request.status < 300 && data.id) resolve(data);
        else reject(new Error(data.error || "Falha no envio."));
      } catch {
        reject(new Error("Falha no envio."));
      }
    };
    request.onerror = () => reject(new Error("Sem conexão."));
    request.send(blob);
  });
}

const exists = (photoId: string) => photoStore.get().photos.some((photo) => photo.id === photoId);

function pump() {
  while (running < MAX_PARALLEL && waiting.length) {
    const photoId = waiting.shift()!;
    const job = files.get(photoId);
    if (!job || !exists(photoId)) continue;
    running += 1;
    let shown = 0;
    patchPhoto(photoId, { upload: { status: "enviando", progress: 0 } });
    uploadBlob(job.blob, job.name, (fraction) => {
      // Atualiza o card a cada 5% (não a cada byte).
      if (fraction - shown >= 0.05 || fraction === 1) {
        shown = fraction;
        if (exists(photoId)) patchPhoto(photoId, { upload: { status: "enviando", progress: Math.min(0.99, fraction) } });
      }
    })
      .then((sent) => {
        files.delete(photoId);
        if (exists(photoId)) patchPhoto(photoId, { uploadId: sent.id, upload: { status: "pronto", progress: 1, convertedFrom: sent.convertedFrom } });
      })
      .catch(() => {
        if (exists(photoId)) patchPhoto(photoId, { upload: { status: "erro", progress: 0 } });
      })
      .finally(() => {
        running -= 1;
        pump();
      });
  }
}

/** Guarda o arquivo da foto; o envio começa quando ela entra no pedido (addPhotos). */
export function queueUpload(photoId: string, blob: Blob, name: string) {
  files.set(photoId, { blob, name });
}

/** "Tentar de novo" no card, quando o envio falhou. */
export function retryUpload(photoId: string) {
  if (!files.has(photoId)) return;
  waiting.push(photoId);
  pump();
}

onPhotosAdded((photos) => {
  for (const photo of photos) if (files.has(photo.id) && !photo.uploadId) waiting.push(photo.id);
  pump();
});
