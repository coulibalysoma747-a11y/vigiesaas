// src/lib/firebase-admin.ts
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function adminApp(): App {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant");
  const cred = JSON.parse(raw);
  return initializeApp({ credential: cert(cred) });
}

export function adminDb() {
  return getFirestore(adminApp());
}
