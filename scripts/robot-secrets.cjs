// Prépare les deux secrets du robot de connexion SANS jamais les afficher (le dépôt est public) :
//  - ROBOT_SECRET (mot de passe du robot) : enregistré directement dans les secrets GitHub du dépôt ;
//  - ROBOT_SECRET puis ROBOT_ENC_KEY (clé de chiffrement) : copiés dans le presse-papiers UN PAR UN, à coller dans Render > Environment > « Add variable ».
// Usage : node scripts/robot-secrets.cjs
const { randomBytes } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const readline = require("node:readline");

const REPO = "coulibalysoma747-a11y/vigiesaas";
const robotSecret = randomBytes(32).toString("hex");
const encKey = randomBytes(32).toString("hex"); // 64 caractères hexadécimaux = 32 octets (AES-256)

if (process.env.ROBOT_DRY_RUN === "1") {
  console.log(`Essai à blanc : ROBOT_SECRET ${robotSecret.length} caractères, ROBOT_ENC_KEY ${encKey.length} caractères. Rien n'a été enregistré ni copié.`);
  process.exit(0);
}

function copy(text) {
  const r = process.platform === "win32" ? spawnSync("clip", { input: text }) : spawnSync("pbcopy", { input: text });
  return !r.error && r.status === 0;
}

function waitEnter(rl, message) {
  return new Promise((resolve) => rl.question(message, () => resolve()));
}

async function main() {
  const gh = spawnSync("gh", ["secret", "set", "ROBOT_SECRET", "--repo", REPO], { input: robotSecret, encoding: "utf8" });
  if (gh.error || gh.status !== 0) {
    console.error("Le secret GitHub n'a pas pu être enregistré (gh est-il connecté ? essaie « gh auth status »).");
    console.error(String(gh.stderr || gh.error?.message || "").split(robotSecret).join("***").trim());
    process.exit(1);
  }
  console.log("OK : ROBOT_SECRET est enregistré dans GitHub.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const steps = [
    ["ROBOT_SECRET", robotSecret],
    ["ROBOT_ENC_KEY", encKey],
  ];
  for (const [index, [name, value]] of steps.entries()) {
    if (!copy(value)) {
      console.error("Impossible de copier dans le presse-papiers. Réessaie.");
      rl.close();
      process.exit(1);
    }
    console.log(`Étape ${index + 1}/2 : la valeur de ${name} est dans ton presse-papiers.`);
    console.log(`  Render > Environment > « Add variable » > Key : ${name} > Value : Ctrl+V > « Save ».`);
    await waitEnter(rl, "  Quand c'est fait, appuie sur Entrée ici... ");
    console.log("");
  }
  copy(""); // vide le presse-papiers : plus aucun secret dedans
  rl.close();
  console.log("Terminé. Le presse-papiers est vidé. Dans Render, lance « Manual Deploy > Deploy latest commit » si le site ne redémarre pas tout seul.");
}

main();
