"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
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
          <form onSubmit={submit} className="mt-6 space-y-4">
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
