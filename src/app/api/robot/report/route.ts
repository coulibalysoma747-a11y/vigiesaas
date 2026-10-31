import { NextResponse } from "next/server";
import { mailer } from "@/lib/alerts";
import { makeRecipientResolver, type MonitorDoc } from "@/lib/check-monitor";
import { adminDb } from "@/lib/firebase-admin";
import { sanitizeRobotReport } from "@/lib/monitoring";
import { applyRobotReport } from "@/lib/robot-report";
import { fail, guardSecret } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Reçoit le résultat d'un passage du robot pour un site (réservé au robot : ROBOT_SECRET). Rien n'est cru sur parole : le rapport est nettoyé. */
export async function POST(req: Request) {
  const refused = guardSecret(req, "ROBOT_SECRET");
  if (refused) return refused;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const monitorId = typeof body?.monitorId === "string" && /^[A-Za-z0-9]{10,40}$/.test(body.monitorId) ? body.monitorId : null;
  const report = sanitizeRobotReport(body);
  if (!monitorId || !report) return fail("Rapport invalide.", 400);

  const db = adminDb();
  const ref = db.collection("monitors").doc(monitorId);
  const snap = await ref.get();
  const data = snap.data() as MonitorDoc | undefined;
  if (!snap.exists || !data || data.robot?.enabled !== true) return fail("Scénario introuvable ou désactivé.", 404);

  const out = await applyRobotReport(ref, data, report, { db, resend: mailer(), recipient: makeRecipientResolver(db), now: new Date() });
  return NextResponse.json({ ok: out.ok });
}
