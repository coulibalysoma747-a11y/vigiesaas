// Icônes en traits (dessinées ici : aucune police d'icônes à charger, donc rien qui clignote au chargement).
const PATHS = {
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  store: <><path d="M4 9 5.5 4h13L20 9" /><path d="M4 9v10h16V9" /><path d="M9 19v-5h6v5" /></>,
  heart: <path d="M12 20S4 15.5 3 10a4.8 4.8 0 0 1 9-2.5A4.8 4.8 0 0 1 21 10c-1 5.500-9 10-9 10z" />,
  verified: <><path d="M12 3l2.4 1.8 3-.1.9 2.9 2.4 1.8-.9 2.9.9 2.9-2.4 1.8-.9 2.9-3-.1L12 21l-2.4-1.8-3 .1-.9-2.9L3.300 14.600l.9-2.900-.9-2.900 2.400-1.800.9-2.900 3 .1z" /><path d="m8.500 12 2.500 2.500 4.500-5" /></>,
  exchange: <><path d="M7 7h11l-3-3M17 17H6l3 3" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" /><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-4M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14 4M20 19v-4h-4" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  "check-circle": <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  "plus-circle": <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17.500v.01" /></>,
  home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.4-1 1-1 1.700M12 17v.01" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.500-3.500" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  external: <><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
