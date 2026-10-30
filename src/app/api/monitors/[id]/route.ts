import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { normalizeInterval } from "@/lib/monitoring";
import { fail, ownMonitor, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Modifie un de SES sites : nom, pause / reprise, fréquence de contrôle. Rien d'autre n'est modifiable. */
export async function PATCH(req: Request, ctx: Ctx) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const mine = await ownMonitor(id, caller.uid);
  if (!mine) return fail("Site introuvable.", 404);

  const body = (await req.json().catch(() => null)) as { name?: unknown; isActive?: unknown; intervalMin?: unknown } | null;
  const update: Record<string, unknown> = {};
  if (typeof body?.isActive === "boolean") update.isActive = body.isActive;
  if (body?.intervalMin !== undefined) update.intervalMin = normalizeInterval(body.intervalMin);
  if (typeof body?.name === "string" && body.name.trim()) update.name = body.name.trim().slice(0, 80);
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
