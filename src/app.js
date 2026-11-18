/* Coiffure Étoile – scripts du site (sans dépendance) */
(function () {
  "use strict";
  var CFG = window.SITE_CFG || {};
  var TZ = "Europe/Paris";
  var DAY_LABELS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

  /* ---------- Heure de Paris ---------- */
  function parisParts(date) {
    var f = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
    var o = {};
    f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    var wd = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."].indexOf(o.weekday);
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, wd: wd };
  }
  function fmtH(t) { var a = t.split(":"); return +a[0] + " h" + (a[1] !== "00" ? " " + a[1] : ""); }
  function toMin(hhmm) { var a = hhmm.split(":"); return +a[0] * 60 + +a[1]; }
  function monIdx(jsDay) { return (jsDay + 6) % 7; } // lundi = 0
  function nowOverride() {
    var q = new URLSearchParams(location.search).get("now");
    return q ? new Date(q) : new Date();
  }

  /* ---------- Ouvert maintenant ---------- */
  function openStatus() {
    var el = document.querySelector("[data-open-status]");
    var p = parisParts(nowOverride());
    var today = monIdx(p.wd);
    var rows = document.querySelectorAll(".hours tr[data-day]");
    rows.forEach(function (r) { r.classList.toggle("today", +r.dataset.day === today); });
    if (!el || !CFG.hours) return;
    var cur = p.h * 60 + p.min;
    var ranges = CFG.hours[today] || [];
    for (var i = 0; i < ranges.length; i++) {
      var a = toMin(ranges[i][0]), b = toMin(ranges[i][1]);
      if (cur >= a && cur < b) {
        el.textContent = "Ouvert maintenant · ferme à " + fmtH(ranges[i][1]);
        el.className = "status is-open";
        return;
      }
    }
    // prochaine ouverture
    for (var k = 0; k < 8; k++) {
      var d = (today + k) % 7, rs = CFG.hours[d] || [];
      for (var j = 0; j < rs.length; j++) {
        if (k > 0 || toMin(rs[j][0]) > cur) {
          var when = k === 0 ? "aujourd'hui" : k === 1 ? "demain" : DAY_LABELS[(d + 1) % 7];
          el.textContent = "Fermé · réouvre " + when + " à " + fmtH(rs[j][0]);
          el.className = "status is-closed";
          return;
        }
      }
    }
  }

  /* ---------- Carte au clic (aucune requête Google avant) ---------- */
  function mapOnClick() {
    var btn = document.querySelector("[data-map-load]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var box = btn.closest(".map");
      var f = document.createElement("iframe");
      f.title = "Plan d'accès au salon Coiffure Étoile";
      f.loading = "lazy";
      f.referrerPolicy = "no-referrer-when-downgrade";
      f.src = "https://www.google.com/maps?q=" + CFG.lat + "," + CFG.lng + "&z=17&output=embed";
      box.innerHTML = "";
      box.appendChild(f);
      box.classList.add("loaded");
    });
  }

  /* ---------- Réservation ---------- */
  function Api() {
    var url = (new URLSearchParams(location.search).get("api")) || CFG.scriptUrl;
    this.demo = !url;
    this.url = url;
  }
  Api.prototype.availability = function (service, staff) {
    if (this.demo) return Promise.resolve(Demo.availability(service, staff));
    var u = this.url + (this.url.indexOf("?") < 0 ? "?" : "&") + "action=availability&service=" + encodeURIComponent(service) + "&staff=" + encodeURIComponent(staff);
    return fetch(u, { method: "GET" }).then(function (r) { return r.json(); });
  };
  Api.prototype.book = function (payload) {
    if (this.demo) return Promise.resolve(Demo.book(payload));
    // text/plain : évite la requête préalable CORS refusée par Apps Script
    return fetch(this.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ action: "book" }, payload)) })
      .then(function (r) { return r.json(); });
  };

  /* Mode démonstration : simule le serveur, n'envoie rien. */
  var Demo = (function () {
    var booked = {}; // "staff|date|time" -> true
    var byClient = {};
    function key(s, d, t) { return s + "|" + d + "|" + t; }
    function seeded(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h) % 100; }
    function svc(id) { return (CFG.services || []).filter(function (s) { return s.id === id; })[0]; }
    function staffList(id) { return (CFG.staff || []).filter(function (s) { return id === "any" || s.id === id; }); }
    function availability(service, staff) {
      var s = svc(service); if (!s) return { ok: false, code: "INVALID", message: "Prestation inconnue." };
      var days = [], now = nowOverride(), p0 = parisParts(now), nowMin = p0.h * 60 + p0.min;
      for (var i = 0; i < 30; i++) {
        var dt = new Date(Date.UTC(p0.y, p0.m - 1, p0.d + i, 12));
        var wd = monIdx(dt.getUTCDay());
        var iso = dt.toISOString().slice(0, 10);
        var team = staffList(staff).filter(function (m) { return m.days.indexOf(wd) >= 0; });
        var ranges = CFG.hours[wd] || [];
        var slots = [];
        ranges.forEach(function (r) {
          for (var t = toMin(r[0]); t + s.duration <= toMin(r[1]); t += 15) {
            var hh = ("0" + Math.floor(t / 60)).slice(-2) + ":" + ("0" + (t % 60)).slice(-2);
            if (i === 0 && t <= nowMin + 60) continue;
            var free = team.some(function (m) { return !booked[key(m.id, iso, hh)] && seeded(m.id + iso + hh) > 30; });
            slots.push({ time: hh, free: free });
          }
        });
        days.push({ date: iso, closed: !team.length || !slots.length, slots: slots });
      }
      return { ok: true, demo: true, days: days };
    }
    function book(p) {
      var v = validate(p); if (v) return v;
      if (p.website) return { ok: true, status: "pending" }; // robot : on fait semblant
      var c = (p.phone.replace(/\D/g, "")) + "|" + p.email.toLowerCase();
      if ((byClient[c] || 0) >= 2) return { ok: false, code: "LIMIT_CLIENT", message: "Vous avez déjà 2 rendez-vous à venir. Appelez le salon pour en prendre un autre." };
      var av = availability(p.service, p.staff).days.filter(function (d) { return d.date === p.date; })[0];
      var sl = av && av.slots.filter(function (s) { return s.time === p.time; })[0];
      if (!sl || !sl.free) return { ok: false, code: "SLOT_TAKEN", message: "Ce créneau vient d'être pris. Choisissez-en un autre." };
      var m = staffList(p.staff).filter(function (m) { return !booked[key(m.id, p.date, p.time)] && seeded(m.id + p.date + p.time) > 30; })[0];
      booked[key(m.id, p.date, p.time)] = true;
      byClient[c] = (byClient[c] || 0) + 1;
      return { ok: true, status: "pending", demo: true, staffName: m.name, holdMinutes: 30 };
    }
    return { availability: availability, book: book };
  })();

  function validate(p) {
    if (!p.name || p.name.trim().length < 2) return { ok: false, code: "INVALID", field: "name", message: "Indiquez votre nom." };
    if (!/^(\+33|0)[1-9](\D?\d{2}){4}$/.test((p.phone || "").replace(/\s/g, ""))) return { ok: false, code: "INVALID", field: "phone", message: "Numéro de téléphone invalide (ex. 06 12 34 56 78)." };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email || "")) return { ok: false, code: "INVALID", field: "email", message: "Adresse e-mail invalide." };
    if (!p.consent) return { ok: false, code: "INVALID", field: "consent", message: "Merci de cocher la case de consentement." };
    if (!p.date || !p.time) return { ok: false, code: "INVALID", message: "Choisissez un jour et un horaire." };
    return null;
  }

  function booking() {
    var root = document.getElementById("rdv");
    if (!root) return;
    var api = new Api();
    var state = { service: null, staff: "any", date: null, time: null, days: [] };
    var $ = function (s) { return root.querySelector(s); };
    var daysEl = $("[data-days]"), slotsEl = $("[data-slots]"), msg = $("[data-msg]"), form = $("form"), sum = $("[data-summary]");
    if (api.demo) $("[data-demo]").hidden = false;

    function say(text, ok) { msg.textContent = text; msg.className = "msg " + (ok ? "ok" : "ko"); }
    function clearMsg() { msg.textContent = ""; msg.className = "msg"; }
    function svc() { return CFG.services.filter(function (s) { return s.id === state.service; })[0]; }
    function fmtDay(iso, opts) { return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", Object.assign({ timeZone: "UTC" }, opts)); }

    function updateSummary() {
      var s = svc();
      if (s && state.date && state.time) {
        sum.textContent = s.name + " · " + fmtDay(state.date, { weekday: "long", day: "numeric", month: "long" }) + " à " + state.time.replace(":", " h ");
        sum.hidden = false;
      } else sum.hidden = true;
      form.querySelector("[type=submit]").disabled = !(s && state.date && state.time);
    }

    function load() {
      state.time = null; updateSummary();
      if (!state.service) return;
      slotsEl.innerHTML = '<p class="hint">Chargement des disponibilités…</p>';
      daysEl.innerHTML = "";
      return api.availability(state.service, state.staff).then(function (res) {
        if (!res.ok) { slotsEl.innerHTML = ""; say(res.message || "Impossible de charger les disponibilités.", false); return; }
        state.days = res.days;
        if (!state.date || !res.days.some(function (d) { return d.date === state.date && !d.closed; })) {
          var first = res.days.filter(function (d) { return !d.closed && d.slots.some(function (s) { return s.free; }); })[0];
          state.date = first ? first.date : null;
        }
        renderDays(); renderSlots();
      }).catch(function () {
        slotsEl.innerHTML = "";
        say("Le service de réservation ne répond pas. Appelez-nous au " + CFG.phone + ".", false);
      });
    }

    function renderDays() {
      daysEl.innerHTML = "";
      state.days.forEach(function (d) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "day"; b.dataset.date = d.date;
        b.innerHTML = "<small>" + fmtDay(d.date, { weekday: "short" }) + "</small><b>" + fmtDay(d.date, { day: "numeric" }) + "</b><small>" + fmtDay(d.date, { month: "short" }) + "</small>";
        var full = !d.closed && !d.slots.some(function (s) { return s.free; });
        b.disabled = d.closed || full;
        b.setAttribute("aria-label", fmtDay(d.date, { weekday: "long", day: "numeric", month: "long" }) + (d.closed ? " – fermé" : full ? " – complet" : ""));
        b.setAttribute("aria-pressed", String(d.date === state.date));
        b.addEventListener("click", function () { state.date = d.date; state.time = null; renderDays(); renderSlots(); updateSummary(); });
        daysEl.appendChild(b);
      });
      var sel = daysEl.querySelector("[aria-pressed=true]");
      if (sel && sel.scrollIntoView && sel.offsetLeft > daysEl.clientWidth) daysEl.scrollLeft = sel.offsetLeft - 8;
    }

    function renderSlots() {
      slotsEl.innerHTML = "";
      var d = state.days.filter(function (x) { return x.date === state.date; })[0];
      if (!d) { slotsEl.innerHTML = '<p class="hint">Aucune disponibilité sur les 30 prochains jours. Appelez-nous au ' + CFG.phone + ".</p>"; return; }
      d.slots.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "slot"; b.textContent = s.time.replace(":", " h ");
        b.dataset.time = s.time;
        b.disabled = !s.free;
        b.setAttribute("aria-label", s.time.replace(":", " h ") + (s.free ? "" : " – déjà pris"));
        b.setAttribute("aria-pressed", String(s.time === state.time));
        b.addEventListener("click", function () {
          state.time = s.time; clearMsg();
          slotsEl.querySelectorAll(".slot").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          updateSummary();
        });
        slotsEl.appendChild(b);
      });
    }

    root.querySelectorAll("input[name=service]").forEach(function (r) {
      r.addEventListener("change", function () { state.service = r.value; clearMsg(); load(); });
    });
    var staffSel = $("select[name=staff]");
    if (staffSel) staffSel.addEventListener("change", function () { state.staff = staffSel.value; load(); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearMsg();
      var fd = new FormData(form);
      var p = {
        service: state.service, staff: state.staff, date: state.date, time: state.time,
        name: (fd.get("name") || "").trim(), phone: (fd.get("phone") || "").trim(), email: (fd.get("email") || "").trim(),
        note: (fd.get("note") || "").trim(), website: fd.get("website") || "", consent: !!fd.get("consent")
      };
      var v = validate(p);
      if (v) { say(v.message, false); if (v.field) { var f = form.querySelector("[name=" + v.field + "]"); f && f.focus(); } return; }
      var btn = form.querySelector("[type=submit]");
      btn.disabled = true; btn.textContent = "Envoi…";
      api.book(p).then(function (res) {
        btn.textContent = "Réserver ce créneau";
        if (res.ok) {
          say((res.demo ? "[Démonstration – aucun e-mail envoyé] " : "") + "Presque fini ! Un e-mail vient de vous être envoyé à " + p.email + ". Cliquez sur le lien qu'il contient dans les 30 minutes pour confirmer votre rendez-vous, sinon le créneau sera libéré.", true);
          form.reset(); state.time = null;
          return load();
        }
        say(res.message || "La réservation n'a pas pu aboutir.", false);
        if (res.code === "SLOT_TAKEN") return load();
        updateSummary();
      }).catch(function () {
        btn.textContent = "Réserver ce créneau"; updateSummary();
        say("Le service de réservation ne répond pas. Appelez-nous au " + CFG.phone + ".", false);
      });
    });

    function fromHash() {
      var m = location.hash.match(/^#rdv-(.+)$/);
      if (!m) return;
      var r = root.querySelector("input[name=service][value='" + m[1].replace(/[^a-z0-9-]/g, "") + "']");
      if (r) { r.checked = true; state.service = r.value; load(); root.scrollIntoView(); }
    }
    window.addEventListener("hashchange", fromHash);
    fromHash();
    updateSummary();
  }

  openStatus();
  setInterval(openStatus, 60000);
  mapOnClick();
  booking();
  window.__validateBooking = validate;
})();
