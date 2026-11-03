"use client";

import { useState } from "react";
import { initials } from "@/components/staff/atendimento/shared";

/** Foto de perfil do WhatsApp do contato; sem foto (ou simulador), as iniciais. */
export function ContactAvatar({ conversationId, name, channel, size = "" }: { conversationId: string; name: string; channel: string; size?: "" | "sm" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const className = `at-avatar${size ? ` at-avatar-${size}` : ""}`;
  if (channel !== "whatsapp" || failed) return <span aria-hidden="true" className={className}>{initials(name)}</span>;
  return (
    <span aria-hidden="true" className={`${className} has-photo`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto privada servida pela API */}
      <img alt="" loading="lazy" onError={() => setFailed(true)} src={`/api/atendimento/conversas/${conversationId}/foto`} />
    </span>
  );
}
