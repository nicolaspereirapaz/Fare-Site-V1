"use client";

// editor de foto no estilo Canva.
// PC: ferramentas à esquerda, painel da ferramenta, foto no centro e tira de fotos embaixo.
// Celular: foto em cima, painel que sobe e barra de ferramentas embaixo.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Crop, Eye, Frame, Info, Minus, Move, Plus, RectangleHorizontal,
  RectangleVertical, Redo2, RotateCcw, Ruler, SlidersHorizontal, Sparkles, Undo2,
} from "lucide-react";
import {
  ADJUSTMENTS, BORDERS, CopiesInput, FILTERS, PAPERS, PhotoLayers, PhotoRender, SizePicker, areaInset, fitWidth, layout, paperLabel,
  ZOOM, patchPhoto, realLabel, photoStore, quality, setPhotos, sizeById, type Photo,
} from "@/components/fotos/shared";
import "./editor.css";

type Tool = "cortar" | "filtros" | "ajustes" | "borda" | "tamanho";
const TOOLS: { id: Tool; label: string; icon: typeof Crop }[] = [
  { id: "cortar", label: "Cortar", icon: Crop },
  { id: "filtros", label: "Filtros", icon: Sparkles },
  { id: "ajustes", label: "Ajustes", icon: SlidersHorizontal },
  { id: "borda", label: "Borda", icon: Frame },
  { id: "tamanho", label: "Tamanho", icon: Ruler },
];
// O que "Usar em todas as fotos" copia em cada ferramenta.
const APPLY: Record<Tool, { fields: (keyof Photo)[]; label: string }> = {
  cortar: { fields: ["fit"], label: "Usar Preencher/Encaixar em todas as fotos" },
  filtros: { fields: ["filter", "filterStrength"], label: "Usar este filtro em todas as fotos" },
  ajustes: { fields: ["brightness", "contrast", "saturation"], label: "Usar estes ajustes em todas as fotos" },
  borda: { fields: ["border"], label: "Usar esta borda em todas as fotos" },
  tamanho: { fields: ["sizeId", "paper"], label: "Usar este tamanho e papel em todas" },
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
type History = { undo: Photo[]; redo: Photo[] };

export function PhotoEditor({ photos, index, onNavigate, onClose }: {
  photos: Photo[]; index: number; onNavigate: (index: number) => void; onClose: () => void;
}) {
  const photo = photos[index];
  const [tool, setTool] = useState<Tool>("cortar");
  const [sheetOpen, setSheetOpen] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [applied, setApplied] = useState<Tool | null>(null);
  const [, rerender] = useState(0);

  // Desfazer/refazer: um histórico por foto. Arrastar e sliders viram um passo só quando a mão para.
  // Mapa mutável guardado em estado (não muda de identidade); o contador `rerender` atualiza os botões.
  const [histories] = useState(() => new Map<string, History>());
  const pending = useRef<Photo | null>(null);
  const idle = useRef<number | undefined>(undefined);
  const latest = useRef(photo);
  useLayoutEffect(() => { latest.current = photo; });
  const historyOf = (id: string) => {
    let h = histories.get(id);
    if (!h) { h = { undo: [], redo: [] }; histories.set(id, h); }
    return h;
  };
  const current = histories.get(photo.id);

  function settle() {
    window.clearTimeout(idle.current);
    const before = pending.current;
    pending.current = null;
    if (before && before !== latest.current) {
      const h = historyOf(before.id);
      h.undo.push(before);
      h.redo = [];
      rerender((n) => n + 1);
    }
  }
  /** Mudança de um clique (um passo no histórico). */
  function edit(patch: Partial<Photo>) {
    settle();
    const h = historyOf(photo.id);
    h.undo.push(latest.current);
    h.redo = [];
    patchPhoto(photo.id, patch);
  }
  /** Mudança contínua (arrastar, slider, roda do mouse). */
  function live(patch: Partial<Photo>) {
    if (!pending.current) pending.current = latest.current;
    patchPhoto(photo.id, patch);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(settle, 450);
  }
  function replace(next: Photo) {
    setPhotos(photoStore.get().photos.map((p) => (p.id === next.id ? next : p)));
  }
  function undo() {
    settle();
    const h = historyOf(photo.id);
    const prev = h.undo.pop();
    if (!prev) return;
    h.redo.push(latest.current);
    replace(prev);
    rerender((n) => n + 1);
  }
  function redo() {
    settle();
    const h = historyOf(photo.id);
    const next = h.redo.pop();
    if (!next) return;
    h.undo.push(latest.current);
    replace(next);
    rerender((n) => n + 1);
  }
  function applyAll() {
    const source = latest.current;
    const fields = APPLY[tool].fields;
    setPhotos(photoStore.get().photos.map((p) => ({ ...p, ...Object.fromEntries(fields.map((key) => [key, source[key]])) })));
    setApplied(tool);
    window.setTimeout(() => setApplied(null), 2200);
  }
  function chooseTool(id: Tool) {
    // No celular, tocar de novo na ferramenta aberta recolhe o painel para ver a foto maior.
    if (id === tool) setSheetOpen((open) => !open);
    else { setTool(id); setSheetOpen(true); }
  }

  // Atalhos: Esc fecha, Ctrl+Z desfaz, Ctrl+Shift+Z ou Ctrl+Y refaz.
  const keys = useRef({ undo, redo, onClose });
  useLayoutEffect(() => { keys.current = { undo, redo, onClose }; });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") keys.current.onClose();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) keys.current.redo(); else keys.current.undo(); }
      if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); keys.current.redo(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);
  useEffect(() => () => window.clearTimeout(idle.current), []);

  const g = layout(photo);
  const q = quality(g.dpi);

  // Arrastar com um dedo/mouse, pinça com dois dedos.
  const paper = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; px: number; py: number; dist: number; zoom: number } | null>(null);
  function startGesture() {
    const [a, b] = [...pointers.current.values()];
    const p = latest.current;
    gesture.current = { x: a.x, y: a.y, px: p.x, py: p.y, zoom: p.zoom, dist: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 };
  }
  function onPointerDown(event: ReactPointerEvent) {
    if ((event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGesture();
    setDragging(true);
  }
  function onPointerMove(event: ReactPointerEvent) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pts = [...pointers.current.values()];
    const start = gesture.current;
    if (pts.length >= 2 && start.dist) {
      live({ zoom: clamp((start.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) / start.dist, ZOOM.min, ZOOM.max) });
      return;
    }
    const area = paper.current?.querySelector(".print-area")?.getBoundingClientRect();
    if (!area) return;
    const overflowW = (area.width * (g.w - 100)) / 100;
    const overflowH = (area.height * (g.h - 100)) / 100;
    live({
      x: overflowW ? clamp(start.px - (pts[0].x - start.x) / overflowW, 0, 1) : 0.5,
      y: overflowH ? clamp(start.py - (pts[0].y - start.y) / overflowH, 0, 1) : 0.5,
    });
  }
  function onPointerUp(event: ReactPointerEvent) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) startGesture();
    else { gesture.current = null; setDragging(false); settle(); }
  }

  // Zoom pelas quinas (estilo Canva): afastar a quina do centro da foto aumenta, aproximar diminui.
  const box = useRef<HTMLDivElement>(null);
  const resize = useRef<{ cx: number; cy: number; dist: number; zoom: number } | null>(null);
  function startResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    resize.current = { cx, cy, dist: Math.hypot(event.clientX - cx, event.clientY - cy) || 1, zoom: latest.current.zoom };
    setDragging(true);
  }
  function moveResize(event: ReactPointerEvent) {
    const start = resize.current;
    if (start) live({ zoom: clamp((start.zoom * Math.hypot(event.clientX - start.cx, event.clientY - start.cy)) / start.dist, ZOOM.min, ZOOM.max) });
  }
  function endResize() {
    if (!resize.current) return;
    resize.current = null;
    setDragging(false);
    settle();
  }
  // Teclado: setas na quina também mudam o zoom.
  function keyResize(event: React.KeyboardEvent) {
    const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[event.key];
    if (!step) return;
    event.preventDefault();
    live({ zoom: clamp(latest.current.zoom + step, ZOOM.min, ZOOM.max) });
  }

  const hold = {
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onPointerCancel: () => setComparing(false),
    onPointerDown: () => setComparing(true),
    onPointerLeave: () => setComparing(false),
    onPointerUp: () => setComparing(false),
  };

  return (
    <div aria-label="Editor de foto" aria-modal="true" className="ce" role="dialog">
      <header className="ce-top">
        <button className="ce-back" onClick={onClose} type="button">
          <ArrowLeft aria-hidden="true" size={20} /><span className="ce-hide-mobile">Voltar às fotos</span>
        </button>
        <div className="ce-nav">
          <button aria-label="Foto anterior" disabled={index === 0} onClick={() => onNavigate(index - 1)} type="button"><ChevronLeft aria-hidden="true" size={20} /></button>
          <span><span className="ce-hide-mobile">Foto </span>{index + 1} de {photos.length}</span>
          <button aria-label="Próxima foto" disabled={index === photos.length - 1} onClick={() => onNavigate(index + 1)} type="button"><ChevronRight aria-hidden="true" size={20} /></button>
        </div>
        <div className="ce-top-actions">
          <button aria-label="Desfazer" className="ce-icon" disabled={!current?.undo.length} onClick={undo} title="Desfazer (Ctrl+Z)" type="button"><Undo2 aria-hidden="true" size={20} /></button>
          <button aria-label="Refazer" className="ce-icon" disabled={!current?.redo.length} onClick={redo} title="Refazer (Ctrl+Shift+Z)" type="button"><Redo2 aria-hidden="true" size={20} /></button>
          <button className="ce-done" onClick={onClose} type="button"><Check aria-hidden="true" size={18} /> Concluído</button>
        </div>
      </header>

      <div className={`ce-body${sheetOpen ? "" : " sheet-closed"}`}>
        <nav aria-label="Ferramentas" className="ce-rail">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button aria-pressed={tool === id} className={tool === id ? "active" : ""} key={id} onClick={() => chooseTool(id)} type="button">
              <span className="ce-rail-icon"><Icon aria-hidden="true" size={22} /></span>{label}
            </button>
          ))}
        </nav>

        <section aria-label={TOOLS.find((t) => t.id === tool)!.label} className="ce-panel">
          <h2 className="ce-panel-title">{TOOLS.find((t) => t.id === tool)!.label}</h2>
          <div className="ce-panel-body">
            {tool === "cortar" ? <CropPanel edit={edit} live={live} photo={photo} /> : null}
            {tool === "filtros" ? <FilterPanel edit={edit} live={live} photo={photo} /> : null}
            {tool === "ajustes" ? <AdjustPanel edit={edit} live={live} photo={photo} /> : null}
            {tool === "borda" ? <BorderPanel edit={edit} key={photo.id} live={live} photo={photo} /> : null}
            {tool === "tamanho" ? <SizePanel edit={edit} photo={photo} /> : null}
          </div>
          {photos.length > 1 ? (
            <button className={`ce-apply${applied === tool ? " done" : ""}`} onClick={applyAll} type="button">
              {applied === tool ? <><Check aria-hidden="true" size={18} /> Aplicado em todas as fotos</> : <><Copy aria-hidden="true" size={18} /> {APPLY[tool].label}</>}
            </button>
          ) : null}
        </section>

        <main className="ce-main">
          <div
            className={`ce-canvas movable${dragging ? " dragging" : ""}`}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={(event) => { live({ zoom: clamp(latest.current.zoom * (1 - event.deltaY * 0.0015), ZOOM.min, ZOOM.max) }); }}
          >
            {q.tone === "low" ? (
              <p className="ce-warning"><Info aria-hidden="true" size={16} /> A foto pode sair borrada neste tamanho. Diminua o zoom ou escolha um tamanho menor.</p>
            ) : null}
            <button aria-label="Segure para ver a foto original" className={`ce-compare${comparing ? " on" : ""}`} type="button" {...hold}>
              <Eye aria-hidden="true" size={17} /> {comparing ? "Original" : "Comparar"}
            </button>

            <div className="ce-stage">
              <div className="ce-paper" ref={paper} style={{ aspectRatio: `${g.W} / ${g.H}`, width: fitWidth(g.W, g.H) }}>
                {/* Fora do papel aparece clarinho o que vai ser cortado, como no Canva. */}
                {tool === "cortar" && !comparing ? (
                  <div aria-hidden="true" className="ce-ghost" style={areaInset(photo)}><PhotoLayers photo={photo} /></div>
                ) : null}
                <PhotoRender original={comparing} photo={photo} />
                {dragging ? <div aria-hidden="true" className="ce-grid" style={areaInset(photo)} /> : null}
                {tool === "cortar" && !comparing ? (
                  <div className="ce-handles-area" style={areaInset(photo)}>
                    <div className="ce-handles" ref={box} style={{ left: `${g.left}%`, top: `${g.top}%`, width: `${g.w}%`, height: `${g.h}%` }}>
                      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                        <button
                          aria-label="Zoom da foto: arraste esta quina (ou use as setas)"
                          className={`ce-handle ${corner}`}
                          key={corner}
                          onKeyDown={keyResize}
                          onPointerCancel={endResize}
                          onPointerDown={startResize}
                          onPointerMove={moveResize}
                          onPointerUp={endResize}
                          type="button"
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="ce-canvas-foot">
              {tool === "cortar" ? (
                <span className="ce-hint">
                  <Move aria-hidden="true" size={15} />
                  <span className="fine-pointer">Arraste a foto · puxe as quinas ou role o mouse para zoom</span>
                  <span className="coarse-pointer">Arraste a foto · puxe as quinas ou use dois dedos para zoom</span>
                </span>
              ) : null}
              <span className="ce-info">
                {sizeById(photo.sizeId).label}{realLabel(sizeById(photo.sizeId)) ? <small className="ce-real"> (real {realLabel(sizeById(photo.sizeId))})</small> : null} · {paperLabel(photo.paper)} · <i className={`ce-dot q-${q.tone}`} /> Qualidade {q.label.toLowerCase()}
              </span>
            </div>
          </div>

          <ol aria-label="Suas fotos" className="ce-strip">
            {photos.map((item, i) => (
              <li key={item.id}>
                <button aria-current={i === index} aria-label={`Foto ${i + 1}`} className={i === index ? "active" : ""} onClick={() => onNavigate(i)} type="button">
                  <span className="ce-thumb"><PhotoRender fit photo={item} /></span>
                  <small>{i + 1}</small>
                </button>
              </li>
            ))}
          </ol>
        </main>
      </div>
    </div>
  );
}

