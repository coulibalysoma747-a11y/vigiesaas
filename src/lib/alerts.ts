// E-mails d'alerte. Serveur seulement.
import { Resend } from "resend";
import { formatDuration } from "@/lib/monitoring";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function appUrl(): string {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
}

export type AlertKind = "down" | "up" | "slow" | "slow_ok" | "ssl" | "ssl_ok" | "feature_down" | "feature_up" | "test";

type AlertInput = {
  kind: AlertKind;
  name: string;
  url: string;
  monitorId?: string;
  /** Cause (panne), ou détail (lenteur, certificat). */
  reason?: string | null;
  downSeconds?: number | null;
  /** Pour « ssl » : vrai si c'est grave (expiré ou invalide), faux s'il s'agit d'un simple avertissement. */
  critical?: boolean;
  /** Pour « feature_down » et « feature_up » : la fonctionnalité concernée. */
  featureName?: string;
  featurePath?: string;
  at: Date;
};

const when = (d: Date) => d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " (UTC)";

const RED = "#ef4444";
const ORANGE = "#f59e0b";
const GREEN = "#10b981";
const INDIGO = "#4f46e5";

export function buildAlert(input: AlertInput): { subject: string; text: string; html: string } {
  // Le nom est saisi par l'utilisateur : retours à la ligne et caractères de contrôle retirés (sujet de l'e-mail).
  const a = { ...input, name: input.name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim() };
  const link = appUrl() ? `${appUrl()}${a.monitorId ? `/tableau-de-bord/${a.monitorId}` : "/tableau-de-bord"}` : "";
  const site = `Ton site ${a.name} (${a.url})`;

  let subject: string;
  let eyebrow: string;
  let title: string;
  let color: string;
  let lines: string[];

  switch (a.kind) {
    case "test":
      subject = "Vigie SaaS : e-mail de test";
      eyebrow = "Test";
      title = "E-mail de test";
      color = INDIGO;
      lines = ["Tout fonctionne : tu recevras ce type de message quand un de tes sites tombe, devient lent, ou quand son certificat SSL approche de l'expiration."];
      break;
    case "down":
      subject = `Vigie SaaS : ${a.name} est hors ligne`;
      eyebrow = "Panne détectée";
      title = `${a.name} est hors ligne`;
      color = RED;
      lines = [`${site} est hors ligne.`, a.reason ? `Cause constatée : ${a.reason}.` : ""];
      break;
    case "up":
      subject = `Vigie SaaS : ${a.name} est de nouveau en ligne`;
      eyebrow = "Retour en ligne";
      title = `${a.name} est de nouveau en ligne`;
      color = GREEN;
      lines = [`${site} est de nouveau en ligne.`, a.downSeconds != null ? `Durée de l'interruption : ${formatDuration(a.downSeconds)}.` : ""];
      break;
    case "slow":
      subject = `Vigie SaaS : ${a.name} est lent`;
      eyebrow = "Site lent";
      title = `${a.name} est lent`;
      color = ORANGE;
      lines = [`${site} répond plus lentement que la limite que tu as fixée.`, a.reason ? `${a.reason}.` : "", "Il a dépassé cette limite plusieurs contrôles de suite."];
      break;
    case "slow_ok":
      subject = `Vigie SaaS : ${a.name} retrouve une vitesse normale`;
      eyebrow = "Vitesse normale";
      title = `${a.name} retrouve une vitesse normale`;
      color = GREEN;
      lines = [`${site} répond de nouveau sous ta limite de lenteur.`, a.downSeconds != null ? `Durée de la lenteur : ${formatDuration(a.downSeconds)}.` : ""];
      break;
    case "ssl":
      subject = `Vigie SaaS : certificat SSL de ${a.name}`;
      eyebrow = a.critical ? "Certificat SSL : urgent" : "Certificat SSL : à renouveler";
      title = a.reason ?? "Problème de certificat SSL";
      color = a.critical ? RED : ORANGE;
      lines = [`${site} : ${a.reason ?? "problème de certificat SSL"}.`, "Un certificat expiré ou invalide affiche un avertissement de sécurité à tous tes visiteurs. Renouvelle-le chez ton hébergeur."];
      break;
    case "feature_down": {
      const feature = (a.featureName ?? "Une fonctionnalité").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
      subject = `Vigie SaaS : ${feature} est en panne sur ${a.name}`;
      eyebrow = "Fonctionnalité en panne";
      title = `${feature} ne fonctionne plus sur ${a.name}`;
      color = RED;
      lines = [
        `${site} : la fonctionnalité « ${feature} »${a.featurePath ? ` (${a.featurePath})` : ""} ne fonctionne plus.`,
        a.reason ? `Cause constatée : ${a.reason}.` : "",
        "Le reste du site peut continuer à répondre : sans cette alerte, la panne passerait inaperçue.",
      ];
      break;
    }
    case "feature_up": {
      const feature = (a.featureName ?? "Une fonctionnalité").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
      subject = `Vigie SaaS : ${feature} refonctionne sur ${a.name}`;
      eyebrow = "Fonctionnalité rétablie";
      title = `${feature} refonctionne sur ${a.name}`;
      color = GREEN;
      lines = [`${site} : la fonctionnalité « ${feature} » est de nouveau opérationnelle.`, a.downSeconds != null ? `Durée de la panne : ${formatDuration(a.downSeconds)}.` : ""];
      break;
    }
    case "ssl_ok":
      subject = `Vigie SaaS : certificat SSL de ${a.name} en règle`;
      eyebrow = "Certificat SSL en règle";
      title = `Le certificat SSL de ${a.name} est de nouveau en règle`;
      color = GREEN;
      lines = [`${site} : le certificat SSL est valide.`, a.reason ? `${a.reason}.` : ""];
      break;
  }
  lines = lines.filter(Boolean);
  lines.push(`Constaté le ${when(a.at)}.`);

  const text = `${lines.join("\n")}${link ? `\n\nVoir le détail : ${link}` : ""}\n\n— Vigie SaaS`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#faf8ff;font-family:Inter,Arial,sans-serif;color:#131b2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;box-shadow:0 1px 8px rgba(0,0,0,.06)" cellpadding="0" cellspacing="0">
<tr><td style="height:6px;background:${color};border-radius:12px 12px 0 0"></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${color}">${escapeHtml(eyebrow)}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#464555">${escapeHtml(l)}</p>`).join("")}
${link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Voir le détail</a></p>` : ""}
</td></tr>
<tr><td style="padding:0 24px 20px;font-size:12px;color:#64748b">Tu reçois ce message parce que ce site est surveillé par Vigie SaaS. Tu peux couper les alertes dans les réglages.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export function mailer(): Resend | null {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

export async function sendAlert(resend: Resend, to: string, a: AlertInput): Promise<void> {
  const mail = buildAlert(a);
  const { error } = await resend.emails.send({
    from: process.env.ALERT_FROM || "Vigie SaaS <onboarding@resend.dev>",
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  if (error) throw new Error(error.message);
}
