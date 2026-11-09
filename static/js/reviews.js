/* JoharTrip customer reviews (talks to the Cloudflare worker set in config.json > reviews.endpoint). Safe: all text is inserted with textContent. */
(function () {
  'use strict';
  var box = document.getElementById('jt-reviews'); if (!box) return;
  var EP = (document.currentScript && document.currentScript.dataset.endpoint || '').replace(/\/$/, '');
  var place = box.dataset.place, pname = box.dataset.name;
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function stars(n) { var s = ''; for (var i = 1; i <= 5; i++) s += i <= Math.round(n) ? '★' : '☆'; return s; }
  if (!EP) { box.appendChild(el('p', 'small', 'Customer reviews are not switched on yet. In the meantime you can share your story.')); return; }

  var list = el('div', 'rv-list'), head = el('div', 'rv-head');
  box.appendChild(head); box.appendChild(list);

  function render(d) {
    head.textContent = '';
    if (!d.count) { head.appendChild(el('p', '', 'No reviews yet for ' + pname + '. Be the first.')); }
    else {
      var a = el('p', 'rv-avg'); a.appendChild(el('span', 'rv-stars', stars(d.average))); a.appendChild(document.createTextNode(' ' + d.average + ' out of 5 from ' + d.count + (d.count === 1 ? ' review' : ' reviews')));
      head.appendChild(a);
    }
    list.textContent = '';
    (d.reviews || []).forEach(function (r) {
      var c = el('article', 'story rv');
      c.appendChild(el('p', 'rv-stars', stars(r.rating)));
      c.appendChild(el('h3', '', r.title));
      c.appendChild(el('p', 'sm', r.name + (r.visited ? ', visited ' + r.visited : '')));
      c.appendChild(el('p', '', r.text));
      var rep = el('button', 'rv-rep', 'Report'); rep.type = 'button';
      rep.addEventListener('click', function () {
        fetch(EP + '/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }) }).then(function () { rep.textContent = 'Thanks, reported'; rep.disabled = true; });
      });
      c.appendChild(rep); list.appendChild(c);
    });
  }
  function load() {
    fetch(EP + '/reviews?place=' + encodeURIComponent(place)).then(function (r) { return r.json(); }).then(render)
      .catch(function () { head.textContent = ''; head.appendChild(el('p', 'small', 'Reviews could not be loaded right now.')); });
  }
  load();

  var done = false; try { done = localStorage.getItem('jt_rv_' + place) === '1'; } catch (e) { }
  var f = document.createElement('form'); f.className = 'form rv-form';
  f.innerHTML = '<h3>Write a review</h3><fieldset class="rv-rate"><legend>Your rating</legend>' +
    [5, 4, 3, 2, 1].map(function (n) { return '<input type="radio" id="rv' + n + '" name="rating" value="' + n + '" required><label for="rv' + n + '" title="' + n + ' stars">★</label>'; }).join('') + '</fieldset>' +
    '<label>Your first name<input name="name" required maxlength="40" autocomplete="given-name"></label>' +
    '<label>When did you go? (optional)<input name="visited" maxlength="30" placeholder="e.g. October 2026"></label>' +
    '<label>Title<input name="title" required maxlength="90"></label>' +
    '<label>Your review (at least 40 characters)<textarea name="text" rows="5" required minlength="40" maxlength="1500" placeholder="What was good, what to watch out for, costs, crowds, tips."></textarea></label>' +
    '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">' +
    '<label class="chk-l"><input type="checkbox" required> I visited this place myself, I wrote this review, and I was not paid or rewarded for it.</label>' +
    '<button class="btn" type="submit">Post review</button><p class="small msg" role="status"></p>' +
    '<p class="small">Reviews are travellers\' own opinions, not checked by JoharTrip. No links, phone numbers or promotions. See the <a href="/content-policy/">content policy</a>.</p>';
  if (done) { f = el('p', 'small', 'Thanks for your review of ' + pname + '.'); }
  box.appendChild(f);
  if (done) return;
  f.addEventListener('submit', function (e) {
    e.preventDefault(); var m = f.querySelector('.msg'), fd = new FormData(f), b = {}; fd.forEach(function (v, k) { b[k] = v; }); b.place = place;
    m.textContent = 'Posting…';
    fetch(EP + '/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) { try { localStorage.setItem('jt_rv_' + place, '1'); } catch (e) { } f.replaceWith(el('p', '', 'Thank you. Your review is now live.')); load(); }
        else m.textContent = x.j.error || 'Could not post your review.';
      }).catch(function () { m.textContent = 'Could not reach the server. Please try again.'; });
  });
})();
