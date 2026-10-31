// Identification de l'appelant des routes /api (jeton Firebase envoyé par le navigateur). Serveur seulement.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export type Caller = { uid: string; email: string | null; emailVerified: boolean };

export function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** Renvoie l'appelant, ou directement la réponse d'erreur 401 à renvoyer au navigateur. */
export async function requireCaller(req: Request): Promise<Caller | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return fail("Connexion requise.", 401);
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? null, emailVerified: decoded.email_verified === true };
  } catch {
    return fail("Session expirée : reconnecte-toi.", 401);
  }
}

/**
 * Protège une route réservée à une machine (le robot) par un mot de passe partagé, lu dans la variable d'environnement `envName`.
 * Sans cette variable sur le serveur, la route reste FERMÉE (503), jamais ouverte à tout le monde. Renvoie null si l'appel est autorisé.
 */
export function guardSecret(req: Request, envName: string): NextResponse | null {
  const secret = process.env[envName];
  if (!secret) return fail(`${envName} non configuré sur le serveur.`, 503);
  const given = createHash("sha256").update(req.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected) ? null : fail("unauthorized", 401);
}

/** Charge un site SEULEMENT s'il appartient à l'appelant (sinon « introuvable », jamais « interdit », pour ne rien révéler). */
export async function ownMonitor(id: string, uid: string) {
  const ref = adminDb().collection("monitors").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== uid) return null;
  return { ref, data: snap.data() as import("@/lib/check-monitor").MonitorDoc };
}

/** Limite de fréquence : au plus une fois par `seconds` pour une clé donnée. Renvoie vrai si c'est permis. */
export async function allowOnce(key: string, seconds: number): Promise<boolean> {
  const ref = adminDb().collection("ratelimits").doc(key);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = snap.data()?.at as number | undefined;
    const now = Date.now();
    if (last && now - last < seconds * 1000) return false;
    tx.set(ref, { at: now });
    return true;
  });
}
