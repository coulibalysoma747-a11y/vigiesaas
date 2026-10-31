// Réveille le robot de connexion tout de suite (« Lancer le robot maintenant ») en demandant à GitHub de lancer le workflow robot.yml.
// Sans GITHUB_DISPATCH_TOKEN, rien n'est lancé : la demande reste notée et le prochain déclenchement de cron-job.org la prend (5 minutes au plus).
const WORKFLOW = "robot.yml";

/** Renvoie vrai si GitHub a bien accepté de lancer le robot. Ne lève jamais d'erreur et ne révèle jamais le jeton. */
export async function dispatchRobot(): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO || "coulibalysoma747-a11y/vigiesaas";
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        "user-agent": "vigie-saas",
      },
      body: JSON.stringify({ ref: "main" }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}
