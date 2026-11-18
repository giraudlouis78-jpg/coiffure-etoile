#!/usr/bin/env python3
"""Génère le site dans ./site à partir de data.py. Usage : python3 build.py"""
import json, shutil, html, datetime, pathlib, re
import data as D

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "site"
S, SITE = D.SALON, D.SITE
BASE = SITE["base_url"].rstrip("/")
TODAY = datetime.date.today().isoformat()
TODOS = []  # liste des éléments à compléter (pour le récapitulatif)

e = lambda s: html.escape(str(s), quote=True)


def todo(label):
    TODOS.append(label)
    return f'<span class="todo">À COMPLÉTER : {e(label)}</span>'


def val(v, label):
    return e(v) if v not in (None, "") else todo(label)


ADDRESS_LINE = f"{S['street']}, {S['postal_code']} {S['city']}"
TEL = f"tel:{S['phone_e164']}"
DIRECTIONS = f"https://www.google.com/maps/dir/?api=1&destination={S['lat']},{S['lng']}&destination_place_id={S['google_place_id']}"
REVIEWS_URL = f"https://search.google.com/local/reviews?placeid={S['google_place_id']}"
ICON_CAL = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>'
ICON_TEL = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>'


def fmt_h(t):
    h, m = t.split(":")
    return f"{int(h)} h" + (f" {m}" if m != "00" else "")


def hours_text(day):
    r = D.HOURS[day]
    return "Fermé" if not r else " · ".join(f"{fmt_h(a)} – {fmt_h(b)}" for a, b in r)


def rating_html():
    r, n = S["google_rating"], S["google_review_count"]
    if r and n:
        full = round(float(r))
        return (f'<p class="rating"><span class="stars" aria-hidden="true">{"★" * full}{"☆" * (5 - full)}</span>'
                f'<span>{str(r).replace(".", ",")}/5 · {n} avis Google</span> <a href="{REVIEWS_URL}" rel="noopener">Lire les avis</a></p>')
    return f'<p class="rating">{todo("note Google et nombre d’avis (fiche Google)")}</p>'


# ---------------------------------------------------------------- JSON-LD
def salon_ld():
    spec = []
    for d, ranges in D.HOURS.items():
        for a, b in ranges:
            spec.append({"@type": "OpeningHoursSpecification", "dayOfWeek": f"https://schema.org/{D.SCHEMA_DAYS[d]}", "opens": a, "closes": b})
    ld = {
        "@context": "https://schema.org", "@type": "HairSalon", "@id": f"{BASE}/#salon",
        "name": S["name"], "url": f"{BASE}/", "telephone": S["phone_e164"],
        "address": {"@type": "PostalAddress", "streetAddress": S["street"], "postalCode": S["postal_code"], "addressLocality": S["city"], "addressRegion": S["department"], "addressCountry": "FR"},
        "geo": {"@type": "GeoCoordinates", "latitude": S["lat"], "longitude": S["lng"]},
        "hasMap": f"https://www.google.com/maps/place/?q=place_id:{S['google_place_id']}",
        "openingHoursSpecification": spec,
        "areaServed": ["Cluses", "Scionzier", "Thyez", "Marnaz", "Vallée de l'Arve"],
        "sameAs": [u for u in (S["facebook"], S["instagram"]) if u],
    }
    if S["google_rating"] and S["google_review_count"]:
        ld["aggregateRating"] = {"@type": "AggregateRating", "ratingValue": S["google_rating"], "reviewCount": S["google_review_count"], "bestRating": 5}
    return ld


def faq_ld(items):
    qa = [(q, a) for q, a in items if a]
    if not qa:
        return None
    return {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]}


def ld_tags(*objs):
    return "\n".join(f'<script type="application/ld+json">{json.dumps(o, ensure_ascii=False)}</script>' for o in objs if o)


# ---------------------------------------------------------------- gabarit
def head(title, desc, path, extra_ld=""):
    url = f"{BASE}/{path}" if path else f"{BASE}/"
    return f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_FR">
