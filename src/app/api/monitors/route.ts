import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { MAX_MONITORS_PER_USER, normalizeInterval, parseMonitorUrl, shortHost } from "@/lib/monitoring";
import { fail, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Crée un site à surveiller. L'adresse est validée ici : le navigateur n'écrit plus jamais directement dans la base. */
export async function POST(req: Request) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;

  const body = (await req.json().catch(() => null)) as { url?: unknown; name?: unknown; intervalMin?: unknown } | null;
  const parsed = parseMonitorUrl(String(body?.url ?? ""));
  if (!parsed.ok) return fail(parsed.error, 400);

  const db = adminDb();
  const count = (await db.collection("monitors").where("userId", "==", caller.uid).count().get()).data().count;
  if (count >= MAX_MONITORS_PER_USER) return fail(`Tu as atteint la limite de ${MAX_MONITORS_PER_USER} sites. Supprime-en un pour en ajouter un autre.`, 409);

  const name = String(body?.name ?? "").trim().slice(0, 80) || shortHost(parsed.url);
  const ref = await db.collection("monitors").add({
    userId: caller.uid,
    name,
    url: parsed.url,
    isActive: true,
    intervalMin: normalizeInterval(body?.intervalMin),
    lastStatus: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id });
}
