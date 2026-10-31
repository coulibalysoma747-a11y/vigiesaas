"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { CRAWL_MAX_PAGES, formatSeconds } from "@/lib/monitoring";
import { ago } from "@/lib/safe-url";
import { dateOf, type CrawlPage, type Monitor } from "@/lib/types";

type Row = CrawlPage & { key: string };

function verdict(p: Row): { label: string; style: string; rank: number } {
  if (p.up === undefined) return { label: "En attente", style: "bg-surface-container text-text-muted", rank: 3 };
  if (!p.up) return p.everOk ? { label: "En panne", style: "bg-status-down/10 text-status-down", rank: 0 } : { label: "Lien cassé", style: "bg-status-degraded/15 text-status-degraded", rank: 1 };
  if (p.protected) return { label: "Protégée", style: "bg-surface-container-high text-on-surface-variant", rank: 4 };
  return { label: "OK", style: "bg-secondary-fixed/30 text-secondary", rank: 5 };
}

/**
 * Exploration automatique : Vigie découvre elle-même les pages du site (liens de l'accueil, 2 niveaux, 20 pages au plus)
 * et les teste toutes à chaque passage. Rien à saisir.
 */
export function CrawlPanel({ monitor: m, onNotice }: { monitor: Monitor; onNotice: (text: string) => void }) {
  const on = m.autoCrawl !== false;
  const [busy, setBusy] = useState(false);

  const rows: Row[] = Object.entries(m.crawlPages ?? {})
    .flatMap(([key, p]) => (p?.path ? [{ key, ...p }] : []))
    .sort((a, b) => verdict(a).rank - verdict(b).rank || a.path.localeCompare(b.path));
  const protectedCount = rows.filter((p) => p.up && p.protected).length;
  const explored = dateOf(m.crawlDiscoveredAt);

  const toggle = async () => {
    setBusy(true);
    try {
      await api(`/api/monitors/${m.id}`, { method: "PATCH", body: { autoCrawl: !on } });
      onNotice(on ? "Exploration automatique désactivée." : "Exploration automatique activée : Vigie explore le site au prochain contrôle (ou cliquez sur « Vérifier maintenant »).");
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mt-6 p-4 sm:p-6" aria-label="Exploration automatique">
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="font-head text-headline-sm font-bold text-on-surface">Exploration automatique</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Vigie explore ton site <strong>toute seule</strong> : elle suit les liens à partir de l&apos;accueil (2 niveaux, {CRAWL_MAX_PAGES} pages au plus) et teste <strong>chaque page découverte</strong> à chaque contrôle. Tu n&apos;as aucune adresse à saisir.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          aria-label="Exploration automatique"
          disabled={busy}
          onClick={toggle}
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-primary-container" : "bg-outline-variant"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
        </button>
      </div>

      {on && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Pages testées", value: String(m.crawlTotal ?? rows.length), tone: "text-on-surface" },
              { label: "En panne", value: String(m.crawlDown ?? 0), tone: (m.crawlDown ?? 0) > 0 ? "text-status-down" : "text-text-muted" },
              { label: "Liens cassés", value: String(m.crawlBroken ?? 0), tone: (m.crawlBroken ?? 0) > 0 ? "text-status-degraded" : "text-text-muted" },
              { label: "Protégées", value: String(protectedCount), tone: "text-text-muted" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-surface-subtle p-3">
                <p className={`font-head text-headline-sm font-bold tabular-nums ${s.tone}`}>{s.value}</p>
                <p className="text-label-md font-semibold text-text-muted">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-label-md text-text-muted">
            {explored ? `Dernière exploration ${ago(explored)} (refaite toutes les 6 heures).` : "Première exploration au prochain contrôle (ou cliquez sur « Vérifier maintenant »)."}
          </p>

          {rows.length > 0 && (
            <details className="mt-3 rounded-xl bg-surface-subtle px-4 py-3">
              <summary className="cursor-pointer text-label-md font-semibold text-on-surface-variant">Voir les {rows.length} pages découvertes</summary>
              <ul className="mt-3 divide-y divide-border-muted/70">
                {rows.map((p) => {
                  const v = verdict(p);
                  return (
                    <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-body-sm font-semibold text-on-surface">{p.path}</p>
                        {p.up === false && p.reason ? <p className="text-label-md font-medium text-error">{p.reason}</p> : null}
                      </div>
                      <div className="flex items-center gap-3 text-label-md text-text-muted">
                        {p.latencyMs != null ? <span>{formatSeconds(p.latencyMs)}</span> : null}
                        <span className={`rounded-full px-2.5 py-1 text-label-sm font-bold ${v.style}`}>{v.label}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-label-md text-text-muted">
                « Lien cassé » : la page n&apos;a jamais répondu depuis qu&apos;elle est découverte. « Protégée » : elle demande une connexion ; Vigie sait qu&apos;elle existe mais ne peut pas encore s&apos;y connecter.
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
