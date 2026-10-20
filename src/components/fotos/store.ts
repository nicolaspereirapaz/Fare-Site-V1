// Estado do pedido de fotos. Fica separado de shared.tsx para o cabeçalho poder contar as fotos do carrinho
// sem carregar o resto do fluxo. As fotos que já subiram para o servidor ficam guardadas no navegador
// (localStorage) e voltam depois de recarregar a página ou de entrar na conta.
import { useSyncExternalStore } from "react";
import type { Photo } from "@/components/fotos/catalog";

type State = { photos: Photo[]; inCart: boolean };
let state: State = { photos: [], inCart: false };
const listeners = new Set<() => void>();
const addedHooks = new Set<(photos: Photo[]) => void>();

let storageKey = "farefoto-fotos-v1";
/** Um pouco menos que os 7 dias em que o servidor guarda envios ainda sem pedido. */
const MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as (State & { savedAt: number }) | null;
    if (saved?.photos?.length && Date.now() - saved.savedAt < MAX_AGE_MS && !state.photos.length) {
      state = { photos: saved.photos, inCart: Boolean(saved.inCart) };
    }
  } catch {
    // Sem acesso ao armazenamento (aba anônima, bloqueado): segue só na memória.
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    // Só o que já está no servidor; o endereço vira a prévia do servidor (o blob: local não sobrevive à recarga).
    const photos = state.photos.filter((photo) => photo.uploadId).map((photo) => ({ ...photo, url: `/api/fotos/envios/${photo.uploadId}` }));
    if (photos.length) window.localStorage.setItem(storageKey, JSON.stringify({ photos, inCart: state.inCart, savedAt: Date.now() }));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // idem
  }
}

/** Link das fotos: guarda as fotos separadas do carrinho (outra chave). Chamar antes de a tela ler o estado. */
export function setPhotoScope(key: string) {
  if (storageKey === key) return;
  storageKey = key;
  state = { photos: [], inCart: false };
  hydrated = false;
}

export const photoStore = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    persist();
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    if (!hydrated) {
      hydrate();
      queueMicrotask(() => listeners.forEach((listener) => listener()));
    }
    return () => listeners.delete(fn);
  },
};

const EMPTY: State = { photos: [], inCart: false };
export const usePhotoState = () => useSyncExternalStore(photoStore.subscribe, photoStore.get, () => EMPTY);

/** Avisa quando fotos entram no pedido (o envio para o servidor começa aqui). */
export const onPhotosAdded = (fn: (photos: Photo[]) => void) => {
  addedHooks.add(fn);
  return () => addedHooks.delete(fn);
};
export const addPhotos = (photos: Photo[]) => {
  photoStore.set({ photos: [...photoStore.get().photos, ...photos] });
  addedHooks.forEach((fn) => fn(photos));
};
export const setPhotos = (photos: Photo[]) => photoStore.set({ photos });
export const patchPhoto = (id: string, patch: Partial<Photo>) =>
  setPhotos(photoStore.get().photos.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo)));
/** Pedido enviado: limpa as fotos (os arquivos já estão na pasta do pedido). */
export const clearPhotoOrder = () => photoStore.set({ photos: [], inCart: false });

/** Linhas que o pedido de fotos ocupa no carrinho: uma por tamanho + papel. */
export const photoCartLines = ({ photos, inCart }: State) =>
  inCart ? new Set(photos.filter((photo) => photo.copies > 0).map((photo) => `${photo.sizeId}|${photo.paper}`)).size : 0;
