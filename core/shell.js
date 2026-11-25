// GameShell — everything every Hijinx room game shares:
// page layout, 3D room, outside screen (RFID tap, difficulty pick, queue, time left),
// game clock, inputs (3D buttons, side-panel buttons, keyboard), settings with
// easy/hard presets, the admin drawer, and player mode (?mode=player hides admin).
import { Room3D, THREE } from './room.js';
import { ROOMS } from './venue.js';
import { C, DISPLAY, MONO, rr, fit, wrap, clear, fmtTime, fmtNum, Surface } from './draw.js';

const TEAM_NAMES = ['The Bellhops', 'Room Service', 'Late Checkout', 'Minibar Raiders', 'Do Not Disturb',
  'Lobby Legends', 'Turndown Crew', 'Suite Dreams', 'Key Card Club', 'The Concierges'];

export class GameShell {
  /**
   * opts: { id, title, roomId, schema, presets, instructions[], blurbs:{easy,hard}, game }
   * game hooks: setup(shell), begin(run), press(inputId), onTimeUp(), tick(dt), reset(),
   *             adminInfo() -> [[k,v]], adminActions() -> [{label, fn}]
   */
  constructor(opts) {
    this.o = opts;
    this.game = opts.game;
    this.params = new URLSearchParams(location.search);
    this.playerMode = this.params.get('mode') === 'player';
    this.roomId = this.params.get('room') || opts.roomId;
    this.spec = ROOMS[this.roomId];
    this.storeKey = `hijinx:${opts.id}:settings`;
    this.state = 'idle'; this.team = null; this.difficulty = 'easy'; this.queue = []; this.lastResult = null;
    this.clock = { running: false, left: 0, total: 0 };
    this.inputs = []; this.lit = new Set();
    this._nameIx = 0;
  }

  async start() {
    await this._loadSettings();
    this._buildDom();
    this.room = new Room3D(this.dom.view, this.spec, { onPick: (id, hit) => this._pick(id, hit) });

    // outside screen (about 12"), beside the door on the corridor side
    const ox = this.spec.door.x - this.spec.door.width / 2 - 0.35;
    this.outside = new Surface(this.room.addScreen({ wall: 'outside', u: Math.max(0.25, ox), v: 1.45, width: 0.266, height: 0.15, px: [800, 450], frameColor: 0xffb547, label: 'OUTSIDE SCREEN 12"' }));
    this.room.clickable(this.outside.screen.mesh, 'screen:outside', 'Outside screen (click to use)');
    // score screen above the door, inside
    const sx = this.spec.w - this.spec.door.x; // front-wall u runs right-to-left looking in
    this.score = new Surface(this.room.addScreen({ wall: 'front', u: sx, v: 2.36, width: 0.8, height: 0.45, px: [800, 450], label: 'SCORE SCREEN' }));

    this.addPanel(this.outside, 'Outside screen', '12" · by the door · click to use', { clickable: true, small: true });
    this.game.setup(this);
    this.addPanel(this.score, 'Score screen', 'above the door, inside');
    this._buildAdmin();
    this._bindKeys();

    this.room.onFrame((dt, t) => this._frame(dt, t));
    this.redrawAll();
    document.fonts && document.fonts.ready.then(() => this.redrawAll());
  }

  // ---------- settings ----------
  async _loadSettings() {
    const schema = this.o.schema;
    this.defaults = Object.fromEntries(schema.map(f => [f.key, f.default]));
    this.filePresets = structuredClone(this.o.presets);
    this.store = { base: {}, presets: { easy: {}, hard: {} } };
    // 1) committed settings.json next to the game (exported from admin), if present
    try {
      const r = await fetch('settings.json', { cache: 'no-store' });
      if (r.ok) this._mergeStore(await r.json());
    } catch { /* no file — fine */ }
    // 2) this browser's admin tweaks
    try { const s = JSON.parse(localStorage.getItem(this.storeKey) || 'null'); if (s) this._mergeStore(s); } catch { }
  }
  _mergeStore(s) {
    Object.assign(this.store.base, s.base || {});
    for (const d of ['easy', 'hard']) Object.assign(this.store.presets[d], (s.presets || {})[d] || {});
  }
  _saveSettings() { try { localStorage.setItem(this.storeKey, JSON.stringify(this.store)); } catch { } }
  presetValue(diff, key) {
    return key in this.store.presets[diff] ? this.store.presets[diff][key]
      : key in (this.filePresets[diff] || {}) ? this.filePresets[diff][key] : this.defaults[key];
  }
  baseValue(key) { return key in this.store.base ? this.store.base[key] : this.defaults[key]; }
  get settings() {
    const s = {};
    for (const f of this.o.schema) s[f.key] = f.preset ? this.presetValue(this.difficulty, f.key) : this.baseValue(f.key);
    return s;
  }

