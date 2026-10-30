"use client";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";

export function Header() {
  const { user } = useAuth();
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-xl font-extrabold text-brand-600">Vigie SaaS</Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/brocante" className="text-slate-600 hover:text-brand-600">Brocante</Link>
          <Link href="/comment-ca-marche" className="text-slate-600 hover:text-brand-600">Comment ça marche</Link>
          {user ? (
            <>
              <Link href="/tableau-de-bord" className="rounded-lg bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700">Tableau de bord</Link>
              <button onClick={() => signOut(auth)} className="text-slate-500 hover:text-slate-800">Déconnexion</button>
            </>
          ) : (
            <Link href="/connexion" className="rounded-lg bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700">Connexion</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
