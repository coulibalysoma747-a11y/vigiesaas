import { NextResponse } from "next/server";
import { extractLinks } from "@/lib/monitoring";
import { fetchText } from "@/lib/safe-fetch";
import { allowOnce, fail, ownMonitor, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Propose les pages importantes d'un de SES sites (connexion, paiement…), lues dans les liens de sa page d'accueil. Une fois toutes les 10 secondes au plus. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const mine = await ownMonitor(id, caller.uid);
  if (!mine) return fail("Site introuvable.", 404);
  if (!(await allowOnce(`discover-${caller.uid}`, 10))) return fail("Patiente quelques secondes avant une nouvelle recherche.", 429);

  const page = await fetchText(mine.data.url);
  if (!page) return fail("Impossible de lire la page d'accueil du site pour en proposer les pages.", 502);

  const known = new Set((mine.data.features ?? []).map((f) => f.path));
  const suggestions = extractLinks(page.text, page.finalUrl, 20).filter((s) => !known.has(s.path)).slice(0, 12);
  return NextResponse.json({ suggestions });
}
