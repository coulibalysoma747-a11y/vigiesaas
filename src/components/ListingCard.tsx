import { Icon } from "@/components/Icon";
import { contactHref, createdOf, initials, KIND_LABEL, priceKind, stackTags, type Listing } from "@/lib/listing";
import { ago, hostOf, safeHref } from "@/lib/safe-url";

const ACCENTS = [
  { bar: "bg-primary-container", tile: "bg-surface-container-highest text-primary" },
  { bar: "bg-secondary", tile: "bg-secondary-fixed text-on-secondary-fixed" },
  { bar: "bg-tertiary-container", tile: "bg-tertiary-fixed text-tertiary" },
] as const;

const KIND_STYLE = {
  paid: "bg-surface-container-high text-primary",
  free: "bg-secondary-fixed/40 text-secondary",
  open: "bg-surface-container-high text-on-surface-variant",
} as const;

/** Carte d'annonce de la brocante. `example` : annonce d'illustration, sans lien ni contact. */
export function ListingCard({ item, index, example = false, onRemove }: { item: Listing; index: number; example?: boolean; onRemove?: () => void }) {
  const accent = ACCENTS[index % ACCENTS.length];
  const kind = priceKind(item.price);
  const tags = stackTags(item.stack);
  const created = createdOf(item);
  const href = example ? null : safeHref(item.url);
  const contact = example ? null : contactHref(item.contact);
  const contactText = (item.contact ?? "").trim();

  return (
    <article className="card group relative flex flex-col justify-between overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:shadow-xl">
      <div className={`absolute inset-x-0 top-0 h-1.5 ${accent.bar}`} />
      <div>
        <div className="mb-3 flex items-start justify-between gap-3 pt-1">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-head text-headline-sm font-bold ${accent.tile}`}>{initials(item.name)}</div>
            <div className="min-w-0">
              <h3 className="truncate font-head text-headline-sm font-semibold text-on-surface transition-colors group-hover:text-primary">{item.name}</h3>
              <p className="truncate text-body-sm text-text-muted">
                {example ? "Exemple d'annonce" : href ? hostOf(item.url) : item.url}
                {created ? ` · ${ago(created)}` : ""}
              </p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-label-sm font-bold ${KIND_STYLE[kind]}`}>{KIND_LABEL[kind]}</span>
        </div>

        {item.description ? <p className="my-3 line-clamp-3 text-body-sm text-on-surface-variant">{item.description}</p> : null}

        {tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-md bg-surface-subtle px-2 py-0.5 text-label-md font-medium text-on-surface-variant">{t}</span>
            ))}
          </div>
        )}

        <div className="mb-4 rounded-xl bg-surface-subtle p-3">
          <p className="text-label-sm font-bold text-text-muted">Pourquoi il est à vendre</p>
          <p className="mt-0.5 text-body-sm font-medium text-on-surface">{item.reason?.trim() || "Non précisé"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="block text-label-sm font-bold text-text-muted">Revenu mensuel déclaré</span>
            <span className="font-head text-body-lg font-bold text-on-surface">{item.mrr?.trim() || "Non communiqué"}</span>
          </div>
          <div className="text-right">
            <span className="block text-label-sm font-bold text-text-muted">Prix demandé</span>
            <span className="font-head text-headline-sm font-extrabold text-on-surface">{item.price?.trim() || "À discuter"}</span>
          </div>
        </div>

        {contact ? (
          <a href={contact} target={contact.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer" className="btn-primary w-full !rounded-xl">
            <span>Contacter le vendeur</span>
            <Icon name="arrow-right" size={18} />
          </a>
        ) : contactText ? (
          <p className="rounded-xl bg-surface-container-low px-3 py-2.5 text-center text-body-sm font-medium text-on-surface">Contact : {contactText}</p>
        ) : null}

        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className={`${contact || contactText ? "btn-ghost" : "btn-primary"} w-full !rounded-xl`}>
            <span>Voir le projet</span>
            <Icon name="external" size={16} />
          </a>
        )}

        {onRemove && (
          <button onClick={onRemove} className="w-full rounded-xl px-3 py-2 text-label-md font-semibold text-text-muted transition hover:bg-status-down/10 hover:text-status-down">
            Retirer mon annonce
          </button>
        )}
      </div>
    </article>
  );
}
