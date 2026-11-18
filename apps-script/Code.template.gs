/**
 * Site&Go – Réservation en ligne sur Google Agenda
 * Salon : voir CONFIG ci-dessous (généré depuis data.py par build.py).
 *
 * Fonctions à lancer à la main une fois : setup()
 * Tâches automatiques : cleanupPending() toutes les 10 min, sendReminders() toutes les heures.
 */

/* ===================== CONFIGURATION ===================== */
var CONFIG = /*__CONFIG__*/{};

var SETTINGS = {
  HOLD_MINUTES: 30,             // délai pour confirmer par e-mail
  STEP_MINUTES: 15,             // pas entre deux créneaux
  DAYS_AHEAD: 30,               // fenêtre de réservation
  MIN_NOTICE_MINUTES: 60,       // délai minimum avant un rendez-vous
  MAX_UPCOMING_PER_CLIENT: 2,   // par téléphone OU par e-mail
  MAX_BOOKINGS_PER_HOUR: 12,    // plafond global anti-abus
  REMINDER_FROM_HOUR: 9,        // le rappel de la veille part à partir de 9 h
  CLOSURE_REGEX: /ferm[ée]|cong[ée]|vacances/i,
  SALON_CALENDAR_ID: '',        // facultatif : agenda commun pour les fermetures du salon
  OWNER_EMAIL: ''               // facultatif : reçoit une copie de chaque rendez-vous confirmé
};

/* ===================== POINTS D'ENTRÉE ===================== */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'availability') {
    return json_(safe_(function () { return availability(p.service, p.staff || 'any'); }));
  }
  if (p.t && (p.a === 'confirm' || p.a === 'cancel')) {
    return actionPage_(p.t, p.a);
  }
  return ContentService.createTextOutput('Service de réservation ' + CONFIG.SALON_NAME + ' : OK');
}

function doPost(e) {
  return json_(safe_(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'book') return book(body);
    return err_('INVALID', 'Action inconnue.');
  }));
}

/* ===================== DISPONIBILITÉS ===================== */
function availability(serviceId, staffId) {
  var svc = service_(serviceId);
  if (!svc) return err_('INVALID', 'Prestation inconnue.');
  var team = team_(staffId);
  if (!team) return err_('INVALID', 'Coiffeuse inconnue.');
  var now = new Date();
  var start = dayStart_(now), end = addDays_(start, SETTINGS.DAYS_AHEAD);
  var busy = busyMap_(team, start, end);
  var days = [];
  for (var i = 0; i < SETTINGS.DAYS_AHEAD; i++) {
    var day = addDays_(start, i);
    days.push(dayInfo_(day, svc, team, busy, now));
  }
  return { ok: true, days: days };
}

function dayInfo_(day, svc, team, busy, now) {
  var wd = (day.getDay() + 6) % 7; // lundi = 0
  var ranges = CONFIG.HOURS[String(wd)] || [];
  var working = team.filter(function (m) { return m.days.indexOf(wd) >= 0; });
  var res = { date: iso_(day), closed: false, slots: [] };
  if (!ranges.length || !working.length) { res.closed = true; return res; }
  var openStaff = working.filter(function (m) { return !fullDayClosed_(busy[m.id], day); });
  if (!openStaff.length) { res.closed = true; return res; }
  var limit = new Date(now.getTime() + SETTINGS.MIN_NOTICE_MINUTES * 60000);
  ranges.forEach(function (r) {
    for (var t = toMin_(r[0]); t + svc.duration <= toMin_(r[1]); t += SETTINGS.STEP_MINUTES) {
      var s = atMin_(day, t);
      if (s < limit) continue;
      var e = new Date(s.getTime() + svc.duration * 60000);
      var free = openStaff.some(function (m) { return isFree_(busy[m.id], s, e); });
      res.slots.push({ time: hhmm_(t), free: free });
    }
  });
  if (!res.slots.length) res.closed = true;
  return res;
}

