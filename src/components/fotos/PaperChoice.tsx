"use client";

// escolha do papel com animação do acabamento (como as miniaturas de acabamento da Futura Im).
// A foto do aquário dos vídeos de exemplo fica deitada num fundo de estúdio e a luz passa por cima:
// no brilho, reflexo de janela e ponto de luz; no fosco, um véu prateado granulado.
import { Check } from "lucide-react";
import { PAPERS, type Paper } from "@/components/fotos/shared";
import "./acabamento.css";

const TEXT: Record<Paper, string> = {
  brilho: "Cores mais vivas e reflexo marcante. Lindo em álbum e porta-retrato.",
  fosco: "Textura suave, sem reflexo forte. Ótimo para quadros e marca menos as digitais.",
};

/** Quadro horizontal com a foto de exemplo e a luz passando. Animação em CSS, sem arquivo de vídeo. */
export function FinishMotion({ finish }: { finish: Paper }) {
  return (
    <span aria-hidden="true" className={`fm fm-${finish}`}>
      <span className="fm-stage">
        <span className="fm-shadow" />
        <span className="fm-print">
          <span className="fm-photo" style={{ backgroundImage: "url(/images/papel-exemplo.webp)" }} />
          <i className="fm-coat" />
          <i className="fm-sheen" />
          <i className="fm-glare" />
          <i className="fm-spot" />
        </span>
      </span>
    </span>
  );
}

export function PaperChoice({ value, onChange }: { value: Paper | null; onChange: (paper: Paper) => void }) {
  return (
    <div aria-label="Papel" className="paper-choice" role="radiogroup">
      {PAPERS.map((paper) => {
        const active = value === paper.id;
        return (
          <button aria-checked={active} className={active ? "active" : ""} key={paper.id} onClick={() => onChange(paper.id)} role="radio" type="button">
            <span className="paper-choice-media">
              <FinishMotion finish={paper.id} />
              {active ? <span className="paper-choice-check"><Check aria-hidden="true" size={16} /></span> : null}
            </span>
            <span className="paper-choice-text">
              <strong>{paper.label}</strong>
              <small>{TEXT[paper.id]}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}
