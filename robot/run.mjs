// Robot de connexion de Vigie SaaS : un vrai navigateur (Chromium) se connecte avec un COMPTE DE TEST et visite l'intérieur de l'application.
// Lancé par GitHub Actions (.github/workflows/robot.yml). Règles de sécurité :
//  - il ne clique JAMAIS sur un bouton (sauf « se connecter ») et ne se déconnecte jamais : il navigue seulement ;
//  - il ne tape les identifiants QUE sur le site surveillé, et refuse toute adresse privée ou interne ;
//  - aucun mot de passe n'est jamais écrit dans les journaux (le dépôt est public : les journaux le sont aussi).
import dns from "node:dns/promises";
import { chromium } from "playwright-core";

const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
const SECRET = process.env.ROBOT_SECRET || "";
const ALLOW_PRIVATE = process.env.ROBOT_ALLOW_PRIVATE === "1"; // pour les essais sur cet ordinateur UNIQUEMENT
const USER_AGENT = "VigieSaaS-Robot/1.0 (surveillance de disponibilite)";
const RUN_BUDGET_MS = 4 * 60_000;

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
      lastError = `HTTP ${res.status}`;
      lastStatus = res.status;
      if ([401, 403, 404, 503].includes(res.status)) break; // inutile de réessayer
    } catch (e) {
      lastError = String(e?.message || e).slice(0, 80);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  const error = new Error(`${path} : ${lastError}`);
  error.status = lastStatus;
  throw error;
}

async function visit(page, base, loginPath, path) {
  const started = Date.now();
  const result = { path, status: null, ms: null, error: null };
  try {
    const response = await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded", timeout: 20_000 });
    result.status = response ? response.status() : null;
    await page.waitForTimeout(600);
    result.ms = Date.now() - started;
    if ((new URL(page.url()).pathname.replace(/\/$/, "") || "/") === loginPath) {
      result.error = "Redirigé vers la connexion (session perdue)";
    } else if (result.status !== null && result.status < 400) {
      const text = (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")) || "";
      if (text.length < 3000 && ERROR_TEXT.test(text)) result.error = "Page d'erreur affichée";
    }
  } catch (e) {
    result.ms = Date.now() - started;
    result.error = /timeout/i.test(String(e?.message || e)) ? "Délai dépassé" : "Page inaccessible";
  }
  return result;
}

async function runJob(browser, job) {
  const report = { loginOk: false, loginError: null, pages: [] };
  const base = new URL(job.baseUrl);
  const wanted = String(job.loginPath || "/connexion");
  const loginPath = wanted === "/" ? "/" : (pagePath(wanted, base) ?? "/connexion");
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

    // 3. L'intérieur : page d'arrivée, puis les liens du même site qu'elle contient (sans jamais se déconnecter ni cliquer)
    const landing = pagePath(page.url(), base) ?? "/";
    const links = await page.$$eval("a[href]", (anchors) => anchors.map((a) => ({ href: a.href, text: (a.textContent || "").trim().slice(0, 60) }))).catch(() => []);
    const queue = [landing];
    for (const link of links) {
      const path = pagePath(link.href, base);
      if (!path || path === loginPath || queue.includes(path) || LOGOUT.test(path) || LOGOUT.test(link.text) || RISKY.test(path)) continue;
      queue.push(path);
      if (queue.length >= (job.maxPages || 15)) break;
    }
    for (const path of queue) report.pages.push(await visit(page, base, loginPath, path));
  } catch (e) {
    if (!report.loginOk) report.loginError = String(e?.message || e).slice(0, 160);
    else report.pages.push({ path: "/", status: null, ms: null, error: String(e?.message || e).slice(0, 100) });
  } finally {
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
      console.log("Le serveur Vigie n'est pas encore prêt pour le robot (variables ROBOT_SECRET / ROBOT_ENC_KEY ou mise en ligne manquantes) : rien à faire.");
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
      console.log(`${hostOf(job.baseUrl)} : connexion ${report.loginOk ? "réussie" : "ÉCHEC"}, ${report.pages.length} page(s) visitée(s), ${failed} en erreur`);
      await api("/api/robot/report", { method: "POST", body: JSON.stringify({ monitorId: job.monitorId, ...report }) });
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("Le robot a échoué :", String(e?.message || e).slice(0, 200));
  process.exit(1);
});
