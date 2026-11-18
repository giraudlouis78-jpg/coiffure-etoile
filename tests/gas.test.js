// Tests du script Apps Script avec objets Google simulés.
// Lancer : TZ=Europe/Paris node tests/gas.test.js
const assert = require("assert");
const { load } = require("./gas-mocks");
if (new Date(2026, 6, 1).getTimezoneOffset() !== -120) throw new Error("Lancer avec TZ=Europe/Paris");

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const NOW = "2026-11-17T08:00:00"; // mardi 8 h, heure de Paris
const client = (o = {}) => Object.assign({ service: "coupe-femme", staff: "any", date: "2026-11-18", time: "10:00", name: "Claire Test", phone: "06 12 34 56 78", email: "claire@example.com", note: "", website: "", consent: true }, o);
const book = (g, o) => g.run("book(" + JSON.stringify(client(o)) + ")");
const avail = (g, svc = "coupe-femme", staff = "any") => g.run(`availability(${JSON.stringify(svc)}, ${JSON.stringify(staff)})`);
const day = (r, d) => r.days.find((x) => x.date === d);
const tokenOf = (g) => g.cals.primary.events.slice(-1)[0].getTag("token");
const act = (g, t, a) => g.run(`performAction(${JSON.stringify(t)}, ${JSON.stringify(a)})`);

test("disponibilités : 30 jours, dimanche fermé, horaires respectés", () => {
  const g = load({ now: NOW });
  const r = avail(g);
  assert.ok(r.ok);
  assert.strictEqual(r.days.length, 30);
  assert.strictEqual(r.days[0].date, "2026-11-17");
  assert.strictEqual(day(r, "2026-11-22").closed, true, "dimanche");
  assert.strictEqual(day(r, "2026-11-23").slots[0].time, "13:30", "lundi après-midi seulement");
  const wed = day(r, "2026-11-18").slots.map((s) => s.time);
  assert.strictEqual(wed[0], "09:30");
  assert.ok(wed.includes("11:15") && !wed.includes("11:30"), "coupe 45 min doit finir avant 12 h");
  assert.ok(!wed.includes("12:00") && wed.includes("13:30"), "pause de midi");
  assert.ok(day(r, "2026-11-17").slots.every((s) => s.time >= "09:00"), "délai minimum 60 min");
});

test("réservation : créneau gelé « À confirmer » + e-mail de confirmation", () => {
  const g = load({ now: NOW });
  const r = book(g);
  assert.deepStrictEqual([r.ok, r.status, r.holdMinutes], [true, "pending", 30]);
  const ev = g.cals.primary.events[0];
  assert.match(ev.getTitle(), /^⏳ À confirmer – Coupe femme – Claire Test$/);
  assert.strictEqual(ev.getTag("status"), "pending");
  assert.strictEqual(ev.getTag("phone"), "0612345678");
  assert.strictEqual(ev.getStartTime().getHours(), 10);
  assert.strictEqual((ev.getEndTime() - ev.getStartTime()) / 60000, 45);
  assert.strictEqual(g.mails.length, 1);
  assert.match(g.mails[0].htmlBody, /\?a=confirm&amp;t=[0-9a-f-]{36}/);
  assert.match(g.mails[0].htmlBody, /Annuler ou déplacer/);
  assert.strictEqual(day(avail(g), "2026-11-18").slots.find((s) => s.time === "10:00").free, false, "créneau gelé");
});

test("refus d'un créneau déjà pris ou qui chevauche", () => {
  const g = load({ now: NOW });
  book(g);
  const other = { name: "Autre", phone: "0699999999", email: "autre@example.com" };
  assert.strictEqual(book(g, other).code, "SLOT_TAKEN");
  assert.strictEqual(book(g, Object.assign({ time: "10:15" }, other)).code, "SLOT_TAKEN");
  assert.strictEqual(book(g, Object.assign({ time: "09:30" }, other)).code, "SLOT_TAKEN", "9h30+45 min chevauche 10 h");
  assert.strictEqual(book(g, Object.assign({ time: "10:45" }, other)).ok, true);
});

