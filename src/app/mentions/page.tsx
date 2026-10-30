export default function Mentions() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-16">
      <span className="eyebrow">Légal</span>
      <h1 className="mt-1 font-head text-[1.75rem] font-bold leading-9 tracking-tight text-on-surface sm:text-headline-lg">Mentions légales</h1>

      <div className="mt-10 space-y-4">
        {[
          { title: "Le service", text: "Vigie SaaS est un service de surveillance de sites et d'annuaire de projets SaaS abandonnés." },
          { title: "Éditeur", text: "À compléter : raison sociale, adresse, e-mail de contact." },
          { title: "Hébergement", text: "Render (offre gratuite) — https://render.com" },
          { title: "Données personnelles", text: "Ton e-mail sert à la connexion et à l'envoi des alertes. Aucune donnée bancaire n'est collectée. Tu peux demander la suppression de ton compte par e-mail." },
        ].map((b) => (
          <section key={b.title} className="card p-6">
            <h2 className="text-label-md font-bold uppercase tracking-widest text-text-muted">{b.title}</h2>
            <p className="mt-2 text-body-md leading-relaxed text-on-surface">{b.text}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
