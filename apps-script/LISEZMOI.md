# Installer la réservation en ligne – Coiffure Étoile

Comptez **20 minutes**. Il faut seulement un compte Google (Gmail) au nom du salon. C'est gratuit et sans commission. Les rendez-vous arrivent dans l'agenda Google du salon.

---

## Ce que fait le système

- Les clientes choisissent une prestation, un jour et une heure sur le site.
- Les créneaux sont lus **en direct** dans votre agenda Google. Tout ce que vous y notez à la main, par exemple un rendez-vous pris par téléphone, bloque le créneau.
- La cliente reçoit un e-mail et doit **cliquer pour confirmer dans les 30 minutes**. Sans confirmation, le créneau se libère tout seul.
- Elle reçoit un **rappel la veille**, et chaque e-mail contient un lien **« Annuler ou déplacer »**.
- Une même cliente ne peut pas avoir plus de **2 rendez-vous à venir**, et les robots sont filtrés.

Dans votre agenda, vous verrez :
- `⏳ À confirmer – Coupe femme – Prénom Nom` : la cliente n'a pas encore cliqué ;
- `✅ Coupe femme – Prénom Nom` : le rendez-vous est confirmé.

---

## Étape 1 – Créer le script

1. Connectez-vous au compte Google du salon.
2. Allez sur **script.google.com**, puis cliquez sur **Nouveau projet**.
3. En haut à gauche, renommez le projet en « Réservation Coiffure Étoile ».
4. Effacez tout le texte du fichier `Code.gs`, puis collez le contenu du fichier **`Code.gs`** fourni.
5. Cliquez sur l'icône ⚙️ **Paramètres du projet** et cochez **« Afficher le fichier manifeste appsscript.json »**.
6. Revenez à l'éditeur (icône `< >`), ouvrez `appsscript.json` et remplacez son contenu par celui du fichier **`appsscript.json`** fourni.
7. Cliquez sur 💾 **Enregistrer**.

## Étape 2 – Lancer l'installation

1. En haut, dans la liste des fonctions, choisissez **`setup`**, puis cliquez sur **▶ Exécuter**.
2. Google demande l'autorisation. Cliquez sur **Examiner les autorisations**, choisissez le compte du salon, puis **Paramètres avancés** et **Accéder à Réservation Coiffure Étoile**, et enfin **Autoriser**.
   *Le message « Google n'a pas validé cette application » est normal : c'est votre propre script.*
3. Le journal en bas doit afficher : `Installation terminée : 1 agenda(s) vérifié(s), 2 tâches automatiques créées.`

## Étape 3 – Mettre le service en ligne

1. Cliquez sur **Déployer**, puis **Nouveau déploiement**.
2. Cliquez sur ⚙️ à côté de « Sélectionner le type » et choisissez **Application Web**.
3. Remplissez ainsi :
   - Description : `Réservation site`
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
4. Cliquez sur **Déployer**, puis copiez l'**URL de l'application Web**. Elle commence par `https://script.google.com/macros/s/…/exec`.

## Étape 4 – Brancher le site

Envoyez cette URL à Site&Go. Nous la collons dans `data.py` (`booking_script_url`) et nous régénérons le site. Le bandeau « Mode démonstration » disparaît alors.

**Test :** réservez un créneau sur le site avec votre propre e-mail, confirmez-le, vérifiez qu'il apparaît dans l'agenda, puis annulez-le avec le lien reçu.

---

## Au quotidien

| Je veux… | Je fais… |
|---|---|
| Bloquer une journée (congé, fermeture) | Je crée un événement **« journée entière »** nommé `Congé`, `Fermé` ou `Vacances`. |
| Bloquer quelques heures | Je crée un événement nommé `Fermé` (ou n'importe quel événement) sur la plage concernée. |
| Noter un rendez-vous pris par téléphone | Je l'ajoute dans l'agenda comme d'habitude : le créneau disparaît du site. |
| Annuler un rendez-vous moi-même | Je supprime l'événement dans l'agenda. Pensez à prévenir la cliente. |

Un événement « journée entière » qui ne s'appelle pas Congé, Fermé ou Vacances (un anniversaire, par exemple) **ne bloque pas** la journée.

## Plusieurs coiffeuses

Chaque coiffeuse peut avoir son propre agenda Google, partagé avec le compte du salon en « Apporter des modifications ». Envoyez à Site&Go son prénom, ses jours de travail et l'**ID de son agenda** : dans Google Agenda, menu ⋮ de l'agenda, puis **Paramètres et partage** et **Intégrer l'agenda**. La cliente pourra alors choisir sa coiffeuse, ou « Peu importe ».

## Réglages possibles (en haut de `Code.gs`, bloc `SETTINGS`)

- `HOLD_MINUTES` : délai pour confirmer (30 min).
- `MIN_NOTICE_MINUTES` : délai minimum avant un rendez-vous (60 min).
- `MAX_UPCOMING_PER_CLIENT` : nombre de rendez-vous à venir par cliente (2).
- `OWNER_EMAIL` : votre adresse, si vous voulez recevoir une copie de chaque rendez-vous confirmé.

**Après toute modification de `Code.gs` :** cliquez sur **Déployer**, puis **Gérer les déploiements**. Cliquez sur ✏️, choisissez **Version : Nouvelle version**, puis **Déployer**. L'URL ne change pas.

## Limites à connaître

- Un compte Gmail gratuit peut envoyer environ **100 e-mails par jour**, soit environ 30 rendez-vous par jour (confirmation, récapitulatif et rappel). Au-delà, un compte Google Workspace est nécessaire.
- Les durées des prestations (45 min pour une coupe femme, 30 min pour un brushing) sont **provisoires** : indiquez-nous les vraies durées.
