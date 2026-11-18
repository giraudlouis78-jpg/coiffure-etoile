// Objets Google simulés (CalendarApp, LockService, CacheService, MailApp, ...) pour tester Code.gs dans Node.
// Lancer avec TZ=Europe/Paris.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const crypto = require("crypto");

function load(opts = {}) {
  let nowMs = opts.now ? new Date(opts.now).getTime() : Date.now();
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(nowMs); else super(...a); }
    static now() { return nowMs; }
  }

  let evSeq = 0;
  class Ev {
    constructor(cal, title, s, e, allDay, o = {}) { this.cal = cal; this.id = "ev" + ++evSeq; this.title = title; this.s = new RealDate(s); this.e = new RealDate(e); this.allDay = allDay; this.desc = o.description || ""; this.tags = {}; }
    getId() { return this.id; } getTitle() { return this.title; } setTitle(t) { this.title = t; return this; }
    getDescription() { return this.desc; } setDescription(d) { this.desc = d; return this; }
    getStartTime() { return new FakeDate(this.s.getTime()); } getEndTime() { return new FakeDate(this.e.getTime()); }
    isAllDayEvent() { return this.allDay; }
    getTag(k) { return k in this.tags ? this.tags[k] : null; } setTag(k, v) { this.tags[k] = String(v); return this; }
    deleteEvent() { this.cal.events = this.cal.events.filter((x) => x !== this); }
  }
  class Cal {
    constructor(id) { this.id = id; this.events = []; }
    getEvents(s, e) { return this.events.filter((x) => x.s < e && x.e > s).sort((a, b) => a.s - b.s); }
    createEvent(t, s, e, o) { const ev = new Ev(this, t, s, e, false, o); this.events.push(ev); return ev; }
    createAllDayEvent(t, d) { const s = new RealDate(d.getFullYear(), d.getMonth(), d.getDate()); const e = new RealDate(d.getFullYear(), d.getMonth(), d.getDate() + 1); const ev = new Ev(this, t, s, e, true); this.events.push(ev); return ev; }
  }
  const cals = { primary: new Cal("primary") };
  const mails = [];
  const cacheStore = {};
  const triggers = [];
  let lockHeld = false, lockCalls = 0;

  const ctx = {
    console, JSON, Math, String, Number, Object, Array, Boolean, RegExp, Error, encodeURIComponent,
    Date: FakeDate,
    CalendarApp: {
      getDefaultCalendar: () => cals.primary,
      getCalendarById: (id) => cals[id] || null,
    },
    LockService: { getScriptLock: () => ({
      tryLock() { if (lockHeld) return false; lockHeld = true; lockCalls++; return true; },
      releaseLock() { lockHeld = false; },
    }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cacheStore ? cacheStore[k] : null), put: (k, v) => { cacheStore[k] = String(v); } }) },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    ScriptApp: {
      getService: () => ({ getUrl: () => "https://script.google.com/macros/s/TEST/exec" }),
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => { const b = { timeBased: () => b, everyMinutes: (n) => ((b.every = n + "min"), b), everyHours: (n) => ((b.every = n + "h"), b), create: () => { const t = { fn, every: b.every, getHandlerFunction: () => fn }; triggers.push(t); return t; } }; return b; },
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; } }),
    },
    HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; }, addMetaTag() { return this; } }) },
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
  vm.runInContext(code, ctx, { filename: "Code.gs" });
  if (opts.staff) vm.runInContext("CONFIG.STAFF = " + JSON.stringify(opts.staff) + ";", ctx);
  (opts.staff || []).forEach((m) => { if (m.calendarId !== "primary") cals[m.calendarId] = new Cal(m.calendarId); });

  return {
    ctx, cals, mails, triggers, cacheStore,
    setNow: (d) => { nowMs = new RealDate(d).getTime(); },
    advance: (min) => { nowMs += min * 60000; },
    lockState: () => ({ lockHeld, lockCalls }),
    holdLock: (v) => { lockHeld = v; },
    run: (expr) => vm.runInContext(expr, ctx),
  };
}
module.exports = { load };
