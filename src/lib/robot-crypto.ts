// Coffre à mots de passe des comptes de test du robot : AES-256-GCM. Serveur seulement.
// La clé (ROBOT_ENC_KEY, 64 caractères hexadécimaux) n'est JAMAIS dans la base : sans elle, les mots de passe enregistrés sont illisibles.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const hex = process.env.ROBOT_ENC_KEY;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error("ROBOT_ENC_KEY manquante ou invalide");
  return Buffer.from(hex, "hex");
}

export const vaultReady = () => /^[0-9a-f]{64}$/i.test(process.env.ROBOT_ENC_KEY ?? "");

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

/** Déchiffre ; lève une erreur si le texte a été modifié ou si la clé n'est plus la bonne (GCM authentifie le contenu). */
export function decryptSecret(blob: string): string {
  const [version, iv, tag, data] = blob.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("format inconnu");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
