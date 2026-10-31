import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { ROBOT_EVERY_MIN, ROBOT_LEASE_MIN, ROBOT_MAX_PAGES, isDue, sanitizeSteps, type RobotStep } from "@/lib/monitoring";
import { decryptSecret } from "@/lib/robot-crypto";
import { guardSecret } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const MAX_JOBS_PER_RUN = 5;

/**
 * Donne au robot (GitHub Actions) les scénarios à exécuter maintenant : au plus 5, les plus anciens d'abord.
 * Réservé au robot (ROBOT_SECRET). Les mots de passe de test sont déchiffrés ici et ne sortent que par cette route.
 */
export async function GET(req: Request) {
  const refused = guardSecret(req, "ROBOT_SECRET");
  if (refused) return refused;

  const db = adminDb();
  const now = Date.now();
  const snap = await db.collection("monitors").where("robot.enabled", "==", true).limit(200).get();
  const due = snap.docs
    .filter((d) => {
      const data = d.data();
      if (data.isActive === false || typeof data.url !== "string" || typeof data.userId !== "string") return false;
      if ((data.robot?.leaseUntil?.toMillis?.() ?? 0) > now) return false; // déjà confié à un autre passage
      const lastRun = data.robot?.lastRunAt?.toMillis?.() ?? null;
      // « Lancer le robot maintenant » : une demande plus récente que le dernier passage passe avant l'horaire.
      if ((data.robot?.runRequestedAt?.toMillis?.() ?? 0) > (lastRun ?? 0)) return true;
      return isDue(lastRun, ROBOT_EVERY_MIN, now);
    })
    .sort((a, b) => (a.data().robot?.lastRunAt?.toMillis?.() ?? 0) - (b.data().robot?.lastRunAt?.toMillis?.() ?? 0))
    .slice(0, MAX_JOBS_PER_RUN);

  const jobs: { monitorId: string; baseUrl: string; loginPath: string; email: string; password: string; maxPages: number; steps: RobotStep[] }[] = [];
  for (const d of due) {
    const data = d.data();
    const vault = await db.collection("robotSecrets").doc(d.id).get();
    // Le mot de passe n'est donné que s'il appartient bien au propriétaire du site.
    if (!vault.exists || vault.data()?.userId !== data.userId || !vault.data()?.passwordEnc || !data.robot?.email) continue;
    let password: string;
    try {
      password = decryptSecret(vault.data()?.passwordEnc as string);
    } catch {
      await d.ref.update({ "robot.ok": false, "robot.reason": "Mot de passe de test illisible : saisis-le de nouveau." }).catch(() => {});
      continue;
    }
    await d.ref.update({ "robot.leaseUntil": Timestamp.fromMillis(now + ROBOT_LEASE_MIN * 60_000) });
    jobs.push({ monitorId: d.id, baseUrl: data.url, loginPath: data.robot.loginPath || "/connexion", email: data.robot.email, password, maxPages: ROBOT_MAX_PAGES, steps: sanitizeSteps(data.robot.steps) });
  }
  return NextResponse.json({ jobs });
}
