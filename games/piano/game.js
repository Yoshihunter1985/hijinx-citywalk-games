// PIANO — music quiz room (R4). Four oversized prop instruments, each with one big button.
// Players pick a genre by pressing an instrument, then hear 20 s snippets and press the
// instrument whose answer is right. Faster = more points. Wrong answer = no points, move on.
// Hard mode plays every song through a different distortion.
import { GameShell, THREE, C, DISPLAY, MONO, rr, fit, wrap, clear, fmtNum, Surface } from '../../core/shell.js';
import { GENRES, songsFor, SONGS } from './songs.js';
import { renderSong, renderLength, processBuffer, play, EFFECTS, describeStyle } from './music.js';

// Instrument colours avoid green/red so right/wrong feedback stays readable.
const INSTR = [
  { id: 'piano',  label: 'Piano',  color: '#ffb547', key: '1', genre: 'mixed' },
  { id: 'drum',   label: 'Drum',   color: '#ff5fa2', key: '2', genre: '80s' },
  { id: 'guitar', label: 'Guitar', color: '#3fd0e0', key: '3', genre: '90s' },
  { id: 'sax',    label: 'Sax',    color: '#9d8bff', key: '4', genre: '2000s' },
];
const genreLabel = (g) => GENRES.find(x => x.id === g)?.label || g;
const effectLabel = (e) => EFFECTS.find(x => x.id === e)?.label || '';

// ---------- settings (admin) ----------
const SCHEMA = [
  { key: 'gameLength', label: 'Game length', type: 'number', min: 30, max: 600, step: 10, unit: 's', default: 180, group: 'Game' },
  { key: 'snippetLength', label: 'Song snippet length', type: 'number', min: 5, max: 30, step: 1, unit: 's', default: 20, group: 'Game' },
  { key: 'countdown', label: 'Pause before each song', type: 'number', min: 0, max: 5, step: 0.5, unit: 's', default: 2, group: 'Game' },
  { key: 'revealTime', label: 'Show answer for', type: 'number', min: 1, max: 6, step: 0.5, unit: 's', default: 2.5, group: 'Game' },
  { key: 'resultHold', label: 'Final score shown outside for', type: 'number', min: 3, max: 30, step: 1, unit: 's', default: 8, group: 'Game' },
  { key: 'maxPoints', label: 'Points for an instant answer', type: 'number', min: 100, max: 5000, step: 50, default: 1000, group: 'Scoring' },
  { key: 'minPoints', label: 'Points for a last-second answer', type: 'number', min: 0, max: 5000, step: 10, default: 100, group: 'Scoring', help: 'Points slide from the top figure down to this one over the snippet.' },
  { key: 'wrongPenalty', label: 'Points lost for a wrong answer', type: 'number', min: 0, max: 1000, step: 10, default: 0, group: 'Scoring' },
  { key: 'showEffectName', label: 'Show the distortion name on screen', type: 'bool', default: true, group: 'Screens' },
  { key: 'demoHighlight', label: 'Demo: outline the right answer', type: 'bool', default: false, group: 'Screens', help: 'For walkthroughs and screen recordings. Players never see this in the real room.' },
  { key: 'volume', label: 'Music volume', type: 'number', min: 0, max: 1, step: 0.05, default: 0.8, group: 'Sound' },
  // per-difficulty
  { key: 'distortion', label: 'Distort the songs', type: 'bool', default: false, preset: true },
  { key: 'effects', label: 'Distortions to use (varied each song)', type: 'multi', options: EFFECTS.map(e => ({ value: e.id, label: e.label })), default: EFFECTS.map(e => e.id), preset: true },
  { key: 'effectStrength', label: 'Distortion strength (0–1)', type: 'number', min: 0, max: 1, step: 0.05, default: 0.7, preset: true },
];
const PRESETS = {
  easy: { distortion: false, effectStrength: 0.5 },
  hard: { distortion: true, effectStrength: 0.7 },
};

