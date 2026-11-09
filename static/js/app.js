(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const params = new URLSearchParams(location.search);
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  /* ---------- consent + ads (AdSense loads only after consent) ---------- */
  const adsMeta = $('meta[name="jt-ads"]');
  function loadAds() {
    if (!adsMeta || window.__adsLoaded) return;
    window.__adsLoaded = true;
    const s = document.createElement("script");
    s.async = true; s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + adsMeta.content;
    document.head.appendChild(s);
  }
  const consent = store.get("jt_consent");
  const banner = $("#cookie");
  if (!consent && banner) banner.hidden = false;
  if (consent === "yes") loadAds();
  $$("[data-consent]").forEach((b) => b.addEventListener("click", () => {
    store.set("jt_consent", b.dataset.consent); banner.hidden = true;
    if (b.dataset.consent === "yes") loadAds();
  }));

  /* ---------- click tracking (feeds the revenue engine via GA4 export) ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-track]");
    if (!t) return;
    const slot = t.closest("[data-slot]");
    const ev = { event_category: "monetization", page: location.pathname, slot: slot ? slot.dataset.slot : "", label: t.dataset.track };
    if (window.gtag) window.gtag("event", t.dataset.track, ev);
    if (window.zaraz) window.zaraz.track(t.dataset.track, ev);
  });

  /* ---------- share ---------- */
  $$(".share").forEach((b) => b.addEventListener("click", () => {
    const url = location.href.split("?")[0];
    const text = b.dataset.share + " – " + url;
    if (navigator.share) navigator.share({ title: b.dataset.share, url }).catch(() => {});
    else window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
  }));

  let indexP;
  const getIndex = () => (indexP = indexP || fetch("/static/search-index.json").then((r) => r.json()));


  /* ---------- theme toggle ---------- */
  const tb = $("#theme");
  if (tb) {
    const cur = () => document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    tb.setAttribute("aria-pressed", cur() === "dark");
    tb.addEventListener("click", () => { const n = cur() === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); store.set("jt_theme", n); tb.setAttribute("aria-pressed", n === "dark"); });
  }

  /* ---------- home: month picker ---------- */
  const ms = $("#monthsel");
  if (ms) {
    const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const slugs = names.map((n) => n.toLowerCase());
    const upd = () => {
      const m = ms.value;
      $$("#mlist .mrow").forEach((r) => { r.hidden = !r.dataset.best.split(",").includes(m); });
      $("#mh").textContent = "Best in " + names[m - 1];
      const l = $("#mlink"); l.href = "/best-places-to-visit-in-" + slugs[m - 1] + "/"; l.textContent = "All places for " + names[m - 1];
    };
    ms.addEventListener("change", upd);
  }

  /* ---------- search autocomplete ---------- */
  $$("input[data-suggest]").forEach((inp) => {
    const box = document.createElement("ul"); box.className = "suggest"; box.hidden = true; inp.parentNode.appendChild(box);
    inp.addEventListener("input", () => getIndex().then((idx) => {
      const t = inp.value.toLowerCase().trim();
      const hits = t.length < 2 ? [] : idx.filter((d) => (d.name + " " + d.state + " " + (d.deity || "")).toLowerCase().includes(t)).slice(0, 6);
      box.innerHTML = hits.map((d) => `<li><a href="/destinations/${d.slug}/">${esc(d.name)}<span>${esc(d.state)}</span></a></li>`).join("");
      box.hidden = !hits.length;
    }));
    document.addEventListener("click", (e) => { if (!box.contains(e.target) && e.target !== inp) box.hidden = true; });
    inp.addEventListener("keydown", (e) => { if (e.key === "Escape") box.hidden = true; });
  });

  /* ---------- table of contents scrollspy ---------- */
  const tocLinks = $$(".toc-d a");
  if (tocLinks.length && "IntersectionObserver" in window) {
    const map = new Map(tocLinks.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { tocLinks.forEach((a) => a.classList.remove("on")); const a = map.get(e.target.id); if (a) a.classList.add("on"); } }), { rootMargin: "-20% 0px -70% 0px" });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  /* ---------- bottom nav highlight + service worker ---------- */
  $$(".bottomnav a").forEach((a) => { const h = a.getAttribute("href"); if (h === location.pathname || (h !== "/" && location.pathname.startsWith(h))) a.classList.add("on"); });
  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));


  /* ---------- permit/rule filters (shared by destination pages, hub and planner) ---------- */
  const fa = $("#rf-aud"), fm = $("#rf-mode");
  const applyRules = () => {
    const a = fa ? fa.value : "", m = fm ? fm.value : "";
    let shown = 0;
    $$(".rule").forEach((r) => {
      const okA = !a || r.dataset.aud === "all" || r.dataset.aud === a;
      const ms = r.dataset.modes.split(" ");
      const okM = !m || ms.includes("any") || ms.includes(m);
      r.hidden = !(okA && okM); if (!r.hidden) shown++;
    });
    const none = $(".rnone"); if (none) none.hidden = shown > 0;
  };
  if (fa || fm) {
    if (fa) { fa.value = store.get("jt_aud") || ""; fa.addEventListener("change", () => { store.set("jt_aud", fa.value); applyRules(); }); }
    if (fm) { fm.value = store.get("jt_mode") || ""; fm.addEventListener("change", () => { store.set("jt_mode", fm.value); applyRules(); }); }
    applyRules();
  }

  /* ---------- destination filters ---------- */
  const grid = $("#cardgrid");
  if (grid) {
    let cat = params.get("cat") || "", region = "", month = "";
    const apply = () => {
      let n = 0;
      $$(".card", grid).forEach((c) => {
        const ok = (!cat || c.dataset.cats.split(" ").includes(cat)) && (!region || c.dataset.region === region) && (!month || c.dataset.best.split(",").includes(month));
        c.hidden = !ok; if (ok) n++;
      });
      $("#nores").hidden = n > 0;
      $$(".chip[data-cat]").forEach((b) => b.classList.toggle("on", b.dataset.cat === cat));
    };
    $$(".chip[data-cat]").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; apply(); }));
    $("#region").addEventListener("change", (e) => { region = e.target.value; apply(); });
    const mf = $("#monthfilter"); if (mf) mf.addEventListener("change", (e) => { month = e.target.value; apply(); });
    apply();
  }

  /* ---------- search ---------- */
  const q = $("#q");
  if (q) {
    const out = $("#results");
    const run = () => getIndex().then((idx) => {
      const terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (!terms.length) { out.innerHTML = '<p class="muted">Try “Jyotirlinga”, “trek”, “Shiva”, “beach” or a state name.</p>'; return; }
      const scored = idx.map((d) => {
        const hay = [d.name, d.state, d.region, d.deity, d.summary, d.cats.join(" "), d.todo.join(" ")].join(" ").toLowerCase();
        let s = 0; terms.forEach((t) => { if (d.name.toLowerCase().includes(t)) s += 5; if (hay.includes(t)) s += 1; else s -= 10; });
        return [s, d];
      }).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]);
      out.innerHTML = scored.length ? scored.map(([, d]) =>
        `<a class="res" href="/destinations/${d.slug}/"><h3>${esc(d.name)}</h3><p class="muted">${esc(d.state)}${d.deity ? " · " + esc(d.deity) : ""}</p><p>${esc(d.summary)}</p></a>`).join("")
        : `<p>No results yet for “${esc(q.value)}”. Our research agent adds new places every week: <a href="mailto:contact@johartrip.com?subject=Please%20add%20${encodeURIComponent(q.value)}">request this place</a>.</p>`;
    });
    q.value = params.get("q") || "";
    q.addEventListener("input", run); run();
  }


  /* ---------- motion: scroll reveal, skipped when the visitor prefers reduced motion ---------- */
  (function () {
    if (!('IntersectionObserver' in window) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var els = document.querySelectorAll('.grid > .card, .month-strip > *, .day, .rule, .story, .trust > *, .pl-day, .pilgrim-card, .stat');
    if (!els.length) return;
    document.documentElement.classList.add('mo');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (el, i) { el.classList.add('rv'); el.style.setProperty('--d', (i % 4) * 70 + 'ms'); io.observe(el); });
    setTimeout(function () { els.forEach(function (el) { el.classList.add('in'); }); }, 4000); /* safety: never leave content hidden */
  })();

})();
