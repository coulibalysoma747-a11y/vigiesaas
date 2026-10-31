// Contrôle d'UN site : mesure, historique, incidents, alertes. Serveur seulement (cron et « Vérifier maintenant »).
// Quatre contrôles : le site répond (et contient le texte attendu), il n'est pas trop lent, son certificat SSL est en règle.
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { Resend } from "resend";
import { adminAuth } from "@/lib/firebase-admin";
import { sendAlert, type AlertKind } from "@/lib/alerts";
import {
  dayDelta, describeSlow, describeSsl, evalSlow, normalizeExpectText, normalizeMaxLatency, sslChange, sslDue, sslLevel, staleDayKeys, transition,
  type Days, type SslLevel,
} from "@/lib/monitoring";
import { checkCertificate, probe, type ProbeResult } from "@/lib/safe-fetch";

export type MonitorDoc = {
  userId: string;
  name: string;
  url: string;
  isActive?: boolean;
  intervalMin?: number;
  expectText?: string | null;
  maxLatencyMs?: number | null;
  sslCheck?: boolean;
  lastStatus?: boolean | null;
  lastCheckedAt?: Timestamp | null;
  lastChangedAt?: Timestamp | null;
  openIncidentId?: string | null;
  slowStreak?: number;
  isSlow?: boolean;
  openSlowIncidentId?: string | null;
  sslLevel?: SslLevel | null;
  sslCheckedAt?: Timestamp | null;
  openSslIncidentId?: string | null;
  days?: Days;
};

export type Recipient = { email: string | null; verified: boolean; enabled: boolean };

/** Destinataire des alertes d'un compte : toujours l'adresse du compte, et seulement si elle est vérifiée (sinon n'importe qui pourrait faire écrire à n'importe qui). */
export function makeRecipientResolver(db: Firestore) {
  const cache = new Map<string, Promise<Recipient>>();
  return (uid: string): Promise<Recipient> => {
    let found = cache.get(uid);
    if (!found) {
      found = (async () => {
        const [settings, user] = await Promise.all([
          db.collection("settings").doc(uid).get(),
          adminAuth().getUser(uid).catch(() => null),
        ]);
        return { email: user?.email ?? null, verified: !!user?.emailVerified, enabled: settings.data()?.alertsEnabled !== false };
      })();
      cache.set(uid, found);
    }
    return found;
  };
}

export type CheckContext = {
  db: Firestore;
  resend: Resend | null;
  recipient: (uid: string) => Promise<Recipient>;
  now: Date;
  /** « Vérifier maintenant » : contrôle aussi le certificat sans attendre les 12 heures. */
  forceSsl?: boolean;
};

export type CheckOutcome = {
  result: ProbeResult;
  change: "none" | "down" | "up";
  alerted: boolean;
  ssl: { level: SslLevel; daysLeft: number | null } | null;
  slow: boolean;
};

type IncidentKind = "down" | "slow" | "ssl";
type Notice = { kind: AlertKind; reason?: string | null; downSeconds?: number | null; critical?: boolean };

