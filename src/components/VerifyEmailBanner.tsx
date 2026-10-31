"use client";
import { useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";

/** Bandeau « vérifie ton e-mail » : tant que l'adresse n'est pas vérifiée, aucune alerte n'est envoyée (protège contre l'envoi d'e-mails à des tiers). */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await sendEmailVerification(user);
      setMessage(`E-mail envoyé à ${user.email}. Pense à regarder tes courriers indésirables.`);
    } catch {
      setMessage("Envoi impossible pour le moment. Réessaie dans une minute.");
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    try {
      await user.reload();
      await user.getIdToken(true); // le serveur doit voir « vérifié » dans le nouveau jeton
      force((n) => n + 1);
      if (!user.emailVerified) setMessage("Ton adresse n'est pas encore vérifiée. Clique sur le lien reçu par e-mail, puis reviens ici.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="mb-6 flex flex-col gap-3 rounded-xl bg-status-degraded/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Icon name="mail" size={20} className="mt-0.5 shrink-0 text-status-degraded" />
        <div>
          <p className="text-label-lg font-semibold text-on-surface">Vérifie ton adresse e-mail pour recevoir les alertes</p>
          <p className="text-body-sm text-on-surface-variant">Nous avons envoyé un lien à {user.email}. <strong>Regarde aussi dans tes courriers indésirables (spam)</strong>, puis clique sur « Pas un spam ». Tant qu&apos;il n&apos;est pas cliqué, tes sites sont surveillés mais aucune alerte n&apos;est envoyée.</p>
          {message && <p className="mt-1 text-body-sm font-medium text-primary">{message}</p>}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={resend} disabled={busy} className="btn-ghost !px-4 !py-2">Renvoyer l&apos;e-mail</button>
        <button onClick={check} disabled={busy} className="btn-primary !px-4 !py-2">C&apos;est fait</button>
      </div>
    </div>
  );
}
