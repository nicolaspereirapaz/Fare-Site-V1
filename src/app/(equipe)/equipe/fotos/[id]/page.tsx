import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { PhotoOrderActions } from "@/components/staff/fotos/PhotoOrderActions";
import { StaffTopbar } from "@/components/staff/StaffTopbar";
import { database } from "@/lib/auth";
import { getPhotoOrder } from "@/lib/photoOrders/repository";
import { getStaffSession } from "@/lib/staff/server";
import "@/components/staff/fotos/fotosEquipe.css";

export const metadata: Metadata = { title: "Pedido de fotos" };
export const dynamic = "force-dynamic";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" }).format(new Date(iso));

/** Um pedido de fotos: miniaturas por tamanho + papel, pasta no servidor, documento e "Apagar fotos". */
export default async function PhotoOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) redirect("/equipe/entrar");
  const order = getPhotoOrder(database, (await params).id);
  if (!order) notFound();
  const file = (relative: string, width?: number) =>
    `/api/equipe/fotos/${order.id}/arquivo?arquivo=${encodeURIComponent(relative)}${width ? `&largura=${width}` : ""}`;

  return (
    <>
      <StaffTopbar name={session.user.name} role={session.user.role} />
      <main className="pf-page container-shell">
        <Link className="back-link" href={order.orderId ? `/equipe/pedidos/${order.orderId}` : "/equipe"}>
          <ArrowLeft aria-hidden="true" size={17} /> {order.orderId ? `Pedido ${order.code}` : "Painel"}
        </Link>
        <div className="pf-detail-head">
          <div>
            <span className="eyebrow">Pedido de fotos</span>
            <h1>{order.code}</h1>
            <p>{order.customer.name} · {order.customerNumber} · {order.customer.phone}</p>
            <p className="pf-muted">Chegou em {when(order.createdAt)} · {order.delivery === "retirada" ? "Retirar na loja" : "Receber em casa"}</p>
          </div>
          <div className="pf-total">
            <small>Total</small>
            <strong>{brl(order.totalCents)}</strong>
            <small>{order.photoCount} {order.photoCount === 1 ? "foto" : "fotos"} · {order.copies} {order.copies === 1 ? "cópia" : "cópias"}</small>
          </div>
        </div>

        <PhotoOrderActions deleted={Boolean(order.filesDeletedAt)} folder={order.folder} id={order.id} />
        <div className="pf-links">
          <a className="pf-doc-link" href={file(`${order.code}.html`)} rel="noreferrer" target="_blank">
            <FileText aria-hidden="true" size={17} /> Abrir {order.code}.html
          </a>
        </div>

        {order.lines.map((line) => (
          <section className="pf-line" key={`${line.sizeId}-${line.paper}`}>
            <header>
              <h2>{line.title} · papel {line.paper}</h2>
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
                    <span>{item.file.split(/[\\/]/).pop()}</span>
                    <em>{item.copies} {item.copies === 1 ? "cópia" : "cópias"}</em>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
