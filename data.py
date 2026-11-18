"""Données du site Coiffure Étoile – Cluses.

C'est le SEUL fichier à modifier pour mettre à jour le contenu.
Toute valeur None ou TODO s'affiche sur le site comme « À COMPLÉTER ».
Sources : voir recherche-sources.md (fiche Fresha lue le 18/11/2026).
"""

TODO = None  # information à demander au salon

SITE = {
    # Domaine pas encore acheté : à remplacer avant la mise en ligne.
    "base_url": "https://www.coiffure-etoile-cluses.fr",
    "domain_is_placeholder": True,
    # URL de l'application Apps Script (voir apps-script/LISEZMOI.md).
    # Laisser vide = mode démonstration.
    "booking_script_url": "",
}

SALON = {
    "name": "Coiffure Étoile",
    "legal_name": TODO,
    "city": "Cluses",
    "department": "Haute-Savoie",
    "department_code": "74",
    "postal_code": "74300",
    # Fresha (actuel) : 4 Grande Rue. Annuaires plus anciens : 7 bis rue Claude Hugard.
    "street": "4 Grande Rue",
    "address_to_confirm": "Adresse à confirmer : d'autres annuaires indiquent le 7 bis rue Claude Hugard.",
    "lat": 46.0586347,
    "lng": 6.5808537,
    "phone_display": "09 50 02 82 54",
    "phone_e164": "+33950028254",
    "email": TODO,
    "google_place_id": "ChIJH7LC9t8GjEcRBjpft0u-cOA",
    "google_rating": TODO,       # ex. 4.7 – à relever sur la fiche Google
    "google_review_count": TODO, # ex. 250
    "facebook": "https://www.facebook.com/p/Coiffure-%C3%A9toile-100063725313103/",
    "instagram": TODO,
    "parking": TODO,
    "payment": TODO,
    "siret": TODO,
    "host": TODO,  # hébergeur
    "manager": TODO,  # responsable de publication
}

# Horaires (Fresha). Lundi = 0. Chaque jour : liste de plages "HH:MM".
HOURS = {
    0: [("13:30", "19:00")],
    1: [("09:00", "12:00"), ("13:30", "19:00")],
    2: [("09:30", "12:00"), ("13:30", "19:00")],
    3: [("09:00", "12:00"), ("13:30", "19:00")],
    4: [("09:00", "12:00"), ("13:30", "19:00")],
    5: [("09:00", "19:00")],
    6: [],
}
DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
SCHEMA_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Équipe : prénoms inconnus. Un seul agenda « Salon » en attendant.
# Pour ajouter une coiffeuse : {"id": "lea", "name": "Léa", "days": [1,2,3,4,5]}
STAFF = [
    {"id": "salon", "name": "L'équipe du salon", "days": [0, 1, 2, 3, 4, 5]},
]

