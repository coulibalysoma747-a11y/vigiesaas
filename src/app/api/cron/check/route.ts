import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  const db = adminDb();
  const snap = await db.collection("monitors").where("isActive", "==", true).get();
  const results: { id: string; up: boolean; changed: boolean }[] = [];
  for (const d of snap.docs) {
    const m = d.data() as { url: string; lastStatus: boolean | null; userEmail?: string; name: string };
    let up = false;
    let code: number | null = null;
    try {
      const r = await fetch(m.url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
      up = r.ok;
      code = r.status;
    } catch {
      up = false;
    }
    const changed = m.lastStatus !== null && m.lastStatus !== up;
    await d.ref.update({ lastStatus: up, lastCheckedAt: new Date(), lastCode: code });
    if (changed && resend && m.userEmail) {
      await resend.emails.send({
        from: "Vigie SaaS <onboarding@resend.dev>",
        to: m.userEmail,
        subject: `Vigie SaaS : ${m.name} est ${up ? "de nouveau en ligne" : "hors ligne"}`,
        text: `Ton SaaS ${m.name} (${m.url}) est ${up ? "de nouveau en ligne" : "hors ligne"}.`,
      });
    }
    results.push({ id: d.id, up, changed });
  }
  return NextResponse.json({ checked: results.length, results });
}
