"use client";

// página da revelação — começa enviando as fotos.
import { useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Clock, Crop, ImagePlus, MessageCircle, Ruler, Upload } from "lucide-react";
import { PHOTO_TYPE_EVENT } from "@/components/fotos/PhotoGallery";
import { PriceTable, SIZES, SIZE_GROUPS, addPhotos, groupOf, loadDemoPhotos, loadFiles, type SizeGroup } from "@/components/fotos/shared";

/** `group`: tipo escolhido no menu "Fotos" (?tipo=…): a aba de preços já abre nele e as fotos enviadas já entram nesse tipo. */
export function PhotoProductPreview({ name, shortDescription, group = "revelacao" }: { name: string; shortDescription: string; group?: SizeGroup }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [table, setTable] = useState<SizeGroup>(group);
  // Trocar a aba de preços leva a galeria para a foto desse tipo e guarda o tipo no endereço (recarregar mantém).
  function chooseTable(id: SizeGroup) {
    setTable(id);
    window.dispatchEvent(new CustomEvent(PHOTO_TYPE_EVENT, { detail: id }));
    window.history.replaceState(null, "", `?tipo=${id}`);
  }

  async function start(load: Promise<Awaited<ReturnType<typeof loadDemoPhotos>>>) {
    setLoading(true);
    const photos = await load;
    if (!photos.length) { setLoading(false); return; }
    // Revelação continua em 10 × 15; nos outros tipos as fotos entram no primeiro tamanho da aba aberta.
    const sizeId = table === "revelacao" ? null : SIZES.find((size) => size.group === table)?.id;
    addPhotos(sizeId ? photos.map((photo) => ({ ...photo, sizeId })) : photos);
    router.push("/produtos/revelacao-de-fotos/enviar");
  }
  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    start(loadFiles([...event.dataTransfer.files]));
  }

  return (
    <div className="product-configurator fp">
      <div className="config-heading">
        <span className="eyebrow">Revelação, ampliações e grandes formatos</span>
        <h1>{name}</h1>
        <p>{shortDescription}</p>
      </div>

      <ol className="fp-how">
        <li><Upload aria-hidden="true" size={20} /><span><strong>1. Envie suas fotos</strong>Do celular ou do computador, quantas quiser.</span></li>
        <li><Ruler aria-hidden="true" size={20} /><span><strong>2. Escolha tamanho e papel</strong>Para todas de uma vez ou foto por foto.</span></li>
        <li><Crop aria-hidden="true" size={20} /><span><strong>3. Ajuste e finalize</strong>Corte, borda e filtros. Finaliza pelo WhatsApp.</span></li>
      </ol>

      <label
        className={`fp-drop fp-drop-start${dragOver ? " over" : ""}`}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDrop={onDrop}
      >
        <input accept="image/*,.heic,.heif" aria-label="Enviar minhas fotos" disabled={loading} multiple onChange={(event) => start(loadFiles(event.target.files))} type="file" />
        <ImagePlus aria-hidden="true" size={36} />
        <span>
          <strong>{loading ? "Carregando suas fotos…" : "Enviar minhas fotos"}</strong>
          <small>Toque para escolher da galeria ou arraste as fotos para cá.</small>
        </span>
        <span className="button button-primary button-large">Escolher fotos</span>
      </label>
      {/* Botão de teste: só aparece em desenvolvimento, nunca para o cliente. */}
      {process.env.NODE_ENV !== "production" ? <button className="fp-demo-button" disabled={loading} onClick={() => start(loadDemoPhotos())} type="button">Teste: usar fotos de exemplo</button> : null}

      <fieldset className="quantity-range-group fp-prices" id="tamanhos">
        <legend>Tamanhos e preços</legend>
        <div className="sp-tabs fp-price-tabs" role="tablist">
          {SIZE_GROUPS.map((item) => (
            <button aria-selected={table === item.id} className={table === item.id ? "active" : ""} key={item.id} onClick={() => chooseTable(item.id)} role="tab" type="button">{item.label}</button>
          ))}
        </div>
        <div role="tabpanel"><PriceTable group={table} /></div>
        <p className="fp-note"><MessageCircle aria-hidden="true" size={18} /> {groupOf(table).note.replace(/ Pronto em [^.]+\./, "")} Papel brilho ou fosco, mesmo valor.</p>
        <p className="fp-help fp-inline-icon"><Clock aria-hidden="true" size={15} /> Até 30 × 45: pronto em 1 hora após o pagamento. Grandes formatos: 3 dias úteis.</p>
      </fieldset>
    </div>
  );
}