  // ---------- layout ----------
  _buildDom() {
    const sp = this.spec;
    document.title = `${this.o.title} · ${this.roomId} · Hijinx CityWalk`;
    document.body.innerHTML = `
    <div class="app">
      <div class="topbar">
        <a class="home" href="../../index.html${this.playerMode ? '?mode=player' : ''}">&larr; Venue</a>
        <h1>${this.o.title}<small>${this.roomId} · ${sp.level} level · ${Math.round(Math.max(sp.d, sp.w) * 1000)} × ${Math.round(Math.min(sp.d, sp.w) * 1000)} mm</small></h1>
        <span class="chip" id="diffchip">No game</span>
        <span class="spacer"></span>
        <div class="grp" id="views">
          <button data-v="overview" aria-pressed="true">Overview</button><button data-v="door">From door</button><button data-v="outside">Outside</button><button data-v="top">Top</button>
        </div>
        <button id="mute" aria-pressed="false" title="Sound on/off">Sound on</button>
        ${this.playerMode ? '' : '<button class="btn-admin" id="adminbtn">Admin</button>'}
      </div>
      <div class="main">
        <div class="view" id="view">
          <div class="legend" id="legend"></div>
          <div class="hint">Drag to orbit · scroll to zoom · click buttons and screens to play</div>
        </div>
        <div class="side" id="side">
          <div class="card"><h2>Room flow <span id="flowstate"></span></h2>
            <div class="flowbtns">
              <button id="tapcard">Tap RFID card</button>
              <button id="resetroom">Reset room</button>
            </div>
          </div>
          <div class="card"><h2>Buttons <span>click, or use keys</span></h2><div class="inputs" id="inputs"></div></div>
          <div id="panels"></div>
          <p class="note">${this.o.footnote || ''}</p>
        </div>
        <div class="admin" id="admin" aria-hidden="true"></div>
      </div>
    </div>`;
    const $ = (id) => document.getElementById(id);
    this.dom = { view: $('view'), side: $('side'), panels: $('panels'), inputs: $('inputs'), admin: $('admin'), chip: $('diffchip'), flow: $('flowstate'), legend: $('legend') };
    $('views').addEventListener('click', e => {
      const v = e.target.dataset.v; if (!v) return;
      this.room.setView(v);
      for (const b of $('views').children) b.setAttribute('aria-pressed', b.dataset.v === v);
    });
    $('tapcard').onclick = () => this.tapCard();
    $('resetroom').onclick = () => this.resetRoom();
    const mute = $('mute');
    mute.onclick = () => {
      this.muted = !this.muted; mute.textContent = this.muted ? 'Sound off' : 'Sound on';
      mute.setAttribute('aria-pressed', this.muted);
      if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    };
    if (!this.playerMode) $('adminbtn').onclick = () => this.toggleAdmin();
  }