type PanelProps = { photo: Photo; edit: (patch: Partial<Photo>) => void; live: (patch: Partial<Photo>) => void };

function Group({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="ce-group">
      <div className="ce-group-head"><h3>{title}</h3>{aside}</div>
      {children}
    </div>
  );
}

/** Miniatura com a própria foto (mesma proporção do papel), usada nos cartões de opção. */
function Thumb({ photo, filter }: { photo: Photo; filter?: Photo["filter"] }) {
  return <span className="ce-thumb"><PhotoRender filter={filter} fit photo={photo} /></span>;
}

function CropPanel({ photo, edit, live }: PanelProps) {
  const reset = { zoom: 1, x: 0.5, y: 0.5 };
  return (
    <>
      <Group title="Como a foto ocupa o papel">
        <div className="ce-cards two">
          <button className={photo.fit === "preencher" ? "active" : ""} onClick={() => edit({ fit: "preencher" })} type="button">
            <Thumb photo={{ ...photo, ...reset, fit: "preencher", border: 0 }} />
            <strong>Preencher</strong><small>Ocupa o papel todo</small>
          </button>
          <button className={photo.fit === "encaixar" ? "active" : ""} onClick={() => edit({ fit: "encaixar", ...reset })} type="button">
            <Thumb photo={{ ...photo, ...reset, fit: "encaixar", border: 0 }} />
            <strong>Encaixar</strong><small>Foto inteira, sobra branco</small>
          </button>
        </div>
      </Group>

      <Group aside={<output className="ce-value">{Math.round(photo.zoom * 100)}%</output>} title="Zoom">
        <div className="ce-zoom">
          <button aria-label="Diminuir zoom" disabled={photo.zoom <= ZOOM.min} onClick={() => edit({ zoom: clamp(photo.zoom - 0.25, ZOOM.min, ZOOM.max) })} type="button"><Minus aria-hidden="true" size={18} /></button>
          <input aria-label="Zoom" max={ZOOM.max} min={ZOOM.min} onChange={(e) => live({ zoom: Number(e.target.value) })} step={0.01} style={{ "--to": `${((photo.zoom - ZOOM.min) / (ZOOM.max - ZOOM.min)) * 100}%` } as React.CSSProperties} type="range" value={photo.zoom} />
          <button aria-label="Aumentar zoom" disabled={photo.zoom >= ZOOM.max} onClick={() => edit({ zoom: clamp(photo.zoom + 0.25, ZOOM.min, ZOOM.max) })} type="button"><Plus aria-hidden="true" size={18} /></button>
        </div>
      </Group>

      {/* Foto retrô: "Deitado" gira a moldura (foto horizontal numa Polaroid/Instax). */}
      <Group title={sizeById(photo.sizeId).frame ? "Moldura" : "Papel"}>
        <div className="ce-seg">
          <button className={!photo.landscape ? "active" : ""} onClick={() => edit({ landscape: false, x: 0.5, y: 0.5 })} type="button"><RectangleVertical aria-hidden="true" size={20} /> Em pé</button>
          <button className={photo.landscape ? "active" : ""} onClick={() => edit({ landscape: true, x: 0.5, y: 0.5 })} type="button"><RectangleHorizontal aria-hidden="true" size={20} /> Deitado</button>
        </div>
      </Group>

      <button className="ce-ghost-button" disabled={photo.zoom === 1 && photo.x === 0.5 && photo.y === 0.5} onClick={() => edit(reset)} type="button">
        <RotateCcw aria-hidden="true" size={17} /> Centralizar e tirar o zoom
      </button>
    </>
  );
}

