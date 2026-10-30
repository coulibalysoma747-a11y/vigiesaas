import { safeHref } from "@/lib/safe-url";

/** Une annonce de la brocante, telle que stockée dans Firestore. `stack`, `mrr` et `contact` sont facultatifs et déclarés par le vendeur. */
export type Listing = {
  id: string;
  name: string;
  url: string;
  description?: string;
  reason?: string;
  price?: string;
  stack?: string;
  mrr?: string;
  contact?: string;
  createdAt?: { toDate: () => Date } | null;
};

export type PriceKind = "paid" | "free" | "open";
export type KindFilter = "all" | PriceKind;
export type SortKey = "recent" | "oldest" | "name";

/** Le prix est un texte libre : on le range en « don / gratuit », « avec un prix » ou « à discuter » (champ vide). */
export function priceKind(price?: string): PriceKind {
  const p = (price ?? "").trim();
  if (!p) return "open";
  if (/\b(don|gratuit|gratuite|free)\b/i.test(p) || /^0(?![\d.,])/.test(p)) return "free";
  return "paid";
}

export const KIND_LABEL: Record<PriceKind, string> = { paid: "À vendre", free: "Don / gratuit", open: "Prix à discuter" };

/** « Next.js, Supabase / Stripe » devient ["Next.js", "Supabase", "Stripe"] (6 au maximum). */
export function stackTags(stack?: string): string[] {
  return (stack ?? "").split(/[,;/]+/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
}

/** Lien pour contacter le vendeur : e-mail ou adresse web seulement (jamais javascript: ou autre). */
export function contactHref(contact?: string): string | null {
  const c = (contact ?? "").trim();
  if (!c) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}`;
  if (/[./]/.test(c)) return safeHref(c);
  return null;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}

export const createdOf = (l: Listing): Date | undefined => l.createdAt?.toDate?.();

export function filterListings(items: Listing[], query: string, kind: KindFilter): Listing[] {
  const q = query.trim().toLowerCase();
  return items.filter((l) => {
    if (kind !== "all" && priceKind(l.price) !== kind) return false;
    if (!q) return true;
    return [l.name, l.description, l.reason, l.stack, l.url, l.price].some((v) => (v ?? "").toLowerCase().includes(q));
  });
}

export function sortListings(items: Listing[], sort: SortKey): Listing[] {
  const time = (l: Listing) => createdOf(l)?.getTime() ?? 0;
  const copy = [...items];
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return copy.sort((a, b) => (sort === "oldest" ? time(a) - time(b) : time(b) - time(a)));
}
