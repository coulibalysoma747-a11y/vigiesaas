"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { hostOf, safeHref } from "@/lib/safe-url";

type Item = { id: string; name: string; url: string; description?: string; reason?: string; price?: string };

/** Annonces d'exemple, affichées seulement tant que la brocante est vide, et clairement marquées « Exemple ». */
const EXAMPLES: Item[] = [
  { id: "ex1", name: "Mon outil de feedback", url: "exemple.com", description: "Petit widget qui récolte l'avis des visiteurs. Code complet et nom de domaine inclus.", reason: "Manque de temps", price: "À discuter" },
  { id: "ex2", name: "Générateur de factures", url: "exemple.com", description: "Outil de facturation pour freelances, fonctionnel mais jamais lancé.", reason: "Autre projet prioritaire", price: "Prix libre" },
  { id: "ex3", name: "Extension de navigateur", url: "exemple.com", description: "Micro-extension prête à être reprise par quelqu'un de motivé.", reason: "Plus d'intérêt", price: "Don" },
];

export function BrocanteShowcase() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    const q = query(collection(db, "abandoned_saas"), orderBy("createdAt", "desc"), limit(3));
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Item, "id">) }))),
      () => setItems([]),
    );
    // Hors connexion ou base lente : après 4 s on affiche les exemples plutôt qu'un chargement sans fin.
    const timer = window.setTimeout(() => setItems((cur) => cur ?? []), 4000);
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  const real = items !== null && items.length > 0;
  const shown = items === null ? [] : real ? items : EXAMPLES;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {items === null && [0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-xl bg-surface-container-lowest/70" />)}
      {shown.map((it) => {
        const href = real ? safeHref(it.url) : null;
        return (
          <article key={it.id} className="card flex flex-col justify-between overflow-hidden transition-all hover:shadow-md">
            <div className="p-6">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="font-head text-headline-sm font-semibold text-on-surface">{it.name}</h3>
                {it.price ? <span className="shrink-0 font-head text-body-md font-extrabold text-primary-container">{it.price}</span> : null}
              </div>
              {real ? (
                href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mb-3 inline-block text-label-md font-semibold text-primary-container hover:text-primary">{hostOf(it.url)} ↗</a> : null
              ) : (
                <span className="mb-3 inline-block rounded bg-surface-container px-2 py-0.5 text-label-sm font-bold uppercase tracking-wider text-text-muted">Exemple d&apos;annonce</span>
              )}
              {it.description ? <p className="line-clamp-3 text-body-sm text-text-muted">{it.description}</p> : null}
            </div>
            <div className="flex items-center justify-between gap-3 bg-surface-subtle px-6 py-4">
              <div className="min-w-0">
                <p className="text-label-sm font-bold text-text-muted">Pourquoi il est à vendre</p>
                <p className="truncate text-label-md font-semibold text-on-surface">{it.reason || "Non précisé"}</p>
              </div>
              {real ? (
                <Link href="/brocante" className="btn-ghost !px-3 !py-1.5 !text-label-md">Voir</Link>
              ) : (
                <Link href="/brocante" className="btn-ghost !px-3 !py-1.5 !text-label-md">Déposer le mien</Link>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
