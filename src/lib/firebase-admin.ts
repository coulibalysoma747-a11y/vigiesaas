// src/lib/firebase-admin.ts : accès serveur à Firebase (ne jamais importer depuis un composant client)
import { initializeApp, getApps, cert, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/** Lit la clé du compte de service, même si l'interface d'hébergement l'a recopiée avec des guillemets autour ou des vrais retours à la ligne. */
function readServiceAccount(): ServiceAccount {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const raw = b64 ? Buffer.from(b64, "base64").toString("utf8") : process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant");
  const text = raw.trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(text.replace(/\r?\n/g, "\\n")); // retours à la ligne réels dans la clé privée : on les remet sous forme « \n »
  }
}

function adminApp(): App {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert(readServiceAccount()) });
}

export function adminDb() {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}
