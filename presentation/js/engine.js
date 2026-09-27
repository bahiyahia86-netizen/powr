/* ============================================================
   POWR presentation engine — motion layer powered by GSAP
   (greensock/GSAP, free standard license incl. SplitText & DrawSVG)
   — fixed 1920×1080 stage scaled to any viewport
   — step-based progressive disclosure (data-step / data-fx)
   — cinematic camera inside diagrams (data-cam on .cam)
   — highlight & focus choreography (data-hl, data-focus)
   — morph continuity between consecutive slides (data-morph)
   — SplitText title reveals · DrawSVG wire drawing
   — start gate + browser fullscreen · overview · notes · hash · touch
   Falls back to the pure-CSS motion system if GSAP is missing.
   ============================================================ */
(function () {
  'use strict';

  const stage = document.getElementById('stage');
  const slides = Array.from(stage.querySelectorAll(':scope > section.slide'));
  const N = slides.length;

  /* ---------- GSAP bootstrap ---------- */
  const G = window.gsap || null;
  const SPLIT = !!(G && window.SplitText);
  const DRAW = !!(G && window.DrawSVGPlugin);
  if (G) {
    if (SPLIT) G.registerPlugin(window.SplitText);
    if (DRAW) G.registerPlugin(window.DrawSVGPlugin);
    document.documentElement.classList.add('gsap');
    G.defaults({ overwrite: 'auto' });
  }
  const EO = 'power4.out', EIO = 'power3.inOut';

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
    const groups = {};
    stepsEls.forEach(el => {
      const k = el.dataset.step;
      const g = groups[k] = (groups[k] || 0) + 1;
      el.dataset.stag = (g - 1) * 80;
    });
    const cam = sl.querySelector('.cam');
    let camFrames = [];
    if (cam && cam.dataset.cam) { try { camFrames = JSON.parse(cam.dataset.cam); } catch (e) { camFrames = []; } }
    if (cam && cam.dataset.cam) { camFrames.forEach(fr => { maxStep = Math.max(maxStep, fr.at | 0); }); }
    const focus = cam && cam.dataset.focus ? cam.dataset.focus.split('-').map(Number) : null;
    Array.from(sl.querySelectorAll('[data-hl]')).forEach(el => { maxStep = Math.max(maxStep, +el.dataset.hl); });
    if (focus) maxStep = Math.max(maxStep, focus[1]);
    return {
      el: sl, inner: sl.querySelector('.inner'), cam, camFrames, focus, stepsEls, maxStep,
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

  /* ---------- reveal primitives ---------- */
  function fromVars(el) {
    const fx = el.dataset.fx;
    const v = { autoAlpha: 0 };
    if (fx === 'up') v.y = 34;
    else if (fx === 'down') v.y = -26;
    else if (fx === 'right') v.x = 46;
    else if (fx === 'left') v.x = -46;
    else if (fx === 'pop') { v.scale = .88; v.filter = 'blur(7px)'; }
    else if (fx === 'clip') v.clipPath = 'inset(0 0 100% 0)';
    else v.y = 26;
    return v;
  }
  function toVars(el) {
    const v = { autoAlpha: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)', duration: .85, ease: EO };
    if (el.dataset.fx === 'clip') v.clipPath = 'inset(-8% 0 -10% 0)';
    return v;
  }
  function splitArr(el) {
    if (el._stArr) return el._stArr;
    try {
      const type = el.dataset.split || 'lines';
      const st = window.SplitText.create(el, { type: type });
      const arr = type === 'words' ? st.words : (type === 'chars' ? st.chars : st.lines);
      el._stArr = (arr && arr.length) ? arr : null;
    } catch (e) { el._stArr = null; }
    return el._stArr;
  }
  function reveal(el, on, delay) {
    if (el.hasAttribute('data-split') && SPLIT && splitArr(el)) {
      if (on) {
        G.set(el, { autoAlpha: 1 });
        G.from(splitArr(el), {
          y: (el.dataset.split === 'words') ? 40 : 28,
          opacity: 0,
          stagger: (el.dataset.split === 'words') ? .042 : .085,
          duration: 1.0, ease: EO, delay: delay
        });
      } else {
        G.to(el, { autoAlpha: 0, duration: .3 });
      }
      return;
    }
    if (el.classList.contains('draw') && DRAW) {
      try {
        const shapes = el.querySelectorAll('path,line,polyline');
        if (on) {
          G.fromTo(el, { opacity: 0 }, { opacity: 1, duration: .3, delay: delay });
          G.fromTo(shapes, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.05, ease: 'power2.inOut', stagger: .12, delay: delay });
        } else {
          G.to(el, { opacity: 0, duration: .3 });
        }
        return;
      } catch (e) { /* fall through to generic reveal */ }
    }
    if (G) {
      if (on) G.fromTo(el, fromVars(el), toVars(el, delay) && Object.assign(toVars(el), { delay: delay }));
      else G.to(el, { autoAlpha: 0, duration: .32, ease: 'power2.in' });
    } else {
      if (on) { el.style.transitionDelay = (delay * 1000) + 'ms'; el.classList.add('on'); }
      else { el.style.transitionDelay = '0ms'; el.classList.remove('on'); }
    }
  }

  /* ---------- apply state of one slide ---------- */
  function apply(m, step) {
    m.step = step;
    m.stepsEls.forEach(el => {
      const k = +el.dataset.step;
      const on = k <= step;
      const was = el._on === true;
      if (on && !was) { el._on = true; reveal(el, true, (el.dataset.stag || 0) / 1000); }
      else if (!on && was) { el._on = false; reveal(el, false, 0); }
    });
    m.hlEls.forEach(el => {
      const from = +el.dataset.hl;
      const until = el.dataset.hlUntil ? +el.dataset.hlUntil : Infinity;
      const on = step >= from && step < until;
      const was = el.classList.contains('hl');
      el.classList.toggle('hl', on);
      if (G && on && !was && el.classList.contains('fnum')) {
        G.fromTo(el, { scale: .5 }, { scale: 1, duration: .65, ease: 'back.out(4)' });
      }
    });
    if (m.cam) {
      let f = m.camFrames[0] || { x: 0, y: 0, k: 1 };
      m.camFrames.forEach(fr => { if (fr.at <= step) f = fr; });
      if (G) G.to(m.cam, { x: f.x || 0, y: f.y || 0, scale: f.k || 1, duration: 1.3, ease: EIO });
      else m.cam.style.transform = 'translate(' + (f.x || 0) + 'px,' + (f.y || 0) + 'px) scale(' + (f.k || 1) + ')';
      if (m.focus) m.cam.classList.toggle('focused', step >= m.focus[0] && step <= m.focus[1]);
      else m.cam.classList.remove('focused');
    }
  }

  /* ---------- HUD sync ---------- */
  function hud(i) {
    const pct = ((i + 1) / N * 100) + '%';
    if (G) G.to(progBar, { width: pct, duration: .6, ease: 'power2.inOut' });
    else progBar.style.width = pct;
    counterCur.textContent = String(i + 1).padStart(2, '0');
    const sec = SECTIONS[meta[i].section - 1];
    secNow.innerHTML = '<span class="n">' + sec.n + '</span><span>' + sec.label + '</span>';
    sectBtns.forEach((b, bi) => {
      const now = bi === meta[i].section - 1;
      const wasNow = b.classList.contains('now');
      b.classList.toggle('now', now);
      b.classList.toggle('done', bi < meta[i].section - 1);
      if (G && now && !wasNow) G.fromTo(b, { scale: .86 }, { scale: 1, duration: .55, ease: 'back.out(3)' });
    });
    btnPrev.disabled = (i === 0 && meta[i].step === 0);
    btnNext.disabled = false;
    renderNotes(i);
    try { history.replaceState(null, '', '#/' + (i + 1)); } catch (e) {}
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
      if (!G) {
        if (typeof el.animate !== 'function') return;
        el.animate([
          { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', opacity: .25 },
          { transform: 'none', opacity: 1 }
        ], { duration: 820, easing: 'cubic-bezier(.22,1,.36,1)', delay: 120, fill: 'backwards' });
        return;
      }
      const brA = getComputedStyle(src).borderRadius, brB = getComputedStyle(el).borderRadius;
      G.fromTo(el,
        { x: dx, y: dy, scaleX: sx, scaleY: sy, autoAlpha: .18, borderRadius: brA },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, autoAlpha: 1, borderRadius: brB, duration: .95, ease: EIO, delay: .12 });
      G.to(src, { autoAlpha: 0, scale: .96, duration: .4, ease: 'power2.in' });
    });
  }

  /* ---------- navigation ---------- */
  function go(i, dir, fullStep) {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === cur && !fullStep) return;
    const oldM = meta[cur], newM = meta[i];
    apply(newM, fullStep ? newM.maxStep : 0);
    oldM.el.classList.remove('active');
    newM.el.classList.add('active');
    if (G) {
      G.to(oldM.el, { autoAlpha: 0, duration: .45, delay: .12, ease: 'power2.inOut' });
      G.to(oldM.inner, { x: dir >= 0 ? 80 : -80, scale: .988, duration: .5, ease: 'power2.in' });
      G.fromTo(newM.el, { autoAlpha: 0 }, { autoAlpha: 1, duration: .5, ease: 'power2.inOut' });
      G.fromTo(newM.inner,
        { x: dir >= 0 ? -80 : 80, scale: .988, opacity: 0 },
        { x: 0, scale: 1, opacity: 1, duration: .85, ease: EO, delay: .08 });
    } else {
      oldM.el.classList.remove('active', 'pre-next', 'pre-prev');
      newM.el.classList.add(dir >= 0 ? 'pre-next' : 'pre-prev');
      void newM.el.offsetWidth;
      newM.el.classList.add('active');
      newM.el.classList.remove('pre-next', 'pre-prev');
    }
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

  /* ---------- start gate + fullscreen ---------- */
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
    requestFS();
    if (G) {
      const tl = G.timeline();
      tl.to('#gate .gbox > *', { y: -34, autoAlpha: 0, stagger: .06, duration: .45, ease: 'power2.in' })
        .to(gate, { autoAlpha: 0, duration: .6, ease: 'power2.inOut', onComplete: () => gate.classList.add('gone') }, '-=.15')
        .add(() => { apply(meta[cur], 0); hud(cur); }, '-=.35');
    } else {
      gate.classList.add('gone');
      setTimeout(() => { apply(meta[cur], 0); hud(cur); }, 260);
    }
  }
  document.getElementById('gate-btn').addEventListener('click', begin);
  document.getElementById('fs-btn').addEventListener('click', toggleFS);
  stage.addEventListener('dblclick', e => {
    if (e.target.closest('button, .navbtns, .sects, #notes, #overview, #help, #gate')) return;
    toggleFS();
  });

  /* ---------- keyboard ---------- */
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
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next() : prev());
    tx = ty = null;
  }, { passive: true });

  /* ---------- micro-interactions (hover lift) ---------- */
  if (G) {
    stage.addEventListener('pointerover', e => {
      const c = e.target.closest('.card, .tech, .res-row, .mrel, .chip');
      if (c && !c.contains(e.relatedTarget)) G.to(c, { y: -6, duration: .4, ease: 'power3.out' });
    });
    stage.addEventListener('pointerout', e => {
      const c = e.target.closest('.card, .tech, .res-row, .mrel, .chip');
      if (c && !c.contains(e.relatedTarget)) G.to(c, { y: 0, duration: .5, ease: 'power3.out' });
    });
  }

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
        const frame = document.createElement('div');
        frame.className = 'frame';
        const clone = m.el.cloneNode(true);
        clone.classList.add('active');
        clone.classList.remove('pre-next', 'pre-prev');
        if (G) clone.style.opacity = 1, clone.style.visibility = 'visible';
        clone.querySelectorAll('[data-step]').forEach(el => el.classList.add('on'));
        const c2 = clone.querySelector('.cam');
        if (c2) { c2.style.transform = 'none'; if (G) G.set(c2, { x: 0, y: 0, scale: 1 }); }
        frame.appendChild(clone);
        t.appendChild(frame);
        const lbl = document.createElement('div');
        lbl.className = 'lbl';
        lbl.innerHTML = '<span class="n">' + String(i + 1).padStart(2, '0') + '</span><span>' + m.title + '</span>';
        t.appendChild(lbl);
        t.addEventListener('click', () => { ov.classList.remove('open'); go(i, i >= cur ? 1 : -1); });
        grid.appendChild(t);
      });
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
    if (G) G.fromTo('#overview .thumb', { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: .022, duration: .5, ease: EO, clearProps: 'transform' });
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
      '<div class="col"><h4>نقطة التركيز والانتقال</h4><p class="fx">' + (n.focus || '') + '</p><p>' + (n.next || '') + '</p></div>';
  }

  /* ---------- boot ---------- */
  let start = 0;
  const h = (location.hash || '').match(/#\/(\d+)/);
  if (h) start = Math.max(0, Math.min(N - 1, +h[1] - 1));
  cur = start;
  if (G) {
    meta.forEach((m, i) => { G.set(m.el, { autoAlpha: i === start ? 1 : 0 }); m.el.classList.toggle('active', i === start); });
    G.set(meta[start].inner, { x: 0, scale: 1, opacity: 1 });
    /* ambient life: hero motif float + gate entrance */
    G.to('.hero .motif', { y: 14, duration: 4.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    G.from('#gate .gbox > *', { y: 44, autoAlpha: 0, stagger: .1, duration: .95, ease: EO, delay: .15 });
  } else {
    meta.forEach((m, i) => m.el.classList.toggle('active', i === start));
  }
  apply(meta[start], -1);           /* hold entrance until the start gate closes */
  hud(start);
})();
