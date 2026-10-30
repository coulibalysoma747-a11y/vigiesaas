# Vigie SaaS

Surveillance de SaaS par email + brocante des projets abandonnés.

## Stack (100 % gratuit)
- Next.js (Vercel)
- Firebase Auth + Firestore (plan Spark)
- Resend (emails)
- GitHub Actions (cron toutes les 5 min)

## Démarrage local
1. Copier `.env.local.example` en `.env.local` et remplir les clés Firebase/Resend.
2. `npm install`
3. `npm run dev`

## Règles Firestore (à coller dans la console Firebase > Firestore > Règles)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /monitors/{id} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    match /abandoned_saas/{id} {
      allow read: if true;
      allow create: if request.auth != null;
    }
  }
}
```

## Déploiement
- Vercel : importer le repo, ajouter les variables d'environnement.
- GitHub Actions : ajouter les secrets `CRON_SECRET` et `APP_URL` (URL Vercel).


## Déploiement sur Render (gratuit)
1. Créer un compte Render (gratuit).
2. « New + » → « Web Service » → connecter ton repo GitHub.
3. Render détecte Next.js automatiquement. Laisser les valeurs par défaut (Build: `npm run build`, Start: `npm start`).
4. Dans « Environment », ajouter toutes les variables de `.env.local` (Firebase, Resend, CRON_SECRET).
5. Plan : choisir « Free » (le service s'endort après 15 min d'inactivité, mais se réveille à la prochaine visite).
6. GitHub Actions : ajouter les secrets `CRON_SECRET` et `APP_URL` (= URL Render, ex. https://vigiesaas.onrender.com). Le cron réveille aussi le service toutes les 5 min.

Note : le plan gratuit Render est suffisant pour tester. Pour un service toujours actif, il faudra un plan payant plus tard.

