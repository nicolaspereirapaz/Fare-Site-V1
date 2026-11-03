"use client";

import { FileText, Mic, Video } from "lucide-react";
import { ApiError } from "@/components/staff/atendimento/shared";
import type { Message } from "@/lib/atendimento/types";

/** Endereço da foto/arquivo de uma mensagem (só para a equipe logada). */
export const mediaUrl = (messageId: string, options: { mini?: boolean; download?: boolean } = {}) =>
  `/api/atendimento/midia/${messageId}${options.mini ? "?mini=1" : options.download ? "?baixar=1" : ""}`;

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Envia um arquivo como corpo bruto (sem guardar tudo na memória do servidor). */
export async function uploadFile<T>(url: string, file: File, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name), ...headers },
    body: file,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string; detail?: string | null };
  if (!response.ok) throw new ApiError(payload.error ?? "INTERNAL", payload.message ?? "Não foi possível enviar o arquivo.", payload.detail ?? null);
  return payload;
}

/** Foto, vídeo, áudio ou documento dentro do balão da conversa. */
export function MessageMediaView({
  message,
  onOpen,
}: {
  message: Pick<Message, "id" | "media"> & Partial<Pick<Message, "transcript" | "transcriptStatus">>;
  onOpen?: (messageId: string) => void;
}) {
  const media = message.media;
  if (!media) return null;
  const isImage = media.mime.startsWith("image/");
  if (isImage && onOpen) {
    return (
      <button className="at-media-image" onClick={() => onOpen(message.id)} title={`${media.name} — ver em tamanho real`} type="button">
        {/* eslint-disable-next-line @next/next/no-img-element -- arquivo privado servido pela API */}
        <img alt={media.name || "Foto"} loading="lazy" src={mediaUrl(message.id, { mini: media.hasThumb })} />
        {media.kind === "documento" ? <span className="at-media-badge">qualidade original</span> : null}
      </button>
    );
  }
  if (isImage) {
    return (
      <a className="at-media-image" href={mediaUrl(message.id)} rel="noopener" target="_blank" title={`${media.name} — abrir em tamanho real`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- arquivo privado servido pela API (o otimizador de imagens não tem a sessão) */}
        <img alt={media.name || "Foto"} loading="lazy" src={mediaUrl(message.id, { mini: media.hasThumb })} />
        {media.kind === "documento" ? <span className="at-media-badge">qualidade original</span> : null}
      </a>
    );
  }
  if (media.kind === "video") {
    return <video className="at-media-video" controls preload="metadata" src={mediaUrl(message.id)} />;
  }
  if (media.kind === "audio") {
    return (
      <>
        <audio className="at-media-audio" controls preload="none" src={mediaUrl(message.id)} />
        {message.transcriptStatus === "pendente" ? <p className="at-transcript is-pending">transcrevendo o áudio…</p> : null}
        {message.transcriptStatus === "ok" ? (
          <p className="at-transcript" title="Transcrição automática (pode ter erros)">
            <span>Transcrição:</span> {message.transcript || "(sem fala)"}
          </p>
        ) : null}
        {message.transcriptStatus === "falhou" ? <p className="at-transcript is-failed">Não foi possível transcrever. Ouça o áudio.</p> : null}
      </>
    );
  }
  const Icon = media.mime.startsWith("video/") ? Video : media.mime.startsWith("audio/") ? Mic : FileText;
  return (
    <a className="at-media-file" href={mediaUrl(message.id, { download: true })}>
      <Icon aria-hidden="true" size={22} />
      <span>
        <strong>{media.name || "arquivo"}</strong>
        <small>{formatBytes(media.size)} · baixar</small>
      </span>
    </a>
  );
}
