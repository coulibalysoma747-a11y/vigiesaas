import type { Monitor } from "@/lib/types";

/** Petits avertissements d'un site qui répond mais n'est pas parfait : lent, certificat SSL à renouveler, expiré ou invalide. */
export function Warnings({ monitor: m }: { monitor: Monitor }) {
  const items: { text: string; bad: boolean }[] = [];
  if (m.isSlow) items.push({ text: "Lent", bad: false });
  if (m.sslCheck !== false) {
    if (m.sslLevel === "warn14") items.push({ text: `SSL : ${m.sslDaysLeft} j`, bad: false });
    else if (m.sslLevel === "warn3") items.push({ text: `SSL : ${m.sslDaysLeft} j`, bad: true });
    else if (m.sslLevel === "expired") items.push({ text: "SSL expiré", bad: true });
    else if (m.sslLevel === "invalid") items.push({ text: "SSL invalide", bad: true });
  }
  if (!items.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {items.map((i) => (
        <span key={i.text} className={`rounded-md px-1.5 py-0.5 text-label-sm font-bold ${i.bad ? "bg-status-down/10 text-status-down" : "bg-status-degraded/15 text-status-degraded"}`}>{i.text}</span>
      ))}
    </span>
  );
}
