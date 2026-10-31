"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";
import { StatusDot, StatusPill } from "@/components/StatusDot";
import { UptimeRibbon } from "@/components/UptimeRibbon";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { Warnings } from "@/components/Warnings";
import { api } from "@/lib/api-client";
import { db } from "@/lib/firebase";
import { LATENCY_OPTIONS, MAX_MONITORS_PER_USER, formatPct, formatSeconds, shortHost, summarize } from "@/lib/monitoring";
import { PENDING_URL_KEY } from "@/lib/pending-url";
import { ago } from "@/lib/safe-url";
import { dateOf, problemCount, type Monitor } from "@/lib/types";

function pendingUrl(): string {
  try {
    return typeof window === "undefined" ? "" : (window.sessionStorage.getItem(PENDING_URL_KEY) ?? "");
  } catch {
    return "";
  }
}

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[] | null>(null);
  // Adresse saisie sur l'accueil avant la création du compte : préremplie (la clé est effacée juste après).
  const [url, setUrl] = useState(pendingUrl);
  const [name, setName] = useState("");
  const [expectText, setExpectText] = useState("");
  const [maxLatency, setMaxLatency] = useState("");
  const [sslCheck, setSslCheck] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/connexion"); return; }
    const q = query(collection(db, "monitors"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => setMonitors(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Monitor, "id">) }))));
    return () => unsub();
  }, [user, loading, router]);

  useEffect(() => {
    try {
      window.sessionStorage.removeItem(PENDING_URL_KEY);
    } catch {
      // stockage indisponible : rien à effacer
    }
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setAdding(true);
    try {
      const created = await api<{ id: string }>("/api/monitors", { method: "POST", body: { url, name, expectText, maxLatencyMs: maxLatency ? Number(maxLatency) : null, sslCheck } });
      setUrl("");
      setName("");
      setExpectText("");
      setMaxLatency("");
      setSslCheck(true);
      router.push(`/tableau-de-bord/${created.id}`); // page du site : on peut y ajouter ses fonctionnalités (connexion, paiement…)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout impossible.");
    } finally {
      setAdding(false);
    }
  };

  const list = useMemo(() => [...(monitors ?? [])].sort((a, b) => (dateOf(b.lastChangedAt)?.getTime() ?? 0) - (dateOf(a.lastChangedAt)?.getTime() ?? 0) || a.name.localeCompare(b.name, "fr")), [monitors]);
  const active = list.filter((m) => m.isActive !== false);
  const partial = (m: Monitor) => m.lastStatus === true && problemCount(m) > 0; // répond, mais une fonctionnalité est en panne
  const online = active.filter((m) => m.lastStatus === true && !partial(m)).length;
  const problems = active.filter((m) => m.lastStatus === false || partial(m)).length;
  const overall = useMemo(() => {
    let checks = 0;
    let weighted = 0;
    for (const m of list) {
      const s = summarize(m.days);
      checks += s.checks;
      weighted += (s.uptimePct ?? 0) * s.checks;
    }
    return checks ? weighted / checks : null;
  }, [list]);

  if (loading || monitors === null) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8" aria-busy="true">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-container" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container" />)}
        </div>
        <div className="mt-6 h-40 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8 sm:py-14">
      <VerifyEmailBanner />
      <h1 className="font-head text-headline-lg font-bold tracking-tight text-on-surface">Mes sites</h1>
      <p className="mt-1.5 text-body-md text-text-muted">Chaque site est contrôlé automatiquement. Tu reçois un e-mail à chaque panne et à chaque retour en ligne.</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Surveillés", value: String(active.length), tone: "text-on-surface" },
          { label: "En ligne", value: String(online), tone: "text-status-up" },
          { label: "Avec un problème", value: String(problems), tone: problems > 0 ? "text-status-down" : "text-text-muted" },
          { label: "Disponibilité 30 j", value: formatPct(overall), tone: "text-on-surface" },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-5">
            <p className={`font-head text-headline-md font-bold tabular-nums sm:text-headline-lg ${s.tone}`}>{s.value}</p>
            <p className="mt-1 text-label-md font-semibold text-text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="card mt-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="url" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Adresse du site</label>
            <input id="url" className="input" placeholder="mon-saas.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
          </div>
          <div className="sm:w-52">
            <label htmlFor="name" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Nom (facultatif)</label>
            <input id="name" className="input" placeholder="Mon application" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <button className="btn-primary sm:!py-3" disabled={adding || list.length >= MAX_MONITORS_PER_USER}>{adding ? "Ajout…" : "Surveiller"}</button>
        </div>
        <details className="mt-3 rounded-lg bg-surface-subtle px-4 py-3">
          <summary className="cursor-pointer text-label-md font-semibold text-on-surface-variant">Contrôles avancés (facultatif) : contenu de la page, lenteur, certificat SSL</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="expect" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Texte qui doit apparaître sur la page</label>
              <input id="expect" className="input" placeholder="Ex. : Connexion" maxLength={200} value={expectText} onChange={(e) => setExpectText(e.target.value)} />
              <p className="mt-1 text-label-md text-text-muted">Si le site répond mais n&apos;affiche plus ce texte (page vide, erreur), il est déclaré hors ligne.</p>
            </div>
            <div>
              <label htmlFor="slow" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Alerter si plus lent que</label>
              <select id="slow" className="input" value={maxLatency} onChange={(e) => setMaxLatency(e.target.value)}>
                <option value="">Désactivé</option>
                {LATENCY_OPTIONS.map((ms) => <option key={ms} value={ms}>{formatSeconds(ms)}</option>)}
              </select>
            </div>
            <label className="flex items-start gap-3 text-body-sm text-on-surface-variant sm:pt-7">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-primary-container" checked={sslCheck} onChange={(e) => setSslCheck(e.target.checked)} />
              <span><span className="font-semibold text-on-surface">Surveiller le certificat SSL</span><span className="block text-text-muted">Alerte avant l&apos;expiration du cadenas.</span></span>
            </label>
          </div>
        </details>
        {error && <p role="alert" className="mt-3 rounded-lg bg-status-down/10 px-3 py-2 text-body-sm text-error">{error}</p>}
        <p className="mt-3 text-label-md text-text-muted">{list.length} / {MAX_MONITORS_PER_USER} sites · contrôle toutes les 5 minutes par défaut. Après l&apos;ajout, tu pourras surveiller chaque <strong>fonctionnalité</strong> du site (connexion, paiement…) à part.</p>
      </form>

      <div className="mt-6">
        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant/80 bg-surface-container-lowest/60 px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container"><Icon name="pulse" size={22} /></span>
            <p className="mt-4 font-head font-bold text-on-surface">Aucun site surveillé pour l&apos;instant</p>
            <p className="mt-1 text-body-sm text-text-muted">Colle l&apos;adresse de ton SaaS ci-dessus : le premier contrôle arrive dans les 5 minutes.</p>
          </div>
        ) : (
          <ul className="card divide-y divide-border-muted/70 overflow-hidden">
            {list.map((m) => {
              const s = summarize(m.days);
              const checked = dateOf(m.lastCheckedAt);
              const paused = m.isActive === false;
              return (
                <li key={m.id}>
                  <Link href={`/tableau-de-bord/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-surface-subtle sm:px-5">
                    <StatusDot status={paused ? null : m.lastStatus} degraded={problemCount(m) > 0} />
                    <div className="min-w-0 flex-1 basis-44">
                      <p className="truncate font-semibold text-on-surface">{m.name}</p>
                      <p className="truncate text-body-sm text-text-muted">{shortHost(m.url)}</p>
                      <Warnings monitor={m} />
                    </div>
                    <div className="hidden lg:block"><UptimeRibbon bars={s.bars} compact /></div>
                    <div className="hidden w-24 text-right sm:block">
                      <p className="text-label-md font-semibold text-on-surface">{formatPct(s.uptimePct)}</p>
                      <p className="text-label-sm text-text-muted">{s.avgLatencyMs !== null ? `${s.avgLatencyMs} ms` : "—"}</p>
                    </div>
                    <div className="hidden w-28 text-right text-label-md text-text-muted md:block">{checked ? ago(checked) : "pas encore contrôlé"}</div>
                    {paused ? (
                      <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-1 text-label-sm font-bold text-text-muted">En pause</span>
                    ) : (
                      <StatusPill status={m.lastStatus} degraded={problemCount(m) > 0} />
                    )}
                    <Icon name="arrow-right" size={16} className="hidden text-text-muted sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
