import { dayLabel, formatPct, type summarize } from "@/lib/monitoring";

const COLOR = { up: "bg-status-up", degraded: "bg-status-degraded", down: "bg-status-down", none: "bg-surface-container-high" } as const;

/** Les 30 derniers jours d'un site : une barre par jour (vert = en ligne, orange = dégradé, rouge = panne, gris = pas de contrôle). */
export function UptimeRibbon({ bars, compact = false }: { bars: ReturnType<typeof summarize>["bars"]; compact?: boolean }) {
  return (
    <div
      className={`grid grid-cols-[repeat(30,minmax(0,1fr))] ${compact ? "h-5 w-44 gap-[2px]" : "h-7 gap-1 rounded-lg bg-surface-subtle p-1.5"}`}
      role="img"
      aria-label="Historique de disponibilité sur 30 jours"
    >
      {bars.map((b) => (
        <div key={b.key} className={`h-full rounded-[2px] ${COLOR[b.state]}`} title={`${dayLabel(b.key)} : ${b.pct === null ? "pas de contrôle" : formatPct(b.pct)}`} />
      ))}
    </div>
  );
}
