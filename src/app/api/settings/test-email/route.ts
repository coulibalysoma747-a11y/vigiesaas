import { NextResponse } from "next/server";
import { mailer, sendAlert } from "@/lib/alerts";
import { allowOnce, fail, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Envoie un e-mail de test à l'adresse VÉRIFIÉE du compte (jamais à une autre adresse), une fois par minute au plus. */
export async function POST(req: Request) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;
  if (!caller.email) return fail("Ton compte n'a pas d'adresse e-mail.", 400);
  if (!caller.emailVerified) return fail("Vérifie d'abord ton adresse e-mail : clique sur le lien reçu à l'inscription.", 403);
  const resend = mailer();
  if (!resend) return fail("L'envoi d'e-mails n'est pas encore configuré sur ce serveur.", 503);
  if (!(await allowOnce(`test-email-${caller.uid}`, 60))) return fail("Patiente une minute avant un nouvel e-mail de test.", 429);

  try {
    await sendAlert(resend, caller.email, { kind: "test", name: "Test", url: "", at: new Date() });
  } catch (e) {
    console.error("e-mail de test non envoyé :", e instanceof Error ? e.message : e);
    return fail("L'e-mail n'a pas pu être envoyé. Le service d'envoi n'accepte peut-être pas encore cette adresse (domaine à vérifier chez Resend).", 502);
  }
  return NextResponse.json({ ok: true, to: caller.email });
}
