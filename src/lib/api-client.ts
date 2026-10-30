import { auth } from "@/lib/firebase";

/** Appelle une route /api de Vigie en envoyant le jeton de connexion. Lève une erreur avec le message à afficher. */
export async function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Connexion requise.");
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error("Impossible de joindre le serveur. Vérifie ta connexion.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Une erreur est survenue.");
  return data as T;
}
