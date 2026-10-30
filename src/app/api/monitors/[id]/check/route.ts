import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { mailer } from "@/lib/alerts";
import { checkMonitor, makeRecipientResolver } from "@/lib/check-monitor";
import { adminDb } from "@/lib/firebase-admin";
import { allowOnce, fail, ownMonitor, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** « Vérifier maintenant » : contrôle immédiat d'un de SES sites (au plus une fois toutes les 20 secondes par site). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const mine = await ownMonitor(id, caller.uid);
  if (!mine) return fail("Site introuvable.", 404);
  if (!(await allowOnce(`check-${id}`, 20))) return fail("Patiente quelques secondes avant une nouvelle vérification.", 429);

  const db = adminDb();
  const now = new Date();
  const out = await checkMonitor(mine.ref, mine.data, { db, resend: mailer(), recipient: makeRecipientResolver(db), now }, { lastManualCheckAt: Timestamp.fromDate(now) });
  return NextResponse.json({ up: out.result.up, code: out.result.code, latencyMs: out.result.latencyMs, reason: out.result.reason });
}
