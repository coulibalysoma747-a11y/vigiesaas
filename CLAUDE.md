# Vigie SaaS : notes pour l'assistant

Projet : surveillance de sites par e-mail + brocante de projets abandonnés (Next.js 16, Firebase Auth + Firestore, Resend, Render, GitHub Actions).
Lire `AGENTS.md` : cette version de Next.js a des changements majeurs, lire `node_modules/next/dist/docs/` avant d'écrire du code.
Le propriétaire n'est pas développeur : répondre en français, simplement, UN geste à la fois, et faire le travail soi-même.

## Règles
- Ne jamais écrire une clé ou un mot de passe dans le code, un message ou un commit. Le dépôt GitHub est PUBLIC.
  `.env*`, `sa.json` et `sa-minified.txt` sont ignorés par git. Ne pas lire ces fichiers, ne jamais afficher une valeur secrète.
- Avant de dire « terminé », lancer et montrer : `npx tsc --noEmit`, `npx eslint src`, `node --test scripts/test-monitoring.mts`, `npm run build`.
- Mise en ligne : Render (`render.yaml`). Dépôt de travail : `coulibalysoma747-a11y/vigiesaas` (PAS `ecosouf7-dot/vigiesaas`, qui est vide).
- Un autre outil commite et pousse parfois à la place du propriétaire : relire `git status` avant d'écrire.
- Le contrôle automatique passe par `/api/cron/check` (fermé tant que `CRON_SECRET` n'est pas réglé sur le serveur).
- Connexion : Google uniquement (décision du propriétaire, 2026-10-31). Ne pas remettre de formulaire e-mail / mot de passe.
- Surveillant extérieur : `scripts/watchdog.mjs` + `.github/workflows/watchdog.yml` lisent `/api/health` (battement de cœur écrit par `/api/cron/check` dans `system/heartbeat`) et ouvrent / ferment une issue GitHub étiquetée `vigie-panne`. Mode vigilance : `vigilance` sur le site, intervalle 1 min (`effectiveInterval`), rappel 30 min (`reminderDue`, alerte `down_again`).
- Robot de connexion : `robot/run.mjs` (Playwright, lancé par `.github/workflows/robot.yml`) lit `/api/robot/jobs` et répond à `/api/robot/report` (tous deux fermés sans `ROBOT_SECRET`). Les mots de passe de test sont chiffrés dans `robotSecrets/{monitorId}` (clé `ROBOT_ENC_KEY`), jamais renvoyés au navigateur ni écrits dans les journaux (le dépôt est public). Le robot ne clique jamais (hors connexion) et ne se déconnecte jamais : ne pas assouplir. Essai local : faux site + `ROBOT_ALLOW_PRIVATE=1` + `ROBOT_BROWSER_PATH` (Edge), dans une copie hors du dépôt.

## État au 2026-10-30
Fait : design clair (maquettes Stitch), historique sur 30 jours, incidents, réglages, moteur de contrôle sécurisé (adresses privées refusées, 20 sites maximum par compte, alertes seulement vers l'adresse vérifiée du compte), correctif Render (`npm install --include=dev`, Node 22), règles Firestore dans `firestore.rules`. Le site est en ligne sur https://vigiesaas.onrender.com.

Reste à faire (voir `README.md`) :
1. Dans Render : les 6 variables `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT` (JSON sur une ligne) et `CRON_SECRET`, puis « Clear build cache & deploy » (les clés `NEXT_PUBLIC_*` sont intégrées à la construction).
2. Le secret GitHub `CRON_SECRET` doit avoir exactement la même valeur que dans Render.
3. Publier `firestore.rules` dans la console Firebase.
4. Vérifier : `GET /api/cron/check` avec un faux mot de passe doit répondre 401 (503 = pas configuré) ; tester « Vérifier maintenant » dans la page d'un site ; supprimer `sa.json` et `sa-minified.txt` du dossier.
5. Facultatif : `RESEND_API_KEY` et un domaine vérifié chez Resend (sinon les alertes n'arrivent qu'au propriétaire du compte Resend).
