// Battement de cœur du contrôle automatique : /api/cron/check l'écrit à chaque passage, /api/health le relit.
// Si le serveur répond mais que plus personne n'appelle le contrôle (cron arrêté), le surveillant extérieur le voit.
import { Timestamp, type Firestore } from "firebase-admin/firestore";

export const CRON_STALE_MIN = 20;

const doc = (db: Firestore) => db.collection("system").doc("heartbeat");

export async function beatCron(db: Firestore, now: Date): Promise<void> {
  await doc(db).set({ lastCronAt: Timestamp.fromDate(now) }, { merge: true });
}

/** Âge en minutes du dernier passage du contrôle ; null si jamais enregistré. */
export function cronAgeMin(lastMs: number | null, nowMs: number): number | null {
  return lastMs === null ? null : Math.max(0, Math.round((nowMs - lastMs) / 60_000));
}

export function cronStale(ageMin: number | null): boolean {
  return ageMin !== null && ageMin > CRON_STALE_MIN;
}

export async function readCronAge(db: Firestore, now: Date): Promise<number | null> {
  const snap = await doc(db).get();
  const last = (snap.data()?.lastCronAt as Timestamp | undefined)?.toMillis?.() ?? null;
  return cronAgeMin(last, now.getTime());
}
