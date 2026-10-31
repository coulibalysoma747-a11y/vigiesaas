// Logique de surveillance PURE (aucun import, aucun accès réseau ni base) : testée par scripts/test-monitoring.mts.

export const MAX_MONITORS_PER_USER = 20;
export const INTERVALS = [5, 10, 30, 60] as const;
export type Interval = (typeof INTERVALS)[number];
export const HISTORY_DAYS = 30;

/** Compteurs d'une journée (UTC) : c = contrôles, u = contrôles réussis, l = somme des temps de réponse (ms), ln = nombre de temps cumulés. */
export type DayStat = { c?: number; u?: number; l?: number; ln?: number };
export type Days = Record<string, DayStat | undefined>;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** « d20261030 » : clé d'un jour (UTC) dans le champ `days` d'un site. Sans tiret, pour rester un nom de champ sûr. */
export function dayKey(date: Date): string {
  return `d${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** Les n dernières clés de jour, de la plus ancienne à aujourd'hui. */
export function lastDayKeys(now: Date, n = HISTORY_DAYS): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(dayKey(new Date(now.getTime() - i * DAY_MS)));
  return keys;
}

/** Ce qu'il faut ajouter aux compteurs du jour après un contrôle. Le temps de réponse ne compte que pour un contrôle réussi. */
export function dayDelta(now: Date, up: boolean, latencyMs: number | null) {
  const timed = up && latencyMs !== null;
  return { key: dayKey(now), c: 1, u: up ? 1 : 0, l: timed ? Math.max(0, Math.round(latencyMs as number)) : 0, ln: timed ? 1 : 0 };
}

/** Jours à effacer pour que le champ `days` ne grossisse jamais : tout ce qui dépasse la fenêtre d'historique. */
export function staleDayKeys(days: Days | undefined, now: Date, n = HISTORY_DAYS): string[] {
  const keep = new Set(lastDayKeys(now, n));
  return Object.keys(days ?? {}).filter((k) => /^d\d{8}$/.test(k) && !keep.has(k) && k < dayKey(new Date(now.getTime() - (n - 1) * DAY_MS)));
}

export type DayState = "none" | "up" | "degraded" | "down";

/** Un jour est « en ligne » à partir de 99,5 % de contrôles réussis, « dégradé » à partir de 90 %, sinon « hors ligne ». */
export function dayState(stat?: DayStat): { state: DayState; pct: number | null } {
  const c = stat?.c ?? 0;
  if (!c) return { state: "none", pct: null };
  const pct = ((stat?.u ?? 0) / c) * 100;
  return { state: pct >= 99.5 ? "up" : pct >= 90 ? "degraded" : "down", pct };
}

export function summarize(days: Days | undefined, now = new Date(), n = HISTORY_DAYS) {
  let checks = 0;
  let ups = 0;
  let latency = 0;
  let timed = 0;
  const bars = lastDayKeys(now, n).map((key) => {
    const s = days?.[key];
    checks += s?.c ?? 0;
    ups += s?.u ?? 0;
    latency += s?.l ?? 0;
    timed += s?.ln ?? 0;
    return { key, ...dayState(s) };
  });
  return { checks, uptimePct: checks ? (ups / checks) * 100 : null, avgLatencyMs: timed ? Math.round(latency / timed) : null, bars };
}

/** « 99,98 % » : arrondi vers le bas à 2 décimales, pour ne jamais afficher 100 % quand il y a eu une panne. */
export function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${(Math.floor(pct * 100) / 100).toFixed(2).replace(".", ",")} %`;
}

/** Date du jour de la barre (« d20261030 » devient « 30/10 »), pour les infobulles. */
export function dayLabel(key: string): string {
  return `${key.slice(7, 9)}/${key.slice(5, 7)}`;
}

export function normalizeInterval(value: unknown): Interval {
  const n = Number(value);
  return (INTERVALS as readonly number[]).includes(n) ? (n as Interval) : 5;
}

/** Un site est à contrôler s'il ne l'a jamais été, ou si son intervalle est écoulé (30 s de tolérance pour la dérive du déclencheur). */
export function isDue(lastCheckedMs: number | null, intervalMin: number, nowMs: number): boolean {
  if (lastCheckedMs === null) return true;
  return nowMs - lastCheckedMs >= intervalMin * 60_000 - 30_000;
}

