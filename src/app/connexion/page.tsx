"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { Icon } from "@/components/Icon";
import { auth } from "@/lib/firebase";

const PERKS = [
  "Vérification de ton site toutes les 5 minutes",
  "Un e-mail dès qu'il tombe, un autre dès qu'il revient",
  "Gratuit, sans carte bancaire",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") await signInWithEmailAndPassword(auth, email, password);
      else {
        const created = await createUserWithEmailAndPassword(auth, email, password);
        // Lien de vérification : tant qu'il n'est pas cliqué, aucune alerte n'est envoyée à cette adresse.
        await sendEmailVerification(created.user).catch(() => {});
      }
      router.push("/tableau-de-bord");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  // Avec Google, l'adresse e-mail est déjà vérifiée : aucun message de vérification à recevoir (donc rien qui puisse tomber dans les spams).
  const google = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push("/tableau-de-bord");
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") setError("");
      else if (code === "auth/operation-not-allowed") setError("La connexion avec Google n'est pas encore activée sur ce site.");
      else if (code === "auth/unauthorized-domain") setError("Ce site n'est pas encore autorisé pour la connexion avec Google.");
      else if (code === "auth/popup-blocked") setError("Le navigateur a bloqué la fenêtre Google : autorise les fenêtres pop-up pour ce site, puis réessaie.");
      else setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[360px] w-[760px] max-w-full -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
      <div className="mx-auto grid max-w-5xl items-center gap-12 px-4 py-12 sm:px-8 sm:py-20 md:grid-cols-[1fr_26rem]">
        <div className="hidden md:block">
          <span className="eyebrow">Vigie SaaS</span>
          <h2 className="mt-2 font-head text-headline-lg font-bold tracking-tight text-on-surface">Garde un œil sur ton SaaS, sans y penser.</h2>
          <ul className="mt-8 space-y-4">
            {PERKS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-on-surface-variant">
                <Icon name="check-circle" size={20} className="mt-0.5 shrink-0 text-status-up" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-7 shadow-xl sm:p-8">
          <h1 className="font-head text-headline-md font-bold tracking-tight text-on-surface">{mode === "login" ? "Connexion" : "Créer un compte"}</h1>
          <p className="mt-1.5 text-body-sm text-text-muted">
            {mode === "login" ? "Accède à ton tableau de bord Vigie." : "Inscription gratuite en 30 secondes."}
          </p>
          <button type="button" onClick={google} disabled={loading} className="btn-ghost mt-6 w-full !py-3 border border-border-muted">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            Continuer avec Google
          </button>
          <div className="my-5 flex items-center gap-3 text-label-md text-text-muted" aria-hidden>
            <span className="h-px flex-1 bg-border-muted" />
            ou avec ton e-mail
            <span className="h-px flex-1 bg-border-muted" />
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Adresse e-mail</label>
              <input id="email" className="input" type="email" autoComplete="email" placeholder="toi@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Mot de passe</label>
              <input id="password" className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p role="alert" className="rounded-lg bg-status-down/10 px-3 py-2 text-body-sm text-error">{error}</p>}
            <button className="btn-primary w-full !py-3" disabled={loading}>
              {loading ? "Un instant…" : mode === "login" ? "Se connecter" : "Créer le compte"}
            </button>
          </form>
          <button className="mt-5 text-body-sm font-semibold text-primary-container hover:text-primary" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Pas de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
          </button>
        </div>
      </div>
    </div>
  );
}