class PianoGame {
  constructor() { this.phase = 'off'; this.buffers = new Map(); this.flashes = {}; }

  // ---------- room build ----------
  setup(shell) {
    this.shell = shell; const room = this.room = shell.room, { w, d } = room.spec;
    shell.setInputs(INSTR.map(i => ({ id: i.id, label: i.label, color: i.color, key: i.key })));
    shell.setLegend(INSTR.map(i => [i.color, i.label]));

    this.main = new Surface(room.addScreen({ wall: 'back', u: w / 2, v: 1.62, width: 2.0, height: 1.125, px: [1280, 720], label: 'QUESTION SCREEN' }));
    shell.addPanel(this.main, 'Question screen', 'back wall · about 90"');

    this.instr = {};
    const add = (id, grp, btn) => { room.scene.add(grp); room.clickable(grp, id, `Press the ${INSTR.find(i => i.id === id).label} button`); this.instr[id] = { body: grp, ...btn }; };
    const col = (id) => new THREE.Color(INSTR.find(i => i.id === id).color);

    // PIANO — oversized upright on the floor, against the left wall, back half
    {
      const c = col('piano'), g = new THREE.Group();
      const body = room.wireMesh(new THREE.BoxGeometry(1.6, 1.3, 0.55), c); body.position.set(0, 0.65, 0); g.add(body);
      const shelf = room.wireMesh(new THREE.BoxGeometry(1.6, 0.12, 0.42), c); shelf.position.set(0, 0.78, 0.48); g.add(shelf);
      const pts = []; for (let i = 0; i <= 14; i++) { const x = -0.8 + i * 1.6 / 14; pts.push(x, 0.842, 0.27, x, 0.842, 0.69); }
      g.add(segs(pts, c));
      [0, 1, 3, 4, 5, 7, 8, 10, 11, 12].forEach(i => { const k = room.wireMesh(new THREE.BoxGeometry(0.06, 0.04, 0.24), c, { fillOpacity: 0.5 }); k.position.set(-0.8 + (i + 1) * 1.6 / 14, 0.86, 0.36); g.add(k); });
      const btn = makeButton(c); btn.grp.position.set(0, 1.08, 0.285); g.add(btn.grp);
      g.position.set(-w / 2 + 0.29, 0, -1.15); g.rotation.y = Math.PI / 2;
      add('piano', g, btn);
      room.label('PIANO', new THREE.Vector3(-w / 2 + 0.4, 1.55, -1.15), { color: INSTR[0].color, size: 0.12 });
    }
    // DRUM — big floor drum, back-right, with a cymbal
    {
      const c = col('drum'), g = new THREE.Group();
      const shellM = room.wireMesh(new THREE.CylinderGeometry(0.44, 0.44, 0.6, 28, 1, true), c); shellM.position.y = 0.3; g.add(shellM);
      const head = room.wireMesh(new THREE.CircleGeometry(0.44, 28), c, { fillOpacity: 0.12 }); head.rotation.x = -Math.PI / 2; head.position.y = 0.6; g.add(head);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.018, 6, 40), new THREE.MeshBasicMaterial({ color: c })); hoop.rotation.x = Math.PI / 2; hoop.position.y = 0.6; g.add(hoop);
      const stand = segs([0.62, 0, 0.1, 0.62, 1.05, 0.1], c); g.add(stand);
      const cym = room.wireMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.01, 24), c); cym.position.set(0.62, 1.05, 0.1); cym.rotation.z = 0.2; g.add(cym);
      const btn = makeButton(c); btn.grp.rotation.x = -Math.PI / 2; btn.grp.position.set(0, 0.62, 0); g.add(btn.grp);
      g.position.set(w / 2 - 0.95, 0, -1.45);
      add('drum', g, btn);
      room.label('DRUM', new THREE.Vector3(w / 2 - 0.95, 1.0, -1.45), { color: INSTR[1].color, size: 0.12 });
    }
    // GUITAR — mounted on the left wall, nearer the door
    {
      const c = col('guitar'), g = new THREE.Group();
      const lower = room.wireMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 28), c); lower.rotation.x = Math.PI / 2; lower.position.set(0, -0.28, 0.05); g.add(lower);
      const upper = room.wireMesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 24), c); upper.rotation.x = Math.PI / 2; upper.position.set(0, 0.16, 0.05); g.add(upper);
      const neck = room.wireMesh(new THREE.BoxGeometry(0.11, 0.95, 0.05), c); neck.position.set(0, 0.85, 0.05); g.add(neck);
      const headst = room.wireMesh(new THREE.BoxGeometry(0.18, 0.24, 0.05), c); headst.position.set(0, 1.44, 0.05); g.add(headst);
      const pts = []; for (let i = -1.5; i <= 1.5; i++) pts.push(i * 0.025, -0.05, 0.11, i * 0.025, 1.32, 0.11); g.add(segs(pts, c));
      const btn = makeButton(c); btn.grp.position.set(0, -0.3, 0.11); g.add(btn.grp);
      g.rotation.z = -0.38; g.scale.setScalar(0.95);
      const holder = new THREE.Group(); holder.add(g);
      const pose = room.wallPose('left', 1.25, 1.32, 0.02); holder.position.copy(pose.pos); holder.rotation.y = pose.rotY;
      add('guitar', holder, btn);
      room.label('GUITAR', new THREE.Vector3(-w / 2 + 0.3, 2.3, d / 2 - 1.25), { color: INSTR[2].color, size: 0.12 });
    }
    // SAX — mounted on the right wall
    {
      const c = col('sax'), g = new THREE.Group();
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.22, 0.78, 0.1), new THREE.Vector3(-0.02, 0.66, 0.1), new THREE.Vector3(0.04, 0.3, 0.1),
        new THREE.Vector3(0.05, -0.3, 0.1), new THREE.Vector3(0.12, -0.58, 0.1), new THREE.Vector3(0.3, -0.6, 0.1), new THREE.Vector3(0.4, -0.38, 0.1)]);
      g.add(room.wireMesh(new THREE.TubeGeometry(curve, 40, 0.075, 8, false), c, { threshold: 40 }));
      const bell = room.wireMesh(new THREE.CylinderGeometry(0.22, 0.08, 0.32, 20, 1, true), c); bell.position.set(0.42, -0.2, 0.1); g.add(bell);
      for (let i = 0; i < 5; i++) { const k = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 12), new THREE.MeshBasicMaterial({ color: c })); k.position.set(0.12, 0.42 - i * 0.14, 0.17); g.add(k); }
      const btn = makeButton(c); btn.grp.position.set(0.05, -0.05, 0.19); g.add(btn.grp);
      g.scale.setScalar(1.15);
      const holder = new THREE.Group(); holder.add(g);
      const pose = room.wallPose('right', 3.35, 1.35, 0.02); holder.position.copy(pose.pos); holder.rotation.y = pose.rotY;
      add('sax', holder, btn);
      room.label('SAX', new THREE.Vector3(w / 2 - 0.3, 2.35, -d / 2 + 3.35), { color: INSTR[3].color, size: 0.12 });
    }

    room.onFrame((dt, t) => this._animateButtons(dt, t));
  }

  _animateButtons(dt, t) {
    for (const ins of INSTR) {
      const b = this.instr[ins.id]; if (!b) continue;
      const lit = this.shell.lit.has(ins.id);
      const fl = this.flashes[ins.id] || 0; if (fl > 0) this.flashes[ins.id] = fl - dt;
      let k = lit ? 0.7 + 0.3 * Math.sin(t * 6) : 0.22;
      b.mat.color.copy(b.base).multiplyScalar(k);
      if (fl > 0) b.mat.color.setRGB(1, 1, 1);
      b.ringMat.opacity = lit ? 0.5 + 0.5 * Math.sin(t * 6) : 0.15;
      b.grp.scale.setScalar(fl > 0 ? 0.86 : 1);
      // highlight the whole instrument for the correct answer during reveal
      const glow = this.phase === 'reveal' && !!this.round && INSTR[this.round.correctIx].id === ins.id;
      if (b.glow !== glow) { b.glow = glow; b.body.traverse(o => { const f = o.userData.fillMat; if (f) { o.userData.fillBase ??= f.opacity; f.opacity = glow ? Math.max(0.3, o.userData.fillBase) : o.userData.fillBase; } }); }
    }
  }

  // ---------- flow ----------
  begin(run) {
    this.run = run; this.score = 0; this.correct = 0; this.rounds = 0; this.streak = 0; this.bestStreak = 0;
    this.genre = null; this.round = null; this.phase = 'genre';
    this.shell.setLit(INSTR.map(i => i.id));
    this.ac = this.shell.unlockAudio();
    // While the team picks a genre, get a first song ready for each genre (one at a time)
    // so the first song starts without a wait whichever they choose.
    this.genreFirst = {}; let chain = Promise.resolve();
    for (const ins of INSTR) {
      const pool = songsFor(ins.genre), song = pool[Math.floor(Math.random() * pool.length)];
      chain = chain.then(() => { if (this.phase !== 'genre') return; const p = this._prepare(song); this.genreFirst[ins.genre] = p; return p.promise; });
    }
  }
  press(id) {
    const ix = INSTR.findIndex(i => i.id === id); if (ix < 0) return;
    this.flashes[id] = 0.22;
    if (this.phase === 'genre') {
      this.genre = INSTR[ix].genre;
      this.shell.beep(660, 0.08); setTimeout(() => this.shell.beep(990, 0.12), 90);
      this._buildDeck();
      this.shell.startClock(this.run.settings.gameLength);
      this.nextRound();
    } else if (this.phase === 'play') this._resolve(ix);
  }
  _buildDeck() {
    const pool = songsFor(this.genre).slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.deck = pool; this.lastEffect = null;
    const ready = this.genreFirst && this.genreFirst[this.genre];
    if (ready) { this.deck = pool.filter(x => x.id !== ready.song.id); this.prepared = ready; this.lastEffect = ready.effect; }
    else this.prepared = this._prepare(this._drawSong());
  }
  _drawSong() { if (!this.deck.length) this._buildDeckOnly(); return this.deck.pop(); }
  _buildDeckOnly() { this.deck = songsFor(this.genre).slice().sort(() => Math.random() - 0.5); }

  _pickEffect() {
    const s = this.shell.settings;
    if (!s.distortion || !s.effects.length) return null;
    const opts = s.effects.length > 1 ? s.effects.filter(e => e !== this.lastEffect) : s.effects;
    const e = opts[Math.floor(Math.random() * opts.length)]; this.lastEffect = e; return e;
  }
  _prepare(song) {
    const s = this.shell.settings, effect = this._pickEffect(), strength = s.effectStrength, snip = s.snippetLength;
    const p = { song, effect, strength, ready: false, buf: null };
    p.promise = (async () => {
      let raw;
      if (song.file) {
        try { const r = await fetch(song.file); raw = await this.ac.decodeAudioData(await r.arrayBuffer()); } catch { raw = null; }
      }
      if (!raw) {
        const len = Math.ceil(renderLength(effect, strength, snip) * 10) / 10, key = song.id + '|' + len;
        if (!this.buffers.has(key)) this.buffers.set(key, renderSong(song, len));
        raw = await this.buffers.get(key);
      }
      p.buf = processBuffer(this.ac, raw, effect, strength); p.ready = true;
    })();
    return p;
  }
  nextRound() {
    if (!this.shell.clock.running) return;
    const p = this.prepared;
    const song = p.song, pool = (this.genre === 'mixed' ? SONGS : songsFor(this.genre)).filter(x => x.id !== song.id);
    const wrong = pool.sort(() => Math.random() - 0.5).slice(0, 3);
    const answers = [song, ...wrong].sort(() => Math.random() - 0.5);
    this.rounds++;
    this.round = { n: this.rounds, song, answers, correctIx: answers.indexOf(song), effect: p.effect, prep: p, choice: null, points: 0 };
    this.phase = 'countdown'; this.timer = this.shell.settings.countdown;
    this.shell.setLit([]);
    this.prepared = this._prepare(this._drawSong()); // look ahead while this one plays
  }
  _startPlay() {
    const r = this.round, s = this.shell.settings;
    this.handle = play(this.ac, this.shell.master, r.prep.buf, r.effect, r.prep.strength, s.volume);
    this.phase = 'play'; this.elapsed = 0;
    this.shell.setLit(INSTR.map(i => i.id));
  }
  _resolve(choice) {
    const r = this.round, s = this.shell.settings;
    if (this.handle) { this.handle.stop(); this.handle = null; }
    r.choice = choice;
    if (choice === 'timeout') { r.result = 'timeout'; this.streak = 0; this.shell.beep(220, 0.3, 'sawtooth', 0.08); }
    else if (choice === r.correctIx) {
      const frac = Math.min(1, this.elapsed / s.snippetLength);
      r.points = Math.round((s.maxPoints - (s.maxPoints - s.minPoints) * frac) / 10) * 10;
      this.score += r.points; this.correct++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
      r.result = 'correct';
      [784, 988, 1319].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.12, 'square', 0.1), i * 80));
    } else {
      r.result = 'wrong'; r.points = -s.wrongPenalty; this.score = Math.max(0, this.score - s.wrongPenalty); this.streak = 0;
      this.shell.beep(140, 0.45, 'sawtooth', 0.12);
    }
    this.phase = 'reveal'; this.timer = s.revealTime;
    this.shell.setLit([]);
  }
  tick(dt) {
    if (this.phase === 'countdown') {
      this.timer -= dt;
      if (this.timer <= 0 && this.round.prep.ready) this._startPlay();
    } else if (this.phase === 'play') {
      this.elapsed += dt;
      if (this.elapsed >= this.shell.settings.snippetLength) this._resolve('timeout');
    } else if (this.phase === 'reveal') {
      this.timer -= dt;
      if (this.timer <= 0) this.nextRound();
    }
  }
  onTimeUp() {
    if (this.handle) { this.handle.stop(); this.handle = null; }
    this.phase = 'over';
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.18, 'square', 0.1), i * 120));
    this.shell.finish({ score: this.score, line: `${this.correct} of ${this.rounds} songs · ${genreLabel(this.genre || 'mixed')} · best streak ${this.bestStreak}` });
  }
  onPause(p) { if (!this.ac) return; p ? this.ac.suspend() : this.ac.resume(); }
  reset() {
    if (this.handle) { this.handle.stop(); this.handle = null; }
    this.phase = 'off'; this.round = null; this.score = 0;
  }
  scoreboard() {
    if (this.phase === 'off') return { score: 0 };
    return {
      score: this.score,
      sub: this.round ? `SONG ${this.round.n}` : 'PICK A GENRE',
      footer: this.genre ? `${genreLabel(this.genre)} · ${this.correct} correct · streak ${this.streak}` : '',
    };
  }
  adminInfo() {
    const r = this.round;
    return [
      ['Phase', this.phase], ['Genre', this.genre ? genreLabel(this.genre) : '—'],
      ['Now playing', r ? `${r.song.title} — ${r.song.artist}` : '—'],
      ['Style', r ? describeStyle(r.song) : '—'],
      ['Distortion', r && r.effect ? `${effectLabel(r.effect)} (${r.prep.strength})` : 'none'],
      ['Score', fmtNum(this.score || 0)],
    ];
  }
  adminActions() {
    const acts = [
      { label: 'Skip song', fn: () => { if (this.phase === 'play') this._resolve('timeout'); else if (this.phase === 'reveal') this.nextRound(); } },
      { label: 'Answer correctly (demo)', fn: () => { if (this.phase === 'play') this.press(INSTR[this.round.correctIx].id); } },
    ];
    for (const e of EFFECTS) acts.push({ label: `Hear: ${e.label}`, fn: () => this._preview(e.id) });
    acts.push({ label: 'Hear: no distortion', fn: () => this._preview(null) });
    return acts;
  }
  async _preview(effect) {
    const ac = this.ac = this.shell.unlockAudio(); if (this.phase === 'play') return;
    if (this._pv) this._pv.stop();
    const song = SONGS[Math.floor(Math.random() * SONGS.length)], s = this.shell.settings;
    const strength = s.effectStrength, len = renderLength(effect, strength, 6);
    const buf = processBuffer(ac, await renderSong(song, len), effect, strength);
    this._pv = play(ac, this.shell.master, buf, effect, strength, s.volume);
  }

  // ---------- question screen ----------
  draw() {
    const S = this.main, ctx = S.begin(), W = 1280, H = 720, s = this.shell.settings, ph = this.phase;
    clear(ctx);
    if (ph === 'off' || this.shell.state !== 'inroom' && ph !== 'over') {
      fit(ctx, 'NAME THAT TUNE', W / 2, 250, W - 120, 120, { color: C.fg, align: 'center' });
      fit(ctx, 'Hit the right instrument. Faster answers score more.', W / 2, 320, W - 160, 34, { color: C.muted, align: 'center', weight: 500 });
      INSTR.forEach((ins, i) => drawIcon(ctx, ins.id, 250 + i * 260, 470, 90, ins.color));
      fit(ctx, this.shell.state === 'result' ? 'THANKS FOR PLAYING' : 'TAP YOUR CARD OUTSIDE TO START', W / 2, 650, W - 120, 36, { color: C.accent, align: 'center' });
      return S.commit();
    }
    if (ph === 'genre') {
      fit(ctx, 'PICK YOUR GENRE', W / 2, 110, W - 120, 84, { color: C.fg, align: 'center' });
      fit(ctx, 'Press an instrument button', W / 2, 160, W - 120, 30, { color: C.muted, align: 'center', weight: 500 });
      this._tiles(ctx, (ins, x, y, tw, th) => {
        fit(ctx, genreLabel(ins.genre), x + 190, y + th / 2 + 34, tw - 220, 92, { color: C.fg });
      });
      return S.commit();
    }
    if (ph === 'over') {
      fit(ctx, "TIME'S UP!", W / 2, 230, W - 120, 130, { color: C.accent, align: 'center' });
      fit(ctx, fmtNum(this.score), W / 2, 430, W - 120, 200, { color: C.fg, align: 'center' });
      fit(ctx, `${this.correct} of ${this.rounds} songs · best streak ${this.bestStreak}`, W / 2, 520, W - 120, 40, { color: C.muted, align: 'center', weight: 500 });
      return S.commit();
    }
    const r = this.round; if (!r) return S.commit();
    // header
    fit(ctx, `SONG ${r.n}`, 40, 70, 300, 56, { color: C.fg });
    fit(ctx, genreLabel(this.genre), 40, 110, 400, 28, { color: C.muted, weight: 500 });
    if (r.effect && s.showEffectName) {
      const label = 'DISTORTION: ' + effectLabel(r.effect).toUpperCase();
      ctx.font = `700 28px ${DISPLAY}`; const lw = ctx.measureText(label).width + 36;
      rr(ctx, W / 2 - lw / 2, 40, lw, 48, 24); ctx.fillStyle = 'rgba(255,107,98,0.16)'; ctx.fill(); ctx.strokeStyle = C.bad; ctx.lineWidth = 2; ctx.stroke();
      fit(ctx, label, W / 2, 74, lw, 28, { color: C.bad, align: 'center' });
    }

    if (ph === 'countdown') {
      const n = Math.max(1, Math.ceil(this.timer));
      fit(ctx, r.prep.ready || this.timer > 0 ? String(n) : '…', W / 2, 470, 400, 300, { color: C.accent, align: 'center' });
      fit(ctx, 'GET READY', W / 2, 560, W, 40, { color: C.muted, align: 'center', weight: 500 });
      return S.commit();
    }
    // points available + snippet bar
    const frac = ph === 'play' ? Math.min(1, this.elapsed / s.snippetLength) : 1;
    const avail = Math.round((s.maxPoints - (s.maxPoints - s.minPoints) * frac) / 10) * 10;
    if (ph === 'play') {
      fit(ctx, '+' + fmtNum(avail), W - 40, 74, 300, 56, { color: C.accent, align: 'right' });
      fit(ctx, 'POINTS UP FOR GRABS', W - 40, 110, 300, 22, { color: C.muted, align: 'right', weight: 500 });
      rr(ctx, 40, 140, W - 80, 14, 7); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
      rr(ctx, 40, 140, Math.max(14, (W - 80) * (1 - frac)), 14, 7); ctx.fillStyle = C.accent; ctx.fill();
      // little equaliser
      const t = performance.now() / 1000;
      for (let i = 0; i < 24; i++) {
        const hgt = 12 + 34 * Math.abs(Math.sin(t * (3 + i % 5) + i * 1.7));
        ctx.fillStyle = 'rgba(111,168,220,0.55)'; ctx.fillRect(W / 2 - 24 * 9 + i * 18, 214 - hgt, 10, hgt);
      }
      fit(ctx, "WHAT'S THIS SONG?", W / 2, 250, W, 30, { color: C.fg, align: 'center' });
    }
    this._tiles(ctx, (ins, x, y, tw, th, i) => {
      const song = r.answers[i];
      fit(ctx, song.title, x + 190, y + th / 2 + 4, tw - 215, 52, { color: C.fg });
      fit(ctx, song.artist, x + 190, y + th / 2 + 44, tw - 215, 28, { color: C.muted, weight: 500, family: MONO });
    }, { top: 280, state: (i) => {
      if (ph === 'reveal') return i === r.correctIx ? 'correct' : (i === r.choice ? 'wrong' : 'dim');
      if (s.demoHighlight && i === r.correctIx) return 'demo';
      return '';
    } });
    if (ph === 'reveal') {
      const msg = r.result === 'correct' ? `CORRECT! +${fmtNum(r.points)}` : r.result === 'wrong' ? 'WRONG ANSWER' : "TIME'S UP ON THAT ONE";
      const col = r.result === 'correct' ? C.good : C.bad;
      rr(ctx, 40, 168, W - 80, 100, 18); ctx.fillStyle = 'rgba(6,11,20,0.94)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
      fit(ctx, msg, W / 2, 238, W - 140, 64, { color: col, align: 'center' });
    }
    S.commit();
  }
  // 2 x 2 grid of instrument tiles
  _tiles(ctx, body, { top = 200, state = () => '' } = {}) {
    const W = 1280, gap = 24, tw = (W - 80 - gap) / 2, th = (720 - top - 40 - gap) / 2;
    INSTR.forEach((ins, i) => {
      const x = 40 + (i % 2) * (tw + gap), y = top + Math.floor(i / 2) * (th + gap), st = state(i);
      ctx.globalAlpha = st === 'dim' ? 0.3 : 1;
      rr(ctx, x, y, tw, th, 18);
      ctx.fillStyle = st === 'correct' ? 'rgba(95,211,141,0.18)' : st === 'wrong' ? 'rgba(255,107,98,0.18)' : ins.color + '14'; ctx.fill();
      ctx.lineWidth = st ? 6 : 3; ctx.strokeStyle = st === 'correct' ? C.good : st === 'wrong' ? C.bad : ins.color;
      if (st === 'demo') { ctx.setLineDash([14, 10]); ctx.strokeStyle = '#ffffff'; }
      ctx.stroke(); ctx.setLineDash([]);
      drawIcon(ctx, ins.id, x + 92, y + th / 2 - 8, Math.min(88, th * 0.55), ins.color);
      fit(ctx, ins.label.toUpperCase(), x + 92, y + th - 16, 150, 22, { color: ins.color, align: 'center', weight: 600 });
      body(ins, x, y, tw, th, i);
      if (st === 'correct' || st === 'wrong') fit(ctx, st === 'correct' ? '✓' : '✗', x + tw - 26, y + 52, 60, 52, { color: st === 'correct' ? C.good : C.bad, align: 'right' });
      ctx.globalAlpha = 1;
    });
  }
}

