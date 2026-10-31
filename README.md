# Vigie SaaS

Surveillance de sites par e-mail + brocante des projets SaaS abandonnés.

## Ce que fait l'application
- **Mes sites** : chaque site est contrôlé automatiquement (5, 10, 30 ou 60 minutes au choix). Temps de réponse mesuré, disponibilité sur 30 jours, barres d'historique, pause / reprise, « Vérifier maintenant ».
- **Exploration automatique** (activée par défaut) : Vigie explore elle-même le site à partir de l'accueil (liens du même site, 2 niveaux, 20 pages au plus, refait toutes les 6 heures) et teste **chaque page découverte à chaque contrôle**. Une page qui marchait et ne répond plus déclenche un incident et UNE alerte groupée ; une page qui n'a jamais répondu est signalée comme « lien cassé » sans alerte ; une page qui demande une connexion (401/403) est marquée « protégée ». Aucune adresse à saisir. Limite : Vigie ne voit que ce qui est accessible sans se connecter.
- **Mode vigilance** (facultatif, 5 sites au plus par compte) : pour un site critique, contrôle **chaque minute** et e-mail de rappel toutes les 30 minutes tant que le site reste hors ligne. Le contrôle chaque minute exige que le déclencheur (cron-job.org) appelle `/api/cron/check` chaque minute ; GitHub, lui, ne descend pas sous 5 minutes.
- **Robot de connexion** (facultatif, site par site) : un vrai navigateur (Chromium, lancé par GitHub Actions) se connecte à l'application avec un **compte de test** créé par le propriétaire du site, puis visite jusqu'à 15 pages de l'intérieur (tableau de bord, paiements…) toutes les 5 minutes. Connexion impossible, page en erreur (500, délai dépassé, session perdue, page d'erreur affichée) : incident + UNE alerte groupée ; un lien cassé (404) est signalé sans alerte. Le robot ne clique sur aucun bouton (hors « se connecter »), ne se déconnecte jamais, ne tape les identifiants que sur le site surveillé et refuse les adresses privées. Le mot de passe de test est chiffré (AES-256-GCM) dans un coffre que le navigateur ne peut jamais lire. **Conseil : un compte de test sans droits importants et sans vraies données.**
- **Fonctionnalités d'un site** (jusqu'à 8 par site, 40 par compte) : connexion, paiement, une API… Chaque fonctionnalité est une adresse du MÊME site, contrôlée à part (code de réponse attendu et texte attendu facultatifs). Si une seule tombe, le site passe en **« Partiel »**, un incident s'ouvre et l'alerte part, même si la page d'accueil répond. Un bouton « Détecter les pages du site » propose les pages importantes à partir des liens de l'accueil.
- **Contrôles avancés** (facultatifs, site par site) :
  - **Contenu de la page** : un texte qui doit apparaître ; s'il manque (page vide, erreur), le site est déclaré hors ligne même s'il répond.
  - **Lenteur** : limite de 0,5 à 5 secondes ; alerte après 3 contrôles lents d'affilée, puis alerte de retour à la normale.
  - **Certificat SSL** (sites https) : contrôlé toutes les 12 heures ; alerte à 14 jours, à 3 jours, à l'expiration, ou si le cadenas est invalide.
- **Incidents** : chaque panne, lenteur ou problème de certificat avec son début, sa cause et sa durée.
- **Alertes e-mail** à chaque panne et à chaque retour en ligne (un second essai a lieu quelques secondes après un échec : une micro-coupure ne déclenche rien). Envoyées seulement à l'adresse **vérifiée** du compte.
- **Réglages** : alertes activées ou non, e-mail de test.
- **Brocante** : annonces de projets abandonnés (recherche, tri, filtres, contact direct du vendeur, retrait de ses propres annonces).

## Stack (gratuit)
- Next.js sur Render (offre gratuite)
- Firebase Auth + Firestore (offre Spark)
- Resend (e-mails)
- GitHub Actions (déclencheur toutes les 5 minutes + robot de connexion)

## Variables d'environnement
Voir `.env.local.example`. En plus : `ALERT_FROM` (facultatif, expéditeur des alertes). `APP_URL` n'est pas nécessaire sur Render (`RENDER_EXTERNAL_URL` est fourni).
Robot de connexion : `ROBOT_SECRET` (mot de passe du robot, même valeur sur Render ET dans le secret GitHub) et `ROBOT_ENC_KEY` (clé de chiffrement des mots de passe de test : 64 caractères hexadécimaux, **sur Render seulement**, jamais sur GitHub). Sans elles, le robot est simplement inactif.

