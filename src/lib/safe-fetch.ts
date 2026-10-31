// Contrôle d'un site par le serveur. Serveur seulement.
// Protection : le serveur ne lit JAMAIS une adresse privée ou interne, ni directement, ni via un nom qui s'y résout, ni via une redirection.
import { lookup } from "node:dns/promises";
import tls from "node:tls";
import { bodyHasText, crawlLinks, daysUntil, describeFailure, isIpLiteral, isPrivateAddress, parseMonitorUrl, type ProbeError } from "@/lib/monitoring";

export type ProbeResult = {
  up: boolean;
  code: number | null;
  latencyMs: number | null;
  error: ProbeError | null;
  reason: string | null;
  /** null = pas de texte attendu, true = trouvé, false = introuvable (le site est alors déclaré hors ligne). */
  contentOk: boolean | null;
};

const TIMEOUT_MS = 10_000;
const DNS_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 1_000_000;
const USER_AGENT = "VigieSaaS/1.0 (+surveillance de disponibilite)";

class ProbeFailure extends Error {
  constructor(readonly kind: ProbeError) {
    super(kind);
  }
}

/** Adresses IP d'un nom de domaine, après vérification qu'aucune n'est privée. Renvoie null si l'une est interdite. */
async function publicAddresses(host: string): Promise<string[] | null> {
  if (isIpLiteral(host)) return [host]; // déjà contrôlée par parseMonitorUrl
  // La résolution DNS ne respecte pas le délai global : on la borne à 5 s pour qu'une adresse introuvable ne bloque pas un contrôle.
  const found = await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns-timeout")), DNS_TIMEOUT_MS)),
  ]);
  if (!found.length || found.some((a) => isPrivateAddress(a.address))) return null;
  return found.map((a) => a.address);
}

async function assertPublicHost(host: string): Promise<void> {
  let addresses: string[] | null;
  try {
    addresses = await publicAddresses(host);
  } catch {
    throw new ProbeFailure("dns");
  }
  if (!addresses) throw new ProbeFailure("blocked");
}

async function request(url: string, method: "HEAD" | "GET", signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = parseMonitorUrl(current);
    if (!parsed.ok) throw new ProbeFailure("blocked");
    await assertPublicHost(parsed.host);
    const res = await fetch(parsed.url, { method, redirect: "manual", signal, headers: { "user-agent": USER_AGENT, accept: "*/*" } });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      void res.body?.cancel().catch(() => {});
      current = new URL(location, parsed.url).href; // chaque redirection est revérifiée au tour suivant
      continue;
    }
    return res;
  }
  throw new ProbeFailure("redirects");
}

/** Lit le début de la page (1 Mo au plus) pour y chercher le texte attendu. */
async function readText(res: Response, limit = MAX_BODY_BYTES): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  return text;
}

function classify(error: unknown): ProbeError {
  if (error instanceof ProbeFailure) return error.kind;
  const e = error as { name?: string; code?: string; cause?: { code?: string } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  const code = e?.cause?.code ?? e?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  return "network";
}

export type ProbeOptions = {
  expectText?: string | null;
  /** Code HTTP exigé (ex. 401 pour une API protégée). Sans lui, toute réponse sous 400 est bonne. */
  expectStatus?: number | null;
  /** Une fonctionnalité est toujours contrôlée en GET (comme le ferait un visiteur). */
  getOnly?: boolean;
  /** Pages découvertes : 401 et 403 veulent dire « existe, mais demande une connexion » : la page répond, ce n'est pas une panne. */
  acceptProtected?: boolean;
};

async function probeOnce(url: string, options: ProbeOptions): Promise<ProbeResult> {
  const expectText = options.expectText ?? null;
  const expectStatus = options.expectStatus ?? null;
  const started = performance.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    // Avec un texte ou un code attendu il faut une vraie réponse : GET. Sinon HEAD suffit (sans lire le contenu), avec repli en GET si le serveur refuse HEAD.
    const needGet = !!expectText || !!expectStatus || !!options.getOnly;
    let res = await request(url, needGet ? "GET" : "HEAD", signal);
    if (!needGet && (res.status === 405 || res.status === 501 || res.status === 403)) {
      void res.body?.cancel().catch(() => {});
      res = await request(url, "GET", signal);
    }
    const latencyMs = Math.round(performance.now() - started); // temps jusqu'à la réponse, avant la lecture de la page
    let up = expectStatus ? res.status === expectStatus : res.status < 400 || (!!options.acceptProtected && (res.status === 401 || res.status === 403));
    let reason: string | null = up ? null : expectStatus ? `Réponse HTTP ${res.status} (attendu : ${expectStatus})` : describeFailure(res.status, null);
    let contentOk: boolean | null = null;
    if (expectText && up) {
      contentOk = bodyHasText(await readText(res), expectText);
      if (!contentOk) {
        up = false;
        reason = `Texte attendu introuvable : « ${expectText.slice(0, 60)} »`;
      }
    } else {
      void res.body?.cancel().catch(() => {});
    }
    return { up, code: res.status, latencyMs, error: null, reason, contentOk };
  } catch (e) {
    const error = classify(e);
    return { up: false, code: null, latencyMs: null, error, reason: describeFailure(null, error), contentOk: null };
  }
}