/** Mode vigilance (par site) : contrôle chaque minute et rappel par e-mail toutes les 30 minutes tant que le site reste hors ligne. */
export const VIGILANCE_INTERVAL_MIN = 1;
export const VIGILANCE_REMIND_MIN = 30;
export const MAX_VIGILANCE_PER_USER = 5;

/** Intervalle réellement appliqué : 1 minute en mode vigilance, sinon le choix de l'utilisateur. */
export function effectiveInterval(m: { intervalMin?: unknown; vigilance?: unknown }): number {
  return m.vigilance === true ? VIGILANCE_INTERVAL_MIN : normalizeInterval(m.intervalMin);
}

/** Un rappel est dû si le dernier message (ou le début de la panne) remonte à 30 minutes ou plus (30 s de tolérance). */
export function reminderDue(sinceMs: number | null, nowMs: number): boolean {
  return sinceMs !== null && nowMs - sinceMs >= VIGILANCE_REMIND_MIN * 60_000 - 30_000;
}

export type Transition = "none" | "went_down" | "first_down" | "recovered";

export function transition(previous: boolean | null, up: boolean): Transition {
  if (previous === null) return up ? "none" : "first_down";
  if (previous && !up) return "went_down";
  if (!previous && up) return "recovered";
  return "none";
}

export type ProbeError = "timeout" | "dns" | "blocked" | "redirects" | "network";

