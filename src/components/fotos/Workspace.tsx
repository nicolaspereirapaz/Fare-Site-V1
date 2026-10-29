"use client";

// etapa 2 — tamanho e papel (todas ou cada foto), cópias e editor.
import { useProfessional } from "@/components/fotos/useProfessional";
import Link from "next/link";
import { useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CloudCheck, ImagePlus, Info, Minus, Pencil, Plus, RefreshCw, RotateCw, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { PaperChoice } from "@/components/fotos/PaperChoice";
import { LinkSummary, type PhotoLinkProps } from "@/components/fotos/LinkSummary";
import { PhotoEditor } from "@/components/fotos/PhotoEditor";
import {
  CopiesInput, PAPERS, PhotoRender, PriceTable, SIZES, SIZE_GROUPS, SizePicker, groupOf, Steps, addPhotos, brl, deadline, layout, loadDemoPhotos, loadFiles, patchPhoto, photoStore, quality,
  isListed, minimumIssues, replacePhotoFile, retryUpload, setPhotos, sizeById, summarize, usePhotoState, type Photo, type SizeGroup,
} from "@/components/fotos/shared";

/** Etapa 2 do site; com `link`, é a página do link das fotos (orçamento/pedido da equipe). */
export function Workspace({ link }: { link?: PhotoLinkProps } = {}) {
  const router = useRouter();
  const { photos } = usePhotoState();
  const [editing, setEditing] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  /** Foto cujo "Trocar" recebeu um arquivo que não abre (mostra o aviso no card). */
  const [replaceError, setReplaceError] = useState<string | null>(null);
  // Profissional: tabela própria (no link da equipe, os preços já vêm do documento).
  const pro = useProfessional();
  const summary = summarize(photos, pro && !link);
  const allSize = photos.length && photos.every((p) => p.sizeId === photos[0].sizeId) ? photos[0].sizeId : null;
  const allPaper = photos.length && photos.every((p) => p.paper === photos[0].paper) ? photos[0].paper : null;
  // Preço especial da equipe não muda com a quantidade: sem o aviso "com mais fotos sai mais barato".
  const nudge = summary.sizes.find((group) => group.price.nudge && !link?.view.special[group.size.id]);
  const firstSize = link?.view.photos[0]?.sizeId;
  const firstPaper = link?.view.photos[0]?.paper;

  async function addFiles(files: FileList | File[] | null) {
    const list = await loadFiles(files);
    // Fotos novas entram no tamanho/papel que as outras já usam (no link, no que a equipe escolheu).
    addPhotos(list.map((p) => ({ ...p, sizeId: allSize ?? firstSize ?? p.sizeId, paper: allPaper ?? firstPaper ?? p.paper })));
  }
  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    addFiles([...event.dataTransfer.files]);
  }

  if (link && (link.done || !link.view.editable)) return <LinkSummary link={link} photos={photos} summary={summary} />;

  if (!photos.length && link) {
    return (
      <section className="fp fp-page"><div className="container-shell">
        <div className="fp-link-empty">
          <h1 className="fp-h1">Fotos do {link.view.kindLabel} {link.view.code}</h1>
          <p>Olá{link.view.customerName ? `, ${link.view.customerName.split(" ")[0]}` : ""}! Envie as fotos aqui. Depois você recorta cada uma, escolhe o papel e as quantidades — o valor atualiza na hora.</p>
          {link.view.photos.length ? (
            <ul className="fp-link-asked">
              {link.view.photos.map((line) => <li key={line.sizeId}>{line.quantity} {line.quantity === 1 ? "foto" : "fotos"} · {sizeById(line.sizeId).label}</li>)}
            </ul>
          ) : null}
          <label className={`fp-link-drop${dragOver ? " over" : ""}`} onDragLeave={() => setDragOver(false)} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDrop={onDrop}>
            <input accept="image/*,.heic,.heif" aria-label="Escolher fotos" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} type="file" />
            <ImagePlus aria-hidden="true" size={26} />
            <strong>Escolher fotos</strong>
            <span>ou arraste para cá · JPG, PNG ou HEIC (iPhone)</span>
          </label>
        </div>
      </div></section>
    );
  }

  if (!photos.length) {
    return (
      <section className="fp fp-page"><div className="container-shell">
        <Steps current={1} />
        <div className="fp-empty">
          <p>Nenhuma foto enviada ainda.</p>
          <Link className="button button-primary" href="/produtos/revelacao-de-fotos">Enviar minhas fotos</Link>
          {/* Botão de teste: só aparece em desenvolvimento, nunca para o cliente. */}
          {process.env.NODE_ENV !== "production" ? <button className="fp-demo-button" onClick={() => loadDemoPhotos().then(addPhotos)} type="button">Teste: usar fotos de exemplo</button> : null}
        </div>
      </div></section>
    );
  }

  return (
    <section className="fp fp-page">
      <div className="container-shell">
        {link ? null : <Steps current={2} />}
        {link ? null : <Link className="fp-back" href="/produtos/revelacao-de-fotos"><ArrowLeft aria-hidden="true" size={16} /> Revelação de fotos</Link>}

        <div className="fp-upload-layout">
          <div>
            <div className="fp-title-row">
              <h1 className="fp-h1">Escolha o tamanho e o papel</h1>
              <label className={`fp-add-more${dragOver ? " over" : ""}`} onDragLeave={() => setDragOver(false)} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDrop={onDrop}>
                <input accept="image/*,.heic,.heif" aria-label="Adicionar mais fotos" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} type="file" />
                <ImagePlus aria-hidden="true" size={18} /> Adicionar mais fotos
              </label>
            </div>

            <div className="fp-all">
              <p className="fp-all-title">Para todas as {photos.length} fotos</p>
              {/* Ordem do mais importante para o menos: tamanho, papel e, por último, a tabela de preços. */}
              <p className="fp-all-label">Tamanho</p>
              <SizePicker
                below={(group) => (
                  <>
                    <div className="fp-all-block">
                      <p className="fp-all-label">Papel</p>
                      <PaperChoice onChange={(paper) => setPhotos(photos.map((p) => ({ ...p, paper })))} value={allPaper || null} />
                    </div>
                    <PriceTableToggle counts={Object.fromEntries(summary.sizes.map((g) => [g.size.id, g.copies]))} group={group} />
                  </>
                )}
                onChange={(id) => setPhotos(photos.map((p) => ({ ...p, sizeId: id })))}
                value={allSize}
              />
              <p className="fp-help">{allSize && allPaper ? "Quer uma foto diferente? Mude o tamanho ou o papel direto nela, abaixo." : "Algumas fotos estão com tamanho ou papel diferente — veja em cada foto abaixo."}</p>
            </div>

            {nudge?.price.nudge ? (
              <p className="fp-nudge fp-nudge-inline"><Sparkles aria-hidden="true" size={18} /><span>Com mais {nudge.price.nudge.missing} {nudge.price.nudge.missing === 1 ? "foto" : "fotos"} em {nudge.size.label}, cada uma sai por <strong>{brl(nudge.price.nudge.unit)}</strong>.</span></p>
            ) : null}

            <div className="fp-grid-head">
              <h2>Suas fotos <span>({photos.length})</span></h2>
              <p><Pencil aria-hidden="true" size={15} /> Toque numa foto para cortar, colocar borda ou filtro.</p>
            </div>
            <ul className="fp-grid">
              {photos.map((photo, index) => {
                const q = quality(layout(photo).dpi);
                return (
                  <li className="fp-card" key={photo.id}>
                    <button aria-label={`Ajustar ${photo.name}`} className="fp-card-image" onClick={() => setEditing(index)} type="button">
                      <span className="fp-fit-box"><PhotoRender fit photo={photo} /></span>
                      <span className="fp-card-edit"><Pencil aria-hidden="true" size={15} /> Ajustar</span>
                      {photo.upload?.status === "enviando" ? (
                        <span className="fp-upload-bar" aria-hidden="true"><i style={{ width: `${Math.round(photo.upload.progress * 100)}%` }} /></span>
                      ) : null}
                    </button>
                    <UploadStatus photo={photo} />
                    {/* Trocar foto: mesmo tamanho, papel e cópias; só a imagem muda. */}
                    <label className="fp-replace">
                      <RefreshCw aria-hidden="true" size={13} /> Trocar foto
                      <input accept="image/*,.heic,.heif" aria-label={`Trocar ${photo.name}`} className="sr-only" onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void replacePhotoFile(photo, file).then((ok) => setReplaceError(ok ? null : photo.id));
                      }} type="file" />
                    </label>
                    {replaceError === photo.id ? <p className="fp-upload error" role="alert">Não deu para abrir esse arquivo. Escolha outra foto.</p> : null}
                    <div className="fp-card-row">
                      <span className={`fp-quality q-${q.tone}`}>{q.tone === "low" ? <Info aria-hidden="true" size={14} /> : null}Qualidade {q.label.toLowerCase()}</span>
                      <button aria-label="Remover foto" className="fp-icon-button" onClick={() => setPhotos(photos.filter((p) => p.id !== photo.id))} type="button"><Trash2 aria-hidden="true" size={17} /></button>
                    </div>
                    <div className="fp-card-selects">
                      <label><span>Tamanho</span>
                        <select onChange={(e) => patchPhoto(photo.id, { sizeId: e.target.value })} value={photo.sizeId}>
                          {SIZE_GROUPS.map((group) => (
                            <optgroup key={group.id} label={group.label}>
                              {[...SIZES.filter((size) => size.group === group.id), ...(isListed(photo.sizeId) || sizeById(photo.sizeId).group !== group.id ? [] : [sizeById(photo.sizeId)])].map((size) => <option key={size.id} value={size.id}>{size.label.replace(" cm", "")}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <label><span>Papel</span>
                        <select onChange={(e) => patchPhoto(photo.id, { paper: e.target.value as Photo["paper"] })} value={photo.paper}>
                          {PAPERS.map((paper) => <option key={paper.id} value={paper.id}>{paper.label}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="fp-copies">
                      <span>Cópias</span>
                      <button aria-label="Menos uma cópia" disabled={photo.copies <= 1} onClick={() => patchPhoto(photo.id, { copies: photo.copies - 1 })} type="button"><Minus size={16} /></button>
                      <CopiesInput onChange={(copies) => patchPhoto(photo.id, { copies })} value={photo.copies} />
                      <button aria-label="Mais uma cópia" onClick={() => patchPhoto(photo.id, { copies: photo.copies + 1 })} type="button"><Plus size={16} /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {link ? <LinkSummary link={link} photos={photos} summary={summary} /> : (
          <aside className="fp-summary fp-summary-sticky">
            <h2>{summary.copies} {summary.copies === 1 ? "foto" : "fotos"}<span className="fp-hide-mobile"> no pedido</span></h2>
            {summary.sizes.map((group) => (
              <div className="fp-summary-group fp-hide-mobile" key={group.size.id}>
                <div className="fp-summary-row"><span>{group.size.label} · {group.copies} × {brl(group.price.unit)}</span><strong>{brl(group.price.total)}</strong></div>
                {group.price.nudge ? <p className="fp-nudge"><Sparkles aria-hidden="true" size={16} /><span>Mais {group.price.nudge.missing} e cada uma sai por <strong>{brl(group.price.nudge.unit)}</strong>.</span></p> : null}
              </div>
            ))}
            <div className="fp-summary-total"><span>Total</span><strong>{brl(summary.total)}</strong></div>
            {minimumIssues(photos).map((text) => <p className="fp-help fp-link-error" key={text} role="status">{text}</p>)}
            <button className="button button-primary button-large" disabled={minimumIssues(photos).length > 0} onClick={() => { photoStore.set({ inCart: true }); router.push("/carrinho"); }} type="button">
              <ShoppingBag aria-hidden="true" size={19} /> Adicionar ao carrinho
            </button>
            <p className="fp-help fp-hide-mobile">{deadline(photos)}</p>
          </aside>
          )}
        </div>
      </div>

      {editing !== null && photos[editing] ? (
        <PhotoEditor index={editing} onClose={() => setEditing(null)} onNavigate={setEditing} photos={photos} />
      ) : null}
    </section>
  );
}

/** Tabela de preços recolhível: aberta no computador, fechada no celular (onde a tela é curta). */
function PriceTableToggle({ group, counts }: { group: SizeGroup; counts: Record<string, number> }) {
  // Só monta no navegador (depois que as fotos carregam), então dá para ler a largura da tela aqui.
  const [open] = useState(() => window.matchMedia("(min-width: 641px)").matches);
  return (
    <details className="fp-table-toggle" open={open}>
      <summary>Tabela de preços · {groupOf(group).label}</summary>
      <PriceTable counts={counts} group={group} />
    </details>
  );
}

/** Andamento do envio da foto para a loja: enviando (com %), enviada, ou falhou com "tentar de novo". */
function UploadStatus({ photo }: { photo: Photo }) {
  const upload = photo.upload;
  if (!upload) return null;
  if (upload.status === "pronto") {
    return <p className="fp-upload ok"><CloudCheck aria-hidden="true" size={14} /> Enviada para a loja{upload.convertedFrom ? ` · convertida de ${upload.convertedFrom.toUpperCase()}` : ""}</p>;
  }
  if (upload.status === "erro") {
    return (
      <p className="fp-upload error">
        Não foi possível enviar.{" "}
        <button onClick={() => retryUpload(photo.id)} type="button"><RotateCw aria-hidden="true" size={13} /> Tentar de novo</button>
      </p>
    );
  }
  return <p className="fp-upload">Enviando… {Math.round(upload.progress * 100)}%</p>;
}
