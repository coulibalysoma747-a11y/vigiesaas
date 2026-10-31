import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  MAX_FEATURES_PER_USER, MAX_ROBOTS_PER_USER, buildFeatureList, normalizeExpectText, normalizeInterval, normalizeMaxLatency, normalizeRobotConfig,
  type RobotConfigInput,
} from "@/lib/monitoring";
import { encryptSecret, vaultReady } from "@/lib/robot-crypto";
import { fail, ownMonitor, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const newId = () => randomUUID().replace(/-/g, "").slice(0, 8);

/** Le robot est coupé ou retiré : un incident encore ouvert est clos (il ne resterait « en cours » pour toujours), sans mail de retour puisque rien n'est revenu. */
async function endRobotIncident(db: Firestore, incidentId: string | null | undefined) {
  if (!incidentId) return;
  const ref = db.collection("incidents").doc(incidentId);
  const now = Timestamp.now();
  const started = ((await ref.get()).data()?.startedAt as Timestamp | undefined)?.toMillis?.() ?? null;
  await ref.update({ resolvedAt: now, durationSec: started === null ? null : Math.max(0, Math.round((now.toMillis() - started) / 1000)) }).catch(() => {});
}

/** Robot coupé : plus d'état « en panne » ni d'incident lié ; à la réactivation, le premier passage repart de zéro. */
function resetRobotState(update: Record<string, unknown>) {
  update["robot.enabled"] = false;
  update["robot.ok"] = null;
  update["robot.reason"] = null;
  update["robot.incidentId"] = null;
}

/** Modifie un de SES sites : nom, pause / reprise, fréquence, contrôles avancés et fonctionnalités. Rien d'autre n'est modifiable. */
export async function PATCH(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const mine = await ownMonitor(id, caller.uid);
  if (!mine) return fail("Site introuvable.", 404);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const update: Record<string, unknown> = {};
  if (typeof body?.isActive === "boolean") update.isActive = body.isActive;
  if (body && "intervalMin" in body) update.intervalMin = normalizeInterval(body.intervalMin);
  if (typeof body?.name === "string" && body.name.trim()) update.name = body.name.trim().slice(0, 80);
  if (body && "expectText" in body) update.expectText = normalizeExpectText(body.expectText);
  if (typeof body?.autoCrawl === "boolean") {
    update.autoCrawl = body.autoCrawl;
    if (body.autoCrawl) update.crawlDiscoveredAt = null; // exploration au prochain passage
  }
  if (body && "maxLatencyMs" in body) {
    update.maxLatencyMs = normalizeMaxLatency(body.maxLatencyMs);
    update.slowStreak = 0;
  }
  if (typeof body?.sslCheck === "boolean") {
    update.sslCheck = body.sslCheck && mine.data.url.toLowerCase().startsWith("https:");
    if (update.sslCheck) update.sslCheckedAt = null; // contrôle du certificat au prochain passage
  }

  if (body && "features" in body) {
    const before = mine.data.features ?? [];
    const built = buildFeatureList(mine.data.url, body.features, new Set(before.map((f) => f.id)), newId);
    if (!built.ok) return fail(built.error, 400);

    const db = adminDb();
    const others = await db.collection("monitors").where("userId", "==", caller.uid).get();
    const usedElsewhere = others.docs.filter((d) => d.id !== id).reduce((sum, d) => sum + ((d.data().features as unknown[] | undefined)?.length ?? 0), 0);
    if (usedElsewhere + built.features.length > MAX_FEATURES_PER_USER) return fail(`Tu as atteint la limite de ${MAX_FEATURES_PER_USER} fonctionnalités surveillées.`, 409);

    const keep = new Set(built.features.map((f) => f.id));
    const now = Timestamp.now();
    for (const old of before) {
      if (keep.has(old.id)) continue;
      // Fonctionnalité retirée : son état disparaît, et un incident encore ouvert est clos.
      const state = mine.data.featureState?.[old.id];
      if (state?.incidentId) await db.collection("incidents").doc(state.incidentId).update({ resolvedAt: now }).catch(() => {});
      update[`featureState.${old.id}`] = FieldValue.delete();
    }
    update.features = built.features;
    update.featuresDown = built.features.filter((f) => mine.data.featureState?.[f.id]?.up === false).length;
  }

  // Robot de connexion : réglages dans le site, mot de passe de test dans le coffre chiffré `robotSecrets` (jamais lisible par le navigateur).
  if (body && "robot" in body) {
    const input = (body.robot ?? {}) as RobotConfigInput & { remove?: unknown };
    const db = adminDb();
    const vaultRef = db.collection("robotSecrets").doc(id);
    if (input.remove === true) {
      await vaultRef.delete().catch(() => {});
      await endRobotIncident(db, mine.data.robot?.incidentId);
      update.robot = FieldValue.delete();
    } else if (input.enabled === false && input.email === undefined && input.password === undefined) {
      await endRobotIncident(db, mine.data.robot?.incidentId);
      resetRobotState(update);
    } else {
      const hasPassword = !!(await vaultRef.get()).data()?.passwordEnc;
      const parsed = normalizeRobotConfig(mine.data.url, input, hasPassword);
      if (!parsed.ok) return fail(parsed.error, 400);
      if (parsed.config.enabled) {
        const active = await db.collection("monitors").where("userId", "==", caller.uid).where("robot.enabled", "==", true).get();
        if (active.docs.filter((d) => d.id !== id).length >= MAX_ROBOTS_PER_USER) return fail(`Tu as atteint la limite de ${MAX_ROBOTS_PER_USER} robots de connexion.`, 409);
      }
      if (parsed.password) {
        if (!vaultReady()) return fail("Le coffre à mots de passe n'est pas encore configuré sur ce serveur (variable ROBOT_ENC_KEY).", 503);
        await vaultRef.set({ userId: caller.uid, passwordEnc: encryptSecret(parsed.password), updatedAt: Timestamp.now() });
      }
      if (parsed.config.enabled) update["robot.enabled"] = true;
      else {
        await endRobotIncident(db, mine.data.robot?.incidentId);
        resetRobotState(update);
      }
      update["robot.loginPath"] = parsed.config.loginPath;
      update["robot.email"] = parsed.config.email;
      update["robot.hasPassword"] = hasPassword || !!parsed.password;
      update["robot.leaseUntil"] = null;
    }
  }

  if (!Object.keys(update).length) return fail("Rien à modifier.", 400);
  await mine.ref.update(update);
  return NextResponse.json({ ok: true });
}

/** Supprime un de SES sites et son historique d'incidents. */
export async function DELETE(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const mine = await ownMonitor(id, caller.uid);
  if (!mine) return fail("Site introuvable.", 404);

  const db = adminDb();
  const incidents = await db.collection("incidents").where("monitorId", "==", id).where("userId", "==", caller.uid).limit(450).get();
  const batch = db.batch();
  incidents.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection("robotSecrets").doc(id)); // le mot de passe de test disparaît avec le site
  batch.delete(mine.ref);
  await batch.commit();
  return NextResponse.json({ ok: true });
}
