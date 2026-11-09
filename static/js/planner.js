/* JoharTrip timed trip planner.
   Site lists and typical timings come from our own guides (data/sites). Travel times are rough estimates from straight-line distance, not timetables. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
  var params = new URLSearchParams(location.search);
  var go = $('#pl-go'); if (!go) return;
  var CITIES = { 'Delhi': [28.61, 77.21], 'Mumbai': [19.08, 72.88], 'Kolkata': [22.57, 88.36], 'Chennai': [13.08, 80.27], 'Bengaluru': [12.97, 77.59], 'Hyderabad': [17.38, 78.48], 'Pune': [18.52, 73.86], 'Ahmedabad': [23.02, 72.57], 'Jaipur': [26.91, 75.79], 'Lucknow': [26.85, 80.95], 'Patna': [25.59, 85.14], 'Guwahati': [26.14, 91.74], 'Bhubaneswar': [20.30, 85.82], 'Siliguri': [26.72, 88.43], 'Chandigarh': [30.73, 76.78], 'Dehradun': [30.32, 78.03], 'Nagpur': [21.15, 79.09], 'Bhopal': [23.26, 77.41], 'Indore': [22.72, 75.86], 'Kochi': [9.93, 76.27], 'Thiruvananthapuram': [8.52, 76.94], 'Visakhapatnam': [17.69, 83.22], 'Ranchi': [23.34, 85.31], 'Raipur': [21.25, 81.63], 'Surat': [21.17, 72.83], 'Varanasi': [25.32, 83.01], 'Amritsar': [31.63, 74.87], 'Coimbatore': [11.02, 76.96], 'Madurai': [9.92, 78.12], 'Goa': [15.50, 73.83] };
  var MODE = { train: 'train', flight: 'flight', bus: 'bus', road: 'car or taxi' };
  var TYPE = { temple: 'Temple', ghat: 'Ghat', sight: 'Sight', museum: 'Museum', food: 'Food', market: 'Market', trek: 'Trek', ritual: 'Ritual', activity: 'Activity', admin: 'Registration', sightseeing: 'Sight' };
  var WIN = { D: [300, 450], M: [420, 750], A: [870, 1050], E: [1050, 1260], X: [420, 1260] };
  var ORDER = { D: 0, M: 1, X: 2, A: 3, E: 4 };

  function km(a, b) {
    var R = 6371, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function hill(d) { return d.cats.indexOf('himalaya') >= 0 || d.cats.indexOf('trek') >= 0 || d.cats.indexOf('hill-station') >= 0; }
  function travel(a, b, mode, hilly) {
    var d = km(a, b), m = mode, mins;
    if (d < 60) m = 'road';
    if (m === 'flight' && d < 350) m = 'train';
    if (m === 'flight') mins = (d / 700 + 3.5) * 60;
    else if (m === 'train') mins = (d * 1.3 / 55) * 60;
    else if (m === 'bus') mins = (d * 1.35 / (hilly ? 24 : 40)) * 60 + (d > 300 ? 45 : 0);
    else mins = (d * 1.35 / (hilly ? 30 : 45)) * 60;
    var extra = hilly && m !== 'road' && m !== 'bus' && d > 150;
    if (extra) mins += 240;
    return { mins: Math.round(mins / 15) * 15, mode: m, km: Math.round(d), hilly: extra, overnight: mins >= 600 && (m === 'train' || m === 'bus') };
  }
  function fmt(t) { var d = Math.floor(t / 1440); t = ((t % 1440) + 1440) % 1440; var h = Math.floor(t / 60), m = t % 60, ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap + (d > 0 ? ' (+' + d + ' day)' : ''); }
  function dur(m) { var h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h ' : '') + (r ? r + ' min' : ''); }
  function parseT(v) { var p = (v || '06:00').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function thumb(d, big) {
    if (d.img) return '<div class="pl-ph' + (big ? ' big' : '') + '"><img src="' + esc(d.img) + '" alt="' + esc(d.name) + '" loading="lazy"></div>';
    return '<div class="pl-ph' + (big ? ' big' : '') + '" style="background:linear-gradient(160deg,' + esc(d.c1) + ',' + esc(d.c2) + ')" role="img" aria-label="' + esc(d.name) + '"><span>' + esc(d.name.charAt(0)) + '</span></div>';
  }
  function transit(a, b) { if (!a || !b) return 0; return (a.c && a.c === b.c) ? 10 : 25; }

  /* put chosen sites on a clock. Returns items and which sites were used. */
  function assign(picks, startMin, noteFirst) {
    var items = [], cur = startMin, last = null, lunch = false, used = [];
    picks.sort(function (a, b) { return (ORDER[a.s.w] - ORDER[b.s.w]) || (a.i - b.i); });
    picks.forEach(function (p) {
      var s = p.s, w = s.w || 'X', st, tr = 0;
      if (w === 'D') { st = Math.max(300, s.at || 330); }
      else {
        tr = last ? transit(last, s) : 0;
        var base = cur + tr; st = w === 'X' ? base : Math.max(base, WIN[w][0]);
        if (!lunch && st >= 765 && cur < 900) {
          var ls = Math.max(cur, 735); items.push({ a: ls, b: ls + 60, x: 'Lunch and rest', k: 'meal' }); cur = ls + 60; lunch = true;
          base = cur + tr; st = w === 'X' ? base : Math.max(base, WIN[w][0]);
        }
      }
      var en = st + s.d;
      if (en > 1320) return;
      var note = (s.x || '') + (s.tip ? ' Tip: ' + s.tip : '');
      if (tr) note += ' Allow about ' + tr + ' min to get here from the previous stop.';
      items.push({ a: st, b: en, x: s.n, n: note, ty: TYPE[s.t] || '', k: 'site' });
      used.push(p.i); cur = en; last = s;
      if (w === 'D') { items.push({ a: cur, b: cur + 45, x: 'Return, freshen up and breakfast', k: 'meal' }); cur += 45; }
    });
    return { items: items, used: used, end: cur, lunch: lunch };
  }

  var rulesP = fetch('/static/rules-index.json').then(function (r) { return r.json(); }).catch(function () { return {}; });
  var sitesP = fetch('/static/sites-index.json').then(function (r) { return r.json(); }).catch(function () { return {}; });
  fetch('/static/search-index.json').then(function (r) { return r.json(); }).then(function (idx) {
    var by = {}; idx.forEach(function (d) { by[d.slug] = d; });
    $('#pl-list').innerHTML = idx.map(function (d) { return '<option value="' + esc(d.name) + '">'; }).join('');
    $('#pl-cities').innerHTML = Object.keys(CITIES).map(function (c) { return '<option value="' + c + '">'; }).join('');
    var pa = $('#pl-aud'), pm = $('#pl-mode');
    pa.value = store.get('jt_aud') || ''; pm.value = store.get('jt_mode') || '';
    pa.addEventListener('change', function () { store.set('jt_aud', pa.value); }); pm.addEventListener('change', function () { store.set('jt_mode', pm.value); });
    $('#pl-from').value = params.get('from') || store.get('jt_from') || '';
    if (params.get('days')) $('#pl-days').value = params.get('days');
    var chosen = (params.get('add') || store.get('jt_plan') || '').split(',').filter(function (s) { return by[s]; });
    function draw() {
      $('#pl-chosen').innerHTML = chosen.map(function (s, i) { return '<span>' + esc(by[s].name) + ' <button data-i="' + i + '" aria-label="Remove ' + esc(by[s].name) + '">×</button></span>'; }).join('');
      store.set('jt_plan', chosen.join(','));
    }
    $('#pl-chosen').addEventListener('click', function (e) { if (e.target.dataset.i) { chosen.splice(+e.target.dataset.i, 1); draw(); } });
    $('#pl-search').addEventListener('change', function (e) {
      var d = idx.filter(function (x) { return x.name.toLowerCase() === e.target.value.toLowerCase(); })[0];
      if (d && chosen.indexOf(d.slug) < 0) { chosen.push(d.slug); draw(); } e.target.value = '';
    });
    draw();

    function plan(SI) {
      var out = $('#pl-out');
      if (!chosen.length) { out.innerHTML = '<p>Add at least one place you want to visit.</p>'; return; }
      var fromName = $('#pl-from').value.trim(), origin = null;
      Object.keys(CITIES).forEach(function (c) { if (c.toLowerCase() === fromName.toLowerCase()) { origin = CITIES[c]; fromName = c; } });
      store.set('jt_from', fromName);
      var mode = $('#pl-xport').value, back = $('#pl-return').checked && !!fromName, extras = $('#pl-extras').checked;
      var total = Math.max(1, +$('#pl-days').value || chosen.length * 2);
      var pace = $('#pl-pace').value;
      var CAP = { relaxed: { n: 3, bud: 300, M: 2, A: 1, E: 2 }, normal: { n: 5, bud: 420, M: 3, A: 2, E: 3 }, fast: { n: 7, bud: 540, M: 3, A: 3, E: 3 } }[pace];
      var dayStart = +$('#pl-dstart').value, depart = parseT($('#pl-time').value);
      var sd = $('#pl-start').value ? new Date($('#pl-start').value + 'T00:00:00') : null;
      var places = chosen.map(function (s) { return by[s]; });
      var pos = function (d) { return [d.lat, d.lon]; };
      var notes = [];
      function leg(a, b, hilly, na, nb) { if (!a || !b) return { mins: 0, mode: mode, km: 0, unknown: true, from: na, to: nb }; var t = travel(a, b, mode, hilly); t.from = na; t.to = nb; return t; }
      var first = fromName ? leg(origin, pos(places[0]), hill(places[0]), fromName, places[0].name) : null;
      var mid = []; for (var i = 0; i < places.length - 1; i++) mid.push(leg(pos(places[i]), pos(places[i + 1]), hill(places[i]) || hill(places[i + 1]), places[i].name, places[i + 1].name));
      var ret = back ? leg(pos(places[places.length - 1]), origin, hill(places[places.length - 1]), places[places.length - 1].name, fromName) : null;
      if (fromName && !origin) notes.push('We do not have coordinates for "' + fromName + '", so we could not estimate the first and last journey. Add your own travel time.');
      var travelDays = 0; [first].concat(mid, [ret]).forEach(function (l) { if (l) travelDays += l.mins > 480 ? 1 : 0.5; });
      var avail = Math.max(places.length, Math.round(total - travelDays));
      var want = places.map(function (d) { return parseInt(d.days) || 2; }), sum = want.reduce(function (a, b) { return a + b; }, 0);
      var alloc = want.map(function (w) { return Math.max(1, Math.round(w / sum * avail)); });

      var lists = places.map(function (p) {
        var rec = SI[p.slug] || { sites: [] };
        return rec.sites.map(function (s, i) { return { s: s, i: i }; }).filter(function (o) { return extras || !o.s.opt; });
      });
      var doneSet = places.map(function () { return {}; });
      var days = [], day = 1;
      function open(title, d) { var o = { n: day, title: title, d: d, items: [], info: null, intro: false }; days.push(o); return o; }
      function remaining(i) { return lists[i].filter(function (o) { return !doneSet[i][o.i]; }); }
      function pick(i, budget, cap, noDawn) {
        var picks = [], used = 0, cnt = { D: 0, M: 0, A: 0, E: 0, X: 0 };
        remaining(i).forEach(function (o) {
          var w = o.s.w || 'X';
          if (picks.length >= cap.n) return;
          if (w === 'D' && (noDawn || cnt.D)) return;
          if (w !== 'D' && w !== 'X' && cnt[w] >= cap[w]) return;
          if (picks.length && used + o.s.d > budget) return;
          picks.push(o); cnt[w]++; used += o.s.d;
        });
        return picks;
      }
      function intro(dy, i, arrival) {
        var p = places[i], rec = SI[p.slug] || {};
        if (dy.info) return;
        var parts = [];
        if (rec.summary) parts.push('<p>' + esc(rec.summary) + '</p>');
        if (arrival && rec.reach) { var r = rec.reach, g = []; if (r.rail) g.push('<b>By train:</b> ' + esc(r.rail)); if (r.air) g.push('<b>By air:</b> ' + esc(r.air)); if (r.road) g.push('<b>By road:</b> ' + esc(r.road)); if (g.length) parts.push('<p>' + g.join('<br>') + '</p>'); }
        if (rec.etiquette) parts.push('<p><b>Dress and etiquette:</b> ' + esc(rec.etiquette) + '</p>');
        if (rec.tips && rec.tips.length) parts.push('<p><b>Good to know:</b> ' + rec.tips.map(esc).join(' ') + '</p>');
        if (parts.length) dy.info = '<details class="pl-info"><summary>About ' + esc(p.name) + '</summary>' + parts.join('') + '</details>';
      }
      function legItem(dy, l, atMin) {
        if (l.unknown) { dy.items.push({ a: atMin, x: 'Travel from ' + l.from + ' to ' + l.to + ' (enter your own timings)', k: 'travel' }); return atMin; }
        var note = 'About ' + dur(l.mins) + ' for ' + l.km + ' km in a straight line.' + (l.hilly ? ' Includes about 4 h by road from the nearest station or airport.' : '') + (l.overnight ? ' This is a long trip. Many travellers prefer an overnight ' + l.mode + ' and sleep on board.' : '') + ' Real routes and timetables differ: check IRCTC, airlines, bus operators or your driver.';
        dy.items.push({ a: atMin, b: atMin + l.mins, x: 'Leave ' + l.from + ' by ' + MODE[l.mode] + ' to ' + l.to, n: note, k: 'travel' });
        return atMin + l.mins;
      }
      function arrive(i, arrMin, dy) {          /* dy is the card for the arrival day */
        var p = places[i]; intro(dy, i, true);
        dy.items.push({ a: arrMin, x: 'Arrive in ' + p.name + '. Check in and rest', n: 'Hotel check-in is often from about 12:00 to 14:00. Ask for early check-in or luggage storage.', k: 'meal' });
        var start = arrMin + 90;
        if (start < 1050) {
          var res = assign(pick(i, Math.round(CAP.bud * 0.55), CAP, true), start);
          res.used.forEach(function (u) { doneSet[i][u] = 1; });
          res.items.forEach(function (it) { dy.items.push(it); });
          dinner(dy, res.items.length ? res.end : start);
        } else dinner(dy, start);
      }
      function transitDays(n, l) {   /* days spent on the road between two cities */
        for (var j = 1; j < n; j++) { day++; var o = open('On the way: ' + l.from + ' to ' + l.to, null); o.items.push({ a: 480, x: 'Travelling. Keep water, snacks, a charger and your tickets and ID handy.', k: 'travel' }); }
        day++;
      }
      function dinner(dy, cur) { var t = Math.max(cur + 15, 1170); if (t < 1320) dy.items.push({ a: t, b: t + 60, x: 'Dinner and early night', k: 'meal' }); }
      function exploreDay(i, k) {
        var dy = open(remaining(i).length ? 'Explore ' + places[i].name : 'Free day in ' + places[i].name, places[i]);
        intro(dy, i, false);
        var picks = pick(i, CAP.bud, CAP, false);
        var hasD = picks.some(function (p) { return p.s.w === 'D'; });
        if (!hasD) dy.items.push({ a: dayStart, b: dayStart + 45, x: 'Breakfast and get ready', k: 'meal' });
        if (!picks.length) { dy.items.push({ a: dayStart + 90, x: 'Free time: revisit your favourite places, shop for souvenirs and enjoy local food', k: 'meal' }); dinner(dy, 780); return; }
        var res = assign(picks, hasD ? dayStart : dayStart + 60);
        res.used.forEach(function (u) { doneSet[i][u] = 1; });
        res.items.forEach(function (it) { dy.items.push(it); });
        dinner(dy, res.end);
      }

      /* ---- build the trip ---- */
      var cur, dy;
      if (first) {
        dy = open('Travel: ' + fromName + ' to ' + places[0].name, places[0]);
        var arr = legItem(dy, first, depart);
        var addDays = Math.floor(arr / 1440);
        if (first.unknown) arr = dayStart + 600;
        if (addDays > 0) { arr -= addDays * 1440; transitDays(addDays, first); dy = open('Arrive in ' + places[0].name, places[0]); }
        else dy.title = 'Travel and arrive: ' + fromName + ' to ' + places[0].name;
        arrive(0, arr, dy);
        alloc[0] = Math.max(1, alloc[0] - 1);
      }
      places.forEach(function (p, i) {
        var n = alloc[i];
        for (var k = 0; k < n; k++) {
          if (k > 0 && !remaining(i).length) { notes.push('We stopped at ' + (k + (first && i === 0 ? 1 : 0)) + ' day(s) in ' + p.name + ' because we have listed all the sights we hold for it. Add another place, or use the spare days for rest.'); break; }
          if (!(i === 0 && k === 0 && !first)) day++;   /* with no starting city, day 1 is itself an explore day */
          exploreDay(i, k);
        }
        if (i < places.length - 1) {
          day++; var l = mid[i], nd = open('Travel: ' + p.name + ' to ' + places[i + 1].name, places[i + 1]);
          nd.items.push({ a: dayStart, b: dayStart + 45, x: 'Breakfast and check out', k: 'meal' });
          var arr2 = legItem(nd, l, dayStart + 90), x2 = Math.floor(arr2 / 1440);
          if (l.unknown) arr2 = dayStart + 600;
          if (x2 > 0) { arr2 -= x2 * 1440; transitDays(x2, l); nd = open('Arrive in ' + places[i + 1].name, places[i + 1]); }
          else nd.title = 'Travel and arrive: ' + p.name + ' to ' + places[i + 1].name;
          arrive(i + 1, arr2, nd);
          alloc[i + 1] = Math.max(1, alloc[i + 1] - 1);
        }
      });
      if (back && ret) {
        day++; var rd = open('Return: ' + places[places.length - 1].name + ' to ' + fromName, null);
        rd.items.push({ a: dayStart, b: dayStart + 45, x: 'Breakfast and check out', k: 'meal' });
        if (ret.unknown) rd.items.push({ a: dayStart + 90, x: 'Travel back to ' + fromName + ' (enter your own timings)', k: 'travel' });
        else { var ar = legItem(rd, ret, dayStart + 90); rd.items.push({ a: ar, x: 'Arrive in ' + fromName, n: 'Trip ends.', k: 'meal' }); }
      }
      var more = [];
      places.forEach(function (p, i) { var r = remaining(i); if (r.length) more.push('<b>' + esc(p.name) + ':</b> ' + r.map(function (o) { return esc(o.s.n); }).join(', ')); });
      days.forEach(function (d) { d.items.sort(function (a, b) { return a.a - b.a; }); });

      /* ---- show it ---- */
      var tripDays = days.length ? days[days.length - 1].n : total;
      var dateOf = function (n) { if (!sd) return ''; var dt = new Date(sd); dt.setDate(dt.getDate() + n - 1); return ' · ' + dt.toDateString().slice(0, 10); };
      var routeText = (fromName ? fromName + ' → ' : '') + places.map(function (p) { return p.name; }).join(' → ') + (back ? ' → ' + fromName : '');
      var html = '<div class="print-only pb-head"><div class="pb-logo">JoharTrip</div><div class="pb-tag">Your trip plan · johartrip.com</div></div>' +
        '<div class="pl-sum"><h3>' + esc(routeText) + '</h3>' +
        '<p class="muted">About ' + tripDays + ' days. Leaving at ' + fmt(depart) + (sd ? ' on ' + sd.toDateString() : '') + '. Main travel by ' + MODE[mode] + '. ' + (pace === 'relaxed' ? 'Relaxed' : pace === 'fast' ? 'Fast' : 'Normal') + ' pace.</p><div class="pl-strip">' + places.map(function (p) { return thumb(p, true); }).join('') + '</div></div>';
      var text = 'My JoharTrip itinerary: ' + routeText + '\n';
      days.forEach(function (d) {
        if (!d.items.length) return;
        html += '<div class="day pl-day">' + (d.d ? thumb(d.d) : '<div class="pl-ph"><span>⌂</span></div>') + '<div class="pl-b"><h4>Day ' + d.n + dateOf(d.n) + ': ' + esc(d.title) + '</h4>' + (d.info || '') + '<ul class="tl">' +
          d.items.map(function (it) {
            var when = it.b ? (it.b >= 1440 ? fmt(it.a) + ' → arrive ' + fmt(it.b) : fmt(it.a) + ' – ' + fmt(it.b)) : fmt(it.a);
            return '<li class="k-' + it.k + '"><b>' + esc(when) + '</b> ' + (it.ty ? '<span class="tg">' + esc(it.ty) + '</span> ' : '') + esc(it.x) + (it.n ? '<span class="tn">' + esc(it.n) + '</span>' : '') + '</li>';
          }).join('') + '</ul>' +
          '</div></div>';
        text += '\nDay ' + d.n + ': ' + d.title + '\n' + d.items.map(function (it) { return '  ' + fmt(it.a) + ' ' + it.x; }).join('\n');
      });
      text += '\n\nPlan yours free: https://johartrip.com/trip-planner/';
      if (more.length) html += '<div class="pl-more"><h4>If you have extra time</h4><p>We could not fit these in at your pace and number of days. Add days, choose a faster pace or swap them in.</p><p>' + more.join('<br>') + '</p></div>';
      html += notes.map(function (n) { return '<p class="small">' + esc(n) + '</p>'; }).join('') +
        '<p class="small">This is a suggested plan. Site timings shown are typical, and travel times are rough estimates. Temple timings, ticket systems, closing days, weather and road conditions change: confirm before you go. Photos are from Wikimedia Commons contributors, with credits on each place\'s page.</p>' +
        '<p class="noprint"><a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text) + '" data-track="planner_share">Share on WhatsApp</a> <button class="btn ghost" onclick="window.print()">Print / save as PDF</button></p>';
      out.innerHTML = html;
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
      rulesP.then(function (ri) {
        var a = pa.value, m = pm.value, block = '', missing = [];
        chosen.forEach(function (sl) {
          var list = (ri[sl] || []).filter(function (r) { return (!a || r.audience === 'all' || r.audience === a) && (!m || r.modes_s.split(' ').indexOf('any') >= 0 || r.modes_s.split(' ').indexOf(m) >= 0); });
          if (!(ri[sl] || []).length) { missing.push(by[sl].name); return; }
          block += '<h4>' + esc(by[sl].name) + '</h4>' + (list.length ? '<ul>' + list.map(function (r) { return '<li><b>' + esc(r.kind_label) + ':</b> ' + esc(r.title) + ' <em>(' + esc(r.status_label) + '; checked ' + r.age + ' days ago' + (r.stale ? ', re-check due' : '') + ')</em>' + (r.cost ? '<br>' + esc(r.cost) : '') + '<br><a href="/destinations/' + sl + '/#rule-' + r.id + '">Details and what we could not verify</a></li>'; }).join('') + '</ul>' : '<p class="small">No listed rule matches your choices here; this does not prove none applies.</p>');
        });
        if (missing.length) block += '<p class="small">Not yet researched: ' + esc(missing.join(', ')) + '. Check official tourism sites and ask your host.</p>';
        var el = document.createElement('div'); el.className = 'pl-rules'; el.innerHTML = '<h3>Permits, fees and vehicle rules for your trip</h3>' + block + '<p class="small">Rules change often. <a href="/how-we-verify/">How we verify</a>.</p>';
        out.appendChild(el);
      });
    }
    go.addEventListener('click', function () { sitesP.then(plan); });
    if (chosen.length && params.get('add')) sitesP.then(plan);
  });
})();
