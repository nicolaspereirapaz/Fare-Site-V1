import Link from "next/link";

export default function NotFound() {
  return (
    <section className="not-found-page">
      <h1>Essa página não foi impressa.</h1>
      <p>O endereço pode ter mudado. Volte ao catálogo para continuar.</p>
      <Link className="button button-primary button-large" href="/brindes">Ver brindes</Link>
    </section>
  );
}
