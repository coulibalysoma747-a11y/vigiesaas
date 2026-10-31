"use client";
import { useState } from "react";
import { DiagnosisBox } from "@/components/DiagnosisBox";
import { api } from "@/lib/api-client";
import { ROBOT_MAX_PAGES, ROBOT_MAX_STEPS, formatSeconds } from "@/lib/monitoring";
import { ago } from "@/lib/safe-url";
import { dateOf, type Monitor } from "@/lib/types";

/**
 * Robot de connexion : un vrai navigateur se connecte à l'application avec un COMPTE DE TEST, visite l'intérieur
 * (tableau de bord, paiements…) et signale toute erreur, comme un utilisateur connecté le verrait.
 */
export function RobotPanel({ monitor: m, onNotice }: { monitor: Monitor; onNotice: (text: string) => void }) {
  const robot = m.robot;
  const enabled = robot?.enabled === true;
  const [loginPath, setLoginPath] = useState(robot?.loginPath ?? "/connexion");
  const [email, setEmail] = useState(robot?.email ?? "");
  const [password, setPassword] = useState("");
  const [scenario, setScenario] = useState(robot?.scenarioText ?? "");
  const [busy, setBusy] = useState("");
  const last = dateOf(robot?.lastRunAt);

  /** « Lancer le robot maintenant » : passe en tête de file et demande à GitHub de le lancer tout de suite. */
  const runNow = async () => {
    setBusy("run");
    try {
      const out = await api<{ dispatched?: boolean }>(`/api/monitors/${m.id}/robot`, { method: "POST" });
      onNotice(out.dispatched ? "Robot lancé : le résultat arrive ici dans environ une minute." : "Demande enregistrée : le robot passera au prochain déclenchement (5 minutes au plus).");
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Lancement impossible.");
    } finally {
      setBusy("");
    }
  };

  const send = async (label: string, body: Record<string, unknown>, success: string) => {
    setBusy(label);
    try {
      await api(`/api/monitors/${m.id}`, { method: "PATCH", body: { robot: body } });
      setPassword("");
      onNotice(success);
    } catch (e) {
      onNotice(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy("");
    }
  };

  const state =
    !enabled
      ? { tone: "bg-surface-container text-text-muted", label: "Désactivé", detail: "Le robot ne se connecte pas à ton application." }
      : !last
        ? { tone: "bg-surface-container text-text-muted", label: "En attente", detail: "Premier passage dans quelques minutes." }
        : robot?.ok
          ? { tone: "bg-secondary-fixed/30 text-secondary", label: "Fonctionne", detail: `Connexion réussie, ${robot.pagesTested ?? 0} page${(robot.pagesTested ?? 0) > 1 ? "s" : ""} visitée${(robot.pagesTested ?? 0) > 1 ? "s" : ""}${robot.pagesBroken ? `, ${robot.pagesBroken} lien${robot.pagesBroken > 1 ? "s" : ""} cassé${robot.pagesBroken > 1 ? "s" : ""}` : ""}.` }
          : { tone: "bg-status-down/10 text-status-down", label: "En panne", detail: robot?.reason ?? "Le robot a constaté un problème." };

  return (
    <section className="card mt-6 p-4 sm:p-6" aria-label="Robot de connexion">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h2 className="font-head text-headline-sm font-bold text-on-surface">Robot de connexion</h2>
          <p className="mt-1 text-body-sm text-text-muted">
            Un vrai navigateur <strong>entre dans ton application</strong> avec un compte de test, visite l&apos;intérieur ({ROBOT_MAX_PAGES} pages au plus), ouvre les onglets et les menus, joue ton scénario, et te prévient dès qu&apos;une page, un appel serveur ou un geste échoue, comme le verrait un testeur.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-label-sm font-bold ${state.tone}`}>{state.label}</span>
      </div>

      <p className="mt-3 text-body-sm text-on-surface-variant">
        {state.detail}
        {last ? <span className="text-text-muted"> · dernier passage {ago(last)}</span> : null}
      </p>
      {enabled && last && robot?.ok === false ? <DiagnosisBox reason={robot.reason} kind="robot" open /> : null}

      {robot?.pages && robot.pages.length > 0 && (
        <details className="mt-3 rounded-xl bg-surface-subtle px-4 py-3">
          <summary className="cursor-pointer text-label-md font-semibold text-on-surface-variant">Voir les {robot.pages.length} pages visitées au dernier passage</summary>
          <ul className="mt-3 divide-y divide-border-muted/70">
            {robot.pages.map((p) => {
              const bad = p.error !== null || p.status === null || p.status >= 500;
              return (
                <li key={p.path} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate text-body-sm font-semibold text-on-surface">
                    {p.path}
                    {p.warn ? <span className="ml-2 text-label-md font-normal text-status-degraded">⚠ {p.warn}</span> : null}
                  </span>
                  <span className="flex items-center gap-3 text-label-md text-text-muted">
                    {p.ms != null ? formatSeconds(p.ms) : null}
                    <span className={`rounded-full px-2.5 py-1 text-label-sm font-bold ${bad ? "bg-status-down/10 text-status-down" : p.status === 404 ? "bg-status-degraded/15 text-status-degraded" : "bg-secondary-fixed/30 text-secondary"}`}>
                      {p.error ?? (p.status ? `HTTP ${p.status}` : "—")}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {robot?.stepResults && robot.stepResults.length > 0 && (
        <div className="mt-3 rounded-xl bg-surface-subtle px-4 py-3">
          <p className="text-label-md font-semibold text-on-surface-variant">Ton scénario au dernier passage{robot.clicks ? ` · ${robot.clicks} clic${robot.clicks > 1 ? "s" : ""} d'exploration` : ""}</p>
          <ul className="mt-2 space-y-1">
            {robot.stepResults.map((s, i) => (
              <li key={`${i}-${s.text}`} className="flex flex-wrap items-center gap-2 text-body-sm">
                <span className={s.ok ? "text-secondary" : "text-status-down"}>{s.ok ? "✓" : "✗"}</span>
                <span className="text-on-surface">{s.text}</span>
                {s.error ? <span className="text-label-md text-status-down">{s.error}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-xl bg-status-degraded/10 p-4 text-body-sm text-on-surface-variant">
        <p className="font-semibold text-on-surface">Avant de commencer</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Crée dans ton application un compte <strong>de TEST</strong> : jamais ton vrai compte, sans droits spéciaux ni vraie somme d&apos;argent.</li>
          <li>Le robot ouvre les onglets, volets et menus et joue ton scénario, mais ne clique <strong>jamais</strong> sur ce qui supprime, paie, retire de l&apos;argent, annule ou déconnecte, et n&apos;envoie aucun formulaire de lui-même.</li>
          <li>Le mot de passe est <strong>chiffré</strong> et ne peut plus être relu, même par toi. Pour le changer, saisis-en un nouveau.</li>
          <li>Le robot passe environ toutes les 5 à 15 minutes.</li>
        </ul>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="r-login" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Page de connexion de ton application</label>
          <input id="r-login" className="input" placeholder="/connexion" value={loginPath} onChange={(e) => setLoginPath(e.target.value)} />
        </div>
        <div>
          <label htmlFor="r-email" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Identifiant du compte de test (e-mail)</label>
          <input id="r-email" className="input" placeholder="robot.test@exemple.com" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="r-pass" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Mot de passe du compte de test</label>
          <input id="r-pass" type="password" className="input" autoComplete="new-password" placeholder={robot?.hasPassword ? "•••••••• (enregistré : laisse vide pour le garder)" : "Mot de passe"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="r-scenario" className="mb-1.5 block text-label-md font-semibold text-on-surface-variant">Scénario de test (facultatif, un geste par ligne)</label>
          <textarea
            id="r-scenario"
            className="input min-h-32 font-mono text-body-sm"
            placeholder={"aller à /paiements\ncliquer sur Créer un lien\nremplir Montant avec 1000\nvoir Lien créé"}
            maxLength={4000}
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          />
          <p className="mt-1 text-label-md text-text-muted">
            Gestes possibles : <code>aller à /page</code> · <code>cliquer sur Texte du bouton</code> · <code>remplir Champ avec Valeur</code> · <code>voir Texte attendu</code> · <code>attendre 2</code> ({ROBOT_MAX_STEPS} au plus). Le robot refuse tout bouton qui supprime, paie, retire de l&apos;argent ou déconnecte, et ne remplit jamais un champ de mot de passe ou de carte. Ce texte n&apos;est pas chiffré : n&apos;y mets aucun secret.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy !== ""} onClick={() => send("save", { enabled: true, loginPath, email, password, scenario }, enabled ? "Réglages du robot enregistrés." : "Robot activé : premier passage dans quelques minutes.")}>
          {busy === "save" ? "Enregistrement…" : enabled ? "Enregistrer les changements" : "Enregistrer et activer le robot"}
        </button>
        {enabled && (
          <button className="btn-ghost" disabled={busy !== ""} onClick={runNow}>{busy === "run" ? "Lancement…" : "Lancer le robot maintenant"}</button>
        )}
        {enabled && (
          <button className="btn-ghost" disabled={busy !== ""} onClick={() => send("off", { enabled: false }, "Robot désactivé.")}>Désactiver</button>
        )}
        {robot?.hasPassword && (
          <button
            className="ml-auto rounded-lg px-3 py-2 text-label-md font-semibold text-text-muted transition hover:bg-status-down/10 hover:text-status-down"
            disabled={busy !== ""}
            onClick={() => {
              if (window.confirm("Supprimer le compte de test enregistré (identifiant et mot de passe) ?")) void send("remove", { remove: true }, "Compte de test supprimé.");
            }}
          >
            Supprimer le compte de test
          </button>
        )}
      </div>
    </section>
  );
}
