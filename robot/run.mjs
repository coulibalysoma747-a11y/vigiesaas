// Robot de connexion de Vigie SaaS : un vrai navigateur (Chromium) se connecte avec un COMPTE DE TEST et agit comme un testeur.
// Lancé par GitHub Actions (.github/workflows/robot.yml). Règles de sécurité :
//  - il ouvre seulement des onglets, menus et volets ; il ne clique JAMAIS sur ce qui supprime, paie, retire de l'argent ou déconnecte (rules.mjs) ;
//  - les gestes d'un scénario (aller à, cliquer sur, remplir, voir) sont vérifiés une seconde fois sur le texte réel du bouton ;
//  - il ne tape les identifiants QUE sur le site surveillé, et refuse toute adresse privée ou interne ;
//  - aucun mot de passe n'est jamais écrit dans les journaux (le dépôt est public : les journaux le sont aussi).
import dns from "node:dns/promises";
import { chromium } from "playwright-core";
import { FORBIDDEN, SECRET_FIELD } from "./rules.mjs";

const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
const SECRET = process.env.ROBOT_SECRET || "";
const ALLOW_PRIVATE = process.env.ROBOT_ALLOW_PRIVATE === "1"; // pour les essais sur cet ordinateur UNIQUEMENT
const USER_AGENT = "VigieSaaS-Robot/1.0 (surveillance de disponibilite)";
const RUN_BUDGET_MS = 4 * 60_000;
const JOB_BUDGET_MS = 100_000;
const MAX_CLICKS_PER_PAGE = 5;
const CLICKABLE = 'button, a, [role="button"], [role="tab"], [role="menuitem"], summary, label';

const ASSET = /\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|xml|pdf|zip|mp4|mp3|woff2?|ttf|map|txt)$/i;
const LOGOUT = /(logout|log-out|signout|sign-out|deconnexion|deconnecter|d%C3%A9connexion|sortir|quitter)/i;
const RISKY = /(delete|supprimer|remove|destroy|cancel)/i;
const ERROR_TEXT = /(application error|internal server error|something went wrong|unhandled runtime error|une erreur est survenue|erreur 500|error 500|this page couldn.t load|cette page ne peut pas être affichée|service unavailable)/i;

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "?";
  }
};

function ipv4Private(a, b) {
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function isPrivateAddress(ip) {
  const v = String(ip).trim().toLowerCase().replace(/^\[|\]$/g, "");
  const m = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) return ipv4Private(Number(m[1]), Number(m[2]));
  if (v.startsWith("::ffff:")) return true;
  if (v.includes(":")) return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v) || v.startsWith("ff");
  return v === "localhost" || v.endsWith(".localhost") || v.endsWith(".local") || v.endsWith(".internal");
}

/** Refuse le site si son adresse (ou le nom, une fois résolu) est privée ou interne. */
async function assertPublicHost(host) {
  if (ALLOW_PRIVATE) return;
  if (isPrivateAddress(host)) throw new Error("Adresse privée ou interne refusée.");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return;
  const found = await dns.lookup(host, { all: true });
  if (!found.length || found.some((a) => isPrivateAddress(a.address))) throw new Error("Le nom du site pointe vers un réseau privé : refusé.");
}

/** Chemin d'une page à visiter : même site, sans fichiers, sans « ? » ni « # », sans « / » final ; null sinon. */
function pagePath(href, base) {
  try {
    const url = new URL(href, base);
    if (url.origin !== base.origin) return null;
    let path = url.pathname.replace(/\/{2,}/g, "/");
    if (path.length > 1) path = path.replace(/\/$/, "");
    if (path === "/" || path.length > 200 || ASSET.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}

async function api(path, init = {}) {
  let lastError = "";
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${APP_URL}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        signal: AbortSignal.timeout(90_000), // le site gratuit de Render peut mettre ~1 minute à se réveiller
      });
      if (res.ok) return await res.json();
      const said = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
      lastError = `HTTP ${res.status}${said ? ` (${said})` : ""}`;
      lastStatus = res.status;
      // Inutile de réessayer : mauvais mot de passe, route absente, ou serveur qui dit lui-même ne pas être configuré.
      // Un autre 503 vient de Render qui se réveille ou redémarre : on réessaie.
      if ([401, 403, 404].includes(res.status) || (res.status === 503 && /non configur/i.test(said))) break;
    } catch (e) {
      lastError = String(e?.message || e).slice(0, 80);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  const error = new Error(`${path} : ${lastError}`);
  error.status = lastStatus;
  throw error;
}