<meta property="og:site_name" content="{e(S['name'])}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}/og.png">
<meta name="theme-color" content="#FBF8F3">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preload" href="fonts/cormorant-garamond-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="styles.css">
{extra_ld}
</head>
<body>
<a class="skip" href="#main">Aller au contenu</a>
<header class="top"><div class="wrap">
  <a class="brand" href="index.html" aria-label="{e(S['name'])} – accueil">{e(S['name'])}</a>
  <nav class="nav" aria-label="Navigation principale">
    <a href="index.html#prestations">Prestations</a><a href="index.html#salon">Le salon</a><a href="index.html#faq">FAQ</a><a href="index.html#infos">Accès &amp; horaires</a>
  </nav>
  <a class="btn btn--ghost call" href="{TEL}">{ICON_TEL}{e(S['phone_display'])}</a>
  <a class="btn" href="index.html#rdv" aria-label="Prendre rendez-vous"><span class="long">Prendre rendez-vous</span><span class="short">Rendez-vous</span></a>
</div></header>
<main id="main">
"""


def foot():
    svc_links = "".join(f'<li><a href="{s["slug"]}.html">{e(s["name"])} à {e(S["city"])}</a></li>' for s in D.SERVICES)
    socials = []
    if S["facebook"]:
        socials.append(f'<li><a href="{S["facebook"]}" rel="noopener">Facebook</a></li>')
    socials.append(f'<li><a href="{S["instagram"]}" rel="noopener">Instagram</a></li>' if S["instagram"] else f'<li>{todo("compte Instagram (s’il existe)")}</li>')
    return f"""</main>
<footer class="foot"><div class="wrap">
  <div class="grid">
    <div>
      <h2>{e(S['name'])}</h2>
      <p>Salon de coiffure à {e(S['city'])}, {e(S['department'])} ({S['department_code']}).<br>{e(ADDRESS_LINE)}<br><a href="{TEL}">{e(S['phone_display'])}</a></p>
      <ul>{''.join(socials)}</ul>
    </div>
    <div><h2>Prestations</h2><ul>{svc_links}</ul></div>
    <div><h2>Infos</h2><ul>
      <li><a href="index.html#rdv">Prendre rendez-vous</a></li>
      <li><a href="index.html#infos">Horaires et accès</a></li>
      <li><a href="mentions-legales.html">Mentions légales et confidentialité</a></li>
    </ul></div>
  </div>
  <small>© {datetime.date.today().year} {e(S['name'])} · Site réalisé par Site&amp;Go</small>
</div></footer>
<nav class="mbar" aria-label="Actions rapides">
  <a class="btn btn--ghost" href="{TEL}">{ICON_TEL}Appeler</a>
  <a class="btn" href="index.html#rdv">{ICON_CAL}Rendez-vous</a>
</nav>
<script>window.SITE_CFG={json.dumps(site_cfg(), ensure_ascii=False)};</script>
<script src="app.js" defer></script>
</body>
</html>
"""


def site_cfg():
    return {
        "scriptUrl": SITE["booking_script_url"], "phone": S["phone_display"], "lat": S["lat"], "lng": S["lng"],
        "hours": {d: [list(r) for r in v] for d, v in D.HOURS.items()},
        "services": [{"id": s["id"], "name": s["name"], "duration": s["duration"]} for s in D.SERVICES],
        "staff": D.STAFF,
    }


def faq_html(items):
    out = []
    for q, a in items:
        body = f"<p>{e(a)}</p>" if a else f"<p>{todo('réponse : ' + q)}</p>"
        out.append(f"<details><summary>{e(q)}</summary><div>{body}</div></details>")
    return '<div class="faq">' + "".join(out) + "</div>"


def duration_html(s):
    txt = f"{s['duration']} min"
    return e(txt) if s["duration_confirmed"] else f'{e(txt)} <span class="todo">durée à confirmer</span>'


def price_html(s):
    return f'<span class="price">{e(s["price"])}</span>' if s["price"] else todo(f"tarif {s['name']}")


# ---------------------------------------------------------------- accueil
def booking_html():
    choices = "".join(
        f'<div class="choice"><input type="radio" name="service" id="svc-{s["id"]}" value="{s["id"]}"><label for="svc-{s["id"]}"><span><b>{e(s["name"])}</b></span><small>{s["duration"]} min' + ("" if s["duration_confirmed"] else " (durée provisoire)") + "</small></label></div>"
        for s in D.SERVICES)
    staff_opts = '<option value="any">Peu importe</option>' + "".join(f'<option value="{m["id"]}">{e(m["name"])}</option>' for m in D.STAFF)
    return f"""
