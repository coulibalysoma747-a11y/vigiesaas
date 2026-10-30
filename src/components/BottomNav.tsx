"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Accueil", icon: "home" },
  { href: "/tableau-de-bord", label: "Mes sites", icon: "pulse" },
  { href: "/brocante", label: "Brocante", icon: "store" },
  { href: "/comment-ca-marche", label: "Aide", icon: "help" },
];

/** Barre d'onglets des téléphones (comme sur la maquette mobile) ; cachée sur ordinateur. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      <nav className="fixed inset-x-0 bottom-0 z-50 bg-surface/90 shadow-[0_-1px_8px_rgba(0,0,0,0.05)] backdrop-blur-xl md:hidden" aria-label="Navigation principale">
        <div className="flex h-16 items-center justify-around px-4">
          {TABS.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] min-w-[60px] flex-col items-center justify-center gap-1 transition-colors ${active ? "font-semibold text-primary" : "text-on-surface-variant hover:text-on-surface"}`}
              >
                <Icon name={t.icon} size={22} />
                <span className="text-label-sm">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
