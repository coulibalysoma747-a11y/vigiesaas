import { Icon } from "@/components/Icon";

/** 30 jours d'illustration : « ok » partout, un jour dégradé (14) et un incident (24). */
const DAYS: { state: "up" | "degraded" | "down"; label: string }[] = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  if (day === 14) return { state: "degraded", label: "Jour 14 : dégradation temporaire" };
  if (day === 24) return { state: "down", label: "Jour 24 : incident, 8 min d'indisponibilité" };
  return { state: "up", label: day === 30 ? "Aujourd'hui : en ligne" : `Jour ${day} : en ligne` };
});

const BAR = { up: "bg-status-up", degraded: "bg-status-degraded", down: "bg-status-down" } as const;

/** Illustration du suivi d'un site et de l'alerte e-mail. Données d'exemple : rien de réel, et c'est écrit sur la carte. */
export function MonitorPreview() {
  return (
    <div className="mx-auto max-w-4xl" role="img" aria-label="Exemple de suivi d'un site : état, historique sur 30 jours et alerte e-mail">
      <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 shadow-xl sm:p-6">
        <span className="absolute -top-0 right-4 rounded-b-md bg-surface-container px-2.5 py-0.5 text-label-sm font-bold uppercase tracking-wider text-text-muted">Exemple</span>

        <div className="-mx-4 -mt-4 mb-4 flex flex-col justify-between gap-4 bg-surface-container-low/50 px-4 pb-4 pt-5 sm:-mx-6 sm:-mt-6 sm:mb-4 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
              <Icon name="globe" size={22} />
            </div>
            <div className="min-w-0 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-head text-[1.05rem] font-semibold text-on-surface sm:text-headline-sm">https://mon-saas.com</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary-fixed/30 px-2.5 py-0.5 text-label-sm font-bold text-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-up" />
                  200 OK
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-sm text-text-muted sm:mt-0">
                <span className="inline-flex items-center gap-1.5"><Icon name="clock" size={14} /> Dernier ping : il y a 42 s</span>
                <span aria-hidden className="hidden sm:inline">•</span>
                <span>Intervalle : 5 min</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-left sm:text-right">
            <div>
              <p className="text-label-sm font-bold uppercase tracking-wider text-text-muted">Latence moyenne</p>
              <p className="font-head text-headline-sm font-semibold text-on-surface">142 ms</p>
            </div>
            <div>
              <p className="text-label-sm font-bold uppercase tracking-wider text-text-muted">Disponibilité (30 j)</p>
              <p className="font-head text-headline-sm font-semibold text-status-up">99,96 %</p>
            </div>
          </div>
        </div>

        <div className="my-4 text-left">
          <div className="mb-1 flex items-center justify-between text-label-sm font-bold text-text-muted">
            <span>Historique (30 derniers jours)</span>
            <span className="text-status-up">1 incident résolu</span>
          </div>
          <div className="grid h-7 grid-cols-[repeat(30,minmax(0,1fr))] items-end gap-1 rounded-lg bg-surface-subtle p-1.5">
            {DAYS.map((d, i) => (
              <div key={i} className={`h-full rounded-sm ${BAR[d.state]}`} title={d.label} />
            ))}
          </div>
          <div className="mt-1 flex justify-between px-1 text-label-sm font-bold text-text-muted">
            <span>Il y a 30 jours</span>
            <span>Aujourd&apos;hui</span>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-start justify-between gap-4 rounded-lg bg-surface-container-low p-4 text-left sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-status-down/10 text-status-down">
              <Icon name="bell" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-label-md font-semibold text-on-surface">Exemple d&apos;alerte par e-mail</p>
              <p className="mt-0.5 text-body-sm text-text-muted">
                <span className="font-medium text-error">Vigie SaaS : mon-saas.com est hors ligne.</span> Ton SaaS mon-saas.com (https://mon-saas.com) est hors ligne.
              </p>
            </div>
          </div>
          <span className="whitespace-nowrap rounded-lg bg-surface-container-lowest px-2.5 py-1.5 text-label-sm font-bold text-text-muted shadow-sm">Reçue à chaque changement d&apos;état</span>
        </div>
      </div>
    </div>
  );
}
