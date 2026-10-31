import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import {
  MAX_FEATURES_PER_USER, MAX_MONITORS_PER_USER, buildFeatureList, normalizeExpectText, normalizeInterval, normalizeMaxLatency, parseMonitorUrl, shortHost,
  type Feature,
} from "@/lib/monitoring";
import { fail, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const newId = () => randomUUID().replace(/-/g, "").slice(0, 8);

/** Crée un site à surveiller. L'adresse est validée ici : le navigateur n'écrit plus jamais directement dans la base. */
export async function POST(req: Request) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;

  const body = (await req.json().catch(() => null)) as {
    url?: unknown; name?: unknown; intervalMin?: unknown; expectText?: unknown; maxLatencyMs?: unknown; sslCheck?: unknown; features?: unknown;
  } | null;
  const parsed = parseMonitorUrl(String(body?.url ?? ""));
  if (!parsed.ok) return fail(parsed.error, 400);

  const db = adminDb();
  const existing = await db.collection("monitors").where("userId", "==", caller.uid).get();
  if (existing.size >= MAX_MONITORS_PER_USER) return fail(`Tu as atteint la limite de ${MAX_MONITORS_PER_USER} sites. Supprime-en un pour en ajouter un autre.`, 409);

  let features: Feature[] = [];
  if (body?.features !== undefined) {
    const built = buildFeatureList(parsed.url, body.features, new Set(), newId);
    if (!built.ok) return fail(built.error, 400);
    const used = existing.docs.reduce((sum, d) => sum + ((d.data().features as unknown[] | undefined)?.length ?? 0), 0);
    if (used + built.features.length > MAX_FEATURES_PER_USER) return fail(`Tu as atteint la limite de ${MAX_FEATURES_PER_USER} fonctionnalités surveillées.`, 409);
    features = built.features;
  }

  const name = String(body?.name ?? "").trim().slice(0, 80) || shortHost(parsed.url);
  const ref = await db.collection("monitors").add({
    userId: caller.uid,
    name,
    url: parsed.url,
    isActive: true,
    intervalMin: normalizeInterval(body?.intervalMin),
    expectText: normalizeExpectText(body?.expectText),
    maxLatencyMs: normalizeMaxLatency(body?.maxLatencyMs),
    sslCheck: parsed.url.startsWith("https:") && body?.sslCheck !== false,
    features,
    featuresDown: 0,
    autoCrawl: true,
    lastStatus: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id });
}
