"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { api } from "@/lib/api-client";
import { auth, db } from "@/lib/firebase";
import { MAX_MONITORS_PER_USER } from "@/lib/monitoring";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [alertsEnabled, setAlertsEnabled] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push("/connexion"); return; }
    return onSnapshot(doc(db, "settings", user.uid), (snap) => setAlertsEnabled(snap.data()?.alertsEnabled !== false), () => setAlertsEnabled(true));
  }, [user, loading, router]);

  const toggle = async () => {
    if (!user || alertsEnabled === null) return;
    setBusy("toggle");
    setNotice("");
    try {
      await setDoc(doc(db, "settings", user.uid), { alertsEnabled: !alertsEnabled }, { merge: true });
    } catch {
      setNotice("Enregistrement impossible pour le moment.");
    } finally {
      setBusy("");
    }
  };

  const sendTest = async () => {
    setBusy("test");
    setNotice("");
    try {
      const r = await api<{ to: string }>("/api/settings/test-email", { method: "POST" });
      setNotice(`E-mail de test envoyé à ${r.to}. Regarde aussi tes courriers indésirables.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setBusy("");
    }
  };

  if (loading || !user) return <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8" aria-busy="true"><div className="h-40 animate-pulse rounded-xl bg-surface-container" /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <VerifyEmailBanner />
      <h1 className="font-head text-headline-lg font-bold tracking-tight text-on-surface">Réglages</h1>
      <p className="mt-1.5 text-body-md text-text-muted">Tes alertes et ton compte.</p>

      <section className="card mt-8 p-5 sm:p-6">
        <h2 className="font-head text-headline-sm font-bold text-on-surface">Alertes par e-mail</h2>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-body-md font-medium text-on-surface">Recevoir un e-mail à chaque panne et à chaque retour en ligne</p>
            <p className="mt-1 text-body-sm text-text-muted">Envoyé à <strong className="text-on-surface">{user.email}</strong>{user.emailVerified ? "" : " (adresse pas encore vérifiée)"}. Pour ta sécurité, les alertes ne partent jamais vers une autre adresse.</p>
          </div>
          <button
            role="switch"
            aria-checked={alertsEnabled !== false}
            aria-label="Alertes par e-mail"
            disabled={alertsEnabled === null || busy === "toggle"}
            onClick={toggle}
            className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${alertsEnabled !== false ? "bg-primary-container" : "bg-outline-variant"}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${alertsEnabled !== false ? "left-[1.375rem]" : "left-0.5"}`} />
          </button>
        </div>
        <div className="mt-5 border-t border-border-muted/70 pt-4">
          <button className="btn-ghost" disabled={busy === "test"} onClick={sendTest}>
            <Icon name="mail" size={16} />
            {busy === "test" ? "Envoi…" : "Envoyer un e-mail de test"}
          </button>
        </div>
        {notice && <p role="status" className="mt-3 text-body-sm font-medium text-primary">{notice}</p>}
      </section>

      <section className="card mt-6 p-5 sm:p-6">
        <h2 className="font-head text-headline-sm font-bold text-on-surface">Surveillance</h2>
        <ul className="mt-3 space-y-2 text-body-sm text-on-surface-variant">
          <li>• Jusqu&apos;à {MAX_MONITORS_PER_USER} sites par compte.</li>
          <li>• Fréquence de contrôle réglable site par site : 5, 10, 30 ou 60 minutes.</li>
          <li>• Un site est déclaré hors ligne après deux essais ratés à quelques secondes d&apos;écart : une micro-coupure ne déclenche pas d&apos;alerte.</li>
          <li>• L&apos;historique et les incidents sont gardés 30 jours dans les barres de disponibilité.</li>
        </ul>
      </section>

      <section className="card mt-6 p-5 sm:p-6">
        <h2 className="font-head text-headline-sm font-bold text-on-surface">Compte</h2>
        <p className="mt-2 text-body-sm text-text-muted">Connecté avec {user.email}.</p>
        <button className="btn-ghost mt-4" onClick={() => signOut(auth).then(() => router.push("/"))}>Se déconnecter</button>
      </section>
    </div>
  );
}
