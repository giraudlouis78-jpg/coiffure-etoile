// Tests navigateur (Playwright) : TZ=Europe/Paris node tests/e2e.js
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs"), path = require("path");
const { start } = require("./server");

const PORT = 8765, BASE = `http://localhost:${PORT}/`;
const PAGES = ["index.html", "coupe-femme-cluses.html", "brushing-cluses.html", "mentions-legales.html", "404.html"];
const SHOTS = path.join(__dirname, "..", "captures");
fs.mkdirSync(SHOTS, { recursive: true });
let ok = 0, fail = 0;
async function step(name, fn) {
  try { await fn(); ok++; console.log("✔ " + name); }
  catch (e) { fail++; console.log("✘ " + name + "\n   " + (e.stack || e).split("\n").slice(0, 3).join("\n   ")); }
}
function watch(page) {
  const errors = [], external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) external.push(r.url()); });
  return { errors, external };
}
async function fillForm(page, o = {}) {
  await page.fill("#f-name", o.name || "Claire Test");
  await page.fill("#f-phone", o.phone || "06 12 34 56 78");
  await page.fill("#f-email", o.email || "claire@example.com");
  if (o.consent !== false) await page.check("input[name=consent]");
}
async function pickFirstFree(page) {
  await page.waitForSelector(".slot:not([disabled])");
  const b = page.locator(".slot:not([disabled])").first();
  const t = await b.getAttribute("data-time");
  await b.click();
  return t;
}

