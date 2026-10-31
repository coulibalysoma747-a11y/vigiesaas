"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { UptimeRibbon } from "@/components/UptimeRibbon";
import { db } from "@/lib/firebase";
import { HISTORY_DAYS, dayLabel, formatDuration, formatPct, summarize, type DayState } from "@/lib/monitoring";
import { INCIDENT_LABEL, dateOf, type Incident, type Monitor } from "@/lib/types";

const DAY_MS = 86_400_000;
const STATE_LABEL: Record<DayState, string> = { up: "En ligne", degraded: "Dégradé", down: "Hors ligne", none: "Pas de contrôle" };
const STATE_COLOR: Record<DayState, string> = { up: "text-status-up", degraded: "text-status-degraded", down: "text-status-down", none: "text-text-muted" };
const fullDate = (d: Date) => d.toLocaleDateString("fr-FR", { dateStyle: "long" });
const dateTime = (d?: Date) => (d ? d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "—");

/** Rapport de disponibilité d'un site sur 30 jours, prêt à être enregistré en PDF (bouton « Télécharger en PDF » = impression du navigateur). */
export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [monitor, setMonitor] = useState<Monitor | null | undefined>(undefined);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [incidentsFailed, setIncidentsFailed] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/connexion"); return; }
    const unsubMonitor = onSnapshot(
      doc(db, "monitors", id),
      (snap) => setMonitor(snap.exists() && snap.data().userId === user.uid ? { id: snap.id, ...(snap.data() as Omit<Monitor, "id">) } : null),
      () => setMonitor(null),
    );
    const q = query(collection(db, "incidents"), where("userId", "==", user.uid), where("monitorId", "==", id));
    const unsubIncidents = onSnapshot(
      q,
      (snap) => { setIncidentsFailed(false); setIncidents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Incident, "id">) }))); },
      () => { setIncidentsFailed(true); setIncidents([]); },
    );
    return () => { unsubMonitor(); unsubIncidents(); };
  }, [id, user, loading, router]);

  const summary = useMemo(() => summarize(monitor?.days, now), [monitor, now]);
  const since = useMemo(() => new Date(now.getTime() - (HISTORY_DAYS - 1) * DAY_MS), [now]);
  const inPeriod = useMemo(
    () =>
      (incidents ?? [])
        .filter((i) => !i.resolvedAt || (dateOf(i.startedAt)?.getTime() ?? 0) >= since.getTime() - DAY_MS)
        .sort((a, b) => (dateOf(b.startedAt)?.getTime() ?? 0) - (dateOf(a.startedAt)?.getTime() ?? 0)),
    [incidents, since],
  );
  const downSeconds = inPeriod
    .filter((i) => (i.kind ?? "down") === "down")
    .reduce((sum, i) => {
      const start = dateOf(i.startedAt);
      return sum + (i.resolvedAt ? (i.durationSec ?? 0) : start ? Math.max(0, Math.round((now.getTime() - start.getTime()) / 1000)) : 0);
    }, 0);

  if (monitor === undefined || loading || incidents === null) {
    return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8" aria-busy="true"><div className="h-40 animate-pulse rounded-xl bg-surface-container" /></div>;
  }
  if (monitor === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-8">
        <p className="font-head text-headline-sm font-bold text-on-surface">Site introuvable</p>
        <Link href="/tableau-de-bord" className="btn-primary mt-6">Retour à mes sites</Link>
      </div>
    );
  }

  const half = Math.ceil(summary.bars.length / 2);
  const columns = [summary.bars.slice(0, half), summary.bars.slice(half)];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
      {/* À l'impression : on ne garde que la feuille (ni menu, ni pied de page, ni barre d'onglets). */}
      <style>{`@page { margin: 14mm; } @media print { header, footer, nav { display: none !important; } main { padding-top: 0 !important; } body { background: #fff !important; } .report-sheet { box-shadow: none !important; border: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/tableau-de-bord/${id}`} className="inline-flex items-center gap-1 text-label-md font-semibold text-text-muted hover:text-on-surface">← Retour au site</Link>
        <button className="btn-primary" onClick={() => window.print()}>Télécharger en PDF</button>
      </div>
      <p className="mb-4 text-label-md text-text-muted print:hidden">Dans la fenêtre d&apos;impression qui s&apos;ouvre, choisis « Enregistrer au format PDF » comme imprimante.</p>

      <article className="report-sheet card bg-white p-6 sm:p-10">
        <p className="eyebrow">Rapport de disponibilité</p>
        <h1 className="mt-1 font-head text-headline-lg font-bold tracking-tight text-on-surface">{monitor.name}</h1>
        <p className="break-all text-body-md text-text-muted">{monitor.url}</p>
        <p className="mt-3 text-body-sm text-on-surface-variant">
          Période : du {fullDate(since)} au {fullDate(now)} ({HISTORY_DAYS} jours) · Rapport généré le {fullDate(now)}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Disponibilité", value: formatPct(summary.uptimePct) },
            { label: "Temps de réponse moyen", value: summary.avgLatencyMs !== null ? `${summary.avgLatencyMs} ms` : "—" },
            { label: "Incidents", value: String(inPeriod.length) },
            { label: "Indisponibilité totale", value: downSeconds > 0 ? formatDuration(downSeconds) : "Aucune" },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-surface-subtle p-4">
              <p className="text-label-sm font-bold uppercase tracking-wider text-text-muted">{k.label}</p>
              <p className="mt-1 font-head text-headline-sm font-semibold text-on-surface">{k.value}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-8 font-head text-body-lg font-bold text-on-surface">Disponibilité jour par jour</h2>
        <div className="mt-2"><UptimeRibbon bars={summary.bars} /></div>
        <div className="mt-1 flex justify-between px-1 text-label-sm font-bold text-text-muted"><span>Il y a {HISTORY_DAYS} jours</span><span>Aujourd&apos;hui</span></div>
        <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
          {columns.map((rows, c) => (
            <table key={c} className="w-full text-body-sm">
              <thead>
                <tr className="text-left text-label-sm uppercase tracking-wider text-text-muted">
                  <th className="py-1 font-bold">Jour</th>
                  <th className="py-1 font-bold">Disponibilité</th>
                  <th className="py-1 font-bold">État</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.key} className="border-t border-border-muted/60">
                    <td className="py-1">{dayLabel(b.key)}</td>
                    <td className="py-1">{b.pct === null ? "—" : formatPct(b.pct)}</td>
                    <td className={`py-1 font-semibold ${STATE_COLOR[b.state]}`}>{STATE_LABEL[b.state]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>

        <h2 className="mt-8 font-head text-body-lg font-bold text-on-surface">Incidents de la période</h2>
        {incidentsFailed ? (
          <p role="alert" className="mt-2 text-body-sm text-status-down">Les incidents n&apos;ont pas pu être lus : ce rapport est incomplet.</p>
        ) : inPeriod.length === 0 ? (
          <p className="mt-2 text-body-sm text-text-muted">Aucun incident enregistré sur la période.</p>
        ) : (
          <table className="mt-2 w-full text-body-sm">
            <thead>
              <tr className="text-left text-label-sm uppercase tracking-wider text-text-muted">
                <th className="py-1 pr-2 font-bold">Type</th>
                <th className="py-1 pr-2 font-bold">Début</th>
                <th className="py-1 pr-2 font-bold">Rétablissement</th>
                <th className="py-1 pr-2 font-bold">Durée</th>
                <th className="py-1 font-bold">Cause</th>
              </tr>
            </thead>
            <tbody>
              {inPeriod.map((i) => (
                <tr key={i.id} className="border-t border-border-muted/60 align-top">
                  <td className="py-1.5 pr-2 font-semibold">{INCIDENT_LABEL[i.kind ?? "down"]}</td>
                  <td className="py-1.5 pr-2">{dateTime(dateOf(i.startedAt))}</td>
                  <td className="py-1.5 pr-2">{i.resolvedAt ? dateTime(dateOf(i.resolvedAt)) : <span className="font-semibold text-status-down">En cours</span>}</td>
                  <td className="py-1.5 pr-2">{i.resolvedAt ? formatDuration(i.durationSec ?? 0) : "—"}</td>
                  <td className="py-1.5">{i.reason ?? "Panne"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-8 border-t border-border-muted/70 pt-4 text-label-md text-text-muted">
          Mesures réalisées par Vigie SaaS (contrôle toutes les {monitor.vigilance ? 1 : monitor.intervalMin ?? 5} minutes). Un jour est « en ligne » à partir de 99,5 % de contrôles réussis, « dégradé » à partir de 90 %, sinon « hors ligne ».
        </p>
      </article>
    </div>
  );
}
