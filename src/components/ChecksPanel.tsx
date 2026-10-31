"use client";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { LATENCY_OPTIONS, describeSsl, formatSeconds } from "@/lib/monitoring";
import { dateOf, type Monitor } from "@/lib/types";

type Tone = "ok" | "warn" | "bad" | "off";
const TONE: Record<Tone, string> = {
  ok: "bg-secondary-fixed/30 text-secondary",
  warn: "bg-status-degraded/15 text-status-degraded",
  bad: "bg-status-down/10 text-status-down",
  off: "bg-surface-container text-text-muted",
};

function Tile({ title, tone, value, detail }: { title: string; tone: Tone; value: string; detail?: string }) {
  return (
    <div className="rounded-xl bg-surface-subtle p-4">
      <p className="text-label-sm font-bold uppercase tracking-wider text-text-muted">{title}</p>
      <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-label-sm font-bold ${TONE[tone]}`}>{value}</span>
      {detail ? <p className="mt-2 text-body-sm text-text-muted">{detail}</p> : null}
    </div>
  );
}

/** Les 3 contrôles en plus de « le site répond » : contenu de la page, vitesse, certificat SSL (état actuel + réglages). */
export function ChecksPanel({ monitor: m, onNotice }: { monitor: Monitor; onNotice: (text: string) => void }) {
  const https = m.url.toLowerCase().startsWith("https:");
  const [expectText, setExpectText] = useState(m.expectText ?? "");
  const [maxLatency, setMaxLatency] = useState(m.maxLatencyMs ? String(m.maxLatencyMs) : "");
  const [ssl, setSsl] = useState(https && m.sslCheck !== false);
  const [vigilance, setVigilance] = useState(m.vigilance === true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/api/monitors/${m.id}`, { method: "PATCH", body: { expectText, maxLatencyMs: maxLatency ? Number(maxLatency) : null, sslCheck: ssl, vigilance } });
      onNotice("Contrôles enregistrés. Ils s'appliquent dès le prochain contrôle (ou cliquez sur « Vérifier maintenant »).");
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  // État actuel
  const content: { tone: Tone; value: string; detail?: string } = !m.expectText
    ? { tone: "off", value: "Non surveillé", detail: "Aucun texte attendu n'est défini." }
    : m.lastContentOk === false
      ? { tone: "bad", value: "Texte introuvable", detail: `« ${m.expectText} » n'apparaît plus sur la page.` }
      : m.lastContentOk === true
        ? { tone: "ok", value: "Texte trouvé", detail: `« ${m.expectText} »` }
        : { tone: "off", value: "En attente", detail: "Vérifié au prochain contrôle." };

  const speed: { tone: Tone; value: string; detail?: string } = !m.maxLatencyMs
    ? { tone: "off", value: "Non surveillée", detail: "Aucune limite de lenteur définie." }
    : m.isSlow
      ? { tone: "warn", value: "Lent", detail: `Dernier temps : ${m.lastLatencyMs != null ? formatSeconds(m.lastLatencyMs) : "—"} (limite ${formatSeconds(m.maxLatencyMs)}).` }
      : { tone: "ok", value: "Normale", detail: `Limite : ${formatSeconds(m.maxLatencyMs)}${m.lastLatencyMs != null ? ` · dernier temps ${formatSeconds(m.lastLatencyMs)}` : ""}.` };

  const expires = dateOf(m.sslExpiresAt);
  const cert: { tone: Tone; value: string; detail?: string } = !https
    ? { tone: "off", value: "Pas de SSL", detail: "L'adresse commence par http : il n'y a pas de certificat." }
    : m.sslCheck === false
      ? { tone: "off", value: "Non surveillé" }
      : !m.sslLevel
        ? { tone: "off", value: "En attente", detail: "Premier contrôle du certificat au prochain passage." }
        : {
            tone: m.sslLevel === "ok" ? "ok" : m.sslLevel === "warn14" ? "warn" : "bad",
            value: m.sslLevel === "ok" ? "Valide" : m.sslLevel === "expired" ? "Expiré" : m.sslLevel === "invalid" ? "Invalide" : "À renouveler",
            detail: `${describeSsl(m.sslLevel, m.sslDaysLeft ?? null)}${expires ? ` · échéance le ${expires.toLocaleDateString("fr-FR", { dateStyle: "long" })}` : ""}.`,
          };

  return (
    <section className="card mt-6 p-4 sm:p-6" aria-label="Contrôles">
      <h2 className="font-head text-headline-sm font-bold text-on-surface">Contrôles</h2>
      <p className="mt-1 text-body-sm text-text-muted">Au-delà de « le site répond » : la page contient-elle ce qu&apos;elle doit, est-elle assez rapide, le cadenas est-il en règle ?</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tile title="Contenu de la page" {...content} />
        <Tile title="Vitesse" {...speed} />
        <Tile title="Certificat SSL" {...cert} />
      </div>

      <div className="mt-6 grid gap-4 border-t border-border-muted/70 pt-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="expect" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Texte qui doit apparaître sur la page</label>
          <input id="expect" className="input" placeholder="Ex. : Connexion" maxLength={200} value={expectText} onChange={(e) => setExpectText(e.target.value)} />
          <p className="mt-1 text-label-md text-text-muted">Si le site répond mais n&apos;affiche plus ce texte (page vide, erreur), il est déclaré hors ligne. Laissez vide pour ne pas vérifier.</p>
        </div>
        <div>
          <label htmlFor="slow" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Alerter si plus lent que</label>
          <select id="slow" className="input" value={maxLatency} onChange={(e) => setMaxLatency(e.target.value)}>
            <option value="">Désactivé</option>
            {LATENCY_OPTIONS.map((ms) => <option key={ms} value={ms}>{formatSeconds(ms)}</option>)}
          </select>
          <p className="mt-1 text-label-md text-text-muted">Alerte après 3 contrôles lents de suite.</p>
        </div>
        <div className="flex items-start gap-3 sm:pt-7">
          <input id="ssl" type="checkbox" className="mt-1 h-4 w-4 accent-primary-container" checked={ssl} disabled={!https} onChange={(e) => setSsl(e.target.checked)} />
          <label htmlFor="ssl" className="text-body-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">Surveiller le certificat SSL</span>
            <span className="block text-text-muted">Alerte à 14 jours puis à 3 jours de l&apos;expiration, et si le cadenas est invalide.</span>
          </label>
        </div>
        <div className="flex items-start gap-3 sm:col-span-2">
          <input id="vigilance" type="checkbox" className="mt-1 h-4 w-4 accent-primary-container" checked={vigilance} onChange={(e) => setVigilance(e.target.checked)} />
          <label htmlFor="vigilance" className="text-body-sm text-on-surface-variant">
            <span className="font-semibold text-on-surface">Mode vigilance</span>
            <span className="block text-text-muted">
              Pour un site critique : contrôle chaque minute (quand le déclencheur appelle Vigie chaque minute), et un e-mail de rappel toutes les 30 minutes tant que le site reste hors ligne. 5 sites au maximum.
            </span>
          </label>
        </div>
      </div>

      <button className="btn-primary mt-5" disabled={saving} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer les contrôles"}</button>
    </section>
  );
}
