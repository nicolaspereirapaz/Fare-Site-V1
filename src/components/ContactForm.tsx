"use client";

import { useState, type FormEvent } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";

export function ContactForm() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = [
      "Olá, Fare Foto!",
      `Meu nome é ${name}.`,
      company ? `Empresa: ${company}.` : null,
      "",
      message,
    ]
      .filter(Boolean)
      .join("\n");
    window.open(buildWhatsAppUrl(FARE_FOTO_WHATSAPP, text), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="contact-section" id="contato">
      <div className="container-shell contact-grid">
        <div className="contact-copy">
          <span className="eyebrow eyebrow-light">Atendimento humano</span>
          <h2>Tem uma ideia fora do catálogo?</h2>
          <p>
            Conte o que precisa. A equipe ajuda a escolher formato, material e acabamento antes da produção.
          </p>
          <div className="contact-promise">
            <MessageCircle aria-hidden="true" />
            <span>
              <strong>Você fala com uma pessoa.</strong>
              Sem chatbot e sem pedido engessado.
            </span>
          </div>
        </div>
        <form className="contact-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label>
              <span>Seu nome</span>
              <input required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span>Empresa (opcional)</span>
              <input value={company} onChange={(event) => setCompany(event.target.value)} />
            </label>
          </div>
          <label>
            <span>O que você quer produzir?</span>
            <textarea
              required
              rows={5}
              placeholder="Ex.: 30 kits com caneca, camiseta e cartão..."
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <button className="button button-white button-large" type="submit">
            Enviar pelo WhatsApp <ArrowUpRight aria-hidden="true" size={19} />
          </button>
        </form>
      </div>
    </section>
  );
}
