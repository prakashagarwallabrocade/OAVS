// Online computer-based test (CBT) for OAVS mock papers.
// States: ready → running → timeup → submitted. Progress is kept in localStorage.
(function () {
  'use strict';
  var root = document.getElementById('cbt');
  if (!root) return;

  var DATA = JSON.parse(document.getElementById('cbt-data').textContent);
  var Q = DATA.questions;
  var SECTIONS = DATA.sections;
  var NEG = DATA.negative;
  var KEY = 'oavs-cbt-mock-' + DATA.mock + '-' + (DATA.version || 'v1');
  // ?minutes=N shortens the timer (for testing); it only applies when a test is started.
  var qsMinutes = parseFloat(new URLSearchParams(location.search).get('minutes'));
  var MINUTES = qsMinutes > 0 ? qsMinutes : DATA.minutes;

  function $(id) { return document.getElementById(id); }
  var el = {
    main: $('cbt-main'), timer: $('cbt-timer'), count: $('cbt-count'),
    intro: $('cbt-intro'), test: $('cbt-test'), result: $('cbt-result'),
    q: $('cbt-q'), tabs: $('cbt-tabs'), palette: $('cbt-palette'), stats: $('cbt-stats'),
    side: $('cbt-side'), palToggle: $('cbt-pal-toggle'), palClose: $('cbt-pal-close'),
    prev: $('cbt-prev'), next: $('cbt-next'), clear: $('cbt-clear'), mark: $('cbt-mark'),
    confirm: $('cbt-confirm'), confirmBody: $('cbt-confirm-body'),
    confirmOk: $('cbt-confirm-ok'), confirmCancel: $('cbt-confirm-cancel'),
    timeup: $('cbt-timeup'), timeupBody: $('cbt-timeup-body'), timeupOk: $('cbt-timeup-ok')
  };

  // ---------- state ----------
  function fresh() { return { status: 'ready', answers: {}, marked: {}, visited: {}, current: 1 }; }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      return s && s.status && s.answers ? s : null;
    } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: keep in memory */ }
  }
  var state = load() || fresh();
  var ticker = null;

  function answered(n) { return Object.prototype.hasOwnProperty.call(state.answers, n); }
  function counts() {
    var a = 0, m = 0;
    for (var i = 1; i <= Q.length; i++) { if (answered(i)) a++; if (state.marked[i]) m++; }
    return { answered: a, unanswered: Q.length - a, marked: m };
  }
  function locked() { return state.status !== 'running'; }

  // ---------- timer ----------
  function fmt(ms) {
    var t = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function tick() {
    if (state.status !== 'running') return;
    var rem = state.deadline - Date.now();
    el.timer.textContent = fmt(rem);
    el.timer.classList.toggle('warn', rem <= 10 * 60000 && rem > 60000);
    el.timer.classList.toggle('danger', rem <= 60000);
    el.timer.setAttribute('aria-label', 'Time left ' + fmt(rem));
    if (rem <= 0) timeUp();
  }
  function startTicker() { stopTicker(); tick(); ticker = setInterval(tick, 250); }
  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  // ---------- actions ----------
  function start() {
    var now = Date.now();
    state = fresh();
    state.status = 'running';
    state.start = now;
    state.deadline = now + MINUTES * 60000;
    state.visited[1] = true;
    save();
    render();
    startTicker();
    el.q.focus();
  }

  function timeUp() {
    stopTicker();
    state.status = 'timeup';
    save();
    el.timer.textContent = '00:00:00';
    render();
    var c = counts();
    el.timeupBody.innerHTML = summaryHTML(c);
    openDialog(el.timeup);
  }

  function askSubmit() {
    var c = counts();
    el.confirmBody.innerHTML = summaryHTML(c);
    openDialog(el.confirm);
  }

  function submit() {
    closeDialog(el.confirm);
    closeDialog(el.timeup);
    stopTicker();
    state.status = 'submitted';
    state.submittedAt = Math.min(Date.now(), state.deadline);
    save();
    render();
    window.scrollTo(0, 0);
  }

  function retake() {
    if (!window.confirm('Discard this attempt and go back to the start screen?')) return;
    state = fresh();
    save();
    render();
    window.scrollTo(0, 0);
  }

  function summaryHTML(c) {
    return '<table class="cbt-sum"><tbody>' +
      '<tr><td>Answered</td><td>' + c.answered + '</td></tr>' +
      '<tr><td>Not answered</td><td>' + c.unanswered + '</td></tr>' +
      '<tr><td>Marked for review</td><td>' + c.marked + '</td></tr>' +
      '</tbody></table>';
  }

  // ---------- dialogs ----------
  function openDialog(d) {
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); }
    else d.setAttribute('open', '');
    var b = d.querySelector('.btn.primary');
    if (b) b.focus();
  }
  function closeDialog(d) {
    if (typeof d.close === 'function') { if (d.open) d.close(); }
    else d.removeAttribute('open');
  }
  // The time-up pop-up cannot be dismissed with Esc; the only way out is Submit.
  el.timeup.addEventListener('cancel', function (e) { e.preventDefault(); });

  // ---------- rendering ----------
  function render() {
    var st = state.status;
    el.intro.hidden = st !== 'ready';
    el.test.hidden = !(st === 'running' || st === 'timeup');
    el.result.hidden = st !== 'submitted';
    el.timer.hidden = !(st === 'running' || st === 'timeup');
    el.palToggle.hidden = el.test.hidden;
    el.main.textContent = st === 'ready' ? 'Start Test' : st === 'submitted' ? 'Retake Test' : 'Submit Test';
    el.main.classList.toggle('danger', st === 'running' || st === 'timeup');
    root.classList.toggle('is-locked', st === 'timeup');
    if (!el.test.hidden) {
      if (!el.palette.childElementCount) buildPalette();
      if (!el.tabs.childElementCount) buildTabs();
      showQuestion(state.current || 1);
    }
    if (st === 'submitted') renderResult();
    updateCount();
  }

  function updateCount() {
    if (state.status === 'running' || state.status === 'timeup') {
      var c = counts();
      el.count.textContent = 'Answered ' + c.answered + ' / ' + Q.length;
    } else if (state.status === 'submitted') {
      el.count.textContent = 'Test submitted';
    } else {
      el.count.textContent = Q.length + ' questions · ' + Math.round(MINUTES) + ' minutes';
    }
  }

  function buildTabs() {
    el.tabs.innerHTML = SECTIONS.map(function (s, i) {
      return '<button type="button" class="cbt-tab" data-sec="' + i + '">' + s.title + '</button>';
    }).join('');
  }

  function buildPalette() {
    el.palette.innerHTML = SECTIONS.map(function (s) {
      var btns = '';
      for (var n = s.start; n <= s.end; n++) {
        btns += '<button type="button" class="pq" data-n="' + n + '" aria-label="Question ' + n + '">' + n + '</button>';
      }
      return '<div class="cbt-pal-sec"><div class="cbt-pal-h">' + s.title + '</div><div class="cbt-pal-grid">' + btns + '</div></div>';
    }).join('');
  }

  function paletteClass(n) {
    var cls = 'pq';
    if (state.marked[n]) cls += ' pq-mk';
    if (answered(n)) cls += ' pq-ans';
    else if (state.visited[n]) cls += ' pq-na';
    else if (!state.marked[n]) cls += ' pq-nv';
    if (n === state.current) cls += ' cur';
    return cls;
  }

  function updatePalette() {
    var btns = el.palette.querySelectorAll('.pq');
    for (var i = 0; i < btns.length; i++) {
      var n = +btns[i].getAttribute('data-n');
      btns[i].className = paletteClass(n);
      if (n === state.current) btns[i].setAttribute('aria-current', 'true');
      else btns[i].removeAttribute('aria-current');
    }
    var c = counts();
    el.stats.innerHTML =
      '<span><i class="pq pq-ans"></i>' + c.answered + ' answered</span>' +
      '<span><i class="pq pq-na"></i>' + c.unanswered + ' not answered</span>' +
      '<span><i class="pq pq-mk"></i>' + c.marked + ' marked</span>';
    var tabs = el.tabs.querySelectorAll('.cbt-tab');
    var cur = Q[state.current - 1].s;
    for (var t = 0; t < tabs.length; t++) tabs[t].classList.toggle('active', +tabs[t].getAttribute('data-sec') === cur);
  }

  function showQuestion(n) {
    n = Math.max(1, Math.min(Q.length, n));
    state.current = n;
    if (!state.visited[n]) { state.visited[n] = true; }
    save();
    var q = Q[n - 1];
    var sec = SECTIONS[q.s];
    var lang = q.lang ? ' lang="' + q.lang + '"' : '';
    var dis = locked() ? ' disabled' : '';
    var opts = q.o.map(function (o, i) {
      var chk = state.answers[n] === i ? ' checked' : '';
      return '<label class="cbt-opt"><input type="radio" name="cbt-opt" value="' + i + '"' + chk + dis + '>' +
        '<span class="on">' + (i + 1) + '.</span><span class="ot">' + o + '</span></label>';
    }).join('');
    el.q.innerHTML =
      '<div class="cbt-qhead"><span class="cbt-qn">Question ' + n + ' <small>of ' + Q.length + '</small></span>' +
      '<span class="cbt-qsec">' + sec.title + (q.area ? ' · ' + q.area : '') + '</span></div>' +
      '<div class="cbt-qtext"' + lang + '>' + q.q + '</div>' +
      (q.f ? '<div class="fig"><img src="' + q.f + '" alt="Figure for question ' + n + '"></div>' : '') +
      '<fieldset class="cbt-opts"' + lang + '><legend class="sr">Options for question ' + n + '</legend>' + opts + '</fieldset>';
    el.prev.disabled = n === 1;
    el.next.disabled = n === Q.length;
    el.clear.disabled = locked() || !answered(n);
    el.mark.disabled = locked();
    el.mark.textContent = state.marked[n] ? 'Unmark Review' : 'Mark for Review';
    el.mark.classList.toggle('on', !!state.marked[n]);
    updatePalette();
    updateCount();
  }

  // ---------- results ----------
  function evaluate() {
    var secs = SECTIONS.map(function (s) { return { title: s.title, total: 0, att: 0, cor: 0, wr: 0 }; });
    var tot = { total: Q.length, att: 0, cor: 0, wr: 0 };
    Q.forEach(function (q) {
      var r = secs[q.s];
      r.total++;
      if (!answered(q.n)) return;
      r.att++; tot.att++;
      if (state.answers[q.n] === q.a) { r.cor++; tot.cor++; } else { r.wr++; tot.wr++; }
    });
    function score(x) { return x.cor - NEG * x.wr; }
    secs.forEach(function (r) { r.score = score(r); });
    tot.score = score(tot);
    return { secs: secs, tot: tot };
  }

  function num(x) { return (Math.round(x * 100) / 100).toFixed(2); }

  function renderResult() {
    var ev = evaluate(), t = ev.tot;
    var taken = (state.submittedAt || Date.now()) - (state.start || Date.now());
    var acc = t.att ? Math.round((t.cor / t.att) * 1000) / 10 : 0;
    var secRows = ev.secs.map(function (r) {
      return '<tr><td>' + r.title + '</td><td class="num">' + r.total + '</td><td class="num">' + r.att + '</td><td class="num">' +
        r.cor + '</td><td class="num">' + r.wr + '</td><td class="num"><b>' + num(r.score) + '</b></td></tr>';
    }).join('');
    el.result.innerHTML =
      '<h1>Mock Test ' + DATA.mock + ' — Result</h1>' +
      '<div class="cbt-score" id="cbt-score-card">' +
        '<div class="cbt-score-main"><span class="cbt-score-label">Your score</span>' +
        '<span class="cbt-score-val" id="cbt-score">' + num(t.score) + '</span><span class="cbt-score-max">/ ' + t.total + '</span></div>' +
        '<div class="cbt-score-formula">' + t.cor + ' correct × 1 − ' + t.wr + ' wrong × ' + NEG + ' = ' + num(t.score) + '</div>' +
      '</div>' +
      '<div class="cbt-kpis">' +
        kpi('Correct', t.cor, 'ok') + kpi('Wrong', t.wr, 'bad') + kpi('Unattempted', t.total - t.att, '') +
        kpi('Accuracy', acc + '%', '') + kpi('Time taken', fmt(taken), '') +
      '</div>' +
      '<h2>Section-wise performance</h2>' +
      '<div class="tablewrap"><table class="pattern cbt-sectable"><thead><tr><th>Section</th><th class="num">Questions</th><th class="num">Attempted</th>' +
      '<th class="num">Correct</th><th class="num">Wrong</th><th class="num">Score</th></tr></thead><tbody>' + secRows +
      '<tr class="tot"><td>Total</td><td class="num">' + t.total + '</td><td class="num">' + t.att + '</td><td class="num">' + t.cor +
      '</td><td class="num">' + t.wr + '</td><td class="num"><b>' + num(t.score) + '</b></td></tr></tbody></table></div>' +
      '<h2>Answer review</h2>' +
      '<div class="cbt-filter" role="group" aria-label="Filter questions">' +
        '<button type="button" class="btn small active" data-f="all">All (' + t.total + ')</button>' +
        '<button type="button" class="btn small" data-f="wrong">Wrong (' + t.wr + ')</button>' +
        '<button type="button" class="btn small" data-f="skip">Unattempted (' + (t.total - t.att) + ')</button>' +
        '<button type="button" class="btn small" data-f="correct">Correct (' + t.cor + ')</button>' +
      '</div>' +
      '<div class="cbt-review" id="cbt-review">' + Q.map(reviewHTML).join('') + '</div>' +
      '<p class="cbt-retake"><button type="button" class="btn primary" id="cbt-retake">Retake Test</button></p>';
  }

  function kpi(label, val, cls) {
    return '<div class="cbt-kpi ' + cls + '"><span>' + label + '</span><b>' + val + '</b></div>';
  }

  function reviewHTML(q) {
    var has = answered(q.n), mine = state.answers[q.n];
    var status = !has ? 'skip' : mine === q.a ? 'correct' : 'wrong';
    var badge = { skip: 'Unattempted · 0', correct: 'Correct · +1', wrong: 'Wrong · −' + NEG }[status];
    var lang = q.lang ? ' lang="' + q.lang + '"' : '';
    var opts = q.o.map(function (o, i) {
      var cls = i === q.a ? ' class="correct"' : (has && i === mine ? ' class="chosen"' : '');
      var tag = i === q.a ? '<em>Correct answer</em>' : (has && i === mine ? '<em>Your answer</em>' : '');
      if (i === q.a && has && mine === q.a) tag = '<em>Your answer ✓</em>';
      return '<li' + cls + '><span class="on">' + (i + 1) + '.</span> <span>' + o + '</span>' + tag + '</li>';
    }).join('');
    return '<article class="q cbt-rq ' + status + '" data-status="' + status + '">' +
      '<div class="qh"><span class="qn">Q.' + q.n + '</span><div class="qt"' + lang + '>' + q.q + '</div><span class="cbt-badge ' + status + '">' + badge + '</span></div>' +
      (q.f ? '<div class="fig"><img src="' + q.f + '" alt="Figure for question ' + q.n + '"></div>' : '') +
      '<ol class="opts"' + lang + '>' + opts + '</ol>' +
      '<div class="ans"><b>Answer: ' + (q.a + 1) + '</b> — ' + q.e + '</div></article>';
  }

  // ---------- events ----------
  el.main.addEventListener('click', function () {
    if (state.status === 'ready') start();
    else if (state.status === 'running') askSubmit();
    else if (state.status === 'timeup') openDialog(el.timeup);
    else if (state.status === 'submitted') retake();
  });
  el.confirmOk.addEventListener('click', submit);
  el.confirmCancel.addEventListener('click', function () { closeDialog(el.confirm); });
  el.timeupOk.addEventListener('click', submit);

  el.q.addEventListener('change', function (e) {
    if (locked() || e.target.name !== 'cbt-opt') return;
    state.answers[state.current] = +e.target.value;
    save();
    el.clear.disabled = false;
    updatePalette();
    updateCount();
  });
  el.prev.addEventListener('click', function () { showQuestion(state.current - 1); });
  el.next.addEventListener('click', function () { showQuestion(state.current + 1); });
  el.clear.addEventListener('click', function () {
    if (locked()) return;
    delete state.answers[state.current];
    save();
    showQuestion(state.current);
  });
  el.mark.addEventListener('click', function () {
    if (locked()) return;
    if (state.marked[state.current]) delete state.marked[state.current];
    else state.marked[state.current] = true;
    save();
    showQuestion(state.current);
  });
  el.palette.addEventListener('click', function (e) {
    var b = e.target.closest('.pq');
    if (!b) return;
    showQuestion(+b.getAttribute('data-n'));
    setDrawer(false);
  });
  el.tabs.addEventListener('click', function (e) {
    var b = e.target.closest('.cbt-tab');
    if (b) showQuestion(SECTIONS[+b.getAttribute('data-sec')].start);
  });

  // Palette drawer on small screens.
  function setDrawer(open) {
    root.classList.toggle('drawer-open', open);
    el.palToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  el.palToggle.addEventListener('click', function () { setDrawer(!root.classList.contains('drawer-open')); });
  el.palClose.addEventListener('click', function () { setDrawer(false); });

  el.result.addEventListener('click', function (e) {
    if (e.target.id === 'cbt-retake') { retake(); return; }
    var f = e.target.closest('[data-f]');
    if (!f) return;
    var mode = f.getAttribute('data-f');
    var btns = el.result.querySelectorAll('[data-f]');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i] === f);
    var items = el.result.querySelectorAll('.cbt-rq');
    for (var j = 0; j < items.length; j++) items[j].hidden = mode !== 'all' && items[j].getAttribute('data-status') !== mode;
  });

  // Keyboard: ← / → move between questions while the test is running.
  document.addEventListener('keydown', function (e) {
    if (state.status !== 'running' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowRight' && e.target.type !== 'radio') showQuestion(state.current + 1);
    if (e.key === 'ArrowLeft' && e.target.type !== 'radio') showQuestion(state.current - 1);
  });

  window.addEventListener('beforeunload', function (e) {
    if (state.status === 'running') { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- boot ----------
  render();
  if (state.status === 'running') {
    if (Date.now() >= state.deadline) timeUp();
    else startTicker();
  } else if (state.status === 'timeup') {
    el.timer.textContent = '00:00:00';
    el.timeupBody.innerHTML = summaryHTML(counts());
    openDialog(el.timeup);
  }
})();