/** Pour chaque coiffeuse : liste des plages occupées [{s,e,closure,allDay}] */
function busyMap_(team, start, end) {
  var shared = [];
  if (SETTINGS.SALON_CALENDAR_ID) {
    shared = CalendarApp.getCalendarById(SETTINGS.SALON_CALENDAR_ID).getEvents(start, end)
      .filter(function (ev) { return SETTINGS.CLOSURE_REGEX.test(ev.getTitle()); })
      .map(function (ev) { return toBusy_(ev, true); });
  }
  var map = {};
  team.forEach(function (m) {
    map[m.id] = shared.concat(cal_(m).getEvents(start, end).map(function (ev) {
      var closure = SETTINGS.CLOSURE_REGEX.test(ev.getTitle());
      if (ev.isAllDayEvent() && !closure) return null; // simple note sur la journée : ne bloque pas
      return toBusy_(ev, closure);
    }).filter(Boolean));
  });
  return map;
}
function toBusy_(ev, closure) { return { s: ev.getStartTime(), e: ev.getEndTime(), closure: closure, allDay: ev.isAllDayEvent() }; }
function isFree_(list, s, e) { return !(list || []).some(function (b) { return b.s < e && b.e > s; }); }
function fullDayClosed_(list, day) {
  var ds = day, de = addDays_(day, 1);
  return (list || []).some(function (b) { return b.closure && b.s <= ds && b.e >= de; });
}