(async () => {
  const { srv, g } = await start(PORT);
  const browser = await chromium.launch();

  await step("toutes les pages : aucune erreur JS, aucune requête extérieure (mobile + ordinateur)", async () => {
    for (const vp of [{ width: 390, height: 844, name: "mobile" }, { width: 1280, height: 860, name: "ordinateur" }]) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
      for (const p of PAGES) {
        const page = await ctx.newPage();
        const w = watch(page);
        await page.goto(BASE + p, { waitUntil: "networkidle" });
        assert.deepStrictEqual(w.errors, [], p + " erreurs JS");
        assert.deepStrictEqual(w.external, [], p + " requêtes extérieures");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, `${p} (${vp.name}) déborde de ${overflow}px`);
        const wide = await page.evaluate(() => [...document.querySelectorAll("main *, header *, footer *")].filter((el) => {
          if (el.closest(".days,.hp,.sr-only,.skip")) return false;
          const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1;
        }).map((el) => el.tagName + "." + el.className).slice(0, 5));
        assert.deepStrictEqual(wide, [], `${p} (${vp.name}) éléments qui sortent de l'écran`);
        await page.screenshot({ path: path.join(SHOTS, `${vp.name}-${p.replace(".html", "")}.png`), fullPage: true });
        await page.close();
      }
      await ctx.close();
    }
  });

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

  await step("SEO : title et meta description uniques, JSON-LD valide, canoniques, liens internes", async () => {
    const titles = new Set(), descs = new Set(), links = new Set();
    for (const p of PAGES) {
      const page = await ctx.newPage();
      await page.goto(BASE + p);
      const info = await page.evaluate(() => ({
        lang: document.documentElement.lang, title: document.title,
        desc: document.querySelector("meta[name=description]").content,
        canon: document.querySelector("link[rel=canonical]").href,
        og: !!document.querySelector("meta[property='og:title']"),
        ld: [...document.querySelectorAll("script[type='application/ld+json']")].map((s) => s.textContent),
        h1: document.querySelectorAll("h1").length,
        links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => !/^(https?:|tel:|mailto:|#)/.test(h)),
        imgsNoAlt: [...document.querySelectorAll("img:not([alt])")].length,
      }));
      assert.strictEqual(info.lang, "fr");
      assert.strictEqual(info.h1, 1, p + " un seul h1");
      assert.ok(info.og && info.canon, p);
      assert.ok(!titles.has(info.title), "title en double : " + info.title); titles.add(info.title);
      assert.ok(!descs.has(info.desc), "description en double : " + p); descs.add(info.desc);
      info.ld.forEach((t) => JSON.parse(t));
      info.links.forEach((l) => links.add(l.split("#")[0]));
      if (p === "index.html") {
        const types = info.ld.map((t) => JSON.parse(t)["@type"]);
        assert.deepStrictEqual(types, ["HairSalon", "FAQPage"]);
        const salon = JSON.parse(info.ld[0]);
        assert.strictEqual(salon.openingHoursSpecification.length, 10);
        assert.ok(salon.geo && salon.address && salon["@id"]);
      }
      if (p.startsWith("coupe")) assert.deepStrictEqual(info.ld.map((t) => JSON.parse(t)["@type"]), ["BreadcrumbList", "Service", "FAQPage"]);
      await page.close();
    }
    for (const l of links) {
      const r = await (await ctx.newPage()).goto(BASE + l);
      assert.strictEqual(r.status(), 200, "lien cassé : " + l);
    }
    const sm = fs.readFileSync(path.join(__dirname, "..", "site", "sitemap.xml"), "utf8");
    ["coupe-femme-cluses.html", "brushing-cluses.html", "mentions-legales.html"].forEach((u) => assert.ok(sm.includes(u), "sitemap " + u));
    assert.ok(!sm.includes("404"), "404 hors sitemap");
  });

  await step("indicateur « Ouvert maintenant / Fermé » en heure de Paris + ligne du jour", async () => {
    const page = await ctx.newPage();
    const cases = [
      ["2026-11-17T10:00:00+01:00", "Ouvert maintenant · ferme à 12 h", "1"],
      ["2026-11-17T12:30:00+01:00", "Fermé · réouvre aujourd'hui à 13 h 30", "1"],
      ["2026-11-21T19:30:00+01:00", "Fermé · réouvre lundi à 13 h 30", "5"],
      ["2026-11-22T11:00:00+01:00", "Fermé · réouvre demain à 13 h 30", "6"],
      ["2026-11-23T08:00:00+01:00", "Fermé · réouvre aujourd'hui à 13 h 30", "0"],
      ["2026-11-18T09:15:00+01:00", "Fermé · réouvre aujourd'hui à 9 h 30", "2"],
      ["2026-11-17T23:30:00Z", "Fermé · réouvre aujourd'hui à 9 h 30", "2"], // 00 h 30 à Paris, mercredi
    ];
    for (const [now, txt, d] of cases) {
      await page.goto(BASE + "index.html?now=" + encodeURIComponent(now));
      assert.strictEqual((await page.textContent("[data-open-status]")).trim(), txt, now);
      assert.strictEqual(await page.getAttribute(".hours tr.today", "data-day"), d, now);
    }
  });

  await step("carte : rien de chargé avant le clic, iframe Google après « Afficher le plan »", async () => {
    const page = await ctx.newPage();
    const w = watch(page);
    await page.route(/google\.com/, (r) => r.fulfill({ status: 200, body: "carte" }));
    await page.goto(BASE + "index.html", { waitUntil: "networkidle" });
    assert.strictEqual(await page.locator(".map iframe").count(), 0);
    assert.deepStrictEqual(w.external, []);
    await page.click("[data-map-load]");
    assert.match(await page.getAttribute(".map iframe", "src"), /^https:\/\/www\.google\.com\/maps\?q=46\.0586347,6\.5808537/);
  });

  await step("mode démonstration : bandeau, réservation, créneau gelé, limite par cliente", async () => {
    const page = await ctx.newPage();
    const w = watch(page);
    await page.goto(BASE + "index.html#rdv-brushing");
    assert.ok(await page.isVisible("[data-demo]"));
    assert.ok(await page.isChecked("#svc-brushing"), "prestation présélectionnée depuis l'ancre");
    assert.ok(await page.locator(".day:disabled").count() >= 4, "dimanches grisés");
    assert.ok(await page.locator(".slot:disabled").count() > 0, "créneaux pris barrés");
    for (let i = 0; i < 2; i++) {
      const t = await pickFirstFree(page);
      await fillForm(page);
      await page.click("button[type=submit]");
      await page.waitForSelector(".msg.ok");
      assert.match(await page.textContent(".msg"), /Démonstration.*30 minutes/);
      await page.waitForSelector(".slot");
      assert.ok(await page.locator(`.slot[data-time="${t}"]`).isDisabled(), "créneau gelé après réservation");
    }
    await pickFirstFree(page);
    await fillForm(page);
    await page.click("button[type=submit]");
    await page.waitForSelector(".msg.ko");
    assert.match(await page.textContent(".msg"), /déjà 2 rendez-vous/);
    assert.deepStrictEqual(w.errors, []);
  });

  await step("validation du formulaire : téléphone, e-mail, consentement", async () => {
    const page = await ctx.newPage();
    await page.goto(BASE + "index.html#rdv-coupe-femme");
    await pickFirstFree(page);
    await fillForm(page, { phone: "12" });
    await page.click("button[type=submit]");
    assert.match(await page.textContent(".msg.ko"), /téléphone invalide/);
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "f-phone");
    await fillForm(page, { email: "abc" });
    await page.click("button[type=submit]");
    assert.match(await page.textContent(".msg.ko"), /e-mail invalide/);
    await page.goto(BASE + "index.html#rdv-coupe-femme"); await page.reload();
    await pickFirstFree(page);
    await fillForm(page, { consent: false });
    await page.click("button[type=submit]");
    assert.match(await page.textContent(".msg.ko"), /consentement/);
  });

  await step("parcours réel avec le script Apps Script (simulé) : page prestation → réservation → créneau gelé → refus si pris → limite", async () => {
    const api = encodeURIComponent(BASE + "api");
    const page = await ctx.newPage();
    const w = watch(page);
    await page.goto(BASE + "coupe-femme-cluses.html");
    const href = await page.getAttribute(".cta .btn", "href");
    assert.strictEqual(href, "index.html#rdv-coupe-femme");
    await page.goto(BASE + "index.html?api=" + api + "#rdv-coupe-femme");
    assert.ok(await page.isHidden("[data-demo]"), "pas de bandeau démo avec une URL de script");
    assert.ok(await page.isChecked("#svc-coupe-femme"));
    const t = await pickFirstFree(page);
    const date = await page.getAttribute(".day[aria-pressed=true]", "data-date");
    // une autre cliente réserve le même créneau entre-temps, dans un autre onglet
    const other = await ctx.newPage();
    await other.goto(BASE + "index.html?api=" + api + "#rdv-coupe-femme");
    await other.waitForSelector(".slot");
    await other.click(`.day[data-date="${date}"]`);
    await other.click(`.slot[data-time="${t}"]`);
    await fillForm(other, { name: "Rapide", phone: "0700000000", email: "rapide@example.com" });
    await other.click("button[type=submit]");
    await other.waitForSelector(".msg.ok");
    const pending = g.cals.primary.events.filter((e) => e.getTag("status") === "pending");
    assert.strictEqual(pending.length, 1);
    assert.match(pending[0].getTitle(), /⏳ À confirmer – Coupe femme – Rapide/);
    assert.match(g.mails[0].htmlBody, /Confirmer mon rendez-vous/);
    // la première cliente valide : refus propre + grille rechargée avec le créneau barré
    await fillForm(page);
    await page.click("button[type=submit]");
    await page.waitForSelector(".msg.ko");
    assert.match(await page.textContent(".msg"), /vient d'être pris/);
    await page.waitForSelector(`.slot[data-time="${t}"]`);
    assert.ok(await page.locator(`.slot[data-time="${t}"]`).isDisabled());
    // elle prend 2 autres créneaux, le 3e est refusé
    for (let i = 0; i < 2; i++) {
      await pickFirstFree(page); await fillForm(page);
      await page.click("button[type=submit]");
      await page.waitForSelector(".msg.ok");
      await page.waitForSelector(".slot");
    }
    await pickFirstFree(page); await fillForm(page);
    await page.click("button[type=submit]");
    await page.waitForSelector(".msg.ko");
    assert.match(await page.textContent(".msg"), /déjà 2 rendez-vous/);
    assert.strictEqual(g.cals.primary.events.length, 3);
    assert.deepStrictEqual(w.errors, []);
    assert.deepStrictEqual(w.external, []);
  });

  await step("service indisponible : message clair avec le téléphone", async () => {
    const page = await ctx.newPage();
    await page.goto(BASE + "index.html?api=" + encodeURIComponent("http://localhost:1/x") + "#rdv-coupe-femme");
    await page.waitForSelector(".msg.ko");
    assert.match(await page.textContent(".msg"), /ne répond pas.*09 50 02 82 54/);
  });

  await step("accessibilité de base : zones cliquables ≥ 44 px, navigation clavier, barre mobile", async () => {
    const page = await ctx.newPage();
    await page.goto(BASE + "index.html#rdv-coupe-femme");
    await page.waitForSelector(".slot");
    const small = await page.evaluate(() => [...document.querySelectorAll("a.btn,button,.svc-name,.choice label,.links a,.foot li a,.crumbs a,select,input:not([type=checkbox]):not([type=radio]):not(#f-website)")]
      .filter((el) => el.offsetParent !== null).map((el) => [el.textContent.trim().slice(0, 30) || el.id, Math.round(el.getBoundingClientRect().height)]).filter(([, h]) => h < 44));
    assert.deepStrictEqual(small, []);
    assert.ok(await page.isVisible(".mbar a[href^='tel:']") && await page.isVisible(".mbar a[href$='#rdv']"));
    await page.keyboard.press("Tab");
    assert.strictEqual(await page.evaluate(() => document.activeElement.className), "skip");
    const big = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await big.goto(BASE + "index.html");
    assert.ok(await big.isHidden(".mbar") && await big.isVisible(".top .call"));
    await big.close();
  });

  await browser.close();
  srv.close();
  console.log(`\n${ok}/${ok + fail} vérifications réussies`);
  process.exitCode = fail ? 1 : 0;
})();