test("limite : 2 rendez-vous à venir par téléphone ou par e-mail", () => {
  const g = load({ now: NOW });
  assert.ok(book(g, { time: "09:30" }).ok);
  assert.ok(book(g, { time: "11:00" }).ok);
  assert.strictEqual(book(g, { date: "2026-11-19", time: "09:00" }).code, "LIMIT_CLIENT");
  assert.strictEqual(book(g, { date: "2026-11-19", time: "09:00", phone: "0700000000" }).code, "LIMIT_CLIENT", "même e-mail");
  assert.strictEqual(book(g, { date: "2026-11-19", time: "09:00", email: "x@example.com" }).code, "LIMIT_CLIENT", "même téléphone");
  assert.ok(book(g, { date: "2026-11-19", time: "09:00", email: "x@example.com", phone: "0700000000" }).ok);
});

test("anti-abus : champ piège, validation serveur, plafond horaire, verrou", () => {
  const g = load({ now: NOW });
  assert.ok(book(g, { website: "http://spam" }).ok);
  assert.strictEqual(g.cals.primary.events.length, 0, "robot : rien n'est créé");
  assert.strictEqual(g.mails.length, 0);
  for (const bad of [{ phone: "123" }, { email: "pas-un-mail" }, { consent: false }, { consent: "true" }, { name: "" }, { service: "inconnue" }, { staff: "inconnue" }, { date: "18/11/2026" }, { note: "x".repeat(501) }])
    assert.strictEqual(book(g, bad).code, "INVALID", JSON.stringify(bad));
  assert.strictEqual(book(g, { date: "2026-11-10" }).code, "INVALID", "date passée");
  assert.strictEqual(book(g, { date: "2027-01-30" }).code, "INVALID", "au-delà de 30 jours");
  assert.strictEqual(book(g, { date: "2026-11-22" }).code, "CLOSED", "dimanche");
  assert.strictEqual(book(g, { time: "12:30" }).code, "CLOSED", "pause de midi");
  g.holdLock(true);
  assert.strictEqual(book(g).code, "BUSY");
  g.holdLock(false);
  g.cacheStore["rate_" + Math.floor(Date.parse(NOW) / 3600000)] = "12";
  assert.strictEqual(book(g).code, "RATE_LIMIT");
});

test("le verrou est toujours libéré, même en cas de refus", () => {
  const g = load({ now: NOW });
  book(g); book(g, { name: "Autre", phone: "0699999999", email: "a@example.com" });
  assert.strictEqual(g.lockState().lockHeld, false);
});

test("page d'action : n'agit pas à l'ouverture du lien", () => {
  const g = load({ now: NOW });
  book(g);
  const t = tokenOf(g);
  const page = g.run(`doGet({parameter:{a:"confirm",t:${JSON.stringify(t)}}})`);
  assert.match(page.html, /google\.script\.run/);
  assert.match(page.html, /Je confirme mon rendez-vous/);
  assert.strictEqual(g.cals.primary.events[0].getTag("status"), "pending");
  const cancelPage = g.run(`doGet({parameter:{a:"cancel",t:${JSON.stringify(t)}}})`);
  assert.match(cancelPage.html, /Annuler ce rendez-vous/);
  assert.strictEqual(g.cals.primary.events.length, 1);
  assert.match(g.run(`doGet({parameter:{a:"confirm",t:"00000000-0000-0000-0000-000000000000"}})`).html, /introuvable/);
  assert.match(g.run(`doGet({parameter:{a:"confirm",t:"<script>"}})`).html, /introuvable/);
});

test("confirmation : statut, titre, e-mail récapitulatif", () => {
  const g = load({ now: NOW });
  book(g);
  const t = tokenOf(g);
  g.advance(10);
  const r = act(g, t, "confirm");
  assert.ok(r.ok, r.message);
  const ev = g.cals.primary.events[0];
  assert.strictEqual(ev.getTag("status"), "confirmed");
  assert.strictEqual(ev.getTitle(), "✅ Coupe femme – Claire Test");
  assert.match(ev.getDescription(), /Confirmé par la cliente/);
  assert.strictEqual(g.mails.length, 2);
  assert.match(g.mails[1].subject, /confirmé/);
  assert.match(act(g, t, "confirm").message, /déjà confirmé/);
  assert.strictEqual(act(g, "00000000-0000-0000-0000-000000000000", "confirm").code, "NOT_FOUND");
});

