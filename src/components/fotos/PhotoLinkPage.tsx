"use client";

import { useState } from "react";
import { Workspace } from "@/components/fotos/Workspace";
import { setPhotoScope } from "@/components/fotos/store";
import type { PhotoLinkView } from "@/lib/photoLinks/links";

/** Página do link: as fotos ficam guardadas só deste link (não misturam com o carrinho do site). */
export function PhotoLinkPage({ token, view }: { token: string; view: PhotoLinkView }) {
  setPhotoScope(`farefoto-link-${token}`);
  const [done, setDone] = useState(false);
  return <Workspace link={{ token, view, done, onDone: () => setDone(true) }} />;
}
