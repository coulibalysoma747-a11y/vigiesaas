import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { MAX_FEATURES_PER_USER, buildFeatureList, normalizeExpectText, normalizeInterval, normalizeMaxLatency } from "@/lib/monitoring";
import { fail, ownMonitor, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const newId = () => randomUUID().replace(/-/g, "").slice(0, 8);

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
  batch.delete(mine.ref);
  await batch.commit();
  return NextResponse.json({ ok: true });
}
