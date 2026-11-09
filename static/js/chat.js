/* JoharTrip trip assistant.
   Works with no server: it reads the site's own JSON (destinations, permits, pilgrim guides) and answers from that.
   If data-endpoint is set (a free Cloudflare Worker), it asks an AI model first and falls back to the built-in engine. */
(function () {
  'use strict';
  var S = document.currentScript || {};
  var CFG = { endpoint: (S.dataset && S.dataset.endpoint) || '', key: (S.dataset && S.dataset.key) || '', email: (S.dataset && S.dataset.email) || 'contact@johartrip.com' };
  var MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MA = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var INTERESTS = [
    { re: /pilgrim|temple|darshan|yatra|puja|aarti|bhakti|hindu|dham|spiritual|holy|mandir/, cats: ['pilgrimage'], label: 'pilgrimage' },
    { re: /shiva|shiv|jyotirling|mahadev/, cats: ['jyotirlinga'], label: 'Shiva temples' },
    { re: /char ?dham/, cats: ['char-dham', 'char-dham-yatra'], label: 'Char Dham' },
    { re: /shakti|devi|durga|kali/, cats: ['shakti', 'shakti-peetha'], label: 'Shakti temples' },
    { re: /vishnu|krishna|ram\b|rama/, cats: ['vishnu', 'krishna', 'ram'], label: 'Vishnu, Rama and Krishna' },
    { re: /kumbh/, cats: ['kumbh'], label: 'Kumbh cities' },
    { re: /homestay|home stay|local stay|village stay|guesthouse/, cats: ['homestay'], label: 'homestays' },
    { re: /trek|hike|hiking/, cats: ['trek'], label: 'trekking' },
    { re: /beach|sea\b|island/, cats: ['beach', 'island'], label: 'beaches' },
    { re: /mountain|himalaya|snow|hills?\b|cold/, cats: ['himalaya', 'hill-station'], label: 'the Himalaya' },
    { re: /heritage|fort|palace|history|historic/, cats: ['heritage'], label: 'heritage' },
    { re: /nature|wildlife|safari|forest|tea garden/, cats: ['nature'], label: 'nature' },
    { re: /adventure|raft|bike|road ?trip|ride/, cats: ['adventure'], label: 'adventure' },
    { re: /yoga|meditat/, cats: ['yoga'], label: 'yoga' },
    { re: /city|nightlife|food/, cats: ['city', 'nightlife'], label: 'city life' }
  ];
  var IDX = null, RULES = {}, PIL = {}, S0 = { months: [], days: 0, budget: '', aud: '', mode: '', cats: [], labels: [], places: [], party: '', amt: 0, from: '' };
  var st = load() || JSON.parse(JSON.stringify(S0));
  var last = [];

  function load() { try { return JSON.parse(sessionStorage.getItem('jt_chat') || 'null'); } catch (e) { return null; } }
  function save() { try { sessionStorage.setItem('jt_chat', JSON.stringify(st)); } catch (e) { } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, r) { return (r || document).querySelector(sel); }

  function data() {
    if (IDX) return Promise.resolve();
    return Promise.all(['search-index', 'rules-index', 'pilgrim-index'].map(function (n) {
      return fetch('/static/' + n + '.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    })).then(function (a) { IDX = a[0] || []; RULES = a[1] || {}; PIL = a[2] || {}; });
  }

  /* ---------- understand the message ---------- */
  function understand(t) {
    var x = t.toLowerCase(), found = {}, before = JSON.stringify([st.months, st.places, st.cats]);
    var nm0 = st.months, pl0 = st.places, ct0 = st.cats, lb0 = st.labels;
    st.months = []; st.places = []; st.cats = []; st.labels = [];
    MA.forEach(function (m, i) {
      if (new RegExp('\\b(' + MN[i].toLowerCase() + (m === 'may' ? '' : '|' + m) + ')\\b').test(x) && st.months.indexOf(i + 1) < 0) { st.months.push(i + 1); found.month = 1; }
    });
    if (/diwali|dev deepawali/.test(x)) { addMonth(11); found.month = 1; }
    if (/navratri|dussehra|durga puja/.test(x)) { addMonth(10); found.month = 1; }
    if (/mahashivratri|shivratri/.test(x)) { addMonth(2); found.month = 1; }
    var d = x.match(/(\d{1,2})\s*(?:-|to)?\s*(\d{1,2})?\s*(day|days|night|nights|d)\b/);
    if (d) { st.days = parseInt(d[2] || d[1], 10); found.days = 1; }
    var fm = t.match(/\bfrom\s+([A-Za-z][A-Za-z ]{2,24}?)(?=\s+(?:to|for|in|on|with|by|and)\b|[,.?!]|$)/i);
    if (fm) { st.from = fm[1].trim().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); found.from = 1; }
    if (/\bweek\b/.test(x)) { st.days = 7; found.days = 1; }
    if (/weekend/.test(x)) { st.days = 2; found.days = 1; }
    if (/budget|cheap|low cost|affordable|backpack|economy|dharamshala/.test(x)) { st.budget = 'budget'; found.budget = 1; }
    if (/moderate|mid[- ]?range|comfortable|medium|standard/.test(x)) { st.budget = 'moderate'; found.budget = 1; }
    if (/luxur|premium|5[- ]?star|high[- ]?end|heritage hotel|helicopter/.test(x)) { st.budget = 'luxury'; found.budget = 1; }
    var amt = x.match(/(?:₹|rs\.?|inr)\s*([\d,]+)\s*(k|000)?|([\d,]+)\s*(k)\b/);
    if (amt) { var n = parseFloat((amt[1] || amt[3]).replace(/,/g, '')); if (amt[2] === 'k' || amt[4] === 'k') n *= 1000; if (n >= 500) { st.amt = n; found.budget = 1; } }
    if (/foreign|nri|overseas|passport|tourist from|visiting from/.test(x)) { st.aud = 'foreign'; found.aud = 1; }
    if (/\bindian\b|indian citizen|i am from (delhi|mumbai|kolkata|india)/.test(x)) { st.aud = 'indian'; found.aud = 1; }
    if (/own car|self[- ]?drive|my car/.test(x)) { st.mode = 'own_car'; found.mode = 1; }
    else if (/own bike|my bike|motorbike|bullet|rented bike|bike trip/.test(x)) { st.mode = 'own_bike'; found.mode = 1; }
    else if (/taxi|cab|hire a car|driver/.test(x)) { st.mode = 'taxi'; found.mode = 1; }
    else if (/train|bus|public transport|flight/.test(x)) { st.mode = 'public'; found.mode = 1; }
    if (/senior|elderly|old parents|parents|grandparent|mother|father/.test(x)) { st.party = 'seniors'; found.party = 1; }
    else if (/kids|children|child|family/.test(x)) { st.party = 'family'; found.party = 1; }
    else if (/solo/.test(x)) { st.party = 'solo'; found.party = 1; }
    else if (/couple|honeymoon|wife|husband/.test(x)) { st.party = 'couple'; found.party = 1; }
    else if (/friends|group/.test(x)) { st.party = 'friends'; found.party = 1; }
    INTERESTS.forEach(function (it) {
      if (it.re.test(x)) { it.cats.forEach(function (c) { if (st.cats.indexOf(c) < 0) st.cats.push(c); }); if (st.labels.indexOf(it.label) < 0) st.labels.push(it.label); found.interest = 1; }
    });
    (IDX || []).forEach(function (p) {
      var nm = p.name.toLowerCase().replace(/\(.*\)/, '').replace(/homestays?/, '').replace(/valley/, '').trim();
      var first = nm.split(/\s+/)[0];
      var hit = (nm.length > 3 && x.indexOf(nm) >= 0) || (first.length > 4 && new RegExp('\\b' + first + '\\b').test(x)) || x.indexOf(p.slug.split('-')[0]) >= 0 && p.slug.split('-')[0].length > 4;
      var stHit = x.indexOf(p.state.toLowerCase()) >= 0 || (p.state === 'Himachal Pradesh' && /\bhp\b|himachal/.test(x)) || (p.state === 'West Bengal' && /north bengal|bengal/.test(x));
      if (hit && st.places.indexOf(p.slug) < 0) { st.places.push(p.slug); found.place = 1; }
      else if (stHit && !hit && st.places.indexOf('@' + p.state) < 0) { st.places.push('@' + p.state); found.place = 1; }
    });
    if (!st.months.length) st.months = nm0;
    if (!st.places.length) st.places = pl0;
    if (!st.cats.length) { st.cats = ct0; st.labels = lb0; }
    if (/permit|ilp|inner line|rules?\b|fee|registration|restricted/.test(x)) found.permit = 1;
    if (/cost|price|how much|budget|afford/.test(x)) found.cost = 1;
    if (/how to (reach|go|get)|process|steps?|procedure|darshan booking|book/.test(x)) found.steps = 1;
    if (/why|important|significance|meaning|history/.test(x)) found.why = 1;
    save();
    return found;
  }
  function addMonth(m) { if (st.months.indexOf(m) < 0) st.months.push(m); }

  /* ---------- rank destinations ---------- */
  function rank() {
    var places = st.places.filter(function (p) { return p[0] !== '@'; });
    var states = st.places.filter(function (p) { return p[0] === '@'; }).map(function (p) { return p.slice(1); });
    return (IDX || []).map(function (p) {
      var s = 0, why = [];
      if (places.indexOf(p.slug) >= 0) { s += 20; }
      if (states.indexOf(p.state) >= 0) { s += 8; why.push('in ' + p.state); }
      var m = 0; st.cats.forEach(function (c) { if (p.cats.indexOf(c) >= 0) { s += 4; m++; } });
      if (m && st.labels.length) why.push('matches ' + st.labels.slice(0, 2).join(' and '));
      if (st.months.length) {
        var ok = st.months.filter(function (mo) { return p.best.indexOf(mo) >= 0; }).length;
        var bad = st.months.filter(function (mo) { return (p.avoid || []).indexOf(mo) >= 0; }).length;
        s += ok * 4 - bad * 6;
        if (ok) why.push('good in ' + st.months.map(function (x) { return MN[x - 1]; }).join(' or '));
        if (bad) why.push('we advise avoiding ' + st.months.map(function (x) { return MN[x - 1]; }).join(' or '));
      }
      if (st.party === 'seniors' && (p.cats.indexOf('trek') >= 0)) { s -= 4; }
      if (st.party === 'seniors' && p.cats.indexOf('pilgrimage') >= 0) s += 1;
      return { p: p, s: s, why: why };
    }).filter(function (r) { return r.s > 0; }).sort(function (a, b) { return b.s - a.s; });
  }

  /* ---------- build answers ---------- */
  function tier() {
    if (st.budget) return st.budget;
    if (st.amt && st.days) { var pd = st.amt / st.days; return pd < 2000 ? 'budget' : pd < 7000 ? 'moderate' : 'luxury'; }
    return '';
  }
  function ruleList(slug, all) {
    var rs = RULES[slug] || [];
    if (!all) rs = rs.filter(function (r) {
      var a = !st.aud || r.audience === 'all' || r.audience === st.aud || r.audience === 'any';
      var m = !st.mode || r.modes_s === 'any' || (r.modes_s || '').indexOf(st.mode.replace('public', 'any')) >= 0;
      return a && m;
    });
    return rs;
  }
  function card(r) {
    var p = r.p, pg = PIL[p.slug], t = tier(), h = '';
    h += '<div class="cc"><a class="cc-t" href="/destinations/' + esc(p.slug) + '/">' + esc(p.name) + '</a><span class="cc-s">' + esc(p.state) + (p.days ? ' · ' + esc(p.days) : '') + '</span>';
    h += '<p>' + esc(p.summary) + '</p>';
    if (r.why.length) h += '<p class="cc-w">Why: ' + esc(r.why.join('; ')) + '.</p>';
    if (p.best && p.best.length) h += '<p class="cc-w">Best months: ' + p.best.slice(0, 6).sort(function (a, b) { return a - b; }).map(function (m) { return MA[m - 1]; }).join(', ') + '.</p>';
    if (pg) {
      var b = pg.budgets, shown = t ? [t] : ['budget', 'moderate', 'luxury'];
      h += '<p class="cc-w"><b>Ground cost per person per day (our estimate):</b> ' + shown.map(function (k) { return k + ' ' + esc(b[k]); }).join(' · ') + '.</p>';
    }
    var rl = ruleList(p.slug, false);
    if (rl.length) h += '<ul class="cc-r">' + rl.slice(0, 3).map(function (x) { return '<li>' + esc(x.title) + ' <em>(' + esc(x.status_label) + ')</em></li>'; }).join('') + '</ul><p class="cc-w"><a href="/destinations/' + esc(p.slug) + '/#permits">See all ' + (RULES[p.slug] || []).length + ' permit and rule notes</a></p>';
    else if (p.cats.indexOf('homestay') >= 0 || p.cats.indexOf('himalaya') >= 0) h += '<p class="cc-w">We have not yet researched permits here. <a href="/destinations/' + esc(p.slug) + '/#permits">Check the status</a>.</p>';
    if (st.party === 'seniors' && p.cats.indexOf('trek') >= 0) h += '<p class="cc-w">Note: this involves long walks or altitude. Ask a doctor first if travelling with older parents.</p>';
    return h + '</div>';
  }
  function detail(slug) {
    var p = IDX.filter(function (x) { return x.slug === slug; })[0], pg = PIL[slug];
    if (!p) return '';
    var h = '<div class="cc"><a class="cc-t" href="/destinations/' + esc(slug) + '/">' + esc(p.name) + '</a>';
    if (pg) {
      h += '<p class="cc-w">' + esc(pg.tradition) + '</p>';
      if (pg.why && pg.why.length) h += '<p><b>Why it matters:</b> ' + pg.why.map(esc).join(' ') + '</p>';
      h += '<p><b>First steps:</b></p><ol>' + pg.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
      h += '<p><b>Cost per person per day (our estimates):</b> budget ' + esc(pg.budgets.budget) + '; moderate ' + esc(pg.budgets.moderate) + '; luxury ' + esc(pg.budgets.luxury) + '.</p>';
    }
    var rl = ruleList(slug, true);
    if (rl.length) h += '<p><b>Permits and rules:</b></p><ul class="cc-r">' + rl.map(function (x) { return '<li>' + esc(x.title) + ' <em>(' + esc(x.status_label) + ')</em></li>'; }).join('') + '</ul>';
    return h + '<p class="cc-w"><a href="/destinations/' + esc(slug) + '/">Open the full guide</a></p></div>';
  }
  function missing() {
    var q = [];
    if (!st.months.length) q.push('Which month are you travelling?');
    if (!st.days) q.push('How many days do you have?');
    if (!tier()) q.push('Budget, moderate or luxury?');
    if (!st.party) q.push('Who is travelling (solo, couple, family, parents)?');
    return q.slice(0, 2);
  }
  function summary() {
    var b = [];
    if (st.labels.length) b.push('Interest: ' + st.labels.join(', '));
    var pl = st.places.map(function (p) { return p[0] === '@' ? p.slice(1) : (IDX.filter(function (x) { return x.slug === p; })[0] || { name: p }).name; });
    if (pl.length) b.push('Places: ' + pl.join(', '));
    if (st.months.length) b.push('Months: ' + st.months.map(function (m) { return MN[m - 1]; }).join(', '));
    if (st.from) b.push('Starting from: ' + st.from);
    if (st.days) b.push('Days: ' + st.days);
    if (tier()) b.push('Budget level: ' + tier());
    if (st.amt) b.push('Total budget: about Rs ' + st.amt);
    if (st.party) b.push('Travelling as: ' + st.party);
    if (st.aud) b.push('Traveller: ' + st.aud);
    if (st.mode) b.push('Transport: ' + st.mode.replace('_', ' '));
    return b;
  }

  function answer(text) {
    var f = understand(text), h = '';
    var single = st.places.filter(function (p) { return p[0] !== '@'; });
    if (!f.place && !f.from && !f.interest && !f.month && !f.permit && !f.days && !f.budget && !f.party && !f.aud && !f.mode) {
      return 'I can plan from the guides on this site. Try: <i>"Spiti homestay in June for 5 days"</i>, <i>"Char Dham with parents, moderate budget"</i>, or <i>"permits for Ladakh as a foreigner"</i>.';
    }
    if ((f.permit || f.steps || f.why || f.cost) && single.length === 1) {
      h = '<p>Here is what we have on ' + esc((IDX.filter(function (x) { return x.slug === single[0]; })[0] || {}).name) + ':</p>' + detail(single[0]);
    } else {
      var r = rank().slice(0, 3);
      if (!r.length) h = '<p>I could not match that to a guide yet. We cover Hindu pilgrimage places, Himalayan homestays and a few cities. Tell me a place, a month or a kind of trip.</p>';
      else h = '<p>Based on what you told me' + (summary().length ? ' (' + esc(summary().join('; ')) + ')' : '') + ', these fit best:</p>' + r.map(card).join('');
    }
    var pls = st.places.filter(function (p) { return p[0] !== '@'; });
    if (pls.length) h += '<p><a class="btn gold sm" href="/trip-planner/?add=' + encodeURIComponent(pls.slice(0, 4).join(',')) + (st.days ? '&days=' + st.days : '') + (st.from ? '&from=' + encodeURIComponent(st.from) : '') + '">Make a timed itinerary</a></p>';
    var q = missing();
    if (!st.from) q.push('Which city will you start from?');
    if (q.length) h += '<p class="cc-q">To narrow this down: ' + q.map(esc).join(' ') + '</p>';
    h += '<p class="cc-d">Suggestions come from our guides. Costs are estimates. Rules change: confirm permits with the official office before you travel.</p>';
    return h;
  }

  /* ---------- optional AI via worker ---------- */
  function ask(text) {
    var local = function () { return Promise.resolve({ html: answer(text) }); };
    if (!CFG.endpoint) { understand; return local(); }
    understand(text);
    var ctx = rank().slice(0, 5).map(function (r) { return { name: r.p.name, state: r.p.state, summary: r.p.summary, best_months: r.p.best, pilgrim: PIL[r.p.slug] || null, rules: (RULES[r.p.slug] || []).slice(0, 4).map(function (x) { return x.title + ' [' + x.status_label + ']'; }) }; });
    return fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, profile: summary(), context: ctx }) })
      .then(function (r) { if (!r.ok) throw new Error('x'); return r.json(); })
      .then(function (j) { if (!j.reply) throw new Error('x'); return { html: '<p>' + esc(j.reply).replace(/\n/g, '<br>') + '</p><p class="cc-d">AI answer, can contain errors. Check the guide and official sources.</p>' + rank().slice(0, 2).map(card).join('') }; })
      .catch(function () { return { html: answer(text) }; });
  }

  /* ---------- UI ---------- */
  var root, log, input;
  function add(who, html) {
    var m = document.createElement('div'); m.className = 'jc-m ' + who; m.innerHTML = html; log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
  }
  function send(t) {
    t = (t || '').trim(); if (!t) return;
    add('u', esc(t)); input.value = '';
    var w = add('b', '<i>Thinking…</i>');
    data().then(function () { return ask(t); }).then(function (r) { w.innerHTML = r.html; log.scrollTop = log.scrollHeight; });
  }
  function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }
  function build() {
    root = document.createElement('div'); root.id = 'jc';
    root.innerHTML = '<button class="jc-fab" type="button" aria-label="Open trip assistant" aria-expanded="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span>Plan with AI</span></button>' +
      '<section class="jc-p" role="dialog" aria-label="Trip assistant" hidden><header><b>JoharTrip assistant</b><span>Tell me where, when and how you like to travel</span><button class="jc-x" type="button" aria-label="Close">×</button></header><div class="jc-l" aria-live="polite"></div>' +
      '<div class="jc-chips"></div><form class="jc-i"><input type="text" placeholder="e.g. Kedarnath in May with parents" aria-label="Your message" autocomplete="off"><button class="btn sm" type="submit">Send</button></form><footer><button type="button" class="jc-reset">Start over</button></footer></section>';
    document.body.appendChild(root);
    log = $('.jc-l', root); input = $('.jc-i input', root);
    var fab = $('.jc-fab', root), panel = $('.jc-p', root);
    function open(v) { panel.hidden = !v; fab.setAttribute('aria-expanded', v); root.classList.toggle('open', v); if (v) { input.focus(); if (!log.children.length) hello(); } }
    fab.addEventListener('click', function () { open(panel.hidden); hint.remove(); });
    window.JTChat = { open: function () { open(true); hint.remove(); } };
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-open-chat]'); if (b) { e.preventDefault(); window.JTChat.open(); } });
    var hint = document.createElement('div'); hint.className = 'jc-hint'; hint.innerHTML = '<button type="button">Planning a trip? Ask me</button>'; root.appendChild(hint);
    hint.firstChild.addEventListener('click', function () { window.JTChat.open(); });
    setTimeout(function () { if (panel.hidden && !sessionStorageGet('jc_hint')) { hint.classList.add('show'); sessionStorageSet('jc_hint', '1'); setTimeout(function () { hint.classList.remove('show'); }, 9000); } }, 4000);
    $('.jc-x', root).addEventListener('click', function () { open(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) open(false); });
    $('.jc-i', root).addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
    $('.jc-reset', root).addEventListener('click', function () { st = JSON.parse(JSON.stringify(S0)); save(); log.innerHTML = ''; hello(); });
    var chips = ['Char Dham with parents', 'Spiti homestay in June', 'Budget Varanasi trip', 'Permits for Ladakh'];
    $('.jc-chips', root).innerHTML = chips.map(function (c) { return '<button type="button">' + esc(c) + '</button>'; }).join('');
    $('.jc-chips', root).addEventListener('click', function (e) { if (e.target.tagName === 'BUTTON') send(e.target.textContent); });
  }
  function hello() {
    add('b', '<p>Namaste. Tell me what you want from the trip: place, month, days, budget and who is going. I will suggest guides, permits and costs from this site.</p><p class="cc-d">I am an assistant, not a travel agent. I do not book anything and I can be wrong, so check official sources.</p>');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