function FilterPanel({ photo, edit, live }: PanelProps) {
  const base = { ...photo, border: 0 };
  return (
    <>
      <div className="ce-cards filters">
        {FILTERS.map((filter) => (
          <button className={photo.filter === filter.id ? "active" : ""} key={filter.id} onClick={() => edit({ filter: filter.id, filterStrength: 100 })} type="button">
            <Thumb filter={filter.id} photo={base} />
            <strong>{filter.label}</strong>
          </button>
        ))}
      </div>
      {photo.filter !== "original" ? (
        <Group aside={<output className="ce-value">{photo.filterStrength}%</output>} title="Intensidade">
          <input aria-label="Intensidade do filtro" className="ce-range" max={100} min={0} onChange={(e) => live({ filterStrength: Number(e.target.value) })} step={1} style={{ "--to": `${photo.filterStrength}%` } as React.CSSProperties} type="range" value={photo.filterStrength} />
        </Group>
      ) : null}
    </>
  );
}

function AdjustPanel({ photo, edit, live }: PanelProps) {
  const changed = photo.brightness || photo.contrast || photo.saturation;
  return (
    <>
      {ADJUSTMENTS.map(({ key, label }) => {
        const value = photo[key];
        // Preenchimento da barra a partir do meio (0), para os dois lados.
        const from = 50 + Math.min(value, 0);
        const to = 50 + Math.max(value, 0);
        return (
          <Group aside={<button aria-label={`Zerar ${label.toLowerCase()}`} className="ce-value as-button" disabled={!value} onClick={() => edit({ [key]: 0 })} type="button">{value > 0 ? `+${value}` : value}</button>} key={key} title={label}>
            <input
              aria-label={label}
              className="ce-range centered"
              max={50}
              min={-50}
              onChange={(e) => live({ [key]: Number(e.target.value) })}
              onDoubleClick={() => edit({ [key]: 0 })}
              step={1}
              style={{ "--from": `${from}%`, "--to": `${to}%` } as React.CSSProperties}
              type="range"
              value={value}
            />
          </Group>
        );
      })}
      <button className="ce-ghost-button" disabled={!changed} onClick={() => edit({ brightness: 0, contrast: 0, saturation: 0 })} type="button">
        <RotateCcw aria-hidden="true" size={17} /> Redefinir ajustes
      </button>
    </>
  );
}

