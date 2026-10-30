// Contrôle d'un site par le serveur. Serveur seulement.
// Protection : le serveur ne lit JAMAIS une adresse privée ou interne, ni directement, ni via un nom qui s'y résout, ni via une redirection.
import { lookup } from "node:dns/promises";
import { describeFailure, isIpLiteral, isPrivateAddress, parseMonitorUrl, type ProbeError } from "@/lib/monitoring";

export type ProbeResult = { up: boolean; code: number | null; latencyMs: number | null; error: ProbeError | null; reason: string | null };

const TIMEOUT_MS = 10_000;
const DNS_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "VigieSaaS/1.0 (+surveillance de disponibilite)";

class ProbeFailure extends Error {
  constructor(readonly kind: ProbeError) {
    super(kind);
  }
}

async function assertPublicHost(host: string): Promise<void> {
  if (isIpLiteral(host)) return; // déjà contrôlée par parseMonitorUrl
  let addresses: { address: string }[];
  try {
    // La résolution DNS ne respecte pas le délai global : on la borne à 5 s pour qu'une adresse introuvable ne bloque pas un contrôle.
    addresses = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns-timeout")), DNS_TIMEOUT_MS)),
    ]);
  } catch {
    throw new ProbeFailure("dns");
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new ProbeFailure("blocked");
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

function classify(error: unknown): ProbeError {
  if (error instanceof ProbeFailure) return error.kind;
  const e = error as { name?: string; code?: string; cause?: { code?: string } };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  const code = e?.cause?.code ?? e?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  return "network";
}

async function probeOnce(url: string): Promise<ProbeResult> {
  const started = performance.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    let res = await request(url, "HEAD", signal);
    // Certains serveurs refusent HEAD : on réessaie en GET (sans lire le contenu).
    if (res.status === 405 || res.status === 501 || res.status === 403) {
      void res.body?.cancel().catch(() => {});
      res = await request(url, "GET", signal);
    }
    const latencyMs = Math.round(performance.now() - started);
    void res.body?.cancel().catch(() => {});
    const up = res.status < 400;
    return { up, code: res.status, latencyMs, error: null, reason: up ? null : describeFailure(res.status, null) };
  } catch (e) {
    const error = classify(e);
    return { up: false, code: null, latencyMs: null, error, reason: describeFailure(null, error) };
  }
}

/** Contrôle un site. En cas d'échec, un second essai est fait 2,5 s plus tard : une micro-coupure ne déclenche pas d'alerte. */
export async function probe(url: string): Promise<ProbeResult> {
  const first = await probeOnce(url);
  if (first.up || first.error === "blocked") return first;
  await new Promise((resolve) => setTimeout(resolve, 2500));
  return probeOnce(url);
}