<section class="sec sec--alt" id="rdv" aria-labelledby="rdv-t"><div class="wrap">
  <div class="sec-head"><h2 id="rdv-t">Prendre rendez-vous en ligne</h2>
    <p>Choisissez votre prestation et votre créneau. Vous recevrez un e-mail pour confirmer, puis un rappel la veille. Vous préférez appeler ? <a href="{TEL}">{e(S['phone_display'])}</a></p></div>
  <div class="book">
    <p class="demo-banner" data-demo hidden><b>Mode démonstration</b> : les disponibilités sont simulées et aucune réservation n'est envoyée au salon.</p>
    <fieldset class="step"><legend><span>1</span>Votre prestation</legend><div class="choices">{choices}</div></fieldset>
    <fieldset class="step"><legend><span>2</span>Votre coiffeuse</legend>
      <label class="sr-only" for="staff">Coiffeuse</label><select id="staff" name="staff">{staff_opts}</select>
      <p class="hint">{todo("prénoms de l’équipe et jours travaillés")}</p></fieldset>
    <fieldset class="step"><legend><span>3</span>Le jour</legend><div class="days" data-days role="group" aria-label="30 prochains jours"><p class="hint">Choisissez d'abord une prestation.</p></div></fieldset>
    <fieldset class="step"><legend><span>4</span>L'heure</legend><div class="slots" data-slots role="group" aria-label="Créneaux disponibles"></div>
      <p class="hint">Les créneaux barrés sont déjà pris.</p></fieldset>
    <form class="step" novalidate>
      <fieldset class="step"><legend><span>5</span>Vos coordonnées</legend>
      <p class="summary" data-summary hidden></p>
      <div class="form-grid">
        <div class="field"><label for="f-name">Nom et prénom</label><input id="f-name" name="name" type="text" autocomplete="name" required maxlength="80"></div>
        <div class="field"><label for="f-phone">Téléphone</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="20" placeholder="06 12 34 56 78"></div>
        <div class="field full"><label for="f-email">E-mail (pour confirmer)</label><input id="f-email" name="email" type="email" autocomplete="email" required maxlength="120"></div>
        <div class="field full"><label for="f-note">Précision (facultatif)</label><textarea id="f-note" name="note" maxlength="500" placeholder="Longueur de cheveux, demande particulière…"></textarea></div>
        <div class="hp" aria-hidden="true"><label for="f-website">Ne pas remplir</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <label class="consent full"><input type="checkbox" name="consent" value="1" required><span>J'accepte que mes coordonnées soient utilisées par {e(S['name'])} uniquement pour gérer ce rendez-vous (confirmation, rappel). <a href="mentions-legales.html#donnees">En savoir plus</a></span></label>
      </div></fieldset>
      <p class="msg" data-msg role="status" aria-live="polite"></p>
      <p><button class="btn" type="submit" disabled>Réserver ce créneau</button></p>
    </form>
  </div>
