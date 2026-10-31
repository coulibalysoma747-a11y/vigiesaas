"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { ChecksPanel } from "@/components/ChecksPanel";
import { CrawlPanel } from "@/components/CrawlPanel";
import { DiagnosisBox } from "@/components/DiagnosisBox";
import { FeaturesPanel } from "@/components/FeaturesPanel";
import { RobotPanel } from "@/components/RobotPanel";
import { Icon } from "@/components/Icon";
import { StatusPill } from "@/components/StatusDot";
import { UptimeRibbon } from "@/components/UptimeRibbon";
import { api } from "@/lib/api-client";
import { db } from "@/lib/firebase";
import { INTERVALS, describeFailure, describeSsl, formatDuration, formatPct, summarize, type ProbeError, type SslLevel } from "@/lib/monitoring";
import { ago } from "@/lib/safe-url";
import { INCIDENT_LABEL, dateOf, problemCount, type Incident, type Monitor } from "@/lib/types";

export default function MonitorDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [monitor, setMonitor] = useState<Monitor | null | undefined>(undefined); // undefined = chargement, null = introuvable
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/connexion"); return; }
    const unsubMonitor = onSnapshot(
      doc(db, "monitors", id),
      (snap) => setMonitor(snap.exists() && snap.data().userId === user.uid ? { id: snap.id, ...(snap.data() as Omit<Monitor, "id">) } : null),
      () => setMonitor(null),
    );
    const q = query(collection(db, "incidents"), where("userId", "==", user.uid), where("monitorId", "==", id));
    const unsubIncidents = onSnapshot(q, (snap) => setIncidents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Incident, "id">) }))));
    return () => { unsubMonitor(); unsubIncidents(); };
  }, [id, user, loading, router]);

  const summary = useMemo(() => summarize(monitor?.days), [monitor]);
  const sorted = useMemo(() => [...incidents].sort((a, b) => (dateOf(b.startedAt)?.getTime() ?? 0) - (dateOf(a.startedAt)?.getTime() ?? 0)), [incidents]);

  const run = async (label: string, work: () => Promise<string | void>) => {
    setBusy(label);
    setNotice("");
    try {
      const done = await work();
      if (done) setNotice(done);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy("");
    }
  };

  if (monitor === undefined || loading) {
    return <div className="mx-auto max-w-4xl px-4 py-12 sm:px-8" aria-busy="true"><div className="h-40 animate-pulse rounded-xl bg-surface-container" /></div>;
  }
  if (monitor === null) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-8">
        <p className="font-head text-headline-sm font-bold text-on-surface">Site introuvable</p>
        <p className="mt-1 text-body-md text-text-muted">Il a peut-être été supprimé.</p>
        <Link href="/tableau-de-bord" className="btn-primary mt-6">Retour à mes sites</Link>
      </div>
    );
  }

  const paused = monitor.isActive === false;
  const checked = dateOf(monitor.lastCheckedAt);
  const interval = monitor.intervalMin ?? 5;
  // La page répond mais n'affiche plus le texte attendu : le motif n'est pas « HTTP 200 », c'est le texte manquant.
  const failure =
    monitor.lastStatus === false
      ? monitor.lastContentOk === false && monitor.expectText
        ? `Texte attendu introuvable : « ${monitor.expectText} »`
        : describeFailure(monitor.lastCode ?? null, (monitor.lastError ?? null) as ProbeError | null)
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
      <Link href="/tableau-de-bord" className="inline-flex items-center gap-1 text-label-md font-semibold text-text-muted hover:text-on-surface">← Mes sites</Link>

      <div className="card mt-4 overflow-hidden p-4 sm:p-6">
        <div className="-mx-4 -mt-4 mb-4 flex flex-col justify-between gap-4 bg-surface-container-low/50 px-4 py-4 sm:-mx-6 sm:-mt-6 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container"><Icon name="globe" size={22} /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-head text-headline-sm font-semibold text-on-surface">{monitor.name}</h1>
                {paused ? <span className="rounded-full bg-surface-container px-2.5 py-1 text-label-sm font-bold text-text-muted">En pause</span> : <StatusPill status={monitor.lastStatus} degraded={problemCount(monitor) > 0} />}
                {monitor.lastCode ? <span className="rounded-full bg-surface-container px-2 py-0.5 text-label-sm font-bold text-on-surface-variant">HTTP {monitor.lastCode}</span> : null}
              </div>
              <a href={monitor.url} target="_blank" rel="noopener noreferrer" className="block truncate text-body-sm text-primary-container hover:text-primary">{monitor.url} ↗</a>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-body-sm text-text-muted">
                <span className="inline-flex items-center gap-1.5"><Icon name="clock" size={14} />{checked ? `Dernier contrôle ${ago(checked)}` : "Pas encore contrôlé"}</span>
                <span>• toutes les {interval} min</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-label-sm font-bold uppercase tracking-wider text-text-muted">Temps de réponse</p>
              <p className="font-head text-headline-sm font-semibold text-on-surface">{monitor.lastLatencyMs != null ? `${monitor.lastLatencyMs} ms` : "—"}</p>
            </div>
            <div>
              <p className="text-label-sm font-bold uppercase tracking-wider text-text-muted">Disponibilité 30 j</p>
              <p className="font-head text-headline-sm font-semibold text-status-up">{formatPct(summary.uptimePct)}</p>
            </div>
          </div>
        </div>

        {failure && (
          <div className="mb-4">
            <p role="alert" className="rounded-lg bg-status-down/10 px-3 py-2.5 text-body-sm font-medium text-error">Panne en cours : {failure}.</p>
            <DiagnosisBox reason={failure} open />
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between text-label-sm font-bold text-text-muted">
            <span>Historique (30 derniers jours)</span>
            <span>{summary.avgLatencyMs !== null ? `Moyenne : ${summary.avgLatencyMs} ms` : "Pas encore de mesure"}</span>
          </div>
          <UptimeRibbon bars={summary.bars} />
          <div className="mt-1 flex justify-between px-1 text-label-sm font-bold text-text-muted"><span>Il y a 30 jours</span><span>Aujourd&apos;hui</span></div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border-muted/70 pt-4">
          <button
            className="btn-primary"
            disabled={!!busy || paused}
            onClick={() => run("check", async () => {
              const r = await api<{ up: boolean; latencyMs: number | null; reason: string | null; slow: boolean; featuresDown: number; crawl: { total: number; down: number; broken: number } | null; sslLevel: SslLevel | null; sslDaysLeft: number | null }>(`/api/monitors/${id}/check`, { method: "POST" });
              const extras = [r.up && r.slow ? "Site lent." : "", r.featuresDown ? `${r.featuresDown} fonctionnalité${r.featuresDown > 1 ? "s" : ""} en panne.` : "", r.crawl ? `${r.crawl.total} page${r.crawl.total > 1 ? "s" : ""} explorée${r.crawl.total > 1 ? "s" : ""}${r.crawl.down ? `, ${r.crawl.down} en panne` : ""}${r.crawl.broken ? `, ${r.crawl.broken} lien${r.crawl.broken > 1 ? "s" : ""} cassé${r.crawl.broken > 1 ? "s" : ""}` : ""}.` : "",r.sslLevel ? `${describeSsl(r.sslLevel, r.sslDaysLeft)}.` : ""].filter(Boolean).join(" ");
              return `${r.up ? `En ligne : ${r.latencyMs} ms.` : `Hors ligne : ${r.reason ?? "pas de réponse"}.`} ${extras}`.trim();
            })}
          >
            <Icon name="refresh" size={16} />
            {busy === "check" ? "Contrôle…" : "Vérifier maintenant"}
          </button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => run("pause", async () => { await api(`/api/monitors/${id}`, { method: "PATCH", body: { isActive: paused } }); return paused ? "Surveillance reprise." : "Surveillance mise en pause : aucun contrôle, aucune alerte."; })}>
            {paused ? "Reprendre" : "Mettre en pause"}
          </button>
          <Link href={`/tableau-de-bord/${id}/rapport`} className="btn-ghost">Rapport PDF</Link>
          <label className="flex items-center gap-2 text-label-md font-semibold text-text-muted">
            Contrôle toutes les
            <select
              value={interval}
              disabled={!!busy}
              onChange={(e) => run("interval", async () => { await api(`/api/monitors/${id}`, { method: "PATCH", body: { intervalMin: Number(e.target.value) } }); return "Fréquence enregistrée."; })}
              className="h-10 rounded-lg bg-surface-subtle px-3 text-label-md font-semibold text-on-surface outline-none"
            >
              {INTERVALS.map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
          </label>
          <button
            className="ml-auto rounded-lg px-3 py-2 text-label-md font-semibold text-text-muted transition hover:bg-status-down/10 hover:text-status-down"
            disabled={!!busy}
            onClick={() => {
              if (!window.confirm(`Supprimer « ${monitor.name} » et son historique d'incidents ?`)) return;
              void run("delete", async () => { await api(`/api/monitors/${id}`, { method: "DELETE" }); router.push("/tableau-de-bord"); });
            }}
          >
            Supprimer
          </button>
        </div>
        {notice && <p role="status" className="mt-3 text-body-sm font-medium text-primary">{notice}</p>}
      </div>

      <CrawlPanel key={`c-${monitor.id}`} monitor={monitor} onNotice={setNotice} />
      <RobotPanel key={`r-${monitor.id}`} monitor={monitor} onNotice={setNotice} />
      <FeaturesPanel key={`f-${monitor.id}`} monitor={monitor} onNotice={setNotice} />
      <ChecksPanel key={monitor.id} monitor={monitor} onNotice={setNotice} />

      <h2 className="mt-10 font-head text-headline-sm font-bold text-on-surface">Incidents</h2>
      {sorted.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface-container-lowest px-5 py-8 text-center text-body-sm text-text-muted shadow-sm">Aucun incident enregistré pour ce site.</p>
      ) : (
        <ul className="card mt-3 divide-y divide-border-muted/70 overflow-hidden">
          {sorted.map((i) => {
            const start = dateOf(i.startedAt);
            const open = !i.resolvedAt;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
                <div>
                  <p className="text-body-sm font-semibold text-on-surface"><span className="mr-2 rounded-md bg-surface-container px-1.5 py-0.5 text-label-sm font-bold text-on-surface-variant">{INCIDENT_LABEL[i.kind ?? "down"]}</span>{i.reason ?? "Panne"}</p>
                  <p className="text-label-md text-text-muted">{start ? start.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : ""}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-label-sm font-bold ${open ? "bg-status-down/10 text-status-down" : "bg-secondary-fixed/30 text-secondary"}`}>
                  {open ? "En cours" : `Résolu · ${formatDuration(i.durationSec ?? 0)}`}
                </span>
                <div className="basis-full"><DiagnosisBox reason={i.reason} kind={i.kind} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
