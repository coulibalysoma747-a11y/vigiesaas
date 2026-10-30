import Link from "next/link";
import { BrocanteShowcase } from "@/components/BrocanteShowcase";
import { Icon, type IconName } from "@/components/Icon";
import { MonitorPreview } from "@/components/MonitorPreview";
import { QuickAdd } from "@/components/QuickAdd";

const PILLARS: { icon: IconName; tone: string; hover: string; title: string; text: string; foot: string; footTone: string; footIcon: IconName; id?: string }[] = [
  {
    icon: "clock",
    tone: "bg-primary-container/10 text-primary-container",
    hover: "group-hover:bg-primary-container group-hover:text-on-primary",
    title: "Surveillance 5 min",
    text: "Ton site est contrôlé automatiquement toutes les 5 minutes. Dès qu'il ne répond plus correctement, tu reçois un e-mail.",
    foot: "Alerte e-mail à chaque changement",
    footTone: "text-primary",
    footIcon: "bolt",
  },
  {
    icon: "store",
    tone: "bg-secondary-container/30 text-secondary",
    hover: "group-hover:bg-secondary group-hover:text-on-secondary",
    title: "Brocante de projets",
    text: "Ne laisse plus tes side-projects mourir sur GitHub. Dépose tes projets abandonnés avec un prix et la raison de l'abandon, et trouve des projets à reprendre.",
    foot: "Place de marché pour solopreneurs",
    footTone: "text-secondary",
    footIcon: "exchange",
  },
  {
    icon: "heart",
    tone: "bg-tertiary-container/15 text-tertiary",
    hover: "group-hover:bg-tertiary group-hover:text-on-tertiary",
    title: "100 % gratuit",
    text: "La version V1 est entièrement gratuite, sans carte bancaire. Des fonctions avancées payantes pourront arriver en V2, de façon transparente.",
    foot: "Projet indépendant",
    footTone: "text-tertiary",
    footIcon: "verified",
  },
];

const STEPS: { title: string; text: string; icon: IconName; chip: string; chipTone: string }[] = [
  {
    title: "Ajoute ton URL en 10 s",
    text: "Renseigne simplement l'adresse de ton site ou de ton API. Rien à installer sur ton site, aucun DNS à configurer.",
    icon: "link",
    chip: "https://mon-saas.com/health",
    chipTone: "text-text-muted",
  },
  {
    title: "Vigie veille 24 h/24",
    text: "Toutes les 5 minutes, une requête est envoyée à ton site et le code de réponse HTTP est contrôlé.",
    icon: "refresh",
    chip: "Contrôle automatique continu",
    chipTone: "text-secondary",
  },
  {
    title: "Alerte e-mail à chaque changement",
    text: "Si ton site ne répond plus, tu reçois un e-mail. Un second e-mail t'avertit quand il est de nouveau en ligne.",
    icon: "mail",
    chip: "Panne, puis retour en ligne",
    chipTone: "text-error",
  },
];

