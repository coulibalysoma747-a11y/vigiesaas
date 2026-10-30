import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { mailer } from "@/lib/alerts";
import { checkMonitor, makeRecipientResolver, type MonitorDoc } from "@/lib/check-monitor";
import { adminDb } from "@/lib/firebase-admin";
import { isDue, MAX_MONITORS_PER_USER, normalizeInterval } from "@/lib/monitoring";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 10;
const MAX_MONITORS_PER_RUN = 1000;

const digest = (s: string) => createHash("sha256").update(s).digest();

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

/** Appelée toutes les 5 minutes par GitHub Actions. Sans CRON_SECRET configuré, la route reste FERMÉE (jamais ouverte à tout le monde). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET non configuré sur le serveur." }, { status: 503 });
  const given = req.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const started = Date.now();
  const db = adminDb();
  const ctx = { db, resend: mailer(), recipient: makeRecipientResolver(db), now: new Date() };

  const snap = await db.collection("monitors").where("isActive", "==", true).limit(MAX_MONITORS_PER_RUN).get();
  const perUser = new Map<string, number>();
  const due: { ref: FirebaseFirestore.DocumentReference; data: MonitorDoc }[] = [];
  for (const d of snap.docs) {
    const data = d.data() as MonitorDoc;
    if (typeof data.userId !== "string" || typeof data.url !== "string") continue;
    const count = (perUser.get(data.userId) ?? 0) + 1;
    perUser.set(data.userId, count);
    if (count > MAX_MONITORS_PER_USER) continue; // au-delà de la limite, même si la base a été remplie à la main
    const last = data.lastCheckedAt?.toMillis?.() ?? null;
    if (isDue(last, normalizeInterval(data.intervalMin), ctx.now.getTime())) due.push({ ref: d.ref, data });
  }

  let down = 0;
  let changed = 0;
  let alerted = 0;
  let errors = 0;
  await pool(due, CONCURRENCY, async ({ ref, data }) => {
    try {
      const out = await checkMonitor(ref, { ...data, name: data.name || data.url }, ctx);
      if (!out.result.up) down += 1;
      if (out.change !== "none") changed += 1;
      if (out.alerted) alerted += 1;
    } catch (e) {
      errors += 1;
      console.error("contrôle en erreur :", ref.id, e instanceof Error ? e.message : e);
    }
  });

  return NextResponse.json({ monitors: snap.size, checked: due.length, down, changed, alerted, errors, ms: Date.now() - started });
}
