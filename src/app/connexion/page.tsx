"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";

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
      else await createUserWithEmailAndPassword(auth, email, password);
      router.push("/tableau-de-bord");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold">{mode === "login" ? "Connexion" : "Créer un compte"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login" ? "Accède à ton tableau de bord Vigie." : "Inscription gratuite en 30 secondes."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-50" disabled={loading}>
            {loading ? "..." : mode === "login" ? "Se connecter" : "Créer le compte"}
          </button>
        </form>
        <button className="mt-4 text-sm text-brand-600 hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Pas de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