  // Show a screen in the side panel (the same canvas the 3D room uses).
  addPanel(surface, title, sub, { clickable = false, small = false, before = null } = {}) {
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<h2>${title} <span>${sub || ''}</span></h2>`;
    const cv = surface.canvas; cv.className = 'screen' + (clickable ? ' clickable' : '') + (small ? ' small' : '');
    card.appendChild(cv);
    if (clickable) cv.addEventListener('click', e => {
      const r = cv.getBoundingClientRect();
      this.unlockAudio();
      surface.click((e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height);
      this.redrawAll();
    });
    if (before) this.dom.panels.insertBefore(card, before); else this.dom.panels.appendChild(card);
    return card;
  }

  setLegend(items) {
    this.dom.legend.innerHTML = items.map(([c, t]) => `<span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};margin-right:6px"></i>${t}</span>`).join('');
  }

  // ---------- inputs ----------
  setInputs(list) {
    this.inputs = list;
    this.dom.inputs.innerHTML = '';
    for (const inp of list) {
      const b = document.createElement('button');
      b.style.color = inp.color; b.dataset.id = inp.id;
      b.innerHTML = `<i></i>${inp.label}<kbd>${inp.key}</kbd>`;
      b.onclick = () => this.press(inp.id);
      inp.el = b; this.dom.inputs.appendChild(b);
    }
  }
  setLit(ids) {
    this.lit = new Set(ids);
    for (const inp of this.inputs) inp.el.classList.toggle('lit', this.lit.has(inp.id));
  }
  press(id) {
    this.unlockAudio();
    if (this.state !== 'inroom') { this.flash(`Buttons do nothing until a team is in the room`); return; }
    this.game.press(id);
    this.redrawAll();
  }
  _bindKeys() {
    addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input,select,textarea')) return;
      const inp = this.inputs.find(i => i.key === e.key);
      if (inp) { this.press(inp.id); e.preventDefault(); }
      if (e.key === 'Escape' && this.adminOpen) this.toggleAdmin(false);
    });
  }
  _pick(id, hit) {
    this.unlockAudio();
    if (id === 'screen:outside') {
      if (hit && hit.uv) this.outside.click(hit.uv.x * 800, (1 - hit.uv.y) * 450);
      this.redrawAll(); return;
    }
    if (typeof id === 'string' && id.startsWith('screen:')) {
      const s = this._extraSurfaces && this._extraSurfaces[id];
      if (s && hit && hit.uv) s.click(hit.uv.x * s.canvas.width, (1 - hit.uv.y) * s.canvas.height);
      this.redrawAll(); return;
    }
    if (this.inputs.find(i => i.id === id)) this.press(id);
  }
  // Let a game register its own clickable screens (e.g. genre pick on the main screen)
  clickableScreen(surface, id, tip) {
    this._extraSurfaces = this._extraSurfaces || {};
    this._extraSurfaces['screen:' + id] = surface;
    this.room.clickable(surface.screen.mesh, 'screen:' + id, tip);
  }

  // ---------- audio ----------
  unlockAudio() {
    if (!this.audio) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      this.audio = new AC();
      this.master = this.audio.createGain(); this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.audio.destination);
    }
    if (this.audio.state === 'suspended') this.audio.resume();
    return this.audio;
  }
  beep(freq = 880, dur = 0.12, type = 'square', vol = 0.12) {
    const ac = this.unlockAudio(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    o.connect(g).connect(this.master); o.start(); o.stop(ac.currentTime + dur + 0.02);
  }

  // ---------- room flow ----------
  _nextName() { return TEAM_NAMES[this._nameIx++ % TEAM_NAMES.length]; }
  tapCard() {
    this.unlockAudio();
    const name = this._nextName();
    if (this.state === 'idle') { this.team = name; this.state = 'carded'; this.beep(1320, 0.08); }
    else if (this.queue.length < 4) { this.queue.push(name); this.beep(990, 0.08); }
    else this.flash('Queue is full (4 teams)');
    this.redrawAll();
  }
  chooseDifficulty(d) {
    if (this.state !== 'carded') return;
    this.difficulty = d; this.state = 'inroom';
    this.clock = { running: false, left: this.settings.gameLength, total: this.settings.gameLength };
    this.game.begin({ team: this.team, difficulty: d, settings: this.settings });
    this._refreshAdmin();
    this.redrawAll();
  }
  startClock(sec) {
    this.clock = { running: true, left: sec, total: sec };
  }
  addTime(sec) { this.clock.left = Math.max(1, this.clock.left + sec); this.clock.total = Math.max(this.clock.total, this.clock.left); }
  finish(result) {
    this.clock.running = false;
    this.lastResult = { team: this.team, difficulty: this.difficulty, ...result };
    this.state = 'result';
    this._resultUntil = performance.now() + (this.settings.resultHold ?? 8) * 1000;
    this.setLit([]);
    this.redrawAll(); this._refreshAdmin();
  }
  _afterResult() {
    this.team = null;
    if (this.queue.length) { this.team = this.queue.shift(); this.state = 'carded'; }
    else this.state = 'idle';
    this.game.reset && this.game.reset();
    this.redrawAll();
  }
  resetRoom() {
    this.clock = { running: false, left: 0, total: 0 };
    this.team = null; this.queue = []; this.state = 'idle';
    this.game.reset && this.game.reset();
    this.setLit([]); this.redrawAll(); this._refreshAdmin();
  }
  flash(msg) {
    this._flash = { msg, until: performance.now() + 2200 };
    this.redrawAll();
  }

  _frame(dt) {
    if (this.state === 'inroom' && this.clock.running && !this.paused) {
      this.clock.left -= dt;
      if (this.clock.left <= 0) { this.clock.left = 0; this.clock.running = false; this.game.onTimeUp(); }
    }
    if (this.state === 'result' && performance.now() > this._resultUntil) this._afterResult();
    if (!this.paused) this.game.tick && this.game.tick(dt);
    // redraw screens ~20 fps
    this._acc = (this._acc || 0) + dt;
    if (this._acc > 0.05) { this._acc = 0; this.redrawAll(); }
    if (this.adminOpen) { this._liveAcc = (this._liveAcc || 0) + dt; if (this._liveAcc > 0.25) { this._liveAcc = 0; this._renderLive(); } }
  }

  redrawAll() {
    this._drawOutside();
    this._drawScore();
    this.game.draw && this.game.draw();
    const chip = this.dom.chip;
    if (this.state === 'inroom' || this.state === 'result') { chip.textContent = this.difficulty; chip.className = 'chip ' + this.difficulty; }
    else { chip.textContent = 'No game'; chip.className = 'chip'; }
    this.dom.flow.textContent = { idle: 'waiting for a team', carded: `${this.team}: picking difficulty`, inroom: `${this.team} in play`, result: 'showing result' }[this.state]
      + (this.queue.length ? ` · ${this.queue.length} queued` : '');
  }

  // ---------- outside screen (shared by all games) ----------
  _drawOutside() {
    const S = this.outside, ctx = S.begin(), W = 800, H = 450, o = this.o;
    clear(ctx);
    // header
    ctx.fillStyle = C.accent; ctx.fillRect(0, 0, W, 6);
    fit(ctx, o.title.toUpperCase(), 32, 64, 520, 52, { color: C.fg });
    fit(ctx, `ROOM ${this.roomId}`, W - 32, 60, 200, 24, { color: C.muted, align: 'right', weight: 500 });

    const flash = this._flash && performance.now() < this._flash.until ? this._flash.msg : null;
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 260);

    if (this.state === 'idle') {
      (o.instructions || []).slice(0, 4).forEach((t, i) => {
        ctx.fillStyle = C.accent; ctx.font = `700 26px ${DISPLAY}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(String(i + 1), 34, 104 + i * 54);
        wrap(ctx, t, 64, 108 + i * 54, 700, 25, { size: 21, color: C.fg, maxLines: 2 });
      });
      rr(ctx, 32, 346, W - 64, 76, 14); ctx.strokeStyle = `rgba(255,181,71,${pulse})`; ctx.lineWidth = 4; ctx.stroke();
      fit(ctx, 'TAP YOUR CARD TO PLAY', W / 2, 398, W - 120, 40, { color: C.accent, align: 'center' });
      S.hit(32, 346, W - 64, 76, () => this.tapCard());
    } else if (this.state === 'carded') {
      fit(ctx, `Hi ${this.team}!`, 32, 128, W - 64, 40, { color: C.fg });
      wrap(ctx, 'Pick your difficulty to start.', 32, 146, W - 64, 26, { size: 20, color: C.muted });
      const bw = (W - 64 - 20) / 2;
      [['easy', C.good], ['hard', C.bad]].forEach(([d, col], i) => {
        const x = 32 + i * (bw + 20), y = 196, h = 220;
        rr(ctx, x, y, bw, h, 16); ctx.fillStyle = col + '22'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
        fit(ctx, d.toUpperCase(), x + bw / 2, y + 78, bw - 30, 64, { color: col, align: 'center' });
        wrap(ctx, (o.blurbs || {})[d] || '', x + bw / 2, y + 102, bw - 36, 25, { size: 19, color: C.fg, align: 'center', maxLines: 4 });
        S.hit(x, y, bw, h, () => this.chooseDifficulty(d));
      });
    } else if (this.state === 'inroom') {
      const cl = this.clock;
      fit(ctx, 'GAME IN PROGRESS', 32, 130, W - 64, 34, { color: C.muted, weight: 500 });
      fit(ctx, this.team, 32, 186, W - 300, 48, { color: C.fg });
      fit(ctx, this.difficulty.toUpperCase(), W - 32, 186, 220, 34, { color: this.difficulty === 'hard' ? C.bad : C.good, align: 'right' });
      fit(ctx, cl.running || cl.left < cl.total ? fmtTime(cl.left) : fmtTime(this.settings.gameLength), W / 2, 318, W, 120, { color: C.accent, align: 'center' });
      fit(ctx, cl.running ? 'LEFT TO PLAY' : 'STARTING SOON', W / 2, 352, W, 22, { color: C.muted, align: 'center', weight: 500 });
      this._drawQueue(ctx, W, H);
      S.hit(0, 0, W, H, () => this.tapCard());
    } else if (this.state === 'result') {
      const r = this.lastResult;
      fit(ctx, `${r.team} scored`, W / 2, 150, W - 64, 40, { color: C.fg, align: 'center' });
      fit(ctx, fmtNum(r.score), W / 2, 290, W - 64, 140, { color: C.accent, align: 'center' });
      if (r.line) fit(ctx, r.line, W / 2, 340, W - 64, 24, { color: C.muted, align: 'center', weight: 500 });
      this._drawQueue(ctx, W, H);
      S.hit(0, 0, W, H, () => this.tapCard());
    }
    if (flash) {
      rr(ctx, 40, H / 2 - 40, W - 80, 80, 12); ctx.fillStyle = 'rgba(6,11,20,.92)'; ctx.fill(); ctx.strokeStyle = C.bad; ctx.lineWidth = 3; ctx.stroke();
      fit(ctx, flash, W / 2, H / 2 + 12, W - 120, 30, { color: C.fg, align: 'center' });
    }
    S.commit();
  }
  _drawQueue(ctx, W, H) {
    ctx.fillStyle = C.rule; ctx.fillRect(32, H - 66, W - 64, 2);
    const q = this.queue.length ? 'Next: ' + this.queue.join(' · ') : 'No one queued · tap your card to queue';
    fit(ctx, q, 32, H - 26, W - 64, 22, { color: C.muted, weight: 500, family: MONO });
  }

  // ---------- score screen (above door inside) ----------
  _drawScore() {
    const S = this.score, ctx = S.begin(), W = 800, H = 450;
    clear(ctx);
    if (this.state === 'inroom' || this.state === 'result') {
      const g = this.game.scoreboard ? this.game.scoreboard() : { score: 0 };
      fit(ctx, this.team || '', 30, 62, 500, 40, { color: C.fg });
      fit(ctx, this.difficulty.toUpperCase(), W - 30, 62, 200, 30, { color: this.difficulty === 'hard' ? C.bad : C.good, align: 'right' });
      fit(ctx, 'SCORE', 30, 130, 300, 26, { color: C.muted, weight: 500 });
      fit(ctx, fmtNum(g.score || 0), 30, 290, 470, 170, { color: C.accent });
      fit(ctx, 'TIME', W - 30, 130, 200, 26, { color: C.muted, weight: 500, align: 'right' });
      const left = this.state === 'result' ? 0 : (this.clock.running || this.clock.left < this.clock.total ? this.clock.left : this.settings.gameLength);
      fit(ctx, fmtTime(left), W - 30, 220, 260, 96, { color: left < 15 && this.state === 'inroom' ? C.bad : C.fg, align: 'right' });
      if (g.sub) fit(ctx, g.sub, W - 30, 290, 260, 30, { color: C.muted, align: 'right', weight: 500 });
      if (g.footer) fit(ctx, g.footer, 30, H - 32, W - 60, 28, { color: C.wire, weight: 500 });
    } else {
      fit(ctx, 'HIJINX HOTEL', W / 2, 200, W - 60, 80, { color: C.fg, align: 'center' });
      fit(ctx, this.o.title.toUpperCase(), W / 2, 260, W - 60, 40, { color: C.accent, align: 'center', weight: 500 });
      if (this.lastResult) fit(ctx, `Last: ${this.lastResult.team} · ${fmtNum(this.lastResult.score)}`, W / 2, 380, W - 60, 26, { color: C.muted, align: 'center', weight: 500, family: MONO });
    }
    S.commit();
  }

  // ---------- admin drawer ----------
  toggleAdmin(force) {
    if (this.playerMode) return;
    this.adminOpen = force ?? !this.adminOpen;
    this.dom.admin.classList.toggle('open', this.adminOpen);
    this.dom.admin.setAttribute('aria-hidden', !this.adminOpen);
    if (this.adminOpen) this._refreshAdmin();
  }
  _buildAdmin() {
    if (this.playerMode) return;
    const a = this.dom.admin;
    a.innerHTML = `<header><b>Admin</b><button id="adm-close">Close</button></header>
      <div class="tabs" role="tablist">
        <button role="tab" data-t="demo" aria-selected="true">Demo</button>
        <button role="tab" data-t="settings">Settings</button>
        <button role="tab" data-t="diff">Easy / Hard</button>
        <button role="tab" data-t="data">Save &amp; share</button>
      </div>
      <div class="body" id="adm-body"></div>`;
    this.adminTab = 'demo';
    a.querySelector('#adm-close').onclick = () => this.toggleAdmin(false);
    a.querySelector('.tabs').addEventListener('click', e => {
      const t = e.target.dataset.t; if (!t) return; this.adminTab = t;
      for (const b of a.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', b.dataset.t === t);
      this._refreshAdmin();
    });
  }
  _refreshAdmin() {
    if (this.playerMode || !this.adminOpen) return;
    const body = document.getElementById('adm-body'); body.innerHTML = '';
    const tab = this.adminTab;
    if (tab === 'demo') {
      body.insertAdjacentHTML('beforeend', `<h3>Live</h3><dl class="live" id="adm-live"></dl><h3>Room</h3>`);
      const act = (list) => { const d = document.createElement('div'); d.className = 'actions'; for (const x of list) { const b = document.createElement('button'); b.textContent = x.label; b.onclick = () => { this.unlockAudio(); x.fn(); this._refreshAdmin(); this.redrawAll(); }; d.appendChild(b); } body.appendChild(d); };
      act([
        { label: 'Tap card', fn: () => this.tapCard() },
        { label: 'Start Easy', fn: () => { if (this.state === 'idle') this.tapCard(); this.chooseDifficulty('easy'); } },
        { label: 'Start Hard', fn: () => { if (this.state === 'idle') this.tapCard(); this.chooseDifficulty('hard'); } },
        { label: this.paused ? 'Resume' : 'Pause', fn: () => { this.paused = !this.paused; this.game.onPause && this.game.onPause(this.paused); } },
        { label: '+30 s', fn: () => this.addTime(30) },
        { label: 'End game now', fn: () => { if (this.state === 'inroom') { this.clock.left = 0; this.clock.running = false; this.game.onTimeUp(); } } },
        { label: 'Reset room', fn: () => this.resetRoom() },
      ]);
      const ga = this.game.adminActions ? this.game.adminActions() : [];
      if (ga.length) { body.insertAdjacentHTML('beforeend', `<h3>${this.o.title}</h3>`); act(ga); }
      body.insertAdjacentHTML('beforeend', `<p class="note">Shortcuts: Esc closes admin. Player link: <a href="?mode=player" target="_blank">open player mode</a> (no admin button).</p>`);
      this._renderLive();
    } else if (tab === 'settings') {
      body.insertAdjacentHTML('beforeend', `<p class="note">Applies to both difficulties. Changes save in this browser straight away and apply from the next game (some apply live).</p>`);
      let group = null;
      for (const f of this.o.schema.filter(f => !f.preset)) {
        if (f.group !== group) { group = f.group; if (group) body.insertAdjacentHTML('beforeend', `<h3>${group}</h3>`); }
        body.appendChild(this._field(f, this.baseValue(f.key), v => { this.store.base[f.key] = v; this._saveSettings(); }, f.key in this.store.base));
      }
    } else if (tab === 'diff') {
      body.insertAdjacentHTML('beforeend', `<p class="note">Each difficulty is a preset of these settings. Players pick on the outside screen.</p>`);
      const cols = document.createElement('div'); cols.className = 'presetcols';
      for (const d of ['easy', 'hard']) {
        const col = document.createElement('div');
        col.innerHTML = `<h4 style="color:${d === 'easy' ? 'var(--good)' : 'var(--bad)'}">${d.toUpperCase()}</h4>`;
        for (const f of this.o.schema.filter(f => f.preset))
          col.appendChild(this._field(f, this.presetValue(d, f.key), v => { this.store.presets[d][f.key] = v; this._saveSettings(); }, f.key in this.store.presets[d]));
        cols.appendChild(col);
      }
      body.appendChild(cols);
    } else if (tab === 'data') {
      const json = JSON.stringify(this.store, null, 2);
      body.insertAdjacentHTML('beforeend', `
        <p class="note">Your tweaks live in this browser. To make everyone (including player mode on other devices) use them, download <b>settings.json</b> and commit it into <code>games/${this.o.id}/</code> in the repo.</p>
        <div class="actions"><button id="adm-dl">Download settings.json</button><button id="adm-copy">Copy JSON</button><button id="adm-reset">Reset to defaults</button></div>
        <textarea class="json" id="adm-json" spellcheck="false">${json}</textarea>
        <div class="actions"><button id="adm-load">Load JSON from box</button></div>`);
      body.querySelector('#adm-dl').onclick = () => {
        const blob = new Blob([JSON.stringify(this.store, null, 2)], { type: 'application/json' });
        const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = 'settings.json'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
      };
      body.querySelector('#adm-copy').onclick = (e) => { try { navigator.clipboard.writeText(JSON.stringify(this.store, null, 2)).then(() => { e.target.textContent = 'Copied'; }, () => { e.target.textContent = 'Copy blocked: select the box'; }); } catch { } };
      body.querySelector('#adm-reset').onclick = (e) => {
        if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'Click again to reset'; return; }
        this.store = { base: {}, presets: { easy: {}, hard: {} } }; this._saveSettings(); this._refreshAdmin();
      };
      body.querySelector('#adm-load').onclick = () => {
        try { const s = JSON.parse(body.querySelector('#adm-json').value); this.store = { base: {}, presets: { easy: {}, hard: {} } }; this._mergeStore(s); this._saveSettings(); this._refreshAdmin(); }
        catch (e) { body.querySelector('#adm-json').value = 'That JSON did not parse: ' + e.message + '\n\n' + body.querySelector('#adm-json').value; }
      };
    }
  }
  _renderLive() {
    const el = document.getElementById('adm-live'); if (!el) return;
    const rows = [['State', this.state + (this.paused ? ' (paused)' : '')], ['Team', this.team || '—'], ['Difficulty', this.state === 'inroom' ? this.difficulty : '—'],
      ['Clock', this.clock.running ? fmtTime(this.clock.left) : '—'], ['Queue', this.queue.join(', ') || '—'],
      ...(this.game.adminInfo ? this.game.adminInfo() : [])];
    el.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }
  _field(f, value, onChange, changed) {
    const row = document.createElement('div'); row.className = 'fld' + (changed ? ' changed' : '');
    const id = 'f-' + Math.random().toString(36).slice(2, 8);
    const lab = `<label for="${id}">${f.label}</label>`;
    if (f.type === 'number') {
      row.innerHTML = `${lab}<span><input id="${id}" type="number" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 1}" value="${value}"><span class="unit">${f.unit || ''}</span></span>`;
      row.querySelector('input').onchange = e => { let v = parseFloat(e.target.value); if (isNaN(v)) v = f.default; if (f.min != null) v = Math.max(f.min, v); if (f.max != null) v = Math.min(f.max, v); e.target.value = v; onChange(v); row.classList.add('changed'); };
    } else if (f.type === 'bool') {
      row.innerHTML = `${lab}<input id="${id}" type="checkbox" ${value ? 'checked' : ''}>`;
      row.querySelector('input').onchange = e => { onChange(e.target.checked); row.classList.add('changed'); };
    } else if (f.type === 'select') {
      row.innerHTML = `${lab}<select id="${id}">${f.options.map(o => `<option value="${o.value}" ${o.value === value ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`;
      row.querySelector('select').onchange = e => { onChange(e.target.value); row.classList.add('changed'); };
    } else if (f.type === 'multi') {
      row.innerHTML = `<label>${f.label}</label><span></span><div class="multi">${f.options.map(o => `<label><input type="checkbox" value="${o.value}" ${(value || []).includes(o.value) ? 'checked' : ''}>${o.label}</label>`).join('')}</div>`;
      row.querySelectorAll('.multi input').forEach(cb => cb.onchange = () => { onChange([...row.querySelectorAll('.multi input:checked')].map(x => x.value)); row.classList.add('changed'); });
    } else if (f.type === 'text') {
      row.innerHTML = `${lab}<input id="${id}" type="text" value="${value ?? ''}">`;
      row.querySelector('input').onchange = e => { onChange(e.target.value); row.classList.add('changed'); };
    }
    if (f.help) row.insertAdjacentHTML('beforeend', `<div class="help">${f.help}</div>`);
    return row;
  }
}

export { THREE, C, DISPLAY, MONO, rr, fit, wrap, clear, fmtTime, fmtNum, Surface };
