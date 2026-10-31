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

/** « https://www.exemple.com/page » devient « exemple.com ». */
export function shortHost(raw: string): string {
  const parsed = parseMonitorUrl(raw);
  return parsed.ok ? parsed.host.replace(/^www\./, "") : raw;
}
