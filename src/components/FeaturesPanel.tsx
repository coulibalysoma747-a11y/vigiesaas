"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api-client";
import { MAX_FEATURES_PER_MONITOR, formatSeconds, type Feature } from "@/lib/monitoring";
import { ago } from "@/lib/safe-url";
import { dateOf, type Monitor } from "@/lib/types";

type Suggestion = { name: string; path: string };
type Draft = { name: string; path: string; expectStatus: string; expectText: string };
const EMPTY: Draft = { name: "", path: "", expectStatus: "", expectText: "" };

/**
 * Fonctionnalités d'un site (connexion, paiement, API…) : chacune est contrôlée à part. Si une seule tombe,
 * le site passe en « Partiel » et l'alerte part, même si la page d'accueil répond.
 */
export function FeaturesPanel({ monitor: m, onNotice }: { monitor: Monitor; onNotice: (text: string) => void }) {
  const features: Feature[] = m.features ?? [];
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const full = features.length >= MAX_FEATURES_PER_MONITOR;

  const save = async (list: { id?: string; name: string; path: string; expectStatus?: string | number | null; expectText?: string | null }[], success: string) => {
    setBusy("save");
    try {
      await api(`/api/monitors/${m.id}`, { method: "PATCH", body: { features: list } });
      onNotice(success);
      return true;
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Enregistrement impossible.");
      return false;
    } finally {
      setBusy("");
    }
  };

  const add = async () => {
    if (!draft.path.trim()) return onNotice("Saisis l'adresse de la fonctionnalité (ex. /connexion).");
    const ok = await save([...features, { name: draft.name, path: draft.path, expectStatus: draft.expectStatus || null, expectText: draft.expectText || null }], "Fonctionnalité ajoutée. Elle est contrôlée dès le prochain passage (ou cliquez sur « Vérifier maintenant »).");
    if (ok) setDraft(EMPTY);
  };

  const remove = async (f: Feature) => {
    if (!window.confirm(`Ne plus surveiller « ${f.name} » ?`)) return;
    await save(features.filter((x) => x.id !== f.id), "Fonctionnalité retirée.");
  };

  const discover = async () => {
    setBusy("discover");
    setSuggestions(null);
    try {
      const r = await api<{ suggestions: Suggestion[] }>(`/api/monitors/${m.id}/discover`, { method: "POST" });
      setSuggestions(r.suggestions);
      setPicked(new Set(r.suggestions.slice(0, Math.max(0, MAX_FEATURES_PER_MONITOR - features.length)).slice(0, 5).map((s) => s.path)));
      if (!r.suggestions.length) onNotice("Aucune autre page trouvée dans les liens de l'accueil. Ajoute-les à la main ci-dessous.");
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Détection impossible.");
    } finally {
      setBusy("");
    }
  };

  const addPicked = async () => {
    const chosen = (suggestions ?? []).filter((s) => picked.has(s.path));
    if (!chosen.length) return;
    if (features.length + chosen.length > MAX_FEATURES_PER_MONITOR) return onNotice(`Au plus ${MAX_FEATURES_PER_MONITOR} fonctionnalités par site : décoche-en quelques-unes.`);
    const ok = await save([...features, ...chosen.map((s) => ({ name: s.name, path: s.path }))], `${chosen.length} fonctionnalité${chosen.length > 1 ? "s" : ""} ajoutée${chosen.length > 1 ? "s" : ""}. Contrôle au prochain passage.`);
    if (ok) setSuggestions(null);
  };

  const togglePick = (path: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <section className="card mt-6 p-4 sm:p-6" aria-label="Fonctionnalités">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="font-head text-headline-sm font-bold text-on-surface">Fonctionnalités du site</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Ajoute les parties importantes de ton site (connexion, paiement, une API…). Chacune est contrôlée à part : si <strong>une seule</strong> tombe, tu es alerté, même si le reste du site répond.
          </p>
        </div>
        <button className="btn-ghost !py-2" onClick={discover} disabled={busy !== "" || full}>
          <Icon name="search" size={16} />
          {busy === "discover" ? "Recherche…" : "Détecter les pages du site"}
        </button>
      </div>

      {suggestions && suggestions.length > 0 && (
        <div className="mt-4 rounded-xl bg-surface-subtle p-4">
          <p className="text-label-md font-semibold text-on-surface">Pages trouvées sur ton site : coche celles à surveiller</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.path}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface-container-lowest px-3 py-2 shadow-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-primary-container" checked={picked.has(s.path)} onChange={() => togglePick(s.path)} />
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-semibold text-on-surface">{s.name}</span>
                    <span className="block truncate text-label-md text-text-muted">{s.path}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary !py-2" onClick={addPicked} disabled={busy !== "" || picked.size === 0}>Surveiller la sélection ({picked.size})</button>
            <button className="btn-ghost !py-2" onClick={() => setSuggestions(null)}>Fermer</button>
          </div>
        </div>
      )}

      {features.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-outline-variant/80 px-4 py-6 text-center text-body-sm text-text-muted">
          Aucune fonctionnalité surveillée pour l&apos;instant. Clique sur « Détecter les pages du site », ou ajoute-en une ci-dessous.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-border-muted/70 overflow-hidden rounded-xl bg-surface-subtle">
          {features.map((f) => {
            const s = m.featureState?.[f.id];
            const checked = dateOf(s?.checkedAt);
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-body-sm font-semibold text-on-surface">{f.name}</p>
                  <p className="truncate text-label-md text-text-muted">
                    {f.path}
                    {f.expectStatus ? ` · code attendu ${f.expectStatus}` : ""}
                    {f.expectText ? ` · texte « ${f.expectText} »` : ""}
                  </p>
                  {s?.up === false && s.reason ? <p className="mt-0.5 text-label-md font-medium text-error">{s.reason}</p> : null}
                </div>
                <div className="hidden text-right text-label-md text-text-muted sm:block">
                  {s?.latencyMs != null ? <p>{formatSeconds(s.latencyMs)}</p> : null}
                  {checked ? <p>{ago(checked)}</p> : null}
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-label-sm font-bold ${s?.up === false ? "bg-status-down/10 text-status-down" : s?.up === true ? "bg-secondary-fixed/30 text-secondary" : "bg-surface-container text-text-muted"}`}
                >
                  {s?.up === false ? "En panne" : s?.up === true ? "Fonctionne" : "En attente"}
                </span>
                <button className="rounded-lg px-2.5 py-1.5 text-label-md font-semibold text-text-muted transition hover:bg-status-down/10 hover:text-status-down" onClick={() => remove(f)} disabled={busy !== ""} aria-label={`Ne plus surveiller ${f.name}`}>
                  Retirer
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 border-t border-border-muted/70 pt-5">
        <p className="text-label-md font-semibold text-on-surface">Ajouter une fonctionnalité à la main {full ? `(maximum de ${MAX_FEATURES_PER_MONITOR} atteint)` : ""}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="f-name" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Nom</label>
            <input id="f-name" className="input" placeholder="Ex. : Paiement" maxLength={40} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={full} />
          </div>
          <div>
            <label htmlFor="f-path" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Adresse sur ton site</label>
            <input id="f-path" className="input" placeholder="/api/paiement" value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} disabled={full} />
          </div>
          <div>
            <label htmlFor="f-status" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Code de réponse attendu</label>
            <select id="f-status" className="input" value={draft.expectStatus} onChange={(e) => setDraft({ ...draft, expectStatus: e.target.value })} disabled={full}>
              <option value="">Par défaut : réponse normale</option>
              <option value="200">200 (OK)</option>
              <option value="401">401 (API protégée : refuse sans clé)</option>
              <option value="403">403 (accès interdit)</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-text" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Texte attendu (facultatif)</label>
            <input id="f-text" className="input" placeholder="Ex. : Payer maintenant" maxLength={200} value={draft.expectText} onChange={(e) => setDraft({ ...draft, expectText: e.target.value })} disabled={full} />
          </div>
        </div>
        <button className="btn-primary mt-4" onClick={add} disabled={busy !== "" || full}>{busy === "save" ? "Enregistrement…" : "Ajouter cette fonctionnalité"}</button>
      </div>
    </section>
  );
}
