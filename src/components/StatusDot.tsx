/** Voyant d'état : vert qui pulse (en ligne), orange (partiel), rouge (hors ligne) ou gris (pas encore vérifié). */
export function StatusDot({ status, degraded = false }: { status: boolean | null; degraded?: boolean }) {
  const partial = status === true && degraded;
  const color = status === null ? "bg-text-muted/50" : partial ? "bg-status-degraded" : status ? "bg-status-up" : "bg-status-down";
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
      {status === true && !partial && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-up opacity-60" />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

/** « Partiel » : le site répond, mais au moins une de ses fonctionnalités est en panne. */
export function StatusPill({ status, degraded = false }: { status: boolean | null; degraded?: boolean }) {
  const partial = status === true && degraded;
  const style =
    status === null
      ? "bg-surface-container text-text-muted"
      : partial
        ? "bg-status-degraded/15 text-status-degraded"
        : status
          ? "bg-secondary-fixed/30 text-secondary"
          : "bg-status-down/10 text-status-down";
  const dot = status === null ? "bg-text-muted/60" : partial ? "bg-status-degraded" : status ? "bg-status-up" : "bg-status-down";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-sm font-bold ${style}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status === null ? "En attente" : partial ? "Partiel" : status ? "En ligne" : "Hors ligne"}
    </span>
  );
}
