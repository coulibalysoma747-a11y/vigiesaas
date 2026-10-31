export type LegalSection = { title: string; text: string[] };

/** Gabarit commun des pages légales : un titre, une date de mise à jour, des blocs de texte. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro?: string; sections: LegalSection[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-16">
      <span className="eyebrow">Légal</span>
      <h1 className="mt-1 font-head text-[1.75rem] font-bold leading-9 tracking-tight text-on-surface sm:text-headline-lg">{title}</h1>
      <p className="mt-2 text-body-sm text-text-muted">Dernière mise à jour : {updated}</p>
      {intro ? <p className="mt-6 text-body-md leading-relaxed text-on-surface-variant">{intro}</p> : null}

      <div className="mt-8 space-y-4">
        {sections.map((s) => (
          <section key={s.title} className="card p-6">
            <h2 className="text-label-md font-bold uppercase tracking-widest text-text-muted">{s.title}</h2>
            <div className="mt-2 space-y-2 text-body-md leading-relaxed text-on-surface">
              {s.text.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