// Borda personalizada: de 1 a 20 mm, de meio em meio milímetro.
const CUSTOM_MIN = 1;
const CUSTOM_MAX = 20;
const CUSTOM_DEFAULT = 8;
const mmLabel = (mm: number) => `${mm.toLocaleString("pt-BR")} mm`;

function BorderPanel({ photo, edit, live }: PanelProps) {
  const isPreset = BORDERS.some((border) => border.cm === photo.border);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const custom = customOpen || !isPreset;
  const mm = Math.round(photo.border * 20) / 2;
  const customMm = !isPreset ? mm : CUSTOM_DEFAULT;
  const setMm = (value: number, commit: boolean) => {
    const next = { border: clamp(Math.round(value * 2) / 2, CUSTOM_MIN, CUSTOM_MAX) / 10 };
    if (commit) edit(next); else live(next);
  };
  if (sizeById(photo.sizeId).frame) return <p className="ce-note">Fotos retrô já vêm com a moldura branca do modelo (Polaroid ou Instax).</p>;
  return (
    <>
      <Group title="Borda branca nos 4 lados">
        <div className="ce-cards borders">
          {BORDERS.map((border) => (
            <button className={!custom && photo.border === border.cm ? "active" : ""} key={border.label} onClick={() => { setCustomOpen(false); edit({ border: border.cm }); }} type="button">
              <Thumb photo={{ ...photo, border: border.cm }} />
              <strong>{border.label}</strong>
            </button>
          ))}
          <button
            className={custom ? "active" : ""}
            onClick={() => { setCustomOpen(true); if (isPreset) edit({ border: customMm / 10 }); }}
            type="button"
          >
            <Thumb photo={{ ...photo, border: customMm / 10 }} />
            <strong>Personalizada</strong>
          </button>
        </div>
      </Group>

      {custom ? (
        <Group
          aside={
            <label className="ce-mm">
              <input
                aria-label="Borda em milímetros"
                inputMode="decimal"
                max={CUSTOM_MAX}
                min={CUSTOM_MIN}
                onChange={(e) => { const value = Number(e.target.value.replace(",", ".")); if (value) setMm(value, true); }}
                step={0.5}
                type="number"
                value={mm}
              />
              mm
            </label>
          }
          title="Espessura da borda"
        >
          <div className="ce-zoom">
            <button aria-label="Diminuir borda" disabled={mm <= CUSTOM_MIN} onClick={() => setMm(mm - 1, true)} type="button"><Minus aria-hidden="true" size={18} /></button>
            <input
              aria-label="Espessura da borda"
              max={CUSTOM_MAX}
              min={CUSTOM_MIN}
              onChange={(e) => setMm(Number(e.target.value), false)}
              step={0.5}
              style={{ "--to": `${((mm - CUSTOM_MIN) / (CUSTOM_MAX - CUSTOM_MIN)) * 100}%` } as React.CSSProperties}
              type="range"
              value={mm}
            />
            <button aria-label="Aumentar borda" disabled={mm >= CUSTOM_MAX} onClick={() => setMm(mm + 1, true)} type="button"><Plus aria-hidden="true" size={18} /></button>
          </div>
          <p className="ce-note">De {mmLabel(CUSTOM_MIN)} a {mmLabel(CUSTOM_MAX)}, igual nos 4 lados.</p>
        </Group>
      ) : null}
    </>
  );
}

function SizePanel({ photo, edit }: Omit<PanelProps, "live">) {
  return (
    <>
      <Group title="Tamanho da foto">
        <SizePicker layout="list" onChange={(id) => edit({ sizeId: id })} value={photo.sizeId} />
      </Group>
      <Group title="Papel">
        <div className="ce-seg">
          {PAPERS.map((paper) => (
            <button className={photo.paper === paper.id ? "active" : ""} key={paper.id} onClick={() => edit({ paper: paper.id })} type="button">{paper.label}</button>
          ))}
        </div>
      </Group>
      <Group title="Cópias desta foto">
        <div className="ce-stepper">
          <button aria-label="Menos uma cópia" disabled={photo.copies <= 1} onClick={() => edit({ copies: photo.copies - 1 })} type="button"><Minus aria-hidden="true" size={18} /></button>
          <CopiesInput onChange={(copies) => edit({ copies })} value={photo.copies} />
          <button aria-label="Mais uma cópia" onClick={() => edit({ copies: photo.copies + 1 })} type="button"><Plus aria-hidden="true" size={18} /></button>
        </div>
      </Group>
    </>
  );
}