// ---------- helpers ----------
function makeButton(color) {
  const grp = new THREE.Group();
  const base = new THREE.Color(color);
  const mat = new THREE.MeshBasicMaterial({ color: base.clone() });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 28), mat); cap.rotation.x = Math.PI / 2; grp.add(cap);
  const ringMat = new THREE.MeshBasicMaterial({ color: base.clone(), transparent: true, opacity: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 36), ringMat); grp.add(ring);
  return { grp, mat, ringMat, base };
}
function segs(arr, color) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
}

// Simple instrument glyphs for the screens.
function drawIcon(ctx, id, cx, cy, s, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(2, s * 0.05); ctx.lineJoin = 'round';
  const u = s / 2;
  if (id === 'piano') {
    rr(ctx, -u, -u * 0.55, 2 * u, 1.1 * u, 6); ctx.stroke();
    for (let i = 1; i < 7; i++) { const x = -u + i * 2 * u / 7; ctx.beginPath(); ctx.moveTo(x, -u * 0.55); ctx.lineTo(x, u * 0.55); ctx.stroke(); }
    [1, 2, 4, 5, 6].forEach(i => ctx.fillRect(-u + i * 2 * u / 7 - u * 0.09, -u * 0.55, u * 0.18, u * 0.6));
  } else if (id === 'drum') {
    ctx.beginPath(); ctx.ellipse(0, -u * 0.35, u * 0.85, u * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-u * 0.85, -u * 0.35); ctx.lineTo(-u * 0.85, u * 0.5); ctx.ellipse(0, u * 0.5, u * 0.85, u * 0.28, 0, Math.PI, 0, true); ctx.lineTo(u * 0.85, -u * 0.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-u * 0.9, -u * 1.0); ctx.lineTo(-u * 0.1, -u * 0.4); ctx.moveTo(u * 0.9, -u * 1.0); ctx.lineTo(u * 0.1, -u * 0.4); ctx.stroke();
  } else if (id === 'guitar') {
    ctx.rotate(0.5);
    ctx.beginPath(); ctx.arc(0, u * 0.45, u * 0.48, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -u * 0.1, u * 0.36, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, u * 0.25, u * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-u * 0.07, -u * 1.15, u * 0.14, u * 0.75);
  } else if (id === 'sax') {
    ctx.beginPath(); ctx.moveTo(-u * 0.5, -u * 1.0); ctx.lineTo(-u * 0.1, -u * 0.8); ctx.lineTo(-u * 0.05, u * 0.45);
    ctx.quadraticCurveTo(0, u * 0.95, u * 0.4, u * 0.75); ctx.lineTo(u * 0.55, u * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(u * 0.3, u * 0.2); ctx.lineTo(u * 0.8, u * 0.2); ctx.stroke();
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(u * 0.12, -u * 0.5 + i * u * 0.25, u * 0.06, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// ---------- boot ----------
const shell = new GameShell({
  id: 'piano', title: 'Piano', roomId: 'R4',
  schema: SCHEMA, presets: PRESETS,
  instructions: [
    'Pick a genre by pressing an instrument button.',
    'Listen to each song and press the instrument showing the right title.',
    'Faster answers score more. A wrong answer scores nothing.',
    'You have 3 minutes. Work as a team!',
  ],
  blurbs: { easy: 'Songs play clean. Just name that tune.', hard: 'Every song is warped: sped up, underwater, backwards and more.' },
  footnote: 'All songs are generated placeholders with made-up titles. Real clips can be dropped in later (see README).',
  game: new PianoGame(),
});
shell.start();
window.__shell = shell; // handy for debugging in the browser console