export default function Home() {
  return (
    <div className="flex w-full flex-col">
      {/* Haut de page */}
      <div className="relative w-full overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-12 -z-10 h-[420px] w-[850px] max-w-full -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
        <div className="pointer-events-none absolute right-[-10%] top-80 -z-10 h-[350px] w-[500px] rounded-full bg-secondary-container/20 blur-3xl" />

        <section className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-8">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-1 rounded-full bg-surface-container-lowest px-4 py-1 shadow-sm">
              <span className="relative mr-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-up opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-status-up" />
              </span>
              <span className="text-label-sm font-bold uppercase tracking-wider text-on-surface">Surveillance active</span>
              <span className="mx-1 text-body-sm text-text-muted">·</span>
              <span className="hidden text-label-md font-semibold text-primary-container sm:inline">vérification toutes les 5 minutes</span>
              <span className="text-label-md font-semibold text-primary-container sm:hidden">toutes les 5 min</span>
            </div>

            <h1 className="font-head text-[2rem] font-extrabold leading-10 tracking-tight text-on-surface sm:text-headline-xl">
              Surveille ton SaaS <br className="hidden sm:inline" />
              <span className="text-primary-container">par e-mail</span>
            </h1>
            <p className="mt-4 max-w-2xl text-body-md leading-relaxed text-text-muted sm:text-body-lg">
              Vigie SaaS vérifie ton site toutes les 5 minutes et t&apos;alerte dès qu&apos;il tombe. Dépose aussi tes projets abandonnés dans la brocante pour leur donner une seconde vie.
            </p>

            <div className="mt-6 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
              <Link href="/connexion" className="btn-primary w-full !px-8 !py-3.5 hover:scale-[1.02] sm:w-auto">
                <Icon name="plus-circle" size={18} />
                Commencer gratuitement
              </Link>
              <Link href="/brocante" className="btn-ghost w-full !py-3.5 sm:w-auto">
                <Icon name="store" size={18} className="text-text-muted" />
                Voir la brocante
              </Link>
            </div>
            <p className="mt-2 text-label-sm font-bold text-text-muted">Sans carte bancaire · Prêt en moins d&apos;une minute · Conçu pour les solopreneurs</p>
          </div>

          <div className="mt-10">
            <MonitorPreview />
          </div>
        </section>
      </div>

      {/* Les trois piliers */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="eyebrow">Une proposition claire</span>
          <h2 className="mt-1 font-head text-[1.625rem] font-bold leading-8 tracking-tight text-on-surface sm:text-headline-lg">Tout ce qu&apos;il te faut pour veiller l&apos;esprit tranquille</h2>
          <p className="mt-1 text-body-md text-text-muted">Pas de tableau de bord boursouflé, pas de configuration complexe. Vigie SaaS va droit au but.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="card group flex flex-col justify-between overflow-hidden transition-all hover:shadow-md">
              <div className="p-6">
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg transition-colors ${p.tone} ${p.hover}`}>
                  <Icon name={p.icon} size={26} />
                </div>
                <h3 className="font-head text-headline-sm font-bold text-on-surface">{p.title}</h3>
                <p className="mt-2 text-body-md leading-relaxed text-text-muted">{p.text}</p>
              </div>
              <div className={`flex items-center gap-1 bg-surface-subtle px-6 py-4 text-label-md font-semibold ${p.footTone}`}>
                <Icon name={p.footIcon} size={16} />
                <span>{p.foot}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Brocante : annonces réelles (ou exemples tant qu'il n'y en a pas) */}
      <section className="w-full bg-surface-container-low/70 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-surface-container-highest px-2.5 py-1 text-label-sm font-bold text-on-surface-variant">
                <Icon name="bag" size={15} className="text-secondary" />
                Offres récentes sur la place de marché
              </div>
              <h2 className="font-head text-[1.625rem] font-bold leading-8 tracking-tight text-on-surface sm:text-headline-lg">Les pépites de la brocante</h2>
              <p className="mt-1 text-body-md text-text-muted">Des projets fonctionnels à reprendre ou à racheter, déposés par leurs créateurs.</p>
            </div>
            <Link href="/brocante" className="inline-flex items-center gap-1 text-label-lg font-semibold text-primary-container transition-colors hover:text-primary">
              Explorer tous les projets
              <Icon name="arrow-right" size={18} />
            </Link>
          </div>
          <BrocanteShowcase />
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="eyebrow">Simple comme bonjour</span>
          <h2 className="mt-1 font-head text-[1.625rem] font-bold leading-8 tracking-tight text-on-surface sm:text-headline-lg">Comment ça marche ?</h2>
          <p className="mt-1 text-body-md text-text-muted">Mettre un site sous surveillance prend moins d&apos;une minute.</p>
        </div>
        <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex flex-col items-start p-6">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary-container font-head text-headline-sm font-bold text-on-primary">{i + 1}</span>
              <h3 className="font-head text-headline-sm font-bold text-on-surface">{s.title}</h3>
              <p className="mt-2 text-body-md text-text-muted">{s.text}</p>
              <div className={`mt-4 flex w-full items-center gap-2 rounded-lg bg-surface-subtle p-2 text-body-sm font-medium ${s.chipTone}`}>
                <Icon name={s.icon} size={16} className={i === 0 ? "text-primary" : ""} />
                <span className="truncate">{s.chip}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Appel à l'action */}
      <section className="mx-auto mb-6 max-w-7xl px-4 py-10 sm:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-container to-tertiary-container p-8 text-center text-on-primary shadow-xl sm:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-on-primary/10 blur-2xl" />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center">
            <h2 className="font-head text-[1.75rem] font-bold leading-9 tracking-tight text-balance sm:text-headline-lg">Prêt à ne plus subir les pannes ?</h2>
            <p className="mt-2 max-w-xl text-body-md text-on-primary-container sm:text-body-lg">Ajoute ton premier site : c&apos;est gratuit et ça prend moins d&apos;une minute.</p>
            <QuickAdd />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-label-sm font-bold text-on-primary-container">
              {["Sans carte bancaire", "Prêt en moins d'une minute", "Accès à la brocante inclus"].map((t) => (
                <span key={t} className="flex items-center gap-1">
                  <Icon name="check-circle" size={16} className="text-secondary-fixed" />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
