/* ============================================================
   POWR presentation engine
   — fixed 1920×1080 stage, scaled to any viewport
   — step-based progressive disclosure (data-step)
   — camera moves inside diagrams (data-cam on .cam)
   — highlight / focus choreography (data-hl, data-focus)
   — FLIP morph continuity between consecutive slides (data-morph)
   — overview grid, presenter notes, help, hash routing, touch
   ============================================================ */
(function () {
  'use strict';

  const stage = document.getElementById('stage');
  const slides = Array.from(stage.querySelectorAll(':scope > section.slide'));
  const N = slides.length;

  /* ---------- viewport scaling ---------- */
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = 'scale(' + s + ')';
  }
  addEventListener('resize', fit); fit();

  /* ---------- parse per-slide choreography ---------- */
  const meta = slides.map((sl, i) => {
    const stepsEls = Array.from(sl.querySelectorAll('[data-step]'));
    let maxStep = 0;
    stepsEls.forEach(el => { maxStep = Math.max(maxStep, +el.dataset.step); });
    const camEl0 = sl.querySelector('.cam');
    if (camEl0 && camEl0.dataset.cam) {
      try { JSON.parse(camEl0.dataset.cam).forEach(fr => { maxStep = Math.max(maxStep, fr.at | 0); }); } catch (e) {}
    }
    Array.from(sl.querySelectorAll('[data-hl]')).forEach(el => { maxStep = Math.max(maxStep, +el.dataset.hl); });
    if (camEl0 && camEl0.dataset.focus) maxStep = Math.max(maxStep, +camEl0.dataset.focus.split('-')[1]);
    // stagger index inside same step number
    const groups = {};
    stepsEls.forEach(el => {
      const k = el.dataset.step;
      const g = groups[k] = (groups[k] || 0) + 1;
      el.dataset.stag = (g - 1) * 80;
    });
    const cam = sl.querySelector('.cam');
    let camFrames = [];
    if (cam && cam.dataset.cam) { try { camFrames = JSON.parse(cam.dataset.cam); } catch (e) { camFrames = []; } }
    const focus = cam && cam.dataset.focus ? cam.dataset.focus.split('-').map(Number) : null;
    return {
      el: sl, cam, camFrames, focus, stepsEls, maxStep,
      hlEls: Array.from(sl.querySelectorAll('[data-hl]')),
      section: +sl.dataset.section, title: sl.dataset.title || '', step: 0
    };
  });

  /* ---------- HUD refs ---------- */
  const progBar = document.querySelector('.progress i');
  const counterCur = document.querySelector('.counter .cur');
  const counterTot = document.querySelector('.counter .tot');
  const secNow = document.querySelector('.sec-now');
  const sectBtns = Array.from(document.querySelectorAll('.sects button'));
  const btnNext = document.getElementById('nx');
  const btnPrev = document.getElementById('pv');
  const hint = document.querySelector('.hint');
  counterTot.textContent = String(N).padStart(2, '0');

  const SECTIONS = JSON.parse(document.getElementById('sections-data').textContent);

  let cur = 0;

  /* ---------- apply state of one slide ---------- */
  function apply(m, step) {
    m.step = step;
    m.stepsEls.forEach(el => {
      const k = +el.dataset.step;
      const on = k <= step;
      const was = el.classList.contains('on');
      if (on && !was) {
        el.style.transitionDelay = (el.dataset.stag || 0) + 'ms';
        el.classList.add('on');
      } else if (!on && was) {
        el.style.transitionDelay = '0ms';
        el.classList.remove('on');
      }
    });
    m.hlEls.forEach(el => {
      const from = +el.dataset.hl;
      const until = el.dataset.hlUntil ? +el.dataset.hlUntil : Infinity;
      el.classList.toggle('hl', step >= from && step < until);
    });
    if (m.cam) {
      let f = m.camFrames[0] || { x: 0, y: 0, k: 1 };
      m.camFrames.forEach(fr => { if (fr.at <= step) f = fr; });
      m.cam.style.transform = 'translate(' + (f.x || 0) + 'px,' + (f.y || 0) + 'px) scale(' + (f.k || 1) + ')';
      if (m.focus) m.cam.classList.toggle('focused', step >= m.focus[0] && step <= m.focus[1]);
      else m.cam.classList.remove('focused');
    }
  }

  /* ---------- HUD sync ---------- */
  function hud(i) {
    progBar.style.width = ((i + 1) / N * 100) + '%';
    counterCur.textContent = String(i + 1).padStart(2, '0');
    const sec = SECTIONS[meta[i].section - 1];
    secNow.innerHTML = '<span class="n">' + sec.n + '</span><span>' + sec.label + '</span>';
    sectBtns.forEach((b, bi) => {
      b.classList.toggle('now', bi === meta[i].section - 1);
      b.classList.toggle('done', bi < meta[i].section - 1);
    });
    btnPrev.disabled = (i === 0 && meta[i].step === 0);
    btnNext.disabled = false;
    renderNotes(i);
    try { history.replaceState(null, '', '#/' + (i + 1)); } catch (e) { /* file:// fallback */ }
  }

  /* ---------- morph continuity ---------- */
  function morph(a, b) {
    const keys = {};
    a.querySelectorAll('[data-morph]').forEach(el => keys[el.dataset.morph] = el);
    b.querySelectorAll('[data-morph]').forEach(el => {
      const src = keys[el.dataset.morph];
      if (!src) return;
      const ra = src.getBoundingClientRect(), rb = el.getBoundingClientRect();
      if (!ra.width || !rb.width) return;
      const dx = (ra.left + ra.width / 2) - (rb.left + rb.width / 2);
      const dy = (ra.top + ra.height / 2) - (rb.top + rb.height / 2);
      const sx = ra.width / rb.width, sy = ra.height / rb.height;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(sx - 1) < .02) return;
      if (typeof el.animate !== 'function') return;
      el.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', opacity: .25 },
        { transform: 'none', opacity: 1 }
      ], { duration: 820, easing: 'cubic-bezier(.22,1,.36,1)', delay: 120, fill: 'backwards' });
    });
  }

  /* ---------- navigation ---------- */
  function go(i, dir, fullStep) {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === cur && !fullStep) return;
    const oldM = meta[cur], newM = meta[i];
    oldM.el.classList.remove('active', 'pre-next', 'pre-prev');
    newM.el.classList.remove('pre-next', 'pre-prev');
    newM.el.classList.add(dir >= 0 ? 'pre-next' : 'pre-prev');
    // force layout so the pre- class applies before activation
    void newM.el.offsetWidth;
    apply(newM, fullStep ? newM.maxStep : 0);
    newM.el.classList.add('active');
    newM.el.classList.remove('pre-next', 'pre-prev');
    morph(oldM.el, newM.el);
    cur = i;
    hud(i);
    killHint();
  }

  function next() {
    const m = meta[cur];
    if (m.step < m.maxStep) { apply(m, m.step + 1); hud(cur); return; }
    go(cur + 1, 1);
  }
  function prev() {
    const m = meta[cur];
    if (m.step > 0) { apply(m, m.step - 1); hud(cur); return; }
    go(cur - 1, -1, true);
  }

  /* ---------- keyboard ---------- */
  const gate = document.getElementById('gate');
  let begun = false;
  function requestFS() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        const p = el.requestFullscreen({ navigationUI: 'hide' });
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {}
  }
  function toggleFS() {
    try {
      if (document.fullscreenElement) { const p = document.exitFullscreen(); if (p && p.catch) p.catch(() => {}); }
      else requestFS();
    } catch (e) {}
  }
  function begin() {
    if (begun) return;
    begun = true;
    gate.classList.add('gone');
    requestFS();
    setTimeout(() => { apply(meta[cur], 0); hud(cur); }, 260);
  }
  document.getElementById('gate-btn').addEventListener('click', begin);
  document.getElementById('fs-btn').addEventListener('click', toggleFS);
  stage.addEventListener('dblclick', e => {
    if (e.target.closest('button, .navbtns, .sects, #notes, #overview, #help, #gate')) return;
    toggleFS();
  });

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!begun) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowLeft') { e.preventDefault(); begin(); }
      else if (e.key === 'f' || e.key === 'F') toggleFS();
      return;
    }
    const ov = document.getElementById('overview'), hp = document.getElementById('help');
    switch (e.key) {
      case 'ArrowLeft': case ' ': case 'PageDown': case 'Enter': e.preventDefault(); closeOverlays(); next(); break;
      case 'ArrowRight': case 'PageUp': case 'Backspace': e.preventDefault(); closeOverlays(); prev(); break;
      case 'ArrowDown': e.preventDefault(); next(); break;
      case 'ArrowUp': e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); go(0, -1); break;
      case 'End': e.preventDefault(); go(N - 1, 1); break;
      case 'o': case 'O': case 'Escape':
        if (hp.classList.contains('open')) { hp.classList.remove('open'); break; }
        if (ov.classList.contains('open')) { ov.classList.remove('open'); break; }
        if (e.key === 'Escape') { document.getElementById('notes').classList.remove('open'); break; }
        openOverview(); break;
      case 'n': case 'N': document.getElementById('notes').classList.toggle('open'); break;
      case 'h': case 'H': case '?': hp.classList.toggle('open'); break;
      case 'f': case 'F': toggleFS(); break;
    }
  });
  function closeOverlays() {
    document.getElementById('overview').classList.remove('open');
    document.getElementById('help').classList.remove('open');
  }

  /* ---------- buttons / touch ---------- */
  btnNext.addEventListener('click', next);
  btnPrev.addEventListener('click', prev);
  sectBtns.forEach((b, i) => b.addEventListener('click', () => {
    const first = SECTIONS[i].from;
    go(first, first >= cur ? 1 : -1);
  }));

  let tx = null, ty = null;
  stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next() : prev());  /* rtl swipe */
    tx = ty = null;
  }, { passive: true });

  function killHint() { if (hint) hint.classList.add('gone'); }
  setTimeout(killHint, 9000);

  /* ---------- overview ---------- */
  const ov = document.getElementById('overview');
  let ovBuilt = false;
  function openOverview() {
    if (!ovBuilt) {
      const grid = ov.querySelector('.grid');
      meta.forEach((m, i) => {
        const t = document.createElement('div');
        t.className = 'thumb' + (i === cur ? ' now' : '');
        t.dataset.i = i;
        const frame = document.createElement('div');
        frame.className = 'frame';
        const clone = m.el.cloneNode(true);
        clone.classList.add('active');
        clone.classList.remove('pre-next', 'pre-prev');
        clone.querySelectorAll('[data-step]').forEach(el => el.classList.add('on'));
        const c2 = clone.querySelector('.cam'); if (c2) c2.style.transform = 'none';
        frame.appendChild(clone);
        t.appendChild(frame);
        const lbl = document.createElement('div');
        lbl.className = 'lbl';
        lbl.innerHTML = '<span class="n">' + String(i + 1).padStart(2, '0') + '</span><span>' + m.title + '</span>';
        t.appendChild(lbl);
        t.addEventListener('click', () => { ov.classList.remove('open'); go(i, i >= cur ? 1 : -1); });
        grid.appendChild(t);
      });
      // scale frames to thumb size
      requestAnimationFrame(() => {
        const w = grid.querySelector('.thumb').clientWidth;
        const f = w / 1920;
        grid.querySelectorAll('.frame').forEach(fr => {
          fr.style.width = '1920px'; fr.style.height = '1080px';
          fr.style.transform = 'scale(' + f + ')';
          fr.style.transformOrigin = 'top left';
        });
      });
      ovBuilt = true;
    } else {
      ov.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('now', i === cur));
    }
    ov.classList.add('open');
  }
  document.getElementById('ov-btn').addEventListener('click', openOverview);

  /* ---------- presenter notes ---------- */
  const notesEl = document.getElementById('notes');
  document.getElementById('notes-btn').addEventListener('click', () => notesEl.classList.toggle('open'));
  function renderNotes(i) {
    const n = (window.NOTES && window.NOTES[i]) || {};
    const sec = SECTIONS[meta[i].section - 1];
    notesEl.innerHTML =
      '<div class="nh"><span class="sec">' + sec.n + ' · ' + sec.label + '</span>' +
      '<span class="ttl">' + meta[i].title + '</span>' +
      '<span class="pg">SLIDE ' + String(i + 1).padStart(2, '0') + ' / ' + N + ' · STEPS ' + meta[i].maxStep + '</span></div>' +
      '<div class="col"><h4>مَاذَا تَقُول</h4><p>' + (n.say || '') + '</p></div>' +
      '<div class="col"><h4>نُقطة التركيز والانتقال</h4><p class="fx">' + (n.focus || '') + '</p><p>' + (n.next || '') + '</p></div>';
  }

  /* ---------- boot ---------- */
  let start = 0;
  const h = (location.hash || '').match(/#\/(\d+)/);
  if (h) start = Math.max(0, Math.min(N - 1, +h[1] - 1));
  meta.forEach((m, i) => { if (i !== start) m.el.classList.remove('active'); });
  cur = start;
  apply(meta[start], -1);           /* hold entrance until the start gate closes */
  meta[start].el.classList.add('active');
  hud(start);
})();
