# Vigie SaaS

Surveillance de sites par e-mail + brocante des projets SaaS abandonnés.

## Ce que fait l'application
- **Mes sites** : chaque site est contrôlé automatiquement (5, 10, 30 ou 60 minutes au choix). Temps de réponse mesuré, disponibilité sur 30 jours, barres d'historique, pause / reprise, « Vérifier maintenant ».
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
- GitHub Actions (déclencheur toutes les 5 minutes)

## Variables d'environnement
Voir `.env.local.example`. En plus : `ALERT_FROM` (facultatif, expéditeur des alertes). `APP_URL` n'est pas nécessaire sur Render (`RENDER_EXTERNAL_URL` est fourni).

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

L'offre gratuite de Render s'endort après 15 minutes sans visite ; le déclencheur toutes les 5 minutes la réveille.
