import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Vigie SaaS</h1>
      <p className="mt-2 text-slate-600">
        Surveille ton SaaS par email. Dépose les projets abandonnés dans la brocante.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/connexion" className="rounded bg-black px-4 py-2 text-white">Commencer</Link>
        <Link href="/brocante" className="rounded border px-4 py-2">Brocante</Link>
        <Link href="/comment-ca-marche" className="rounded border px-4 py-2">Comment ça marche</Link>
      </div>
      <footer className="mt-12 text-xs text-slate-500">
        <Link href="/mentions" className="underline">Mentions légales</Link>
      </footer>
    </main>
  );
}
