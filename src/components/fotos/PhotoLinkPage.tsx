"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Workspace } from "@/components/fotos/Workspace";
import { setPhotos } from "@/components/fotos/shared";
import { setPhotoScope } from "@/components/fotos/store";
import type { Photo } from "@/components/fotos/catalog";
import type { PhotoLinkView, ReopenedPhoto } from "@/lib/photoLinks/links";

// crypto.randomUUID só existe em https/localhost (mesma ideia do newId de shared.tsx).
let nextId = 0;
const reopenedId = () => `foto-r${Date.now().toString(36)}-${(nextId++).toString(36)}`;

/** Foto do envio anterior no formato do editor: já está no servidor (envio pronto), com os ajustes de antes. */
const toPhoto = (photo: ReopenedPhoto): Photo => ({
  id: reopenedId(), name: photo.name, url: `/api/fotos/envios/${photo.uploadId}`, w: photo.width, h: photo.height,
  uploadId: photo.uploadId, upload: { status: "pronto", progress: 1, convertedFrom: photo.convertedFrom },
  sizeId: photo.sizeId, paper: photo.paper, copies: photo.copies, fit: photo.fit, landscape: photo.landscape, zoom: photo.zoom,
  x: photo.x, y: photo.y, border: photo.border, filter: photo.filter as Photo["filter"], filterStrength: photo.filterStrength,
  brightness: photo.brightness, contrast: photo.contrast, saturation: photo.saturation,
});

/**
 * Página do link: as fotos ficam guardadas só deste link (não misturam com o carrinho do site). A chave inclui o
 * envio atual: depois de um reenvio (do cliente ou da equipe), o que estava guardado no navegador não volta mais.
 * `autoEdit` (?editar=1, botão "Editar fotos" da equipe): já abre as fotos enviadas no editor.
 */
export function PhotoLinkPage({ token, view, autoEdit = false, staffUrl = null }: { token: string; view: PhotoLinkView; autoEdit?: boolean; staffUrl?: string | null }) {
  const scope = `farefoto-link-${token}${view.previous ? `-${view.previous.id}` : ""}`;
  setPhotoScope(scope);
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [reopened, setReopened] = useState(false);

  async function reopen() {
    const response = await fetch(`/api/fotos/link/${token}/reabrir`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { photos?: ReopenedPhoto[]; missing?: number; restoredEdits?: boolean; error?: string };
    if (!response.ok || !data.photos) throw new Error(data.error || "Não foi possível abrir as fotos enviadas. Tente de novo.");
    setPhotos(data.photos.map(toPhoto));
    setDone(false);
    setReopened(true);
    return { missing: data.missing ?? 0, restoredEdits: Boolean(data.restoredEdits) };
  }

  return (
    <Workspace
      key={scope}
      link={{
        token, view, done, reopened, autoEdit, reopen, staffUrl,
        onDone: () => { setDone(true); setReopened(false); router.refresh(); },
      }}
    />
  );
}