</div></section>"""


def index():
    title = f"{S['name']} – Salon de coiffure à {S['city']} ({S['department']})"
    desc = (f"Coiffeur à Cluses : {S['name']}, salon de coiffure en Haute-Savoie, {ADDRESS_LINE}. "
            f"Réservation en ligne 24 h/24 ou au {S['phone_display']}.")
    cats = {}
    for s in D.SERVICES:
        cats.setdefault(s["category"], []).append(s)
    svc_html = "".join(
        f'<div class="cat"><h3>{e(c)}</h3>' + "".join(
            f'<div class="svc"><a class="svc-name" href="{s["slug"]}.html">{e(s["name"])}</a><span class="meta"><span>{duration_html(s)}</span>{price_html(s)}<a href="#rdv-{s["id"]}">Réserver</a></span></div>'
            for s in lst) + "</div>" for c, lst in cats.items())
    hours_rows = "".join(f'<tr data-day="{d}"><th scope="row">{D.DAY_NAMES[d]}</th><td>{hours_text(d)}</td></tr>' for d in range(7))
    reviews = "".join(f'<div class="card review-ph"><p>{todo("avis Google " + str(i) + " copié mot pour mot, avec l’accord du salon")}</p></div>' for i in (1, 2, 3))
    body = f"""
<section class="hero"><div class="wrap">
  <div>
    <p class="kicker">Salon de coiffure · {e(S['city'])}, vallée de l'Arve</p>
    <h1>{e(S['name'])}, votre coiffeur à {e(S['city'])}</h1>
    <p class="lead">Coupe femme et brushing au cœur de Cluses, Grande Rue. Réservez en ligne en quelques secondes ou appelez le salon.</p>
    {rating_html()}
    <div class="cta">
      <a class="btn" href="#rdv">{ICON_CAL}Prendre rendez-vous</a>
      <a class="btn btn--ghost" href="{TEL}">{ICON_TEL}Appeler le {e(S['phone_display'])}</a>
    </div>
    <p class="status" data-open-status aria-live="polite">Horaires ci-dessous</p>
  </div>
  <div class="ph" role="img" aria-label="Emplacement réservé à la photo du salon"><div><strong>Photo du salon</strong>{todo("photo de la devanture ou de l’intérieur, 1600 px de large minimum")}</div></div>
</div></section>

<section class="sec" id="prestations" aria-labelledby="presta-t"><div class="wrap">
  <div class="sec-head"><h2 id="presta-t">Prestations et tarifs</h2>
    <p>Les prestations ci-dessous sont celles que le salon affiche aujourd'hui en ligne. {todo("liste complète des prestations (couleur, mèches, soins, homme, enfant…) avec tarifs")}</p></div>
  {svc_html}
</div></section>

{booking_html()}

<section class="sec" id="salon" aria-labelledby="salon-t"><div class="wrap">
  <div class="sec-head"><h2 id="salon-t">Le salon et l'équipe</h2>
    <p>{e(S['name'])} vous accueille Grande Rue, au centre de Cluses, du lundi au samedi. {todo("quelques phrases de la gérante : histoire du salon, façon de travailler")}</p></div>
  <div class="grid grid--3">
    <div class="ph" role="img" aria-label="Emplacement photo de l'équipe" style="aspect-ratio:4/5"><div><strong>Photo de l'équipe</strong>{todo("photo + prénom")}</div></div>
    <div class="ph" role="img" aria-label="Emplacement photo de l'intérieur du salon" style="aspect-ratio:4/5"><div><strong>Intérieur du salon</strong>{todo("photo")}</div></div>
    <div class="ph" role="img" aria-label="Emplacement photo d'un détail du salon" style="aspect-ratio:4/5"><div><strong>Détail / ambiance</strong>{todo("photo")}</div></div>
  </div>
</div></section>

<section class="sec sec--alt" id="galerie" aria-labelledby="gal-t"><div class="wrap">
  <div class="sec-head"><h2 id="gal-t">Avant / après</h2><p>{todo("3 à 6 paires de photos avant/après, avec l’accord écrit des clientes reconnaissables")}</p></div>
  <div class="grid grid--3">{''.join(f'<div class="ph" role="img" aria-label="Emplacement photo avant/après {i}" style="aspect-ratio:1"><div><strong>Avant / après {i}</strong></div></div>' for i in (1, 2, 3))}</div>