export function describeFailure(code: number | null, error: ProbeError | null): string {
  if (error === "timeout") return "Délai dépassé (10 s)";
  if (error === "dns") return "Adresse introuvable (DNS)";
  if (error === "blocked") return "Adresse non autorisée";
  if (error === "redirects") return "Trop de redirections";
  if (error) return "Site injoignable";
  if (code) return `Réponse HTTP ${code}`;
  return "Pas de réponse";
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return "moins d'une minute";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} j ${h % 24} h` : `${d} j`;
}

function ipv4Private(a: number, b: number): boolean {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Vrai pour une adresse IP privée, locale ou réservée (jamais surveillable : le serveur irait lire ton réseau interne). */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = v.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return ipv4Private(Number(v4[1]), Number(v4[2]));
  if (v.startsWith("::ffff:")) return true; // IPv4 enveloppée dans de l'IPv6 : on refuse par prudence
  if (v.includes(":")) return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v) || v.startsWith("ff");
  return false;
}

export const isIpLiteral = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");

export type ParsedUrl = { ok: true; url: string; host: string } | { ok: false; error: string };

/** Valide l'adresse d'un site : http(s) seulement, pas d'identifiants, pas de réseau privé ni de nom interne. Ajoute https:// si absent. */
export function parseMonitorUrl(raw: string): ParsedUrl {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "Saisis l'adresse de ton site." };
  if (value.length > 2000) return { ok: false, error: "Adresse trop longue." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, error: "Adresse invalide." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "Seules les adresses http et https sont acceptées." };
  if (url.username || url.password) return { ok: false, error: "Retire l'identifiant et le mot de passe de l'adresse." };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, error: "Adresse invalide." };
  if (isPrivateAddress(host)) return { ok: false, error: "Cette adresse pointe vers un réseau privé : elle ne peut pas être surveillée." };
  if (!isIpLiteral(host) && (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|corp|home)$/.test(host) || host.endsWith(".home.arpa"))) {
    return { ok: false, error: "Cette adresse n'est pas un site public." };
  }
  return { ok: true, url: url.href, host };
}

// ───── Contrôles avancés : contenu de la page, lenteur, certificat SSL ─────

export const EXPECT_TEXT_MAX = 200;
export const LATENCY_OPTIONS = [500, 1000, 2000, 3000, 5000] as const;
/** Une lenteur n'est signalée qu'après ce nombre de contrôles lents d'affilée (un pic isolé ne compte pas). */
export const SLOW_STREAK = 3;
export const SSL_RECHECK_HOURS = 12;

/** Limite de lenteur autorisée en millisecondes, ou null (désactivé). */
export function normalizeMaxLatency(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === 0 || value === "0") return null;
  const n = Number(value);
  return (LATENCY_OPTIONS as readonly number[]).includes(n) ? n : null;
}

/** Texte attendu sur la page : espaces compactés, 200 caractères au plus, ou null (désactivé). */
export function normalizeExpectText(value: unknown): string | null {
  const s = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, EXPECT_TEXT_MAX);
  return s || null;
}

/** Le texte attendu est-il sur la page ? Sans tenir compte des majuscules ni des espaces multiples. */
export function bodyHasText(body: string, expected: string): boolean {
  const flat = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  return flat(body).includes(flat(expected));
}

export type SlowEval = { streak: number; isSlow: boolean; change: "none" | "became_slow" | "back_to_normal" };

/**
 * Lenteur : seul un site EN LIGNE peut être « lent ». Il devient lent après SLOW_STREAK contrôles consécutifs
 * au-dessus de la limite, et redevient normal dès qu'un contrôle repasse sous la limite.
 */
export function evalSlow(prev: { streak?: number; isSlow?: boolean }, up: boolean, latencyMs: number | null, maxMs: number | null): SlowEval {
  if (!up || maxMs === null || latencyMs === null) return { streak: 0, isSlow: false, change: "none" };
  const wasSlow = !!prev.isSlow;
  if (latencyMs > maxMs) {
    const streak = (prev.streak ?? 0) + 1;
    const isSlow = wasSlow || streak >= SLOW_STREAK;
    return { streak, isSlow, change: !wasSlow && isSlow ? "became_slow" : "none" };
  }
  return { streak: 0, isSlow: false, change: wasSlow ? "back_to_normal" : "none" };
}

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

export function describeSlow(latencyMs: number, maxMs: number): string {
  return `Lent : ${formatSeconds(latencyMs)} (limite ${formatSeconds(maxMs)})`;
}

export type SslLevel = "ok" | "warn14" | "warn3" | "expired" | "invalid";
const SSL_RANK: Record<SslLevel, number> = { ok: 0, warn14: 1, warn3: 2, expired: 3, invalid: 4 };

export const daysUntil = (date: Date, now: Date) => Math.floor((date.getTime() - now.getTime()) / 86_400_000);

/** Niveau d'un certificat : expiré, invalide (non reconnu, mauvais nom…), expire sous 3 jours, sous 14 jours, ou valide. */
export function sslLevel(cert: { authorized: boolean; daysLeft: number | null }): SslLevel {
  if (cert.daysLeft !== null && cert.daysLeft < 0) return "expired";
  if (!cert.authorized || cert.daysLeft === null) return "invalid";
  if (cert.daysLeft <= 3) return "warn3";
  if (cert.daysLeft <= 14) return "warn14";
  return "ok";
}

/** Alerte seulement quand la situation EMPIRE (14 j, puis 3 j, puis expiré, ou invalide) ou quand elle est RÉPARÉE : jamais de répétition. */
export function sslChange(previous: SslLevel | null | undefined, next: SslLevel): "worse" | "fixed" | "none" {
  const before = previous ?? "ok";
  if (SSL_RANK[next] > SSL_RANK[before]) return "worse";
  if (next === "ok" && before !== "ok") return "fixed";
  return "none";
}

export function sslDue(lastCheckedMs: number | null, nowMs: number): boolean {
  return lastCheckedMs === null || nowMs - lastCheckedMs >= SSL_RECHECK_HOURS * 3_600_000 - 60_000;
}

export function describeSsl(level: SslLevel, daysLeft: number | null): string {
  if (level === "expired") return "Le certificat SSL a expiré";
  if (level === "invalid") return "Certificat SSL invalide (non reconnu ou ne correspondant pas au site)";
  const n = daysLeft ?? 0;
  if (level === "ok") return `Certificat SSL valide (expire dans ${n} jour${n > 1 ? "s" : ""})`;
  return `Le certificat SSL expire dans ${n} jour${n > 1 ? "s" : ""}`;
}

// ───── Fonctionnalités : plusieurs pages ou points d'accès d'un MÊME site (connexion, paiement, API…) ─────

export const MAX_FEATURES_PER_MONITOR = 8;
export const MAX_FEATURES_PER_USER = 40;
export const FEATURE_NAME_MAX = 40;

export type Feature = { id: string; name: string; path: string; expectStatus: number | null; expectText: string | null };
export type FeatureInput = { id?: unknown; name?: unknown; path?: unknown; expectStatus?: unknown; expectText?: unknown };

/** Code HTTP attendu (100 à 599), ou null : par défaut, toute réponse sous 400 est bonne. */
export function normalizeExpectStatus(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 100 && n <= 599 ? n : null;
}

export type FeatureUrl = { ok: true; path: string; url: string } | { ok: false; error: string };

/** Adresse d'une fonctionnalité : TOUJOURS sur le même site que le site surveillé (jamais un autre domaine, jamais « //autre.com »). */
export function featureUrl(baseUrl: string, raw: string): FeatureUrl {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "Saisis l'adresse de la fonctionnalité (ex. /connexion)." };
  if (value.length > 300 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: "Adresse invalide." };
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return { ok: false, error: "Site invalide." };
  }
  let target: URL;
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) target = new URL(value);
    else if (value.startsWith("//")) return { ok: false, error: "L'adresse doit rester sur le même site que le site surveillé." };
    else if (!value.startsWith("/") && /^[a-z][a-z0-9+.-]*:/i.test(value)) return { ok: false, error: "Adresse invalide : commence par « / » (ex. /connexion)." }; // « javascript:… », « mailto:… »
    else target = new URL(value.startsWith("/") ? value : `/${value}`, base.origin);
  } catch {
    return { ok: false, error: "Adresse invalide." };
  }
  if (target.origin !== base.origin) return { ok: false, error: "L'adresse doit rester sur le même site que le site surveillé." };
  const path = target.pathname + target.search;
  if (path.length > 300) return { ok: false, error: "Adresse trop longue." };
  return { ok: true, path, url: target.href };
}

/** « /api/health-check » devient « Health check » ; « / » devient « Accueil ». */
export function nameFromPath(path: string): string {
  const last = path.split("?")[0].split("/").filter(Boolean).pop();
  if (!last) return "Accueil";
  let text = last;
  try {
    text = decodeURIComponent(last);
  } catch {
    // on garde le texte tel quel
  }
  const words = text.replace(/[-_.]+/g, " ").trim();
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, FEATURE_NAME_MAX) || "Page";
}

export function normalizeFeature(baseUrl: string, input: FeatureInput): { ok: true; feature: Omit<Feature, "id"> } | { ok: false; error: string } {
  const u = featureUrl(baseUrl, String(input.path ?? ""));
  if (!u.ok) return u;
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, FEATURE_NAME_MAX) || nameFromPath(u.path);
  return { ok: true, feature: { name, path: u.path, expectStatus: normalizeExpectStatus(input.expectStatus), expectText: normalizeExpectText(input.expectText) } };
}

/**
 * Liste de fonctionnalités à enregistrer : chaque entrée validée, doublons d'adresse retirés, 8 au plus.
 * Une entrée garde son identifiant s'il existe déjà (pour conserver son historique), sinon `makeId()` en crée un.
 */
export function buildFeatureList(baseUrl: string, raw: unknown, existingIds: ReadonlySet<string>, makeId: () => string): { ok: true; features: Feature[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > MAX_FEATURES_PER_MONITOR) return { ok: false, error: `Au plus ${MAX_FEATURES_PER_MONITOR} fonctionnalités par site.` };
  const features: Feature[] = [];
  const paths = new Set<string>();
  const used = new Set<string>();
  for (const entry of list) {
    const input = (entry ?? {}) as FeatureInput;
    const parsed = normalizeFeature(baseUrl, input);
    if (!parsed.ok) return { ok: false, error: `${String(input.name ?? input.path ?? "Fonctionnalité").slice(0, 40)} : ${parsed.error}` };
    if (paths.has(parsed.feature.path)) continue;
    paths.add(parsed.feature.path);
    // Un identifiant déjà connu (et pas encore utilisé dans cette liste) est conservé ; sinon on en crée un tout neuf.
    let id = typeof input.id === "string" && existingIds.has(input.id) && !used.has(input.id) ? input.id : "";
    if (!id) {
      do id = makeId();
      while (used.has(id) || existingIds.has(id));
    }
    used.add(id);
    features.push({ id, ...parsed.feature });
  }
  return { ok: true, features };
}

export type Health = "up" | "degraded" | "down";

/** Santé d'un site : hors ligne, « partiel » (il répond mais une fonctionnalité est en panne), ou en ligne. null = pas encore contrôlé. */
export function siteHealth(mainUp: boolean | null | undefined, featuresDown: number | null | undefined): Health | null {
  if (mainUp === null || mainUp === undefined) return null;
  if (!mainUp) return "down";
  return (featuresDown ?? 0) > 0 ? "degraded" : "up";
}

const ASSET = /\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|json|xml|pdf|zip|mp4|mp3|woff2?|ttf|map|txt)$/i;
const KEY_WORDS = ["connexion", "login", "signin", "inscription", "signup", "register", "panier", "cart", "checkout", "paiement", "payment", "pay", "commande", "order", "compte", "account", "dashboard", "tableau", "api", "health", "boutique", "shop", "tarif", "pricing", "contact"];

/** Pages à proposer à partir du code de la page d'accueil : liens du MÊME site, sans fichiers, les plus importantes (connexion, paiement…) d'abord. */
export function extractLinks(html: string, pageUrl: string, max = 12): { name: string; path: string }[] {
  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return [];
  }
  const re = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const found: { name: string; path: string; score: number }[] = [];
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = re.exec(html)) && guard++ < 3000) {
    const href = (match[1] ?? match[2] ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    let target: URL;
    try {
      target = new URL(href, page);
    } catch {
      continue;
    }
    if (target.origin !== page.origin) continue;
    const path = target.pathname + target.search;
    if (path === "/" || path.length > 200 || ASSET.test(target.pathname) || seen.has(path)) continue;
    seen.add(path);
    const text = match[3].replace(/<[^>]*>/g, " ").replace(/&nbsp;|&amp;|&#\d+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, FEATURE_NAME_MAX);
    const haystack = `${path} ${text}`.toLowerCase();
    found.push({ name: text || nameFromPath(path), path, score: KEY_WORDS.some((k) => haystack.includes(k)) ? 1 : 0 });
  }
  found.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  return found.slice(0, max).map(({ name, path }) => ({ name, path }));
}

// ───── Exploration automatique : Vigie découvre elle-même les pages d'un site et les teste toutes ─────

export const CRAWL_MAX_PAGES = 20;
export const CRAWL_MAX_PAGES_PER_USER = 60;
export const CRAWL_DEPTH = 2;
export const CRAWL_REDISCOVER_HOURS = 6;
/** Une page qui n'est plus trouvée par ce nombre d'explorations de suite est oubliée. */
export const CRAWL_FORGET_AFTER = 3;

/** Empreinte courte et stable d'un texte (FNV-1a, 8 caractères) : sert de nom de champ sûr pour une page. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export const pageKey = (path: string) => `p${fnv1a(path)}`;

/** Chemin d'une page à explorer : même site, sans fichiers, sans « ?… » ni « # », sans « / » final ; null sinon. L'accueil (« / ») est exclu : c'est le site lui-même. */
export function crawlPath(href: string, pageUrl: string): string | null {
  const value = (href ?? "").trim();
  if (!value || value.startsWith("#") || /^(mailto|tel|javascript|data|sms|whatsapp):/i.test(value)) return null;
  let page: URL;
  let target: URL;
  try {
    page = new URL(pageUrl);
    target = new URL(value, page);
  } catch {
    return null;
  }
  if (target.origin !== page.origin) return null;
  let path = target.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/$/, "");
  if (path === "/" || path.length > 200 || ASSET.test(path) || /[\s\\\u0000-\u001f\u007f]/.test(path)) return null;
  return path;
}

/** Tous les liens (même site) d'une page, sans doublon, dans l'ordre d'apparition. */
export function crawlLinks(html: string, pageUrl: string): string[] {
  const re = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  const seen = new Set<string>();
  const out: string[] = [];
  let match: RegExpExecArray | null;
  let guard = 0;
  while ((match = re.exec(html)) && guard++ < 5000) {
    const path = crawlPath(match[1] ?? match[2] ?? "", pageUrl);
    if (path && !seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/**
 * Met à jour la liste des pages connues avec celles trouvées par la dernière exploration :
 * les pages connues sont gardées (compteur « introuvable » remis à zéro si elles sont retrouvées, +1 sinon, oubliées à 3),
 * les nouvelles s'ajoutent jusqu'à `maxPages`.
 */
export function mergeDiscovered(
  previous: Record<string, { path: string; missing?: number }>,
  found: string[],
  maxPages = CRAWL_MAX_PAGES,
): { pages: Record<string, { path: string; missing: number }>; added: string[]; dropped: string[] } {
  const foundSet = new Set(found);
  const pages: Record<string, { path: string; missing: number }> = {};
  const added: string[] = [];
  const dropped: string[] = [];
  for (const [key, page] of Object.entries(previous)) {
    const missing = foundSet.has(page.path) ? 0 : (page.missing ?? 0) + 1;
    if (missing >= CRAWL_FORGET_AFTER) dropped.push(key);
    else pages[key] = { path: page.path, missing };
  }
  for (const path of found) {
    if (Object.keys(pages).length >= maxPages) break;
    const key = pageKey(path);
    if (!pages[key]) {
      pages[key] = { path, missing: 0 };
      added.push(key);
    }
  }
  return { pages, added, dropped };
}

/**
 * Évolution d'une page entre deux contrôles. Une page qui n'a JAMAIS répondu est un « lien cassé » (à signaler, pas une panne) ;
 * une page qui marchait puis ne répond plus est une « panne » (alerte) ; une page réparée n'alerte que si elle avait déjà marché.
 */
export function pageStep(previous: { up?: boolean; everOk?: boolean } | undefined, up: boolean): "went_down" | "recovered" | "broken" | "none" {
  if (!previous || previous.up === undefined) return up ? "none" : "broken";
  if (previous.up && !up) return "went_down";
  if (!previous.up && up) return previous.everOk ? "recovered" : "none";
  return "none";
}

export function crawlDue(lastMs: number | null, nowMs: number, force = false): boolean {
  return force || lastMs === null || nowMs - lastMs >= CRAWL_REDISCOVER_HOURS * 3_600_000 - 60_000;
}

/** Nombre de problèmes qui font passer un site « répond » en « partiel » : fonctionnalités en panne + pages découvertes qui ne répondent plus. */
export const problemTotal = (featuresDown?: number | null, crawlDown?: number | null) => (featuresDown ?? 0) + (crawlDown ?? 0);

// ───── Robot de connexion : un vrai navigateur se connecte avec un COMPTE DE TEST et visite l'intérieur de l'application ─────

export const ROBOT_MAX_PAGES = 15;
export const ROBOT_EVERY_MIN = 5;
export const MAX_ROBOTS_PER_USER = 3;
/** Un scénario confié à un exécuteur n'est pas redonné à un autre pendant ce délai. */
export const ROBOT_LEASE_MIN = 4;

export type RobotConfigInput = { enabled?: unknown; loginPath?: unknown; email?: unknown; password?: unknown; scenario?: unknown };

// ───── Scénario : les gestes que le robot fait comme un testeur (écrits en français, une ligne par geste) ─────

export const ROBOT_MAX_STEPS = 20;
export type RobotStep = { a: "goto" | "click" | "fill" | "see" | "wait"; t: string; v?: string };

/**
 * Actions irréversibles ou financières : le robot ne clique JAMAIS dessus, ni dans un scénario, ni en exploration
 * (supprimer, payer, retirer de l'argent, virement, se déconnecter…). L'exécuteur applique la même règle au texte réel du bouton.
 */
export const ROBOT_FORBIDDEN = /supprim|delet|remov|effac|retirer|retrait|withdraw|\bpayer\b|pay now|virement|transf[eé]r|envoyer (l'|de l'|un |le |des )?(argent|paiement|virement|fonds)|confirmer|r[eé]silier|annuler|d[eé]connect|d[eé]connex|quitter|fermer la session|log ?out|sign ?out|d[eé]sactiver|r[eé]initialiser|\breset\b/i;
/** Champs où un scénario n'a pas le droit de saisir une valeur (elle serait lisible dans le navigateur). */
const ROBOT_SECRET_FIELD = /mot de passe|password|\bpin\b|cvv|iban|secret|carte|\botp\b|code de v[eé]rification|code sms/i;

const unquote = (s: string) => s.trim().replace(/^["'«“]\s*|\s*["'»”]$/g, "").trim();

/**
 * Transforme le texte d'un scénario en gestes. Exemple :
 *   aller à /paiements
 *   cliquer sur Créer un lien
 *   remplir Montant avec 1000
 *   voir Lien créé
 *   attendre 2
 * Les lignes vides et celles qui commencent par # sont ignorées. Renvoie l'erreur de la première ligne invalide.
 */
export function parseScenario(baseUrl: string, text: unknown): { ok: true; steps: RobotStep[]; lines: string[] } | { ok: false; error: string } {
  const raw = typeof text === "string" ? text : "";
  if (raw.length > 4000) return { ok: false, error: "Scénario trop long." };
  const steps: RobotStep[] = [];
  const lines: string[] = [];
  const rows = raw.split(/\r?\n/);
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i].replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
    if (!line || line.startsWith("#")) continue;
    const fail = (why: string) => ({ ok: false as const, error: `Ligne ${i + 1} : ${why}` });
    if (steps.length >= ROBOT_MAX_STEPS) return fail(`${ROBOT_MAX_STEPS} gestes au plus.`);
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(?:aller|va|ouvrir|visiter)\s+(?:à|a|sur)?\s*(\S+)$/i))) {
      const target = featureUrl(baseUrl, m[1]);
      if (!target.ok) return fail(`« ${m[1]} » n'est pas une page de ton site (${target.error}).`);
      steps.push({ a: "goto", t: target.path });
    } else if ((m = line.match(/^cliquer\s+sur\s+(.+)$/i))) {
      const t = unquote(m[1]).slice(0, 80);
      if (!t) return fail("sur quoi cliquer ?");
      if (ROBOT_FORBIDDEN.test(t)) return fail(`« ${t} » est une action que le robot n'a pas le droit de faire (supprimer, payer, retirer de l'argent, se déconnecter…).`);
      steps.push({ a: "click", t });
    } else if ((m = line.match(/^(?:remplir|saisir)\s+(.+?)\s+avec\s+(.+)$/i))) {
      const t = unquote(m[1]).slice(0, 80);
      const v = unquote(m[2]).slice(0, 100);
      if (!t || !v) return fail("il manque le champ ou la valeur.");
      if (ROBOT_SECRET_FIELD.test(t)) return fail(`le champ « ${t} » est sensible : le robot n'y saisit jamais de valeur.`);
      steps.push({ a: "fill", t, v });
    } else if ((m = line.match(/^(?:voir|v[eé]rifier)\s+(.+)$/i))) {
      const t = unquote(m[1]).slice(0, 100);
      if (!t) return fail("quel texte doit apparaître ?");
      steps.push({ a: "see", t });
    } else if ((m = line.match(/^attendre\s+(\d{1,2})\s*(?:s|sec|secondes?)?$/i))) {
      const seconds = Number(m[1]);
      if (seconds < 1 || seconds > 5) return fail("attendre entre 1 et 5 secondes.");
      steps.push({ a: "wait", t: String(seconds) });
    } else {
      return fail("geste non compris. Utilise : aller à /page · cliquer sur Texte · remplir Champ avec Valeur · voir Texte · attendre 2");
    }
    lines.push(line.slice(0, 160));
  }
  return { ok: true, steps, lines };
}

