// Surveillant EXTÉRIEUR de Vigie SaaS : tourne sur GitHub Actions (donc vivant même si Render est à terre).
// Il interroge /api/health ; en cas de panne il ouvre une « issue » GitHub assignée au propriétaire (GitHub envoie un e-mail),
// il la relance toutes les heures tant que ça dure, et la ferme avec un message « retour à la normale » (deuxième e-mail).
// Aucun secret n'est nécessaire en plus : le jeton fourni par GitHub Actions suffit.
import { pathToFileURL } from "node:url";

export const LABEL = "vigie-panne";
export const REMIND_EVERY_MIN = 60;

/** Verdict d'un contrôle de santé. `probe` : { status, body } (status 0 = pas de réponse). */
export function evaluate(probe) {
  if (!probe || probe.status === 0) return { healthy: false, retry: true, reason: "le site ne répond pas du tout (délai dépassé ou connexion impossible)" };
  if (probe.status !== 200) return { healthy: false, retry: true, reason: `le site répond avec une erreur (HTTP ${probe.status})` };
  if (probe.body?.cronStale) {
    const age = probe.body.cronAgeMin;
    return { healthy: false, retry: false, reason: `le site répond mais le contrôle automatique ne tourne plus${age !== null && age !== undefined ? ` (dernier passage il y a ${age} minutes)` : ""} : vérifie cron-job.org` };
  }
  return { healthy: true, retry: false, reason: null };
}

/** Que faire maintenant ? `openIssue` : { number, updatedAtMs } ou null. */
export function decide({ healthy, openIssue, nowMs, remindEveryMin = REMIND_EVERY_MIN }) {
  if (!healthy && !openIssue) return "open";
  if (!healthy && openIssue) return nowMs - openIssue.updatedAtMs >= remindEveryMin * 60_000 ? "remind" : "none";
  if (healthy && openIssue) return "close";
  return "none";
}

export function formatDuration(ms) {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

const stamp = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeOnce(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(60_000), headers: { "user-agent": "VigieSaaS-Watchdog/1.0" } });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

/** Jusqu'à 3 essais espacés de 30 s : un réveil lent de Render ou une micro-coupure ne déclenche rien. */
async function check(url) {
  let verdict = evaluate(await probeOnce(url));
  for (let attempt = 1; attempt < 3 && !verdict.healthy && verdict.retry; attempt++) {
    await sleep(30_000);
    verdict = evaluate(await probeOnce(url));
  }
  return verdict;
}

function github(repo, token) {
  const call = async (method, path, body) => {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  };
  return {
    async openIssue() {
      const r = await call("GET", `/issues?labels=${LABEL}&state=open&per_page=5`);
      if (!r.ok) throw new Error(`GitHub : lecture des issues impossible (HTTP ${r.status})`);
      const found = (r.data ?? []).find((i) => !i.pull_request);
      return found ? { number: found.number, updatedAtMs: Date.parse(found.updated_at), createdAtMs: Date.parse(found.created_at) } : null;
    },
    async create(title, text, assignee) {
      await call("POST", "/labels", { name: LABEL, color: "d93f0b", description: "Panne de Vigie SaaS détectée par le surveillant extérieur" }); // 422 s'il existe déjà : sans importance
      let r = await call("POST", "/issues", { title, body: text, labels: [LABEL], assignees: [assignee] });
      if (!r.ok) r = await call("POST", "/issues", { title, body: text, labels: [LABEL] });
      if (!r.ok) throw new Error(`GitHub : création de l'issue impossible (HTTP ${r.status})`);
    },
    async comment(number, text) {
      const r = await call("POST", `/issues/${number}/comments`, { body: text });
      if (!r.ok) throw new Error(`GitHub : commentaire impossible (HTTP ${r.status})`);
    },
    async close(number) {
      const r = await call("PATCH", `/issues/${number}`, { state: "closed", state_reason: "completed" });
      if (!r.ok) throw new Error(`GitHub : fermeture impossible (HTTP ${r.status})`);
    },
  };
}

async function main() {
  const url = (process.env.APP_URL || "").replace(/\/$/, "");
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPOSITORY_OWNER || "";
  if (!url || !repo || !token) {
    console.log("APP_URL, GITHUB_REPOSITORY ou GITHUB_TOKEN absent : rien à faire.");
    return;
  }
  const verdict = await check(url);
  const gh = github(repo, token);
  const openIssue = await gh.openIssue();
  const nowMs = Date.now();
  const action = decide({ healthy: verdict.healthy, openIssue, nowMs });
  console.log(`Santé : ${verdict.healthy ? "OK" : `PANNE (${verdict.reason})`} ; action : ${action}`);
  const mention = owner ? `@${owner} ` : "";

  if (action === "open") {
    await gh.create("🔴 Vigie SaaS est en panne", `${mention}Le surveillant extérieur a détecté une panne le ${stamp(nowMs)} : ${verdict.reason}.\n\nIl te prévient aussi du retour à la normale en fermant cette issue. Rappel toutes les heures tant que ça dure.`, owner);
  } else if (action === "remind") {
    await gh.comment(openIssue.number, `${mention}🔴 Toujours en panne depuis ${formatDuration(nowMs - openIssue.createdAtMs)} (${stamp(nowMs)}) : ${verdict.reason}.`);
  } else if (action === "close") {
    await gh.comment(openIssue.number, `${mention}✅ Vigie SaaS est revenue à la normale le ${stamp(nowMs)} (panne de ${formatDuration(nowMs - openIssue.createdAtMs)}).`);
    await gh.close(openIssue.number);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("Le surveillant a échoué :", String(e?.message || e).slice(0, 200));
    process.exitCode = 1;
  });
}
