import type { Metadata } from "next";
import { Workspace } from "@/components/fotos/Workspace";

export const metadata: Metadata = { title: "Enviar fotos para revelação" };

/** Etapa 2 da revelação: tamanho, papel, cópias e editor de cada foto. */
export default function EnviarFotosPage() {
  return <Workspace />;
}