/* ===================== RÉSERVATION ===================== */
function book(p) {
  var v = validate_(p);
  if (v) return v;
  if (p.website) return { ok: true, status: 'pending', holdMinutes: SETTINGS.HOLD_MINUTES }; // robot : réponse neutre, rien n'est créé

  var cache = CacheService.getScriptCache();
  var rateKey = 'rate_' + Math.floor(Date.now() / 3600000);
  if (+(cache.get(rateKey) || 0) >= SETTINGS.MAX_BOOKINGS_PER_HOUR) {
    return err_('RATE_LIMIT', 'Trop de réservations en ce moment. Merci de réessayer plus tard ou d\'appeler le ' + CONFIG.PHONE + '.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return err_('BUSY', 'Le service est très sollicité. Réessayez dans un instant.');
  try {
    var svc = service_(p.service), team = team_(p.staff || 'any');
    var phone = normPhone_(p.phone), email = String(p.email).trim().toLowerCase();

    // 1) limite par cliente
    if (countUpcoming_(phone, email) >= SETTINGS.MAX_UPCOMING_PER_CLIENT) {
      return err_('LIMIT_CLIENT', 'Vous avez déjà ' + SETTINGS.MAX_UPCOMING_PER_CLIENT + ' rendez-vous à venir. Pour en prendre un autre, appelez le salon au ' + CONFIG.PHONE + '.');
    }

    // 2) seconde vérification du créneau, sous verrou
    var day = parseDate_(p.date);
    var start = atMin_(day, toMin_(p.time));
    var end = new Date(start.getTime() + svc.duration * 60000);
    var now = new Date();
    if (day < dayStart_(now) || day >= addDays_(dayStart_(now), SETTINGS.DAYS_AHEAD)) return err_('INVALID', 'Date hors de la période de réservation.');
    var busy = busyMap_(team, dayStart_(day), addDays_(day, 1));
    var info = dayInfo_(day, svc, team, busy, now);
    var slot = info.slots.filter(function (s) { return s.time === p.time; })[0];
    if (info.closed || !slot) return err_('CLOSED', 'Le salon n\'est pas disponible à cet horaire.');
    var wd = (day.getDay() + 6) % 7;
    var who = team.filter(function (m) {
      return m.days.indexOf(wd) >= 0 && !fullDayClosed_(busy[m.id], day) && isFree_(busy[m.id], start, end);
    })[0];
    if (!slot.free || !who) return err_('SLOT_TAKEN', 'Ce créneau vient d\'être pris. Choisissez-en un autre.');

    // 3) création du rendez-vous « à confirmer »
    var token = Utilities.getUuid();
    var name = clean_(p.name, 80), note = clean_(p.note || '', 500);
    var ev = cal_(who).createEvent('⏳ À confirmer – ' + svc.name + ' – ' + name, start, end, {
      description: 'Réservé en ligne\nCliente : ' + name + '\nTéléphone : ' + p.phone + '\nE-mail : ' + email +
        (note ? '\nPrécision : ' + note : '') + '\n\nEn attente de confirmation par e-mail (' + SETTINGS.HOLD_MINUTES + ' min).'
    });
    var tags = { sg: '1', status: 'pending', token: token, phone: phone, email: email, name: name, service: svc.id, staff: who.id, createdAt: String(Date.now()), reminded: '0' };
    Object.keys(tags).forEach(function (k) { ev.setTag(k, tags[k]); });
    cache.put(rateKey, String(+(cache.get(rateKey) || 0) + 1), 3700);
  } finally {
    lock.releaseLock();
  }

  sendMail_(email, 'Confirmez votre rendez-vous – ' + CONFIG.SALON_NAME,
    '<p>Bonjour ' + esc_(name) + ',</p><p>Vous avez demandé un rendez-vous :</p>' + recap_(svc.name, start, who) +
    '<p><b>Pour le confirmer, cliquez ici dans les ' + SETTINGS.HOLD_MINUTES + ' minutes :</b><br>' + button_(actionUrl_('confirm', token), 'Confirmer mon rendez-vous') + '</p>' +
    '<p>Sans confirmation, le créneau sera libéré automatiquement.</p>' + footer_(token));
  return { ok: true, status: 'pending', holdMinutes: SETTINGS.HOLD_MINUTES, staffName: who.name };
}

/** Appelée par le bouton de la page d'action (google.script.run) */
function performAction(token, action) {
  return safe_(function () {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return err_('BUSY', 'Réessayez dans un instant.');
    var ev;
    try {
      ev = findByToken_(token);
      if (!ev) return err_('NOT_FOUND', 'Ce rendez-vous est introuvable : il a peut-être déjà été annulé ou libéré.');
      var svc = service_(ev.getTag('service')) || { name: 'Rendez-vous', id: '' };
      var email = ev.getTag('email'), name = ev.getTag('name'), start = ev.getStartTime();
      var who = staffById_(ev.getTag('staff'));
      if (action === 'confirm') {
        if (ev.getTag('status') === 'confirmed') return { ok: true, message: 'Votre rendez-vous est déjà confirmé. À bientôt !' };
        if (Date.now() - +ev.getTag('createdAt') > SETTINGS.HOLD_MINUTES * 60000) {
          ev.deleteEvent();
          return err_('EXPIRED', 'Le délai de ' + SETTINGS.HOLD_MINUTES + ' minutes est dépassé et le créneau a été libéré. Vous pouvez en réserver un nouveau sur le site.');
        }
        ev.setTag('status', 'confirmed');
        ev.setTitle('✅ ' + svc.name + ' – ' + name);
        ev.setDescription(String(ev.getDescription()).replace(/En attente de confirmation.*$/m, 'Confirmé par la cliente le ' + fmtDate_(new Date()) + '.'));
        lock.releaseLock(); lock = null;
        sendMail_(email, 'Rendez-vous confirmé – ' + CONFIG.SALON_NAME,
          '<p>Bonjour ' + esc_(name) + ',</p><p>Votre rendez-vous est confirmé :</p>' + recap_(svc.name, start, who) +
          '<p>Vous recevrez un rappel la veille.</p>' + footer_(token));
        if (SETTINGS.OWNER_EMAIL) sendMail_(SETTINGS.OWNER_EMAIL, 'Nouveau RDV : ' + svc.name + ' – ' + fmtDate_(start), recap_(svc.name, start, who) + '<p>' + esc_(name) + ' · ' + esc_(ev.getTag('phone')) + ' · ' + esc_(email) + '</p>');
        return { ok: true, message: 'Merci ! Votre rendez-vous du ' + fmtDate_(start) + ' est confirmé. Un e-mail récapitulatif vient de vous être envoyé.' };
      }
      if (action === 'cancel') {
        ev.deleteEvent();
        lock.releaseLock(); lock = null;
        sendMail_(email, 'Rendez-vous annulé – ' + CONFIG.SALON_NAME,
          '<p>Bonjour ' + esc_(name) + ',</p><p>Votre rendez-vous du ' + fmtDate_(start) + ' est bien annulé.</p>' +
          '<p>' + button_(CONFIG.SITE_URL + '/#rdv-' + svc.id, 'Choisir un autre créneau') + '</p>' + signature_());
        return { ok: true, message: 'Votre rendez-vous est annulé. Le créneau est de nouveau libre.', rebookUrl: CONFIG.SITE_URL + '/#rdv-' + svc.id };
      }
      return err_('INVALID', 'Action inconnue.');
    } finally {
      if (lock) lock.releaseLock();
    }
  });
}

/* ===================== TÂCHES AUTOMATIQUES ===================== */
/** Toutes les 10 minutes : libère les créneaux non confirmés après 30 min. */
function cleanupPending() {
  var limit = Date.now() - SETTINGS.HOLD_MINUTES * 60000, n = 0;
  allBookings_(addDays_(dayStart_(new Date()), -1), addDays_(dayStart_(new Date()), SETTINGS.DAYS_AHEAD + 1)).forEach(function (ev) {
    if (ev.getTag('status') === 'pending' && +ev.getTag('createdAt') < limit) { ev.deleteEvent(); n++; }
  });
  return n;
}

/** Toutes les heures : rappel la veille, une seule fois par rendez-vous. */
function sendReminders() {
  var now = new Date();
  if (now.getHours() < SETTINGS.REMINDER_FROM_HOUR) return 0;
  var tomorrow = addDays_(dayStart_(now), 1), n = 0;
  allBookings_(tomorrow, addDays_(tomorrow, 1)).forEach(function (ev) {
    if (ev.getTag('status') !== 'confirmed' || ev.getTag('reminded') === '1') return;
    if (ev.getStartTime() < tomorrow) return;
    ev.setTag('reminded', '1');
    var svc = service_(ev.getTag('service')) || { name: 'Rendez-vous' };
    sendMail_(ev.getTag('email'), 'Rappel : votre rendez-vous demain – ' + CONFIG.SALON_NAME,
      '<p>Bonjour ' + esc_(ev.getTag('name')) + ',</p><p>Petit rappel de votre rendez-vous de demain :</p>' +
      recap_(svc.name, ev.getStartTime(), staffById_(ev.getTag('staff'))) + footer_(ev.getTag('token')));
    n++;
  });
  return n;
}

/** À lancer une fois après l'installation : crée les tâches automatiques. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['cleanupPending', 'sendReminders'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cleanupPending').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();
  CONFIG.STAFF.forEach(function (m) { if (!cal_(m)) throw new Error('Agenda introuvable pour ' + m.name + ' : ' + m.calendarId); });
  return 'Installation terminée : ' + CONFIG.STAFF.length + ' agenda(s) vérifié(s), 2 tâches automatiques créées.';
}

/* ===================== PAGE « CONFIRMER / ANNULER » ===================== */
/* La page n'agit PAS à l'ouverture (les antivirus de messagerie ouvrent les liens) :
   il faut cliquer sur le bouton, qui appelle performAction via google.script.run. */
function actionPage_(token, action) {
  var ev = findByToken_(token);
  var title, intro, buttons;
  if (!ev) {
    title = 'Rendez-vous introuvable';
    intro = 'Ce rendez-vous a peut-être déjà été annulé ou libéré. Pour toute question : ' + esc_(CONFIG.PHONE) + '.';
    buttons = '';
  } else {
    var svc = service_(ev.getTag('service')) || { name: 'Rendez-vous' };
    var label = esc_(svc.name) + ' · ' + esc_(fmtDate_(ev.getStartTime()));
    if (action === 'confirm') {
      title = 'Confirmer mon rendez-vous';
      intro = label;
      buttons = '<button onclick="go(\'confirm\')">Je confirme mon rendez-vous</button>';
    } else {
      title = 'Annuler ou déplacer mon rendez-vous';
      intro = label + '<br><small>Pour déplacer : annulez, puis choisissez un nouveau créneau sur le site.</small>';
      buttons = '<button onclick="go(\'cancel\')">Annuler ce rendez-vous</button>';
    }
  }
  var html = '<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
    'body{font:16px/1.5 system-ui,sans-serif;background:#FBF8F3;color:#2B2521;margin:0;padding:24px}main{max-width:480px;margin:auto;background:#fff;border:1px solid #E6DED2;border-radius:14px;padding:24px}' +
    'h1{font:600 1.6rem Georgia,serif;margin:0 0 12px}button{width:100%;min-height:52px;border:0;border-radius:999px;background:#8A6516;color:#fff;font:600 1rem system-ui;cursor:pointer;margin-top:16px}' +
    'button:disabled{opacity:.6}#msg{margin-top:16px;font-weight:600}a{color:#8A6516}</style></head><body><main>' +
    '<p>' + esc_(CONFIG.SALON_NAME) + '</p><h1>' + title + '</h1><p>' + intro + '</p>' + buttons + '<p id="msg" role="status"></p></main>' +
    '<script>var T=' + JSON.stringify(String(token)) + ';function go(a){var b=document.querySelector("button");b.disabled=true;b.textContent="Un instant…";' +
    'google.script.run.withSuccessHandler(function(r){b.remove();var m=document.getElementById("msg");m.textContent=r.message;' +
    'if(r.rebookUrl){var l=document.createElement("a");l.href=r.rebookUrl;l.target="_top";l.textContent="Choisir un autre créneau";m.appendChild(document.createElement("br"));m.appendChild(l);}})' +
    '.withFailureHandler(function(){b.disabled=false;b.textContent="Réessayer";}).performAction(T,a);}</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title + ' – ' + CONFIG.SALON_NAME).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ===================== OUTILS ===================== */
function validate_(p) {
  if (!p || typeof p !== 'object') return err_('INVALID', 'Requête invalide.');
  if (!service_(p.service)) return err_('INVALID', 'Prestation inconnue.');
  if (!team_(p.staff || 'any')) return err_('INVALID', 'Coiffeuse inconnue.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '') || !/^\d{2}:\d{2}$/.test(p.time || '')) return err_('INVALID', 'Date ou heure invalide.');
  if (!p.name || String(p.name).trim().length < 2 || String(p.name).length > 80) return err_('INVALID', 'Indiquez votre nom.');
  if (!/^(\+33|0)[1-9]\d{8}$/.test(normPhone_(p.phone))) return err_('INVALID', 'Numéro de téléphone invalide.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(p.email || '').trim()) || String(p.email).length > 120) return err_('INVALID', 'Adresse e-mail invalide.');
  if (p.note && String(p.note).length > 500) return err_('INVALID', 'Précision trop longue (500 caractères maximum).');
  if (p.consent !== true) return err_('INVALID', 'Le consentement est obligatoire.');
  return null;
}
function countUpcoming_(phone, email) {
  var now = new Date();
  return allBookings_(now, addDays_(dayStart_(now), SETTINGS.DAYS_AHEAD + 1)).filter(function (ev) {
    var st = ev.getTag('status');
    return (st === 'pending' || st === 'confirmed') && ev.getEndTime() > now && (ev.getTag('phone') === phone || ev.getTag('email') === email);
  }).length;
}
function allBookings_(start, end) {
  var out = [];
  CONFIG.STAFF.forEach(function (m) {
    cal_(m).getEvents(start, end).forEach(function (ev) { if (ev.getTag('sg') === '1') out.push(ev); });
  });
  return out;
}
function findByToken_(token) {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  var now = new Date();
  return allBookings_(addDays_(dayStart_(now), -1), addDays_(dayStart_(now), SETTINGS.DAYS_AHEAD + 2))
    .filter(function (ev) { return ev.getTag('token') === token; })[0] || null;
}
function service_(id) { return CONFIG.SERVICES.filter(function (s) { return s.id === id; })[0] || null; }
function staffById_(id) { return CONFIG.STAFF.filter(function (m) { return m.id === id; })[0] || null; }
function team_(id) {
  if (id === 'any') return CONFIG.STAFF.slice();
  var m = staffById_(id);
  return m ? [m] : null;
}
function cal_(m) { return m.calendarId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(m.calendarId); }
function normPhone_(s) { return String(s || '').replace(/[\s.\-()]/g, ''); }
function clean_(s, max) { return String(s).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function toMin_(hhmm) { var a = String(hhmm).split(':'); return +a[0] * 60 + +a[1]; }
function hhmm_(m) { return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
function dayStart_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays_(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function atMin_(day, m) { return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60); }
function parseDate_(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
function iso_(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function fmtDate_(d) {
  var j = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getDay()];
  var m = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][d.getMonth()];
  return j + ' ' + d.getDate() + ' ' + m + ' à ' + d.getHours() + ' h ' + ('0' + d.getMinutes()).slice(-2);
}
function actionUrl_(a, token) { return ScriptApp.getService().getUrl() + '?a=' + a + '&t=' + encodeURIComponent(token); }
function recap_(svcName, start, who) {
  return '<p style="background:#F3E9D2;padding:12px 16px;border-radius:10px"><b>' + esc_(svcName) + '</b><br>' + esc_(fmtDate_(start)) +
    (who && CONFIG.STAFF.length > 1 ? '<br>avec ' + esc_(who.name) : '') + '<br>' + esc_(CONFIG.SALON_NAME) + '</p>';
}
function button_(url, label) { return '<a href="' + esc_(url) + '" style="display:inline-block;background:#8A6516;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">' + esc_(label) + '</a>'; }
function footer_(token) { return '<p>Besoin d\'annuler ou de déplacer ? <a href="' + esc_(actionUrl_('cancel', token)) + '">Annuler ou déplacer</a></p>' + signature_(); }
function signature_() { return '<p>À bientôt,<br>' + esc_(CONFIG.SALON_NAME) + ' · ' + esc_(CONFIG.PHONE) + '</p>'; }
function sendMail_(to, subject, htmlBody) {
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: htmlBody, body: htmlBody.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''), name: CONFIG.SALON_NAME });
}
function err_(code, message) { return { ok: false, code: code, message: message }; }
function safe_(fn) {
  try { return fn(); } catch (e) { console.error(e && e.stack || e); return err_('SERVER', 'Erreur du service de réservation. Appelez le salon au ' + CONFIG.PHONE + '.'); }
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
