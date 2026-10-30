"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";
import { StatusDot, StatusPill } from "@/components/StatusDot";
import { db } from "@/lib/firebase";
import { PENDING_URL_KEY } from "@/lib/pending-url";
import { ago, hostOf } from "@/lib/safe-url";

type Monitor = {
  id: string;
  name: string;
  url: string;
  lastStatus: boolean | null;
  lastCode?: number | null;
  lastCheckedAt?: { toDate: () => Date } | null;
};

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [monitors, setMonitors] = useState<Monitor[] | null>(null);
  // Adresse saisie sur l'accueil avant la création du compte : préremplie (la clé est effacée juste après, voir plus bas).
  const [url, setUrl] = useState(() => {
    try {
      return typeof window === "undefined" ? "" : (window.sessionStorage.getItem(PENDING_URL_KEY) ?? "");
    } catch {
      return "";
    }
  });
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

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
    const clean = url.trim();
    if (!user || !clean) return;
    // Sans « https:// », la vérification automatique ne peut pas joindre le site : on l'ajoute pour l'utilisateur.
    const full = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    setAdding(true);
    try {
      await addDoc(collection(db, "monitors"), {
        userId: user.uid,
        userEmail: user.email,
        url: full,
        name: name.trim() || hostOf(full),
        isActive: true,
        lastStatus: null,
        createdAt: serverTimestamp(),
      });
      setUrl("");
      setName("");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (m: Monitor) => {
    if (!window.confirm(`Arrêter la surveillance de « ${m.name} » ?`)) return;
    await deleteDoc(doc(db, "monitors", m.id));
  };

  const list = monitors ?? [];
  const online = list.filter((m) => m.lastStatus === true).length;
  const offline = list.filter((m) => m.lastStatus === false).length;

  if (loading || monitors === null) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-8" aria-busy="true">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-container" />
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container" />)}
        </div>
        <div className="mt-6 h-40 animate-pulse rounded-xl bg-surface-container" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="font-head text-headline-lg font-bold tracking-tight text-on-surface">Tableau de bord</h1>
      <p className="mt-1.5 text-body-md text-text-muted">Tes sites sont vérifiés toutes les 5 minutes. Tu reçois un e-mail à chaque changement d&apos;état.</p>

      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { label: "Surveillés", value: list.length, tone: "text-on-surface" },
          { label: "En ligne", value: online, tone: "text-status-up" },
          { label: "Hors ligne", value: offline, tone: offline > 0 ? "text-status-down" : "text-text-muted" },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-5 text-center sm:text-left">
            <p className={`font-head text-headline-lg font-bold tabular-nums ${s.tone}`}>{s.value}</p>
            <p className="mt-1 text-label-md font-semibold text-text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="card mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="url" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Adresse du site</label>
          <input id="url" className="input" placeholder="mon-saas.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>
        <div className="sm:w-52">
          <label htmlFor="name" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Nom (facultatif)</label>
          <input id="name" className="input" placeholder="Mon application" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn-primary sm:!py-3" disabled={adding}>{adding ? "Ajout…" : "Surveiller"}</button>
      </form>

      <div className="mt-6">
        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant/80 bg-surface-container-lowest/60 px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container">
              <Icon name="pulse" size={22} />
            </span>
            <p className="mt-4 font-head font-bold text-on-surface">Aucun site surveillé pour l&apos;instant</p>
            <p className="mt-1 text-body-sm text-text-muted">Colle l&apos;adresse de ton SaaS ci-dessus : la première vérification arrive dans les 5 minutes.</p>
          </div>
        ) : (
          <ul className="card divide-y divide-border-muted/70 overflow-hidden">
            {list.map((m) => {
              const checked = m.lastCheckedAt?.toDate?.();
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
                  <StatusDot status={m.lastStatus} />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate font-semibold text-on-surface">{m.name}</p>
                    <p className="truncate text-body-sm text-text-muted">{hostOf(m.url)}</p>
                  </div>
                  <div className="hidden text-right text-label-md text-text-muted sm:block">
                    <p>{checked ? `Vérifié ${ago(checked)}` : "Pas encore vérifié"}</p>
                    {m.lastCode ? <p className="mt-0.5 font-medium">HTTP {m.lastCode}</p> : null}
                  </div>
                  <StatusPill status={m.lastStatus} />
                  <button className="rounded-lg px-2.5 py-1.5 text-label-md font-semibold text-text-muted transition hover:bg-status-down/10 hover:text-status-down" onClick={() => remove(m)} aria-label={`Arrêter la surveillance de ${m.name}`}>
                    Supprimer
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
