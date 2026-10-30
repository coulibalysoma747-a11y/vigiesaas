import Link from "next/link";

/** Logo : un battement de cœur (« la vigie ») dans un carré indigo. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="vigie-logo" x1="2" y1="0" x2="30" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#3525cd" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#vigie-logo)" />
      <path d="M5 17h5l3-7 5 13 3-8 2 2h4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 focus:outline-none" aria-label="Vigie SaaS, accueil">
      <LogoMark />
      <span className="font-head text-headline-sm font-bold tracking-tight text-on-surface">Vigie SaaS</span>
    </Link>
  );
}
