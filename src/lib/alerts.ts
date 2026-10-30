// E-mails d'alerte. Serveur seulement.
import { Resend } from "resend";
import { formatDuration } from "@/lib/monitoring";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function appUrl(): string {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
}

type AlertInput = {
  kind: "down" | "up" | "test";
  name: string;
  url: string;
  monitorId?: string;
  reason?: string | null;
  downSeconds?: number | null;
  at: Date;
};

const when = (d: Date) => d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }) + " (UTC)";

export function buildAlert(input: AlertInput): { subject: string; text: string; html: string } {
  // Le nom est saisi par l'utilisateur : retours à la ligne et caractères de contrôle retirés (sujet de l'e-mail).
  const a = { ...input, name: input.name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim() };
  const link = appUrl() ? `${appUrl()}${a.monitorId ? `/tableau-de-bord/${a.monitorId}` : "/tableau-de-bord"}` : "";
  const down = a.kind === "down";
  const test = a.kind === "test";
  const title = test ? "E-mail de test" : down ? `${a.name} est hors ligne` : `${a.name} est de nouveau en ligne`;
  const lines = test
    ? ["Tout fonctionne : tu recevras ce type de message quand un de tes sites tombe, puis quand il revient en ligne."]
    : [
        `Ton site ${a.name} (${a.url}) est ${down ? "hors ligne" : "de nouveau en ligne"}.`,
        down && a.reason ? `Cause constatée : ${a.reason}.` : "",
        !down && a.downSeconds != null ? `Durée de l'interruption : ${formatDuration(a.downSeconds)}.` : "",
        `Constaté le ${when(a.at)}.`,
      ].filter(Boolean);
  const color = test ? "#4f46e5" : down ? "#ef4444" : "#10b981";
  const text = `${lines.join("\n")}${link ? `\n\nVoir le détail : ${link}` : ""}\n\n— Vigie SaaS`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#faf8ff;font-family:Inter,Arial,sans-serif;color:#131b2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;box-shadow:0 1px 8px rgba(0,0,0,.06)" cellpadding="0" cellspacing="0">
<tr><td style="height:6px;background:${color};border-radius:12px 12px 0 0"></td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${color}">${test ? "Test" : down ? "Panne détectée" : "Retour en ligne"}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#464555">${escapeHtml(l)}</p>`).join("")}
${link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">Voir le détail</a></p>` : ""}
</td></tr>
<tr><td style="padding:0 24px 20px;font-size:12px;color:#64748b">Tu reçois ce message parce que ce site est surveillé par Vigie SaaS. Tu peux couper les alertes dans les réglages.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: test ? "Vigie SaaS : e-mail de test" : `Vigie SaaS : ${a.name} est ${down ? "hors ligne" : "de nouveau en ligne"}`, text, html };
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