/** Un geste de scénario enregistré, relu depuis la base : on ne s'y fie pas (forme, tailles, actions interdites). */
export function sanitizeSteps(raw: unknown): RobotStep[] {
  const out: RobotStep[] = [];
  for (const entry of Array.isArray(raw) ? raw.slice(0, ROBOT_MAX_STEPS) : []) {
    const s = (entry ?? {}) as Record<string, unknown>;
    const a = s.a;
    if (a !== "goto" && a !== "click" && a !== "fill" && a !== "see" && a !== "wait") continue;
    const t = typeof s.t === "string" ? s.t.slice(0, 100) : "";
    if (!t) continue;
    if (a === "click" && ROBOT_FORBIDDEN.test(t)) continue;
    if (a === "fill") {
      const v = typeof s.v === "string" ? s.v.slice(0, 100) : "";
      if (!v || ROBOT_SECRET_FIELD.test(t)) continue;
      out.push({ a, t, v });
    } else out.push({ a, t });
  }
  return out;
}

/** Réglages du robot saisis par l'utilisateur. Le mot de passe n'est jamais dans la configuration : il part dans le coffre chiffré. */
export function normalizeRobotConfig(
  baseUrl: string,
  input: RobotConfigInput,
  hasPassword: boolean,
): { ok: true; config: { enabled: boolean; loginPath: string; email: string }; password: string | null } | { ok: false; error: string } {
  const login = featureUrl(baseUrl, String(input.loginPath ?? "").trim() || "/connexion");
  if (!login.ok) return { ok: false, error: `Page de connexion : ${login.error}` };
  const email = String(input.email ?? "").trim();
  if (email.length < 3 || email.length > 120 || /[\s\u0000-\u001f\u007f]/.test(email)) return { ok: false, error: "Saisis l'identifiant (e-mail) du compte de test." };
  const raw = typeof input.password === "string" ? input.password : "";
  if (raw.length > 200) return { ok: false, error: "Mot de passe trop long (200 caractères au plus)." };
  const enabled = input.enabled === true;
  if (enabled && !raw && !hasPassword) return { ok: false, error: "Saisis le mot de passe du compte de test." };
  return { ok: true, config: { enabled, loginPath: login.path, email }, password: raw || null };
}