## Démarrage local
1. Copier `.env.local.example` en `.env.local` et remplir les valeurs.
2. `npm install`
3. `npm run dev`
4. Tests de la logique : `node --test scripts/test-monitoring.mts`

## Règles Firestore (OBLIGATOIRE)
Coller le contenu du fichier [`firestore.rules`](firestore.rules) dans la console Firebase > Firestore > Règles, puis « Publier ».
Elles interdisent au navigateur d'écrire dans `monitors` et `incidents` : tout passe par le serveur, qui valide les adresses
(pas de réseau privé), limite à 20 sites par compte et envoie les alertes à l'adresse du compte, jamais ailleurs.
Sans ces règles, l'ancien comportement reste ouvert (un utilisateur pourrait écrire n'importe quoi dans la base).

## Mise en ligne sur Render
1. « New + » > « Blueprint » > choisir ce dépôt : Render lit `render.yaml` (commande de construction et version de Node déjà réglées).
2. Renseigner les variables marquées dans l'écran Render : clés Firebase (6 variables `NEXT_PUBLIC_…` + `FIREBASE_SERVICE_ACCOUNT`), `RESEND_API_KEY`, `CRON_SECRET` (une longue phrase au hasard).
3. Dans Firebase > Authentication > Paramètres > Domaines autorisés : ajouter le domaine Render (ex. `vigiesaas.onrender.com`).
4. Sur GitHub (Settings > Secrets > Actions) : `CRON_SECRET` (même valeur) et `APP_URL` (ex. `https://vigiesaas.onrender.com`). L'onglet Actions montre si le déclencheur réussit ; il réveille aussi le service gratuit.
5. **Alertes vers les utilisateurs** : sans domaine vérifié chez Resend, l'expéditeur de test (`onboarding@resend.dev`) n'écrit qu'au propriétaire du compte Resend. Vérifier un domaine, puis définir `ALERT_FROM`.

6. **Robot de connexion** : ajouter `ROBOT_SECRET` et `ROBOT_ENC_KEY` dans Render, le secret GitHub `ROBOT_SECRET` (même valeur que dans Render) ; `APP_URL` existe déjà. Le workflow `.github/workflows/robot.yml` se lance tout seul (onglet Actions > « Vigie robot » > « Run workflow » pour un essai immédiat). Les tâches programmées gratuites de GitHub peuvent démarrer avec quelques minutes de retard : c'est normal.
   Essai sur son ordinateur : `robot/run.mjs` accepte `ROBOT_ALLOW_PRIVATE=1` (adresses locales) et `ROBOT_BROWSER_PATH` (navigateur installé) ; ne jamais les définir sur GitHub.

7. **Surveillant extérieur de Vigie elle-même** : `.github/workflows/watchdog.yml` (rien à configurer en plus de `APP_URL`). Toutes les 5 minutes il interroge `/api/health` (le serveur ET la base répondent, et le contrôle automatique a tourné il y a moins de 20 minutes). Panne : une issue « 🔴 Vigie SaaS est en panne » est ouverte et assignée au propriétaire (e-mail GitHub), relancée chaque heure, puis fermée avec « retour à la normale » (second e-mail). Prérequis : les notifications GitHub par e-mail activées pour ce dépôt. Complément conseillé : dans cron-job.org, activer les notifications d'échec et de retour du job.
8. **Lancement officiel** : (a) acheter un domaine, le vérifier chez Resend (enregistrements SPF et DKIM donnés par Resend dans le DNS) puis définir `ALERT_FROM` dans Render : sans cela, les alertes n'arrivent qu'au propriétaire du compte Resend ; (b) compléter la section « Éditeur » de `src/app/mentions/page.tsx` ; (c) ajouter le domaine dans Firebase > Authentication > Domaines autorisés, et dans `APP_URL` (Render + GitHub) ; (d) désactiver le fournisseur « E-mail/Mot de passe » dans Firebase (connexion Google seule).

L'offre gratuite de Render s'endort après 15 minutes sans visite ; le déclencheur toutes les 5 minutes la réveille.
