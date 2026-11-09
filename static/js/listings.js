/* Shows paid listings and ads from the JoharTrip listings worker. Does nothing until the endpoint is set in config.json. */
(function () {
  var s = document.currentScript, EP = (s && s.dataset.endpoint || "").replace(/\/+$/, "");
  if (!EP) return;
  var places = document.querySelectorAll("[data-jt-place]");
  if (!places.length) return;
  var place = places[0].getAttribute("data-jt-place");
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x) e.textContent = x; return e; }
  function link(href, cls, txt, track) { var a = el("a", cls, txt); a.href = href; a.rel = "sponsored nofollow noopener"; a.target = "_blank"; if (track) a.setAttribute("data-track", track); return a; }
  function card(l) {
    var b = el("div", "mbox sponsor jt-lst" + (l.plan === "partner" ? " jt-big" : ""));
    b.appendChild(el("span", "ad-note", "Featured partner"));
    if (l.img) { var i = el("img", "jt-img"); i.src = EP + "/img?id=" + l.id; i.alt = l.name; i.loading = "lazy"; i.width = 320; i.height = 200; b.appendChild(i); }
    b.appendChild(el("h4", "", l.name)); b.appendChild(el("p", "muted", l.blurb));
    var r = el("div", "jt-row"); r.appendChild(link(EP + "/go?id=" + l.id, "btn", l.cta || "Visit website", "partner_click"));
    if (l.call) r.appendChild(link(EP + "/go?id=" + l.id + "&t=call", "btn ghost", "Call", "partner_call"));
    b.appendChild(r); return b;
  }
  function ad(a) {
    var w = el("div", "adbox jt-adb"); w.appendChild(el("span", "ad-note", "Advertisement"));
    var k = link(EP + "/go?id=" + a.id, "jt-ad-a", "", "ad_click");
    if (a.img) { var i = el("img", "jt-ad-img"); i.src = EP + "/img?id=" + a.id; i.alt = a.name; i.loading = "lazy"; i.width = 600; i.height = 200; k.appendChild(i); }
    var t = el("span", "jt-ad-t"); t.appendChild(el("b", "", a.name)); t.appendChild(document.createTextNode(" " + a.blurb)); k.appendChild(t);
    w.appendChild(k); return w;
  }
  fetch(EP + "/public?place=" + encodeURIComponent(place)).then(function (r) { return r.json(); }).then(function (j) {
    var slot = document.querySelector("[data-jt-ads]"), box = document.querySelector("[data-jt-partners]");
    if (slot && j.ads && j.ads.length) { slot.textContent = ""; slot.appendChild(ad(j.ads[0])); slot.hidden = false; }
    if (box && j.listings && j.listings.length) { j.listings.forEach(function (l) { box.appendChild(card(l)); }); box.hidden = false; }
  }).catch(function () { });
})();