test("confirmation trop tardive : créneau libéré", () => {
  const g = load({ now: NOW });
  book(g);
  const t = tokenOf(g);
  g.advance(31);
  assert.strictEqual(act(g, t, "confirm").code, "EXPIRED");
  assert.strictEqual(g.cals.primary.events.length, 0);
});

test("nettoyage toutes les 10 min : seuls les « à confirmer » de plus de 30 min partent", () => {
  const g = load({ now: NOW });
  book(g, { time: "09:30" });
  const t1 = tokenOf(g);
  act(g, t1, "confirm");
  book(g, { time: "11:00", phone: "0700000000", email: "b@example.com" });
  g.advance(20);
  assert.strictEqual(g.run("cleanupPending()"), 0);
  g.advance(11);
  assert.strictEqual(g.run("cleanupPending()"), 1);
  assert.strictEqual(g.cals.primary.events.length, 1);
  assert.strictEqual(g.cals.primary.events[0].getTag("status"), "confirmed");
  g.cals.primary.createEvent("RDV noté à la main", new Date(2026, 10, 18, 14, 0), new Date(2026, 10, 18, 15, 0), {});
  assert.strictEqual(g.run("cleanupPending()"), 0, "ne touche pas aux événements manuels");
  assert.strictEqual(g.cals.primary.events.length, 2);
});