/** `error` = panne (alerte) ; `warn` = simple remarque, jamais d'alerte (par exemple une erreur JavaScript dans la page). */
export type RobotPageResult = { path: string; status: number | null; ms: number | null; error: string | null; warn: string | null };
export type RobotStepResult = { text: string; ok: boolean; error: string | null };
export type RobotReport = { loginOk: boolean; loginError: string | null; pages: RobotPageResult[]; steps: RobotStepResult[]; clicks: number };

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
  return text || null;
};

/** Rapport reçu de l'exécuteur : on ne fait confiance à rien (types, tailles, caractères). Renvoie null si le rapport est inutilisable. */
export function sanitizeRobotReport(raw: unknown): RobotReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.loginOk !== "boolean") return null;
  const pages: RobotPageResult[] = [];
  for (const entry of Array.isArray(r.pages) ? r.pages.slice(0, 30) : []) {
    const p = (entry ?? {}) as Record<string, unknown>;
    const path = cleanText(p.path, 200);
    if (!path || !path.startsWith("/")) continue;
    const status = typeof p.status === "number" && Number.isInteger(p.status) && p.status >= 100 && p.status <= 599 ? p.status : null;
    const ms = typeof p.ms === "number" && Number.isFinite(p.ms) && p.ms >= 0 && p.ms <= 120_000 ? Math.round(p.ms) : null;
    pages.push({ path, status, ms, error: cleanText(p.error, 120), warn: cleanText(p.warn, 120) });
  }
  const steps: RobotStepResult[] = [];
  for (const entry of Array.isArray(r.steps) ? r.steps.slice(0, ROBOT_MAX_STEPS) : []) {
    const s = (entry ?? {}) as Record<string, unknown>;
    const text = cleanText(s.text, 140);
    if (!text || typeof s.ok !== "boolean") continue;
    steps.push({ text, ok: s.ok, error: cleanText(s.error, 120) });
  }
  const clicks = typeof r.clicks === "number" && Number.isInteger(r.clicks) && r.clicks >= 0 ? Math.min(r.clicks, 500) : 0;
  return { loginOk: r.loginOk, loginError: cleanText(r.loginError, 200), pages, steps, clicks };
}