# Prestations : seules ces deux sont attestées (Fresha). Tarifs et durées inconnus.
# "duration" sert au calcul des créneaux : PROVISOIRE tant que "duration_confirmed" est False.
SERVICES = [
    {
        "id": "coupe-femme",
        "slug": "coupe-femme-cluses",
        "category": "Coupes",
        "name": "Coupe femme",
        "h1": "Coupe femme à Cluses",
        "title": "Coupe femme à Cluses – Coiffure Étoile",
        "description": "Coupe femme à Cluses chez Coiffure Étoile, Grande Rue. Réservez en ligne ou au 09 50 02 82 54. Salon de coiffure en vallée de l'Arve.",
        "price": TODO,
        "duration": 45,
        "duration_confirmed": False,
        "intro": "Une coupe femme au cœur de Cluses, Grande Rue, à réserver en ligne ou par téléphone.",
        "paragraphs": [
            "Envie de rafraîchir votre coupe ou de changer franchement de tête ? Au salon Coiffure Étoile, Grande Rue à Cluses, la coupe commence par un échange : votre style, le temps que vous passez à vous coiffer le matin, la nature de vos cheveux.",
            "Le salon accueille les clientes de Cluses et des communes voisines de la vallée de l'Arve, comme Scionzier, Thyez ou Marnaz. Vous pouvez réserver en ligne ou par téléphone.",
        ],
        "steps": [
            ("Échange", "Vous expliquez ce que vous souhaitez, photos à l'appui si vous en avez."),
            ("Shampooing", "Un lavage avant la coupe."),
            ("Coupe", "La coupe est réalisée selon ce qui a été convenu ensemble."),
            ("Coiffage", "Mise en forme et conseils pour refaire le geste chez vous."),
        ],
        "faq": [
            ("Combien de temps dure une coupe femme ?", None),
            ("Faut-il venir avec les cheveux lavés ?", None),
            ("Puis-je réserver en ligne ?", "Oui, directement sur ce site, 24 h/24. Vous recevez un e-mail à confirmer, puis un rappel la veille. Vous pouvez aussi appeler le salon au 09 50 02 82 54."),
        ],
    },
    {
        "id": "brushing",
        "slug": "brushing-cluses",
        "category": "Coiffage",
        "name": "Brushing",
        "h1": "Brushing à Cluses",
        "title": "Brushing à Cluses – Coiffure Étoile",
        "description": "Brushing à Cluses chez Coiffure Étoile, Grande Rue. Pour un rendez-vous, une soirée ou simplement pour vous. Réservation en ligne ou au 09 50 02 82 54.",
        "price": TODO,
        "duration": 30,
        "duration_confirmed": False,
        "intro": "Un brushing pour un rendez-vous important, une soirée, ou simplement pour se faire du bien, à deux pas du centre de Cluses.",
        "paragraphs": [
            "Le brushing met en forme vos cheveux au sèche-cheveux et à la brosse : lisse, avec du volume ou légèrement ondulé, selon ce que vous aimez.",
            "Le salon Coiffure Étoile se trouve Grande Rue, à Cluses. Il est facile d'accès depuis Scionzier, Thyez, Marnaz et le reste de la vallée de l'Arve.",
        ],
        "steps": [
            ("Échange", "Vous choisissez le résultat souhaité : lisse, volume, ondulations."),
            ("Shampooing", "Un lavage pour partir sur une base propre."),
            ("Séchage et mise en forme", "Séchage à la brosse pour donner la forme voulue."),
        ],
        "faq": [
            ("Combien de temps tient un brushing ?", None),
            ("Peut-on faire un brushing sans coupe ?", None),
            ("Puis-je réserver en ligne ?", "Oui, directement sur ce site, 24 h/24. Vous recevez un e-mail à confirmer, puis un rappel la veille. Vous pouvez aussi appeler le salon au 09 50 02 82 54."),
        ],
    },
]

# FAQ de l'accueil. Réponse None = à compléter avec le salon.
FAQ = [
    ("Faut-il prendre rendez-vous ?", "Le plus simple est de réserver : en ligne sur ce site, à toute heure, ou par téléphone au 09 50 02 82 54 pendant les horaires d'ouverture."),
    ("Comment annuler ou déplacer mon rendez-vous ?", "Chaque e-mail de confirmation contient un lien « Annuler ou déplacer ». Vous pouvez aussi appeler le salon au 09 50 02 82 54."),
    ("Pourquoi dois-je confirmer ma réservation par e-mail ?", "Pour éviter les fausses réservations. Le créneau vous est réservé 30 minutes : sans confirmation, il est libéré pour une autre cliente."),
    ("Où se garer ?", None),
    ("Quels moyens de paiement acceptez-vous ?", None),
    ("Coiffez-vous les enfants ? À partir de quel âge ?", None),
    ("Quelles sont vos prestations et vos tarifs ?", None),
]

# Palette (aucune identité visuelle trouvée) : proposition sobre, à valider.
PALETTE = {
    "bg": "#FBF8F3",
    "surface": "#FFFFFF",
    "ink": "#2B2521",
    "muted": "#5E554E",
    "accent": "#8A6516",       # doré – texte et boutons
    "accent_soft": "#F3E9D2",
    "line": "#E6DED2",
}