</div></section>

<section class="sec" id="avis" aria-labelledby="avis-t"><div class="wrap">
  <div class="sec-head"><h2 id="avis-t">Avis clients</h2><p>Les avis affichés ici seront de vrais avis Google, copiés mot pour mot. <a href="{REVIEWS_URL}" rel="noopener">Voir tous les avis sur Google</a></p></div>
  <div class="grid grid--3">{reviews}</div>
</div></section>

<section class="sec sec--alt" id="faq" aria-labelledby="faq-t"><div class="wrap">
  <div class="sec-head"><h2 id="faq-t">Questions fréquentes</h2></div>
  {faq_html(D.FAQ)}
</div></section>

<section class="sec" id="infos" aria-labelledby="infos-t"><div class="wrap">
  <div class="sec-head"><h2 id="infos-t">Accès et horaires</h2></div>
  <div class="grid grid--2">
    <div class="card">
      <h3>Adresse</h3>
      <p>{e(S['name'])}<br>{e(ADDRESS_LINE)}<br><span class="todo">{e(S['address_to_confirm'])}</span></p>
      <p><a class="btn btn--ghost" href="{DIRECTIONS}" rel="noopener">Itinéraire</a> <a class="btn btn--ghost" href="{TEL}">{ICON_TEL}{e(S['phone_display'])}</a></p>
      <h3>Stationnement</h3><p>{val(S['parking'], 'stationnement le plus proche')}</p>
      <div class="map"><div><p>Le plan Google Maps n'est chargé que si vous le demandez.</p><button class="btn" type="button" data-map-load>Afficher le plan</button></div></div>
    </div>
    <div class="card">
      <h3>Horaires d'ouverture</h3>
      <table class="hours"><caption class="sr-only">Horaires d'ouverture du salon</caption><tbody>{hours_rows}</tbody></table>
      <p class="hint" style="margin-top:12px">Horaires relevés en ligne, {todo("à confirmer par le salon")}</p>
    </div>
  </div>
</div></section>
"""
    return head(title, desc, "", ld_tags(salon_ld(), faq_ld(D.FAQ))) + body + foot()


# ---------------------------------------------------------------- prestations
def service_page(s):
    others = "".join(f'<li><a href="{o["slug"]}.html">{e(o["name"])} à {e(S["city"])}</a></li>' for o in D.SERVICES if o is not s)
    steps = "".join(f"<li><b>{e(t)}</b><br>{e(d)}</li>" for t, d in s["steps"])
    crumbs_ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Accueil", "item": f"{BASE}/"},
        {"@type": "ListItem", "position": 2, "name": "Prestations", "item": f"{BASE}/#prestations"},
        {"@type": "ListItem", "position": 3, "name": s["h1"], "item": f"{BASE}/{s['slug']}.html"}]}
    service_ld = {"@context": "https://schema.org", "@type": "Service", "name": s["h1"], "serviceType": s["name"],
                  "provider": {"@id": f"{BASE}/#salon"}, "areaServed": {"@type": "City", "name": S["city"]}, "url": f"{BASE}/{s['slug']}.html"}
    if s["price"]:
        service_ld["offers"] = {"@type": "Offer", "price": re.sub(r"[^\d.,]", "", s["price"]).replace(",", "."), "priceCurrency": "EUR"}
    body = f"""
