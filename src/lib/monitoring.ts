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

/** « https://www.exemple.com/page » devient « exemple.com ». */
export function shortHost(raw: string): string {
  const parsed = parseMonitorUrl(raw);
  return parsed.ok ? parsed.host.replace(/^www\./, "") : raw;
}