/** Contrôle un site. En cas d'échec, un second essai est fait 2,5 s plus tard : une micro-coupure ne déclenche pas d'alerte. */
export async function probe(url: string, options: ProbeOptions = {}): Promise<ProbeResult> {
  const first = await probeOnce(url, options);
  if (first.up || first.error === "blocked") return first;
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return probeOnce(url, options);
}

/** Lit une page (1 Mo au plus), avec les mêmes protections que les contrôles : sert à proposer les pages d'un site. */
export async function fetchText(url: string): Promise<{ text: string; finalUrl: string } | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const res = await request(url, "GET", signal);
    if (res.status >= 400) {
      void res.body?.cancel().catch(() => {});
      return null;
    }
    return { text: await readText(res), finalUrl: res.url || url };
  } catch {
    return null;
  }
}

/**
 * Explore un site comme le ferait un visiteur : part de la page d'accueil, suit les liens du MÊME site sur `depth` niveaux
 * (2 par défaut), 20 pages au plus. `ok` est faux si la page d'accueil n'a pas pu être lue (alors on ne touche à rien).
 */
export async function crawlSite(baseUrl: string, options: { maxPages?: number; depth?: number } = {}): Promise<{ ok: boolean; paths: string[] }> {
  const maxPages = options.maxPages ?? 20;
  const depth = options.depth ?? 2;
  const deadline = Date.now() + 45_000;
  const seen = new Set<string>();
  const found: string[] = [];
  let frontier: string[] = [baseUrl];
  let homeOk = false;
  for (let level = 0; level < depth && frontier.length && found.length < maxPages && Date.now() < deadline; level++) {
    const pages: { ok: boolean; links: string[] }[] = new Array(frontier.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, frontier.length) }, async () => {
        while (next < frontier.length) {
          const i = next++;
          try {
            const res = await request(frontier[i], "GET", AbortSignal.timeout(8000));
            const isHtml = (res.headers.get("content-type") ?? "").toLowerCase().includes("html");
            if (res.status >= 400 || !isHtml) {
              void res.body?.cancel().catch(() => {});
              pages[i] = { ok: res.status < 400, links: [] };
            } else {
              pages[i] = { ok: true, links: crawlLinks(await readText(res, 500_000), res.url || frontier[i]) };
            }
          } catch {
            pages[i] = { ok: false, links: [] };
          }
        }
      }),
    );
    if (level === 0) homeOk = pages[0]?.ok === true;
    const upcoming: string[] = [];
    for (const page of pages) {
      for (const path of page.links) {
        if (seen.has(path) || found.length >= maxPages) continue;
        seen.add(path);
        found.push(path);
        upcoming.push(new URL(path, baseUrl).href);
      }
    }
    frontier = upcoming;
  }
  return { ok: homeOk, paths: found };
}

export type CertResult = { authorized: boolean; daysLeft: number | null; expiresAt: Date | null; error: string | null };

/**
 * Lit le certificat SSL d'un site https. Renvoie null quand le contrôle est impossible (site injoignable, adresse interdite, http simple) :
 * ce n'est pas un certificat défectueux, la panne éventuelle est déjà signalée par le contrôle normal.
 */
export async function checkCertificate(rawUrl: string, now = new Date()): Promise<CertResult | null> {
  const parsed = parseMonitorUrl(rawUrl);
  if (!parsed.ok) return null;
  const url = new URL(parsed.url);
  if (url.protocol !== "https:") return null;
  let address: string;
  try {
    const addresses = await publicAddresses(parsed.host);
    if (!addresses) return null;
    address = addresses[0];
  } catch {
    return null;
  }
  return new Promise<CertResult | null>((resolve) => {
    let finished = false;
    const done = (value: CertResult | null) => {
      if (!finished) {
        finished = true;
        resolve(value);
      }
    };
    const socket = tls.connect(
      { host: address, port: Number(url.port || 443), servername: isIpLiteral(parsed.host) ? undefined : parsed.host, rejectUnauthorized: false, timeout: 8000 },
      () => {
        const cert = socket.getPeerCertificate();
        const expiresAt = cert && cert.valid_to ? new Date(cert.valid_to) : null;
        const valid = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null;
        done({
          authorized: socket.authorized,
          daysLeft: valid ? daysUntil(valid, now) : null,
          expiresAt: valid,
          error: socket.authorized ? null : String(socket.authorizationError ?? "invalid").slice(0, 80),
        });
        socket.end();
      },
    );
    socket.on("timeout", () => { socket.destroy(); done(null); });
    socket.on("error", () => done(null));
  });
}
