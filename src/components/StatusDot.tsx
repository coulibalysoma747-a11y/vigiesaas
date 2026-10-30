/** Voyant d'état : vert qui pulse (en ligne), rouge (hors ligne) ou gris (pas encore vérifié). */
export function StatusDot({ status }: { status: boolean | null }) {
  const color = status === null ? "bg-text-muted/50" : status ? "bg-status-up" : "bg-status-down";
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
      {status === true && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-up opacity-60" />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

export function StatusPill({ status }: { status: boolean | null }) {
  const style =
    status === null
      ? "bg-surface-container text-text-muted"
      : status
        ? "bg-secondary-fixed/30 text-secondary"
        : "bg-status-down/10 text-status-down";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-sm font-bold ${style}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === null ? "bg-text-muted/60" : status ? "bg-status-up" : "bg-status-down"}`} />
      {status === null ? "En attente" : status ? "En ligne" : "Hors ligne"}
    </span>
  );
}
