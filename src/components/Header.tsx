"use client";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/components/AuthProvider";
import { auth } from "@/lib/firebase";

const PUBLIC_LINKS = [
  { href: "/brocante", label: "Brocante" },
  { href: "/comment-ca-marche", label: "Comment ça marche" },
];

const APP_LINKS = [
  { href: "/tableau-de-bord", label: "Mes sites" },
  { href: "/incidents", label: "Incidents" },
  { href: "/brocante", label: "Brocante" },
  { href: "/parametres", label: "Réglages" },
];

export function Header() {
  const { user, loading } = useAuth();
  const signedIn = !loading && !!user;
  const links = signedIn ? APP_LINKS : PUBLIC_LINKS;
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-surface-container-lowest/90 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Pages du site">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-label-lg font-semibold text-on-surface-variant transition-colors hover:text-on-surface">{l.label}</Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          {signedIn ? (
            <>
              <button onClick={() => signOut(auth)} className="hidden px-2 py-1 text-label-lg font-semibold text-on-surface-variant transition-colors hover:text-on-surface sm:block">Déconnexion</button>
              <Link href="/tableau-de-bord" className="btn-primary !px-4 !py-2">Tableau de bord</Link>
              <Link href="/tableau-de-bord" aria-label="Mon compte" className="hidden h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary sm:flex">
                <Icon name="user" size={16} />
              </Link>
            </>
          ) : (
            <>
              <Link href="/connexion" className="hidden px-2 py-1 text-label-lg font-semibold text-on-surface-variant transition-colors hover:text-on-surface sm:block">Connexion</Link>
              <Link href="/connexion" className="btn-primary !px-4 !py-2">
                <span className="sm:hidden">Commencer</span>
                <span className="hidden sm:inline">Commencer gratuitement</span>
              </Link>
            </>
          )}

          {/* Menu des téléphones (sans JavaScript : <details>) */}
          <details className="relative md:hidden">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-on-surface transition hover:bg-surface-container [&::-webkit-details-marker]:hidden" aria-label="Menu">
              <Icon name="menu" size={22} />
            </summary>
            <div className="absolute right-0 top-12 w-56 rounded-xl bg-surface-container-lowest p-2 shadow-xl">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2.5 text-label-lg font-semibold text-on-surface hover:bg-surface-container-low">{l.label}</Link>
              ))}
              {signedIn ? (
                <button onClick={() => signOut(auth)} className="block w-full rounded-lg px-3 py-2.5 text-left text-label-lg font-semibold text-on-surface-variant hover:bg-surface-container-low">Déconnexion</button>
              ) : (
                <Link href="/connexion" className="block rounded-lg px-3 py-2.5 text-label-lg font-semibold text-on-surface hover:bg-surface-container-low">Connexion</Link>
              )}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
