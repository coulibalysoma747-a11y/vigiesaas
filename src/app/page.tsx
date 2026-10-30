import Link from "next/link";

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Surveille ton SaaS par email
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Vigie SaaS vérifie ton site toutes les 5 minutes et t&apos;alerte si ça tombe.
          Dépose aussi les projets abandonnés dans la brocante.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/connexion" className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-brand-600/30 hover:bg-brand-700">
            Commencer gratuitement
          </Link>
          <Link href="/brocante" className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 hover:border-brand-300 hover:text-brand-600">
            Voir la brocante
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { title: "Surveillance 5 min", desc: "Ping automatique de ton SaaS, alerte email sur changement d'état." },
            { title: "Brocante", desc: "Dépose les projets abandonnés, rachète ceux des autres." },
            { title: "100 % gratuit", desc: "V1 sans paiement. Monétisation prévue en V2." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-brand-700">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <Link href="/mentions" className="hover:text-brand-600">Mentions légales</Link>
        <span className="mx-2">·</span>
        <Link href="/comment-ca-marche" className="hover:text-brand-600">Comment ça marche</Link>
      </footer>
    </div>
  );
}