<nav class="crumbs wrap" aria-label="Fil d'Ariane"><ol><li><a href="index.html">Accueil</a></li><li><a href="index.html#prestations">Prestations</a></li><li aria-current="page">{e(s['name'])}</li></ol></nav>
<section class="sec" style="padding-top:20px"><div class="wrap prose">
  <h1>{e(s['h1'])}</h1>
  <p class="lead">{e(s['intro'])}</p>
  <div class="facts"><span class="fact">Durée : {duration_html(s)}</span><span class="fact">Tarif : {price_html(s)}</span><span class="fact">Note : {todo('note Google') if not S['google_rating'] else e(str(S['google_rating']).replace('.', ',')) + '/5'}</span></div>
  <p class="cta"><a class="btn" href="index.html#rdv-{s['id']}">{ICON_CAL}Réserver : {e(s['name'])}</a><a class="btn btn--ghost" href="{TEL}">{ICON_TEL}Appeler</a></p>
  {''.join(f'<p>{e(p)}</p>' for p in s['paragraphs'])}
  <h2>Comment se passe la prestation ?</h2>
  <ol class="steps">{steps}</ol>
  <p class="hint">{todo("déroulé à valider par le salon")}</p>
  <h2>Questions fréquentes</h2>
  {faq_html(s['faq'])}
  <h2>Nos autres prestations</h2>
  <ul class="links">{others}<li><a href="index.html#prestations">Toutes les prestations</a></li></ul>
  <p class="cta"><a class="btn" href="index.html#rdv-{s['id']}">{ICON_CAL}Prendre rendez-vous</a></p>
</div></section>
"""
    return head(s["title"], s["description"], f"{s['slug']}.html", ld_tags(crumbs_ld, service_ld, faq_ld(s["faq"]))) + body + foot()


def legal():
    body = f"""
<section class="sec"><div class="wrap prose">
  <h1>Mentions légales et confidentialité</h1>
  <h2>Éditeur du site</h2>
  <p>{e(S['name'])} – raison sociale : {val(S['legal_name'], 'raison sociale et forme juridique')}<br>
  Adresse : {e(ADDRESS_LINE)}<br>Téléphone : <a href="{TEL}">{e(S['phone_display'])}</a><br>
  E-mail : {val(S['email'], 'e-mail du salon')}<br>SIRET : {val(S['siret'], 'numéro SIRET')}<br>
  Responsable de la publication : {val(S['manager'], 'nom de la gérante')}</p>
  <h2>Hébergeur</h2><p>{val(S['host'], 'nom, adresse et téléphone de l’hébergeur')}</p>
  <h2>Conception</h2><p>Site&amp;Go – création de sites pour les commerces de la vallée de l'Arve.</p>

  <h2 id="donnees">Protection des données personnelles</h2>
  <p><b>Responsable du traitement :</b> {e(S['name'])}, {e(ADDRESS_LINE)}, représenté par {val(S['manager'], 'nom de la gérante')}.</p>
  <p><b>Données collectées :</b> lors d'une réservation en ligne, votre nom, votre téléphone, votre adresse e-mail, la prestation, le créneau choisi et, si vous le souhaitez, une précision écrite.</p>
  <p><b>Finalité :</b> gérer votre rendez-vous (confirmation, rappel la veille, annulation ou déplacement) et vous joindre en cas d'imprévu. Base légale : votre consentement et l'exécution de la prestation demandée.</p>
  <p><b>Destinataires :</b> le salon uniquement. Les rendez-vous sont enregistrés dans l'agenda Google du salon et les e-mails envoyés depuis son compte Google (Google Ireland Ltd, sous-traitant). Vos données ne sont ni vendues ni utilisées pour de la publicité.</p>
  <p><b>Durée de conservation :</b> les réservations non confirmées sont supprimées après 30 minutes. Les rendez-vous sont conservés au maximum 3 ans après votre dernière visite. {todo("durée de conservation à valider par la gérante")}</p>
  <p><b>Vos droits :</b> vous pouvez accéder à vos données, les rectifier, les effacer, vous opposer à leur traitement ou en demander la limitation et la portabilité, en écrivant à {val(S['email'], 'e-mail du salon')} ou à l'adresse du salon. Vous pouvez retirer votre consentement à tout moment.</p>
  <p><b>Réclamation :</b> si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL (<a href="https://www.cnil.fr/fr/plaintes" rel="noopener">www.cnil.fr</a>).</p>
  <h2>Cookies et services tiers</h2>
  <p>Ce site ne dépose aucun cookie et n'utilise aucun outil de statistiques. Les polices de caractères sont hébergées sur le site. Le plan Google Maps n'est chargé que si vous cliquez sur « Afficher le plan » : Google peut alors déposer ses propres cookies.</p>
  <p class="hint">Mise à jour : {datetime.date.today().strftime('%d/%m/%Y')}</p>
