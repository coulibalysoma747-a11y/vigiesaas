import Link from "next/link";
import { Logo } from "@/components/Logo";

const LINKS = [
  { href: "/brocante", label: "Brocante" },
  { href: "/comment-ca-marche", label: "Comment ça marche" },
  { href: "/connexion", label: "Connexion" },
  { href: "/mentions", label: "Mentions légales" },
  { href: "/confidentialite", label: "Confidentialité" },
  { href: "/conditions", label: "Conditions" },
];

export function Footer() {
  return (
    <footer className="mt-16 w-full bg-surface-container-low">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        <div className="flex flex-col items-center justify-between gap-6 pb-6 md:flex-row">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <Logo />
            <p className="text-body-sm text-text-muted">Sois prévenu quand ton site tombe. Donne une seconde vie à tes projets.</p>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Pied de page">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-body-sm text-on-surface-variant transition-colors hover:text-on-surface">{l.label}</Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col items-center justify-between gap-2 border-t border-border-muted/70 pt-5 text-body-sm text-text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} Vigie SaaS. Tous droits réservés.</p>
          <p>Surveillance de sites &amp; brocante de micro-SaaS</p>
        </div>
      </div>
    </footer>
  );
}
