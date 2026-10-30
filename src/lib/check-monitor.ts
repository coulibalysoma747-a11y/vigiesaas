// Contrôle d'UN site : mesure, historique, incident, alerte. Serveur seulement (cron et « Vérifier maintenant »).
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { Resend } from "resend";
import { adminAuth } from "@/lib/firebase-admin";
import { sendAlert } from "@/lib/alerts";
import { dayDelta, staleDayKeys, transition, type Days } from "@/lib/monitoring";
import { probe, type ProbeResult } from "@/lib/safe-fetch";

export type MonitorDoc = {
  userId: string;
  name: string;
  url: string;
  isActive?: boolean;
  intervalMin?: number;
  lastStatus?: boolean | null;
  lastCheckedAt?: Timestamp | null;
  lastChangedAt?: Timestamp | null;
  openIncidentId?: string | null;
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
};

export type CheckOutcome = { result: ProbeResult; change: "none" | "down" | "up"; alerted: boolean };

export async function checkMonitor(ref: DocumentReference, m: MonitorDoc, ctx: CheckContext, extra: Record<string, unknown> = {}): Promise<CheckOutcome> {
  const { db, now } = ctx;
  const result = await probe(m.url);
  const change = transition(m.lastStatus ?? null, result.up);
  const at = Timestamp.fromDate(now);

  const update: Record<string, unknown> = {
    lastStatus: result.up,
    lastCode: result.code,
    lastError: result.error,
    lastLatencyMs: result.latencyMs,
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

  let downSeconds: number | null = null;
  if (change === "went_down" || change === "first_down") {
    const incident = db.collection("incidents").doc();
    await incident.set({ userId: m.userId, monitorId: ref.id, monitorName: m.name, url: m.url, startedAt: at, resolvedAt: null, durationSec: null, reason: result.reason ?? "Pas de réponse" });
    update.openIncidentId = incident.id;
    update.lastChangedAt = at;
  } else if (change === "recovered") {
    const startedMs = m.lastChangedAt?.toMillis?.() ?? null;
    downSeconds = startedMs === null ? null : Math.max(0, Math.round((now.getTime() - startedMs) / 1000));
    if (m.openIncidentId) {
      await db.collection("incidents").doc(m.openIncidentId).update({ resolvedAt: at, durationSec: downSeconds }).catch(() => {});
    }
    update.openIncidentId = null;
    update.lastChangedAt = at;
  }

  await ref.update(update);

  let alerted = false;
  if (change !== "none" && ctx.resend) {
    try {
      const to = await ctx.recipient(m.userId);
      if (to.email && to.verified && to.enabled) {
        await sendAlert(ctx.resend, to.email, {
          kind: change === "recovered" ? "up" : "down",
          name: m.name,
          url: m.url,
          monitorId: ref.id,
          reason: result.reason,
          downSeconds,
          at: now,
        });
        alerted = true;
      }
    } catch (e) {
      console.error("alerte non envoyée :", e instanceof Error ? e.message : e);
    }
  }
  return { result, change: change === "none" ? "none" : change === "recovered" ? "up" : "down", alerted };
}