const isLoginPage = (page, loginPath) => (new URL(page.url()).pathname.replace(/\/$/, "") || "/") === loginPath;

/** Étiquette visible d'un élément (texte + aria-label) : sert à refuser les boutons dangereux, quoi qu'il arrive. */
async function labelOf(el) {
  const text = await el.innerText({ timeout: 1500 }).catch(() => "");
  const aria = await el.getAttribute("aria-label").catch(() => null);
  return `${text} ${aria ?? ""}`.replace(/\s+/g, " ").trim();
}

/** Exploration SÛRE d'une page : ouvre onglets, volets et menus (jamais un bouton d'envoi de formulaire ni une action interdite). */
async function exploreSafe(page, run) {
  const startUrl = page.url();
  const toggles = page.locator('[role="tab"]:visible, button[aria-expanded="false"]:visible, summary:visible');
  const count = Math.min(await toggles.count().catch(() => 0), MAX_CLICKS_PER_PAGE);
  let clicks = 0;
  for (let i = 0; i < count && Date.now() < run.deadline; i++) {
    const el = toggles.nth(i);
    const label = await labelOf(el);
    if (FORBIDDEN.test(label)) continue;
    const submits = await el.evaluate((n) => n.tagName === "BUTTON" && n.type === "submit" && !!n.form).catch(() => true);
    if (submits) continue;
    try {
      await el.click({ timeout: 3000 });
      clicks++;
      await page.waitForTimeout(300);
    } catch {
      /* élément disparu ou masqué : on passe au suivant */
    }
  }
  if (page.url() !== startUrl) await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
  return clicks;
}

async function visit(page, base, loginPath, path, watch, run) {
  const started = Date.now();
  const result = { path, status: null, ms: null, error: null, warn: null };
  watch.errors.length = 0;
  watch.warns.length = 0;
  try {
    const response = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 20_000 });
    result.status = response ? response.status() : null;
    await page.waitForTimeout(600);
    result.ms = Date.now() - started;
    if (isLoginPage(page, loginPath)) {
      result.error = "Redirigé vers la connexion (session perdue)";
    } else if (result.status !== null && result.status < 400) {
      const text = (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")) || "";
      if (text.length < 3000 && ERROR_TEXT.test(text)) result.error = "Page d'erreur affichée";
      else run.clicks += await exploreSafe(page, run);
    }
  } catch (e) {
    result.ms = Date.now() - started;
    result.error = /timeout/i.test(String(e?.message || e)) ? "Délai dépassé" : "Page inaccessible";
  }
  if (!result.error && watch.errors.length) result.error = `${watch.errors[0]}${watch.errors.length > 1 ? ` (+${watch.errors.length - 1})` : ""}`.slice(0, 120);
  if (watch.warns.length) result.warn = watch.warns[0];
  return result;
}

const describe = (s) =>
  s.a === "goto" ? `aller à ${s.t}` : s.a === "click" ? `cliquer sur « ${s.t} »` : s.a === "fill" ? `remplir « ${s.t} »` : s.a === "see" ? `voir « ${s.t} »` : `attendre ${s.t} s`;

/** Un geste du scénario. Renvoie null s'il réussit, sinon la raison (courte) de l'échec. */
async function doStep(page, base, loginPath, step) {
  if (step.a === "goto") {
    const res = await page.goto(new URL(step.t, base).href, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(500);
    if (isLoginPage(page, loginPath)) return "redirigé vers la connexion (session perdue)";
    return res && res.status() >= 400 ? `HTTP ${res.status()}` : null;
  }
  if (step.a === "wait") {
    await page.waitForTimeout(Math.min(5, Math.max(1, Number(step.t) || 1)) * 1000);
    return null;
  }
  if (step.a === "see") {
    await page.getByText(step.t, { exact: false }).first().waitFor({ state: "visible", timeout: 8000 });
    return null;
  }
  if (step.a === "fill") {
    if (SECRET_FIELD.test(step.t)) return "champ sensible refusé";
    const byLabel = page.getByLabel(step.t, { exact: false }).first();
    const found = await byLabel.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false);
    const field = found ? byLabel : page.getByPlaceholder(step.t, { exact: false }).first();
    await field.waitFor({ state: "visible", timeout: 4000 });
    if ((await field.getAttribute("type")) === "password") return "champ mot de passe refusé";
    await field.fill(step.v ?? "");
    return null;
  }
  // click
  const el = page.locator(CLICKABLE).filter({ hasText: step.t }).first();
  await el.waitFor({ state: "visible", timeout: 8000 });
  if (FORBIDDEN.test(await labelOf(el))) return "bouton interdit au robot (action irréversible)";
  const href = await el.getAttribute("href").catch(() => null);
  if (href) {
    try {
      if (new URL(href, page.url()).origin !== base.origin) return "lien vers un autre site refusé";
    } catch {
      return "lien invalide";
    }
  }
  await el.click({ timeout: 5000 });
  await page.waitForTimeout(600);
  return null;
}

