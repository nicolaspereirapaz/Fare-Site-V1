import { FileText } from "lucide-react";
import { PhotoOrderActions } from "@/components/staff/fotos/PhotoOrderActions";
import type { PhotoOrder } from "@/lib/photoOrders/repository";
import "@/components/staff/fotos/fotosEquipe.css";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Fotos enviadas pelo cliente: pasta, documento, miniaturas por tamanho + papel e "Apagar fotos". */
export function PhotoOrderFiles({ order }: { order: PhotoOrder }) {
  const file = (relative: string, width?: number) =>
    `/api/equipe/fotos/${order.id}/arquivo?arquivo=${encodeURIComponent(relative)}${width ? `&largura=${width}` : ""}`;
  return (
    <section className="qe-card pf-files" id="fotos">
      <h2>Fotos do cliente</h2>
      <p className="pf-muted">{order.photoCount} {order.photoCount === 1 ? "foto" : "fotos"} · {order.copies} {order.copies === 1 ? "cópia" : "cópias"} · {order.delivery === "retirada" ? "retirar na loja" : "receber em casa"}</p>
      <PhotoOrderActions deleted={Boolean(order.filesDeletedAt)} folder={order.folder} id={order.id} />
      <div className="pf-links">
        <a className="pf-doc-link" href={file(`${order.code}.html`)} rel="noreferrer" target="_blank">
          <FileText aria-hidden="true" size={17} /> Abrir {order.code}.html
        </a>
      </div>
      {order.lines.map((line) => (
        <section className="pf-line" key={`${line.sizeId}-${line.paper}`}>
          <header>
            <h3>{line.title} · papel {line.paper}</h3>
            <p>
              Pasta <code>{line.folder}</code>{line.realSize ? ` · tamanho real ${line.realSize}` : ""} · {line.photos} {line.photos === 1 ? "foto" : "fotos"}
              {" "}· {line.copies} {line.copies === 1 ? "cópia" : "cópias"} · {brl(line.totalCents)}
            </p>
          </header>
          {order.filesDeletedAt ? (
            <p className="pf-muted">As fotos deste pedido foram apagadas.</p>
          ) : (
            <ul className="pf-thumbs">
              {line.files.map((item) => (
                <li key={item.file}>
                  <a href={file(item.file)} rel="noreferrer" target="_blank">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={item.file} loading="lazy" src={file(item.file, 320)} />
                  </a>
                  <span>{item.file.split(/[\/]/).pop()}</span>
                  <em>{item.copies} {item.copies === 1 ? "cópia" : "cópias"}</em>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  );
}