export async function checkMonitor(ref: DocumentReference, m: MonitorDoc, ctx: CheckContext, extra: Record<string, unknown> = {}): Promise<CheckOutcome> {
  const { db, now } = ctx;
  const at = Timestamp.fromDate(now);
  const notices: Notice[] = [];

  const openIncident = async (kind: IncidentKind, reason: string): Promise<string> => {
    const incident = db.collection("incidents").doc();
    await incident.set({ userId: m.userId, monitorId: ref.id, monitorName: m.name, url: m.url, kind, startedAt: at, resolvedAt: null, durationSec: null, reason });
    return incident.id;
  };
  /** Ferme un incident et renvoie sa durée en secondes (null si elle est inconnue). */
  const closeIncident = async (id: string): Promise<number | null> => {
    const doc = db.collection("incidents").doc(id);
    const startedMs = ((await doc.get()).data()?.startedAt as Timestamp | undefined)?.toMillis?.() ?? null;
    const seconds = startedMs === null ? null : Math.max(0, Math.round((now.getTime() - startedMs) / 1000));
    await doc.update({ resolvedAt: at, durationSec: seconds }).catch(() => {});
    return seconds;
  };

  // 1. Le site répond-il (et contient-il le texte attendu) ?
  const expectText = normalizeExpectText(m.expectText);
  const result = await probe(m.url, { expectText });
  const change = transition(m.lastStatus ?? null, result.up);

  const update: Record<string, unknown> = {
    lastStatus: result.up,
    lastCode: result.code,
    lastError: result.error,
    lastLatencyMs: result.latencyMs,
    lastContentOk: result.contentOk,
    lastCheckedAt: at,
    ...extra,
  };

  // Historique : un seul document par site, un compteur par jour (30 jours gardés).
  const delta = dayDelta(now, result.up, result.latencyMs);
  update[`days.${delta.key}.c`] = FieldValue.increment(delta.c);
  update[`days.${delta.key}.u`] = FieldValue.increment(delta.u);
  if (delta.ln) {
    update[`days.${delta.key}.l`] = FieldValue.increment(delta.l);
    update[`days.${delta.key}.ln`] = FieldValue.increment(delta.ln);
  }
  for (const stale of staleDayKeys(m.days, now)) update[`days.${stale}`] = FieldValue.delete();

  if (change === "went_down" || change === "first_down") {
    update.openIncidentId = await openIncident("down", result.reason ?? "Pas de réponse");
    update.lastChangedAt = at;
    notices.push({ kind: "down", reason: result.reason });
  } else if (change === "recovered") {
    const fromIncident = m.openIncidentId ? await closeIncident(m.openIncidentId) : null;
    const startedMs = m.lastChangedAt?.toMillis?.() ?? null;
    const downSeconds = fromIncident ?? (startedMs === null ? null : Math.max(0, Math.round((now.getTime() - startedMs) / 1000)));
    update.openIncidentId = null;
    update.lastChangedAt = at;
    notices.push({ kind: "up", downSeconds });
  }

  // 2. Le site est-il trop lent ? (seulement s'il répond, et après 3 contrôles lents d'affilée)
  const maxMs = normalizeMaxLatency(m.maxLatencyMs);
  const slow = evalSlow({ streak: m.slowStreak, isSlow: m.isSlow }, result.up, result.latencyMs, maxMs);
  update.slowStreak = slow.streak;
  update.isSlow = slow.isSlow;
  if (slow.change === "became_slow" && result.latencyMs !== null && maxMs !== null) {
    const reason = describeSlow(result.latencyMs, maxMs);
    update.openSlowIncidentId = await openIncident("slow", reason);
    notices.push({ kind: "slow", reason });
  } else if (!slow.isSlow && m.openSlowIncidentId) {
    const seconds = await closeIncident(m.openSlowIncidentId);
    update.openSlowIncidentId = null;
    if (slow.change === "back_to_normal") notices.push({ kind: "slow_ok", downSeconds: seconds }); // pas de message si le site est tombé entre-temps
  }

  // 3. Le certificat SSL est-il en règle ? (https seulement, toutes les 12 heures)
  let ssl: CheckOutcome["ssl"] = null;
  const wantsSsl = m.sslCheck !== false && m.url.toLowerCase().startsWith("https:");
  if (wantsSsl && (ctx.forceSsl || sslDue(m.sslCheckedAt?.toMillis?.() ?? null, now.getTime()))) {
    const cert = await checkCertificate(m.url, now);
    if (cert) {
      const level = sslLevel(cert);
      ssl = { level, daysLeft: cert.daysLeft };
      update.sslCheckedAt = at;
      update.sslLevel = level;
      update.sslDaysLeft = cert.daysLeft;
      update.sslExpiresAt = cert.expiresAt ? Timestamp.fromDate(cert.expiresAt) : null;
      const verdict = sslChange(m.sslLevel, level);
      const reason = describeSsl(level, cert.daysLeft);
      if (verdict === "worse") {
        if (m.openSslIncidentId) await db.collection("incidents").doc(m.openSslIncidentId).update({ reason }).catch(() => {});
        else update.openSslIncidentId = await openIncident("ssl", reason);
        notices.push({ kind: "ssl", reason, critical: level === "expired" || level === "invalid" });
      } else if (verdict === "fixed") {
        if (m.openSslIncidentId) await closeIncident(m.openSslIncidentId);
        update.openSslIncidentId = null;
        notices.push({ kind: "ssl_ok", reason });
      }
    }
  }

  await ref.update(update);

  // Alertes : après l'enregistrement, et une alerte qui échoue ne casse jamais le contrôle.
  let alerted = false;
  if (notices.length && ctx.resend) {
    try {
      const to = await ctx.recipient(m.userId);
      if (to.email && to.verified && to.enabled) {
        for (const notice of notices) {
          try {
            await sendAlert(ctx.resend, to.email, { ...notice, name: m.name, url: m.url, monitorId: ref.id, at: now });
            alerted = true;
          } catch (e) {
            console.error("alerte non envoyée :", notice.kind, e instanceof Error ? e.message : e);
          }
        }
      }
    } catch (e) {
      console.error("destinataire introuvable :", e instanceof Error ? e.message : e);
    }
  }
  return { result, change: change === "none" ? "none" : change === "recovered" ? "up" : "down", alerted, ssl, slow: slow.isSlow };
}
