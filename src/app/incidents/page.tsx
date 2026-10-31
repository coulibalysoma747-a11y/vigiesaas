"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { DiagnosisBox } from "@/components/DiagnosisBox";
import { Icon } from "@/components/Icon";
import { db } from "@/lib/firebase";
import { formatDuration, shortHost } from "@/lib/monitoring";
import { ago } from "@/lib/safe-url";
import { INCIDENT_LABEL, dateOf, type Incident } from "@/lib/types";

export default function IncidentsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Incident[] | null>(null);
  // Une lecture refusée ne doit JAMAIS s'afficher comme « Aucun incident » : ce serait faux et rassurant à tort.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/connexion"); return; }
    const q = query(collection(db, "incidents"), where("userId", "==", user.uid));
    return onSnapshot(
      q,
      (snap) => { setFailed(false); setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Incident, "id">) }))); },
      () => { setFailed(true); setItems([]); },
    );
  }, [user, loading, router]);

  const sorted = useMemo(
    () => [...(items ?? [])].sort((a, b) => Number(!!a.resolvedAt) - Number(!!b.resolvedAt) || (dateOf(b.startedAt)?.getTime() ?? 0) - (dateOf(a.startedAt)?.getTime() ?? 0)).slice(0, 200),
    [items],
  );
  const open = sorted.filter((i) => !i.resolvedAt).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-head text-headline-lg font-bold tracking-tight text-on-surface">Incidents</h1>
      <p className="mt-1.5 text-body-md text-text-muted">Chaque panne détectée sur tes sites, avec son début, sa cause et sa durée.</p>

      {items === null || loading ? (
        <div className="mt-8 space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-container" />)}</div>
      ) : failed ? (
        <div role="alert" className="mt-8 rounded-xl border border-status-down/30 bg-status-down/5 px-6 py-8 text-center">
          <p className="font-head font-bold text-status-down">Impossible de lire tes incidents</p>
          <p className="mt-1 text-body-sm text-text-muted">Ce n&apos;est pas « aucun incident » : la lecture a été refusée ou a échoué. Recharge la page ; si cela continue, les règles Firestore du projet (fichier <code>firestore.rules</code>) ne sont probablement pas publiées.</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-outline-variant/80 bg-surface-container-lowest/60 px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-fixed/40 text-secondary"><Icon name="check-circle" size={24} /></span>
          <p className="mt-4 font-head font-bold text-on-surface">Aucun incident</p>
          <p className="mt-1 text-body-sm text-text-muted">Tous tes sites répondent. Les pannes apparaîtront ici dès qu&apos;elles sont détectées.</p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-label-md font-semibold text-text-muted">{open > 0 ? `${open} incident${open > 1 ? "s" : ""} en cours · ` : ""}{sorted.length} au total</p>
          <ul className="card mt-3 divide-y divide-border-muted/70 overflow-hidden">
            {sorted.map((i) => {
              const start = dateOf(i.startedAt);
              const end = dateOf(i.resolvedAt);
              const isOpen = !i.resolvedAt;
              return (
                <li key={i.id}>
                  <Link href={`/tableau-de-bord/${i.monitorId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-surface-subtle sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-on-surface">{i.monitorName}</p>
                      <p className="truncate text-body-sm text-text-muted"><span className="mr-2 rounded-md bg-surface-container px-1.5 py-0.5 text-label-sm font-bold text-on-surface-variant">{INCIDENT_LABEL[i.kind ?? "down"]}</span>{shortHost(i.url)} · {i.reason ?? "Panne"}</p>
                      <p className="text-label-md text-text-muted">{start ? `${start.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })} (${ago(start)})` : ""}{end ? ` · rétabli le ${end.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-label-sm font-bold ${isOpen ? "bg-status-down/10 text-status-down" : "bg-secondary-fixed/30 text-secondary"}`}>
                      {isOpen ? "En cours" : `Résolu · ${formatDuration(i.durationSec ?? 0)}`}
                    </span>
                  </Link>
                  <div className="px-4 pb-3 sm:px-5"><DiagnosisBox reason={i.reason} kind={i.kind} /></div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
