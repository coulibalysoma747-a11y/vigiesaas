import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { dispatchRobot } from "@/lib/github-dispatch";
import { allowOnce, fail, ownMonitor, requireCaller } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * « Lancer le robot maintenant » : le site passe en tête de file pour le prochain passage du robot, et GitHub est prié de le lancer tout de suite.
 * `dispatched` vaut faux si GitHub n'est pas joignable ou pas configuré : la demande reste notée et le prochain déclencheur (5 minutes au plus) la prend.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireCaller(req);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const mine = await ownMonitor(id, caller.uid);
  if (!mine) return fail("Site introuvable.", 404);
  if (mine.data.robot?.enabled !== true) return fail("Active d'abord le robot de connexion de ce site.", 409);
  if (!(await allowOnce(`robot-run-${id}`, 30)) || !(await allowOnce(`robot-dispatch-${caller.uid}`, 10))) {
    return fail("Patiente quelques secondes avant de relancer le robot.", 429);
  }

  await mine.ref.update({ "robot.runRequestedAt": Timestamp.now(), "robot.leaseUntil": null });
  const dispatched = await dispatchRobot();
  return NextResponse.json({ ok: true, dispatched });
}