/**
 * Verdict d'un passage du robot. Panne : le compte de test n'arrive pas à se connecter, ou une page de l'application répond en erreur
 * (500 et plus, délai dépassé, session perdue, page d'erreur affichée). Une page 404 est un « lien cassé » : signalé, mais ce n'est pas une panne.
 */
export function robotVerdict(report: RobotReport): { ok: boolean; reason: string | null; failed: RobotPageResult[]; broken: RobotPageResult[]; failedSteps: RobotStepResult[] } {
  if (!report.loginOk) return { ok: false, reason: `Connexion impossible : ${report.loginError ?? "le compte de test n'a pas pu se connecter"}`, failed: [], broken: [], failedSteps: [] };
  const failed = report.pages.filter((p) => p.error !== null || p.status === null || p.status >= 500);
  const broken = report.pages.filter((p) => !failed.includes(p) && (p.status === 404 || p.status === 410));
  const failedSteps = report.steps.filter((s) => !s.ok);
  if (!failed.length && !failedSteps.length) return { ok: true, reason: null, failed, broken, failedSteps };
  const parts: string[] = [];
  if (failed.length) {
    const shown = failed.slice(0, 3).map((p) => `${p.path} (${p.error ?? `HTTP ${p.status}`})`).join(", ");
    const more = failed.length > 3 ? ` et ${failed.length - 3} autre${failed.length - 3 > 1 ? "s" : ""}` : "";
    parts.push(`${failed.length} page${failed.length > 1 ? "s" : ""} de l'application en erreur : ${shown}${more}`);
  }
  if (failedSteps.length) parts.push(`scénario en échec à « ${failedSteps[0].text} »${failedSteps[0].error ? ` (${failedSteps[0].error})` : ""}`);
  return { ok: false, reason: parts.join(" ; "), failed, broken, failedSteps };
}

/** « https://www.exemple.com/page » devient « exemple.com ». */
export function shortHost(raw: string): string {
  const parsed = parseMonitorUrl(raw);
  return parsed.ok ? parsed.host.replace(/^www\./, "") : raw;
}