</div></section>"""
    return head(f"Mentions légales et confidentialité – {S['name']}", f"Mentions légales, données personnelles et cookies du site {S['name']}, salon de coiffure à Cluses.", "mentions-legales.html") + body + foot()


def page404():
    body = f"""
<section class="sec"><div class="wrap prose" style="text-align:center">
  <h1>Page introuvable</h1>
  <p class="lead">Cette page n'existe pas ou a été déplacée.</p>
  <p class="cta" style="justify-content:center"><a class="btn" href="index.html">Retour à l'accueil</a><a class="btn btn--ghost" href="index.html#rdv">Prendre rendez-vous</a></p>
</div></section>"""
    return head(f"Page introuvable – {S['name']}", f"Page introuvable sur le site de {S['name']}, salon de coiffure à Cluses.", "404.html").replace('<head>', '<head>\n<meta name="robots" content="noindex">', 1) + body + foot()


FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#FBF8F3"/><path fill="#8A6516" d="M12 3l2.2 6.1 6.5.2-5.2 4 1.9 6.3L12 15.9l-5.4 3.7 1.9-6.3-5.2-4 6.5-.2z"/></svg>"""


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(ROOT / "src" / "fonts", OUT / "fonts")
    shutil.copy(ROOT / "src" / "styles.css", OUT)
    shutil.copy(ROOT / "src" / "app.js", OUT)
    if (ROOT / "src" / "og.png").exists():
        shutil.copy(ROOT / "src" / "og.png", OUT)
    (OUT / "favicon.svg").write_text(FAVICON, encoding="utf-8")
    pages = {"index.html": index(), "mentions-legales.html": legal(), "404.html": page404()}
    for s in D.SERVICES:
        pages[f"{s['slug']}.html"] = service_page(s)
    for name, content in pages.items():
        (OUT / name).write_text(content, encoding="utf-8")
    urls = [""] + [f"{s['slug']}.html" for s in D.SERVICES] + ["mentions-legales.html"]
    (OUT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                                     "".join(f"  <url><loc>{BASE}/{u}</loc><lastmod>{TODAY}</lastmod></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")
    (OUT / ".htaccess").write_text("ErrorDocument 404 /404.html\n", encoding="utf-8")
    # Apps Script : on injecte la configuration (prestations, horaires, équipe) dans Code.gs
    tpl = (ROOT / "apps-script" / "Code.template.gs")
    if tpl.exists():
        cfg = {"SALON_NAME": S["name"], "PHONE": S["phone_display"], "SITE_URL": BASE,
               "HOURS": {str(d): [list(r) for r in v] for d, v in D.HOURS.items()},
               "SERVICES": [{"id": s["id"], "name": s["name"], "duration": s["duration"]} for s in D.SERVICES],
               "STAFF": [dict(m, calendarId="primary" if m["id"] == "salon" else "A_RENSEIGNER") for m in D.STAFF]}
        code = tpl.read_text(encoding="utf-8").replace("/*__CONFIG__*/{}", json.dumps(cfg, ensure_ascii=False, indent=2))
        (ROOT / "apps-script" / "Code.gs").write_text(code, encoding="utf-8")
    uniq = sorted(set(TODOS))
    (ROOT / "a-completer.txt").write_text("\n".join(uniq) + "\n", encoding="utf-8")
    print(f"{len(pages)} pages générées dans {OUT} · {len(uniq)} éléments à compléter")


if __name__ == "__main__":
    main()
