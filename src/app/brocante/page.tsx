"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { Icon } from "@/components/Icon";
import { ListingCard } from "@/components/ListingCard";
import { db } from "@/lib/firebase";
import { createdOf, filterListings, initials, KIND_LABEL, priceKind, sortListings, type KindFilter, type Listing, type SortKey } from "@/lib/listing";
import { ago } from "@/lib/safe-url";

const EMPTY = { name: "", url: "", description: "", reason: "", price: "", stack: "", mrr: "", contact: "" };

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Derniers ajouts" },
  { value: "oldest", label: "Plus anciens" },
  { value: "name", label: "Nom (A → Z)" },
];

export default function Brocante() {
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [slow, setSlow] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    const q = query(collection(db, "abandoned_saas"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Listing, "id">) }))));
    const timer = window.setTimeout(() => setSlow(true), 6000);
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, []);

  const all = useMemo(() => items ?? [], [items]);
  const counts = useMemo(() => {
    const c = { all: all.length, paid: 0, free: 0, open: 0 };
    for (const l of all) c[priceKind(l.price)] += 1;
    return c;
  }, [all]);
  const shown = useMemo(() => sortListings(filterListings(all, search, kind), sort), [all, search, kind, sort]);
  const latest = useMemo(() => sortListings(all, "recent")[0], [all]);
  const filtersOn = search.trim() !== "" || kind !== "all";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSending(true);
    try {
      await addDoc(collection(db, "abandoned_saas"), {
        userId: user.uid,
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
        reason: form.reason.trim(),
        price: form.price.trim(),
        stack: form.stack.trim(),
        mrr: form.mrr.trim(),
        contact: form.contact.trim(),
        createdAt: serverTimestamp(),
      });
      setForm(EMPTY);
      setShowForm(false);
    } finally {
      setSending(false);
    }
  };

  const field = (key: keyof typeof EMPTY) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value }) });

  const openForm = () => {
    setShowForm(true);
    window.setTimeout(() => document.getElementById("deposer")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const KINDS: { value: KindFilter; label: string; count: number }[] = [
    { value: "all", label: "Tous", count: counts.all },
    { value: "paid", label: KIND_LABEL.paid, count: counts.paid },
    { value: "free", label: KIND_LABEL.free, count: counts.free },
    { value: "open", label: KIND_LABEL.open, count: counts.open },
  ];

  return (
    <div className="w-full">
      {/* Haut de page */}
      <div className="relative mx-auto w-full max-w-7xl overflow-hidden px-4 pb-4 pt-6 sm:px-8">
        <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[360px] w-[720px] max-w-full -translate-x-1/2 bg-gradient-to-tr from-primary-fixed-dim/40 via-secondary-fixed/30 to-transparent opacity-60 blur-3xl" />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-surface-container-high/80 px-3 py-1 backdrop-blur-md">
            <span className="mr-1 h-2 w-2 animate-pulse rounded-full bg-status-up" />
            <span className="text-label-sm font-bold uppercase tracking-wider text-secondary">Place de marché active</span>
            <span className="text-label-md font-medium text-text-muted">· {items === null ? "chargement…" : `${all.length} projet${all.length > 1 ? "s" : ""} en ligne`}</span>
          </div>
          <div className="hidden items-center gap-6 text-label-md font-medium text-text-muted md:flex">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-status-up" /> Contact direct, de créateur à créateur</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Commission Vigie : <strong className="text-on-surface">0 %</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 items-center gap-6 py-4 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <div className="inline-flex items-center gap-1 text-label-md font-bold uppercase text-primary">
              <Icon name="store" size={18} />
              <span>Marketplace indie maker &amp; micro-SaaS</span>
            </div>
            <h1 className="font-head text-[2rem] font-extrabold leading-[1.1] tracking-tight text-on-surface sm:text-headline-xl">
              La brocante des <span className="text-primary-container">micro-SaaS</span> &amp; side-projects
            </h1>
            <p className="max-w-2xl text-body-md leading-relaxed text-on-surface-variant sm:text-body-lg">
              Reprends un projet prêt à relancer, ou dépose le tien pour lui offrir une seconde vie. Chaque annonce est publiée par son créateur : tu le contactes directement, sans intermédiaire.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {user ? (
                <button onClick={openForm} className="btn-primary !rounded-xl !px-6 !py-3 shadow-md">
                  <Icon name="plus-circle" size={20} />
                  <span>Déposer mon projet (gratuit)</span>
                </button>
              ) : (
                <Link href="/connexion" className="btn-primary !rounded-xl !px-6 !py-3 shadow-md">
                  <Icon name="plus-circle" size={20} />
                  <span>Me connecter pour déposer un projet</span>
                </Link>
              )}
              <Link href="/comment-ca-marche" className="btn-ghost !rounded-xl !py-3">
                <Icon name="help" size={20} className="text-text-muted" />
                <span>Comment ça marche ?</span>
              </Link>
            </div>
          </div>

          {/* Dernière annonce */}
          <div className="relative flex flex-col gap-2 rounded-2xl bg-surface-container-lowest p-6 shadow-sm lg:col-span-4">
            <span className="text-label-sm font-bold uppercase text-text-muted">Dernière annonce</span>
            {latest ? (
              <>
                <div className="my-2 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container-highest font-head text-headline-sm font-bold text-primary">{initials(latest.name)}</div>
                  <div className="min-w-0">
                    <p className="truncate font-head text-headline-sm font-semibold text-on-surface">{latest.name}</p>
                    <p className="text-body-sm text-text-muted">{createdOf(latest) ? `Ajoutée ${ago(createdOf(latest) as Date)}` : "Ajoutée récemment"}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 text-label-md font-medium text-on-surface-variant">
                  <span>Prix demandé : <strong className="text-on-surface">{latest.price?.trim() || "à discuter"}</strong></span>
                  <span className="rounded-full bg-surface-container-low px-2 py-0.5 text-label-sm font-bold text-secondary">{KIND_LABEL[priceKind(latest.price)]}</span>
                </div>
              </>
            ) : (
              <div className="my-2 flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container-highest text-primary"><Icon name="upload" size={24} /></div>
                <p className="text-body-sm text-text-muted">{items === null ? "Chargement des annonces…" : "Aucune annonce pour l'instant. Sois le premier à déposer un projet."}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ce qu'il faut savoir */}
      <section className="w-full bg-surface-container-low py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { icon: "bag", tone: "bg-secondary-fixed text-on-secondary-fixed", title: "Annonces publiées par leurs créateurs", text: "Chaque projet est déposé par la personne qui l'a créé, avec sa propre description, son prix et la raison de la vente." } as const,
              { icon: "exchange", tone: "bg-primary-fixed-dim/60 text-primary", title: "Créateur à créateur : 0 % de commission", text: "Vigie met les personnes en relation, c'est tout. Aucun paiement ne passe par nous, donc aucune commission." } as const,
              { icon: "alert", tone: "bg-tertiary-fixed text-tertiary", title: "Vérifie avant d'acheter", text: "Les revenus et les technologies sont déclarés par le vendeur. Demande les preuves (statistiques, accès, code) avant tout paiement." } as const,
            ].map((b) => (
              <div key={b.title} className="flex items-start gap-4 rounded-xl bg-surface-container-lowest/80 p-4 shadow-sm">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${b.tone}`}><Icon name={b.icon} size={22} /></div>
                <div>
                  <h2 className="font-head text-headline-sm font-semibold text-on-surface">{b.title}</h2>
                  <p className="mt-1 text-body-sm text-on-surface-variant">{b.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Formulaire de dépôt */}
      {showForm && user && (
        <section id="deposer" className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-8">
          <form onSubmit={submit} className="card grid gap-4 rounded-2xl p-5 shadow-md sm:grid-cols-2 sm:p-6">
            <div className="flex items-center justify-between sm:col-span-2">
              <h2 className="font-head text-headline-sm font-bold text-on-surface">Déposer un projet</h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg p-2 text-text-muted hover:bg-surface-container" aria-label="Fermer le formulaire"><Icon name="close" size={18} /></button>
            </div>
            <div>
              <label htmlFor="b-name" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Nom du projet</label>
              <input id="b-name" className="input" placeholder="Mon super outil" {...field("name")} required />
            </div>
            <div>
              <label htmlFor="b-url" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Adresse du projet (URL)</label>
              <input id="b-url" className="input" placeholder="mon-outil.com" {...field("url")} required />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="b-desc" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Description</label>
              <textarea id="b-desc" rows={3} className="input" placeholder="Ce que fait le projet, où il en est, ce qui est inclus (code, domaine, comptes)…" {...field("description")} />
            </div>
            <div>
              <label htmlFor="b-reason" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Raison de la vente</label>
              <input id="b-reason" className="input" placeholder="Manque de temps…" {...field("reason")} />
            </div>
            <div>
              <label htmlFor="b-stack" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Technologies (séparées par des virgules)</label>
              <input id="b-stack" className="input" placeholder="Next.js, Supabase, Stripe" {...field("stack")} />
            </div>
            <div>
              <label htmlFor="b-price" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Prix demandé (facultatif)</label>
              <input id="b-price" className="input" placeholder="150 000 F CFA, ou « don »" {...field("price")} />
            </div>
            <div>
              <label htmlFor="b-mrr" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Revenu mensuel (facultatif)</label>
              <input id="b-mrr" className="input" placeholder="180 € / mois" {...field("mrr")} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="b-contact" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Comment te contacter (visible par tout le monde)</label>
              <input id="b-contact" className="input" placeholder="toi@exemple.com ou t.me/ton-pseudo" {...field("contact")} />
              <p className="mt-1.5 text-label-md text-text-muted">Les acheteurs t&apos;écrivent directement. Utilise une adresse que tu acceptes de rendre publique.</p>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <button className="btn-primary" disabled={sending}>{sending ? "Publication…" : "Publier dans la brocante"}</button>
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
            </div>
          </form>
        </section>
      )}

      {/* Recherche, tri et filtres */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-4 pt-8 sm:px-8">
        <div className="flex flex-col gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm">
          <div className="flex flex-col items-stretch justify-between gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Icon name="search" size={20} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                className="h-11 w-full rounded-xl bg-surface-subtle pl-10 pr-10 text-body-sm text-on-surface shadow-inner outline-none placeholder:text-text-muted focus:bg-surface-container-lowest focus:ring-4 focus:ring-primary-container/15"
                placeholder="Rechercher par nom, technologie, mot-clé…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Rechercher une annonce"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-text-muted hover:bg-surface-container" aria-label="Effacer la recherche"><Icon name="close" size={16} /></button>
              )}
            </div>
            <label className="flex shrink-0 items-center gap-2">
              <span className="text-label-md font-semibold text-text-muted">Trier par :</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-11 cursor-pointer rounded-xl bg-surface-subtle px-4 text-label-md font-semibold text-on-surface outline-none">
                {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKind(k.value)}
                aria-pressed={kind === k.value}
                className={`rounded-full px-4 py-1.5 text-label-md font-semibold transition-colors ${kind === k.value ? "bg-primary-container text-on-primary shadow-sm" : "bg-surface-subtle text-on-surface-variant hover:bg-surface-container-high"}`}
              >
                {k.label} ({k.count})
              </button>
            ))}
            {filtersOn && (
              <button onClick={() => { setSearch(""); setKind("all"); }} className="ml-auto text-label-md font-semibold text-primary-container hover:text-primary">Effacer les filtres</button>
            )}
          </div>
        </div>
      </section>

      {/* Annonces */}
      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8">
        {items === null ? (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-2xl bg-surface-container" />)}
            </div>
            {slow && <p className="mt-4 text-center text-body-sm text-text-muted">Le chargement est plus long que prévu. Vérifie ta connexion et recharge la page.</p>}
          </>
        ) : all.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant/80 bg-surface-container-lowest/60 px-6 py-16 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-container/10 text-primary-container"><Icon name="store" size={22} /></span>
            <p className="mt-4 font-head font-bold text-on-surface">La brocante est encore vide</p>
            <p className="mx-auto mt-1 max-w-sm text-body-sm text-text-muted">Sois le premier à y déposer un projet que tu n&apos;as plus le temps de faire vivre.</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant/80 bg-surface-container-lowest/60 px-6 py-14 text-center">
            <p className="font-head font-bold text-on-surface">Aucune annonce ne correspond</p>
            <p className="mt-1 text-body-sm text-text-muted">Essaie un autre mot-clé ou enlève un filtre.</p>
            <button onClick={() => { setSearch(""); setKind("all"); }} className="btn-ghost mt-4">Effacer les filtres</button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-label-md font-semibold text-text-muted">{shown.length} annonce{shown.length > 1 ? "s" : ""}{filtersOn ? ` sur ${all.length}` : ""}</p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {shown.map((it, i) => <ListingCard key={it.id} item={it} index={i} />)}
            </div>
          </>
        )}
      </section>

      {/* Appel à l'action */}
      <section className="mx-auto w-full max-w-7xl px-4 pb-2 pt-4 sm:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary-container to-tertiary-container p-8 text-center text-on-primary shadow-xl sm:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-on-primary/10 blur-2xl" />
          <div className="relative mx-auto max-w-xl">
            <h2 className="font-head text-[1.5rem] font-bold leading-8 tracking-tight text-balance sm:text-headline-lg">Prêt à valoriser ton travail ?</h2>
            <p className="mt-2 text-body-md text-on-primary-container">Décris ton projet en quelques lignes : les personnes intéressées te contactent directement.</p>
            {user ? (
              <button onClick={openForm} className="btn-ghost mt-6 !rounded-xl !px-7 !py-3"><Icon name="bolt" size={18} /> Déposer un projet</button>
            ) : (
              <Link href="/connexion" className="btn-ghost mt-6 !rounded-xl !px-7 !py-3"><Icon name="bolt" size={18} /> Créer un compte et déposer un projet</Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