/** Exécute le scénario ; s'arrête au premier geste en échec (les suivants n'auraient pas de sens). */
async function runSteps(page, base, loginPath, steps, watch, run) {
  const results = [];
  for (const step of steps) {
    const text = describe(step);
    if (Date.now() > run.deadline) {
      results.push({ text, ok: false, error: "temps imparti dépassé" });
      break;
    }
    watch.errors.length = 0;
    let error = null;
    try {
      error = await doStep(page, base, loginPath, step);
    } catch (e) {
      error = /timeout/i.test(String(e?.message || e)) ? "introuvable (délai dépassé)" : String(e?.message || e).split("\n")[0].slice(0, 100);
    }
    if (!error && watch.errors.length) error = watch.errors[0];
    results.push({ text, ok: error === null, error });
    if (error) break;
  }
  return results;
}

async function runJob(browser, job) {
  const report = { loginOk: false, loginError: null, pages: [], steps: [], clicks: 0 };
  const base = new URL(job.baseUrl);
  const wanted = String(job.loginPath || "/connexion");
  const loginPath = wanted === "/" ? "/" : (pagePath(wanted, base) ?? "/connexion");
  const run = { clicks: 0, deadline: Date.now() + JOB_BUDGET_MS };
  const watch = { errors: [], warns: [] };
  const context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1280, height: 800 } });
  try {
    await assertPublicHost(base.hostname);
    // Aucune requête vers une adresse privée, quoi que la page demande.
    await context.route("**/*", (route) => {
      try {
        const url = new URL(route.request().url());
        if (!/^https?:$/.test(url.protocol)) return route.abort();
        if (!ALLOW_PRIVATE && isPrivateAddress(url.hostname)) return route.abort();
      } catch {
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    page.on("dialog", (d) => d.dismiss().catch(() => {})); // jamais de « OK » sur une boîte de confirmation
    // Comme un testeur qui ouvre la console : appels d'API en erreur (panne) et erreurs JavaScript (simple remarque).
    page.on("response", (res) => {
      try {
        const type = res.request().resourceType();
        const url = new URL(res.url());
        if ((type === "xhr" || type === "fetch") && url.origin === base.origin && res.status() >= 500) {
          watch.errors.push(`${res.request().method()} ${url.pathname.slice(0, 50)} répond ${res.status()}`);
        }
      } catch {
        /* ignoré */
      }
    });
    page.on("pageerror", (e) => watch.warns.push(`Erreur JavaScript : ${String(e?.message || e).split("\n")[0].slice(0, 80)}`));

    // 1. Page de connexion
    await page.goto(new URL(loginPath, base).href, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    if (new URL(page.url()).origin !== base.origin) throw new Error("La page de connexion renvoie vers un autre site : identifiants non envoyés.");
    const password = page.locator('input[type="password"]:visible').first();
    if (!(await password.count())) throw new Error("Aucun champ mot de passe sur la page de connexion.");
    const form = password.locator("xpath=ancestor::form[1]");
    const scope = (await form.count()) ? form : page.locator("body");
    const identifier = scope.locator('input[type="email"]:visible, input[autocomplete="username"]:visible, input[name*="mail" i]:visible, input[type="text"]:visible, input[type="tel"]:visible').first();
    if (!(await identifier.count())) throw new Error("Aucun champ identifiant sur la page de connexion.");
    await identifier.fill(job.email);
    await password.fill(job.password);
    const submit = scope.locator('button[type="submit"]:visible, input[type="submit"]:visible').first();
    if (await submit.count()) await submit.click();
    else await password.press("Enter");

    // 2. La connexion a-t-elle réussi ? (le champ mot de passe disparaît)
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'), null, { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    report.loginOk = (await page.locator('input[type="password"]:visible').count()) === 0;
    if (!report.loginOk) {
      const shown = await page.locator('[role="alert"], [class*="error" i], [class*="erreur" i]').first().textContent({ timeout: 2000 }).catch(() => null);
      report.loginError = shown && shown.trim() ? `connexion refusée : « ${shown.trim().slice(0, 120)} »` : "le compte de test n'a pas pu se connecter (le champ mot de passe est toujours affiché)";
      return report;
    }
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});

    // 3. L'intérieur : page d'arrivée, puis les liens du même site qu'elle contient (sans jamais se déconnecter)
    const landing = pagePath(page.url(), base) ?? "/";
    const links = await page.$$eval("a[href]", (anchors) => anchors.map((a) => ({ href: a.href, text: (a.textContent || "").trim().slice(0, 60) }))).catch(() => []);
    const queue = [landing];
    for (const link of links) {
      const path = pagePath(link.href, base);
      if (!path || path === loginPath || queue.includes(path) || LOGOUT.test(path) || LOGOUT.test(link.text) || RISKY.test(path)) continue;
      queue.push(path);
      if (queue.length >= (job.maxPages || 15)) break;
    }
    for (const path of queue) {
      if (Date.now() > run.deadline) break;
      report.pages.push(await visit(page, base, loginPath, path, watch, run));
    }

    // 4. Le scénario de l'utilisateur (aller à, cliquer sur, remplir, voir), depuis la page d'arrivée
    if (Array.isArray(job.steps) && job.steps.length) {
      await page.goto(new URL(landing, base).href, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => {});
      report.steps = await runSteps(page, base, loginPath, job.steps, watch, run);
    }
  } catch (e) {
    if (!report.loginOk) report.loginError = String(e?.message || e).slice(0, 160);
    else report.pages.push({ path: "/", status: null, ms: null, error: String(e?.message || e).slice(0, 100), warn: null });
  } finally {
    report.clicks = run.clicks;
    await context.close().catch(() => {});
  }
  return report;
}

async function main() {
  if (!APP_URL || !SECRET) {
    console.log("APP_URL ou ROBOT_SECRET absent : rien à faire.");
    return;
  }
  const started = Date.now();
  let jobs;
  try {
    ({ jobs } = await api("/api/robot/jobs"));
  } catch (e) {
    // 503 = ROBOT_SECRET pas encore réglé sur le serveur ; 404 = serveur pas encore mis à jour : pas une panne, on reste silencieux.
    if (e.status === 503 || e.status === 404) {
      console.log(`Le serveur Vigie (${hostOf(APP_URL)}) n'est pas encore prêt pour le robot : ${e.message}. Rien à faire.`);
      return;
    }
    throw e;
  }
  if (!Array.isArray(jobs) || !jobs.length) {
    console.log("Aucun scénario à exécuter pour le moment.");
    return;
  }
  for (const job of jobs) if (job.password) console.log(`::add-mask::${job.password}`); // masque le mot de passe dans les journaux GitHub

  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROBOT_BROWSER_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    for (const job of jobs) {
      if (Date.now() - started > RUN_BUDGET_MS) {
        console.log("Temps imparti dépassé : les scénarios restants seront repris au prochain passage.");
        break;
      }
      const report = await runJob(browser, job);
      const failed = report.pages.filter((p) => p.error || p.status === null || p.status >= 500).length;
      const stepsOk = report.steps.filter((s) => s.ok).length;
      console.log(
        `${hostOf(job.baseUrl)} : connexion ${report.loginOk ? "réussie" : "ÉCHEC"}, ${report.pages.length} page(s) visitée(s), ${failed} en erreur, ${report.clicks} clic(s) d'exploration` +
          (report.steps.length ? `, scénario ${stepsOk}/${report.steps.length} geste(s) réussi(s)` : ""),
      );
      await api("/api/robot/report", { method: "POST", body: JSON.stringify({ monitorId: job.monitorId, ...report }) });
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("Le robot a échoué :", String(e?.message || e).slice(0, 200));
  process.exitCode = 1;
});
