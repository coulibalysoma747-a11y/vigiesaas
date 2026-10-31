import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { cronStale, readCronAge } from "@/lib/heartbeat";

export const dynamic = "force-dynamic";

// Réponse gardée 20 s en mémoire : cette route est publique, elle ne doit pas pouvoir épuiser les lectures gratuites de la base.
let cached: { at: number; status: number; body: { ok: boolean; cronAgeMin: number | null; cronStale: boolean } } | null = null;

/** Point de santé pour le surveillant extérieur (GitHub). 200 = le serveur ET la base répondent ; `cronStale` = le contrôle automatique ne tourne plus. */
export async function GET() {
  const now = Date.now();
  if (cached && now - cached.at < 20_000) return NextResponse.json(cached.body, { status: cached.status, headers: { "cache-control": "no-store" } });
  let status = 200;
  let body = { ok: true, cronAgeMin: null as number | null, cronStale: false };
  try {
    const age = await Promise.race([readCronAge(adminDb(), new Date(now)), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("délai")), 8000))]);
    body = { ok: true, cronAgeMin: age, cronStale: cronStale(age) };
  } catch {
    status = 503;
    body = { ok: false, cronAgeMin: null, cronStale: false };
  }
  cached = { at: now, status, body };
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
