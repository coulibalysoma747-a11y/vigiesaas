import Link from "next/link";

const STEPS = [
  { title: "Crée un compte gratuit", text: "Une adresse e-mail et un mot de passe suffisent. Pas de carte bancaire." },
  { title: "Ajoute l'adresse de ton SaaS", text: "Dans le tableau de bord, colle l'URL de ton site. Tu peux en surveiller plusieurs." },
  { title: "Vigie vérifie toutes les 5 minutes", text: "Un contrôle automatique regarde si ton site répond, jour et nuit." },
  { title: "Tu reçois un e-mail à chaque changement", text: "Quand ton site tombe, puis quand il revient en ligne. Rien entre les deux." },
  { title: "Un projet abandonné ? Passe par la brocante", text: "Dépose-le avec sa description, son prix et la raison de l'abandon : un autre créateur peut le reprendre." },
];

export default function CommentCaMarche() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-16">
      <span className="eyebrow">Comment ça marche</span>
      <h1 className="mt-1 font-head text-[1.75rem] font-bold leading-9 tracking-tight text-on-surface sm:text-headline-lg">De l&apos;inscription à ta première alerte</h1>
      <p className="mt-2 max-w-xl text-body-md text-text-muted">Cinq étapes, dont trois se font toutes seules.</p>

      <ol className="mt-10">
        {STEPS.map((s, i) => (
          <li key={s.title} className="relative flex gap-5 pb-6 last:pb-0">
            {i < STEPS.length - 1 && <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-gradient-to-b from-primary-container/40 to-transparent" aria-hidden />}
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container font-head text-headline-sm font-bold text-on-primary">{i + 1}</span>
            <div className="card flex-1 p-5">
              <h2 className="font-head text-headline-sm font-bold text-on-surface">{s.title}</h2>
              <p className="mt-1 text-body-md text-text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-xl bg-surface-container-low p-6 sm:flex-row sm:items-center">
        <p className="text-body-md text-on-surface-variant">100 % gratuit pour la V1. Les plans payants (plus de sites surveillés) sont prévus pour la V2.</p>
        <Link href="/connexion" className="btn-primary shrink-0">Commencer gratuitement</Link>
      </div>
    </div>
  );
}
