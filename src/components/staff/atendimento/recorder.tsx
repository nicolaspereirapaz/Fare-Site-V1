"use client";

import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 5 * 60;

/** Formato que o navegador grava (Chrome: webm/opus; Firefox: ogg/opus). O servidor converte para voz do WhatsApp. */
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export const formatSeconds = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Gravação de áudio pelo microfone do computador (até 5 minutos). */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const finish = useRef<((file: File | null) => void) | null>(null);
  const keep = useRef(true);

  const cleanup = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    setRecording(false);
  };

  useEffect(() => () => {
    keep.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (timer.current) window.clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((track) => track.stop());
  }, []);

  async function start() {
    setError(null);
    const mimeType = pickMime();
    if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
      setError("Este navegador não grava áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      keep.current = true;
      media.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      media.onstop = () => {
        const type = (media.mimeType || mimeType || "audio/webm").split(";")[0];
        const file = keep.current && chunks.current.length ? new File(chunks.current, `audio.${type.includes("ogg") ? "ogg" : "webm"}`, { type }) : null;
        cleanup();
        finish.current?.(file);
        finish.current = null;
      };
      recorder.current = media;
      media.start(250);
      setSeconds(0);
      setRecording(true);
      const began = Date.now();
      timer.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS && recorder.current?.state === "recording") recorder.current.stop();
      }, 250);
    } catch {
      setError("Não foi possível usar o microfone. Libere o acesso no navegador.");
      cleanup();
    }
  }

  /** Para e devolve o arquivo (null se cancelou). */
  function stop(save: boolean): Promise<File | null> {
    const media = recorder.current;
    if (!media || media.state !== "recording") return Promise.resolve(null);
    keep.current = save;
    return new Promise((resolve) => {
      finish.current = resolve;
      media.stop();
    });
  }

  return { recording, seconds, error, start, stop };
}
