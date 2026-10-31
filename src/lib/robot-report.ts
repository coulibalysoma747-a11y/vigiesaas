// Enregistrement du rapport d'un passage du robot de connexion. Serveur seulement.
import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { Resend } from "resend";
import { sendAlert, type AlertKind } from "@/lib/alerts";
import type { MonitorDoc, Recipient } from "@/lib/check-monitor";
import { robotVerdict, transition, type RobotReport } from "@/lib/monitoring";

export async function applyRobotReport(
  ref: DocumentReference,
  m: MonitorDoc,
  report: RobotReport,
  ctx: { db: Firestore; resend: Resend | null; recipient: (uid: string) => Promise<Recipient>; now: Date },
): Promise<{ ok: boolean; reason: string | null }> {
  const { db, now } = ctx;
  const at = Timestamp.fromDate(now);
  const verdict = robotVerdict(report);
  const step = transition(m.robot?.ok ?? null, verdict.ok);

  const update: Record<string, unknown> = {
    "robot.lastRunAt": at,
    "robot.leaseUntil": null,
    "robot.ok": verdict.ok,
    "robot.reason": verdict.reason,
    "robot.loginOk": report.loginOk,
    "robot.pagesTested": report.pages.length,
    "robot.pagesFailed": verdict.failed.length,
    "robot.pagesBroken": verdict.broken.length,
    "robot.pages": report.pages.slice(0, 20),
  };

  let notice: { kind: AlertKind; downSeconds?: number | null } | null = null;
  if (step === "went_down" || step === "first_down") {
    const incident = db.collection("incidents").doc();
    await incident.set({
      userId: m.userId, monitorId: ref.id, monitorName: m.name, url: m.url, kind: "robot",
      startedAt: at, resolvedAt: null, durationSec: null, reason: verdict.reason ?? "Le robot n'arrive plus à utiliser l'application",
    });
    update["robot.incidentId"] = incident.id;
    update["robot.changedAt"] = at;
    notice = { kind: "robot_down" };
  } else if (step === "recovered") {
    let seconds: number | null = null;
    if (m.robot?.incidentId) {
      const doc = db.collection("incidents").doc(m.robot.incidentId);
      const startedMs = ((await doc.get()).data()?.startedAt as Timestamp | undefined)?.toMillis?.() ?? null;
      seconds = startedMs === null ? null : Math.max(0, Math.round((now.getTime() - startedMs) / 1000));
      await doc.update({ resolvedAt: at, durationSec: seconds }).catch(() => {});
    }
    update["robot.incidentId"] = null;
    update["robot.changedAt"] = at;
    notice = { kind: "robot_up", downSeconds: seconds };
  }

  await ref.update(update);

  if (notice && ctx.resend) {
    try {
      const to = await ctx.recipient(m.userId);
      if (to.email && to.verified && to.enabled) {
        await sendAlert(ctx.resend, to.email, { kind: notice.kind, name: m.name, url: m.url, monitorId: ref.id, reason: verdict.reason, downSeconds: notice.downSeconds ?? null, at: now });
      }
    } catch (e) {
      console.error("alerte du robot non envoyée :", e instanceof Error ? e.message : e);
    }
  }
  return { ok: verdict.ok, reason: verdict.reason };
}