test("annulation : événement supprimé, créneau à nouveau libre, lien pour reprendre RDV", () => {
  const g = load({ now: NOW });
  book(g);
  const t = tokenOf(g);
  act(g, t, "confirm");
  const r = act(g, t, "cancel");
  assert.ok(r.ok);
  assert.match(r.rebookUrl, /#rdv-coupe-femme$/);
  assert.strictEqual(g.cals.primary.events.length, 0);
  assert.strictEqual(day(avail(g), "2026-11-18").slots.find((s) => s.time === "10:00").free, true);
  assert.match(g.mails.slice(-1)[0].subject, /annulé/);
  assert.strictEqual(act(g, t, "cancel").code, "NOT_FOUND");
});

test("rappel la veille, une seule fois, et pas pour les non confirmés", () => {
  const g = load({ now: NOW });
  book(g, { date: "2026-11-18", time: "10:00" });
  act(g, tokenOf(g), "confirm");
  book(g, { date: "2026-11-18", time: "14:00", phone: "0700000000", email: "b@example.com" }); // reste à confirmer
  const before = g.mails.length;
  assert.strictEqual(g.run("sendReminders()"), 0, "avant 9 h");
  g.setNow("2026-11-17T10:00:00");
  assert.strictEqual(g.run("sendReminders()"), 1);
  assert.match(g.mails.slice(-1)[0].subject, /Rappel/);
  g.setNow("2026-11-17T11:00:00");
  assert.strictEqual(g.run("sendReminders()"), 0, "une seule fois");
  assert.strictEqual(g.mails.length, before + 1);
});

test("fermetures : Congé (journée), Fermé (plage), RDV noté à la main, note sans effet", () => {
  const g = load({ now: NOW });
  const c = g.cals.primary;
  c.createAllDayEvent("Congé", new Date(2026, 10, 19));
  c.createEvent("Fermé – formation", new Date(2026, 10, 20, 14, 0), new Date(2026, 10, 20, 16, 0), {});
  c.createEvent("Mme Dupont (téléphone)", new Date(2026, 10, 18, 9, 30), new Date(2026, 10, 18, 10, 0), {});
  c.createAllDayEvent("Anniversaire de Léa", new Date(2026, 10, 21));
  const r = avail(g);
  assert.strictEqual(day(r, "2026-11-19").closed, true);
  const fri = day(r, "2026-11-20").slots;
  assert.strictEqual(fri.find((s) => s.time === "14:00").free, false);
  assert.strictEqual(fri.find((s) => s.time === "13:30").free, false, "13h30+45 chevauche 14 h");
  assert.strictEqual(fri.find((s) => s.time === "16:00").free, true);
  const wed = day(r, "2026-11-18").slots;
  assert.strictEqual(wed.find((s) => s.time === "09:30").free, false);
  assert.strictEqual(wed.find((s) => s.time === "10:00").free, true);
  assert.strictEqual(day(r, "2026-11-21").closed, false);
  assert.strictEqual(book(g, { date: "2026-11-19", time: "10:00" }).code, "CLOSED");
  c.createAllDayEvent("Vacances", new Date(2026, 10, 24));
  assert.strictEqual(day(avail(g), "2026-11-24").closed, true);
});

test("plusieurs coiffeuses : « Peu importe », agenda et jours de chacune", () => {
  const staff = [
    { id: "a", name: "Anne", days: [1, 2, 3, 4, 5], calendarId: "cal-a" },
    { id: "b", name: "Béa", days: [2, 3], calendarId: "cal-b" },
  ];
  const g = load({ now: NOW, staff });
  const r1 = book(g);
  assert.strictEqual(r1.staffName, "Anne");
  assert.strictEqual(day(avail(g), "2026-11-18").slots.find((s) => s.time === "10:00").free, true, "Béa est encore libre");
  assert.strictEqual(day(avail(g, "coupe-femme", "a"), "2026-11-18").slots.find((s) => s.time === "10:00").free, false);
  const r2 = book(g, { name: "Deux", phone: "0700000000", email: "b@example.com" });
  assert.strictEqual(r2.staffName, "Béa");
  assert.strictEqual(g.cals["cal-b"].events.length, 1);
  assert.strictEqual(book(g, { name: "Trois", phone: "0711111111", email: "c@example.com" }).code, "SLOT_TAKEN");
  assert.strictEqual(day(avail(g, "coupe-femme", "b"), "2026-11-20").closed, true, "Béa ne travaille pas le vendredi");
  g.cals["cal-a"].createAllDayEvent("Congé Anne", new Date(2026, 10, 20));
  assert.strictEqual(day(avail(g), "2026-11-20").closed, true);
  assert.strictEqual(g.mails.length, 2);
  assert.ok(g.run("countUpcoming_('0612345678','claire@example.com')") === 1);
});

test("points d'entrée HTTP doGet / doPost (JSON)", () => {
  const g = load({ now: NOW });
  const out = g.run(`doGet({parameter:{action:"availability",service:"brushing",staff:"any"}})`);
  const j = JSON.parse(out.content);
  assert.ok(j.ok && j.days.length === 30);
  assert.ok(day(j, "2026-11-18").slots.some((s) => s.time === "11:30"), "brushing 30 min jusqu'à 11 h 30");
  const post = g.run(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(Object.assign({ action: "book" }, client())))}}})`);
  assert.strictEqual(JSON.parse(post.content).status, "pending");
  assert.strictEqual(JSON.parse(g.run(`doPost({postData:{contents:"pas du json"}})`).content).code, "SERVER");
  assert.strictEqual(JSON.parse(g.run(`doGet({parameter:{action:"availability",service:"x"}})`).content).code, "INVALID");
});

test("setup : crée les 2 tâches automatiques, sans doublon", () => {
  const g = load({ now: NOW });
  g.run("setup()"); g.run("setup()");
  assert.deepStrictEqual(g.triggers.map((t) => t.fn + ":" + t.every).sort(), ["cleanupPending:10min", "sendReminders:1h"]);
});

test("changement d'heure (29 mars 2027) : créneaux toujours en heure de Paris", () => {
  const g = load({ now: "2027-03-27T08:00:00" });
  const r = avail(g);
  assert.strictEqual(day(r, "2027-03-29").slots[0].time, "13:30");
  assert.ok(book(g, { date: "2027-03-30", time: "09:00" }).ok);
  assert.strictEqual(g.cals.primary.events[0].getStartTime().toISOString(), "2027-03-30T07:00:00.000Z");
});

for (const [name, fn] of tests) {
  try { fn(); passed++; console.log("✔ " + name); }
  catch (e) { console.log("✘ " + name + "\n   " + e.message); process.exitCode = 1; }
}
console.log(`\n${passed}/${tests.length} tests réussis`);
