/** Adresse prête à être ouverte : ajoute https:// si besoin, et refuse tout ce qui n'est pas http(s) (ex. javascript:). */
export function safeHref(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** « https://www.exemple.com/page » devient « exemple.com ». */
export function hostOf(input: string): string {
  const href = safeHref(input);
  if (!href) return input;
  return new URL(href).hostname.replace(/^www\./, "");
}

/** « il y a 3 min », « il y a 2 h »… */
export function ago(date: Date, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 45) return "à l'instant";
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
