"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Prévia de PDF desenhada na própria página com pdf.js (uma imagem por folha).
 * Não usa o visualizador do navegador: com "Baixar PDFs em vez de abrir" ligado no Chrome,
 * um <iframe> mostra só o botão "Abrir" e a prévia some.
 */
export function PdfPreview({ url, label }: { url: string; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const task = pdfjs.getDocument({ url, withCredentials: true });
      destroy = () => void task.destroy();
      const pdf = await task.promise;
      if (cancelled) return;
      box.replaceChildren();
      const width = Math.max(box.clientWidth - 48, 280);
      const ratio = window.devicePixelRatio || 1;
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        canvas.setAttribute("aria-label", `Página ${number} de ${pdf.numPages}`);
        canvas.setAttribute("role", "img");
        box.append(canvas);
        await page.render({ canvas, viewport }).promise;
      }
      if (!cancelled) setState("ready");
    })().catch(() => {
      if (!cancelled) setState("error");
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  return (
    <div aria-busy={state === "loading"} aria-label={label} className="qe-pdf" role="document">
      <div className="qe-pdf-pages" ref={boxRef} />
      {state === "loading" ? <p className="qe-pdf-msg">Gerando a prévia do PDF…</p> : null}
      {state === "error" ? <p className="qe-pdf-msg">Não foi possível mostrar a prévia. Use “Baixar PDF” ou “Abrir em outra aba”.</p> : null}
    </div>
  );
}
