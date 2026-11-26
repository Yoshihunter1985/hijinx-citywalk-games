// CLAW QUIZ (R9) — a question and its answers show on the console screen; the answer is somewhere
// in the collage on the two 85" side-wall screens. Players pick a theme first. Each theme has one
// fixed collage (its "question pack"), so teams can learn it and get faster.
// Every N correct answers earns a claw machine credit (the claw itself isn't simulated).
import { GameShell, THREE, C, DISPLAY, MONO, rr, fit, wrap, clear, fmtNum, Surface } from '../../core/shell.js';
import { THEMES, THEME_IDS, item } from './themes.js';
import { makePack, TYPES } from './questions.js';

const BTN = [
  { id: 'a', letter: 'A', color: '#ffb547', key: '1' },
  { id: 'b', letter: 'B', color: '#ff5fa2', key: '2' },
  { id: 'c', letter: 'C', color: '#3fd0e0', key: '3' },
  { id: 'd', letter: 'D', color: '#9d8bff', key: '4' },
];
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const SCHEMA = [
  { key: 'gameLength', label: 'Time limit', type: 'number', min: 30, max: 600, step: 10, unit: 's', default: 180, group: 'Game' },
  { key: 'revealTime', label: 'Show answer for', type: 'number', min: 1, max: 6, step: 0.5, unit: 's', default: 2.5, group: 'Game' },
  { key: 'resultHold', label: 'Final score shown outside for', type: 'number', min: 3, max: 30, step: 1, unit: 's', default: 8, group: 'Game' },
  { key: 'themes', label: 'Themes offered (first 4 ticked are used)', type: 'multi', options: THEME_IDS.map(t => ({ value: t, label: THEMES[t].label })), default: ['sport', 'emoji', 'teddies', 'space'], group: 'Game' },
  { key: 'creditEvery', label: 'Correct answers per claw credit', type: 'number', min: 1, max: 20, step: 1, default: 4, group: 'Claw credits' },
  { key: 'creditPopup', label: '"Credit earned" pop-up shows for', type: 'number', min: 1, max: 6, step: 0.5, unit: 's', default: 2.5, group: 'Claw credits' },
  { key: 'pointsCorrect', label: 'Points per correct answer', type: 'number', min: 0, max: 1000, step: 10, default: 100, group: 'Scoring' },
  { key: 'speedBonus', label: 'Speed bonus (instant answer)', type: 'number', min: 0, max: 1000, step: 10, default: 100, group: 'Scoring', help: 'Slides to zero as the question timer runs out.' },
  { key: 'demoHighlight', label: 'Demo: circle the answer on the screens', type: 'bool', default: false, group: 'Screens', help: 'For walkthroughs and recordings only.' },
  // per-difficulty
  { key: 'questionTime', label: 'Time per question', type: 'number', min: 5, max: 120, step: 1, unit: 's', default: 20, preset: true, group: 'Questions' },
  { key: 'packSize', label: 'Questions in each theme\'s pack', type: 'number', min: 3, max: 30, step: 1, default: 8, preset: true, group: 'Questions', help: 'The same questions every game (order shuffled). About 9 fit in 3 minutes at 20 s each.' },
  { key: 'types', label: 'Question types', type: 'multi', options: TYPES.map(t => ({ value: t.id, label: t.label })), default: ['count', 'not'], preset: true, group: 'Questions' },
  { key: 'countMin', label: 'Copies of each picture, min', type: 'number', min: 1, max: 30, step: 1, default: 2, preset: true, group: 'Questions' },
  { key: 'countMax', label: 'Copies of each picture, max', type: 'number', min: 1, max: 30, step: 1, default: 5, preset: true, group: 'Questions' },
  { key: 'pictures', label: 'Show pictures in questions and answers', type: 'bool', default: true, preset: true, group: 'Questions' },
  { key: 'collageSeed', label: 'Collage layout number', type: 'number', min: 1, max: 9999, step: 1, default: 1, preset: true, group: 'Collage', help: 'Each number is a different fixed layout for every theme. Change it to get a new collage; it stays until you change it again.' },
  { key: 'size', label: 'Picture size', type: 'number', min: 30, max: 220, step: 5, unit: 'px', default: 120, preset: true, group: 'Collage', help: 'On a 1280 px wide screen.' },
  { key: 'rotate', label: 'Tilt pictures at random', type: 'bool', default: false, preset: true, group: 'Collage' },
];
const PRESETS = {
  easy: { packSize: 8, questionTime: 20, types: ['count', 'not'], countMin: 2, countMax: 5, pictures: true, size: 120, rotate: false, collageSeed: 1 },
  hard: { packSize: 10, questionTime: 15, types: ['count', 'not', 'most'], countMin: 4, countMax: 9, pictures: false, size: 82, rotate: true, collageSeed: 1 },
};

class ClawQuizGame {
  constructor() { this.phase = 'off'; this.flashes = {}; }

  setup(shell) {
    this.shell = shell; const room = this.room = shell.room, { w, d } = room.spec;
    shell.setInputs(BTN.map(b => ({ id: b.id, label: b.letter, color: b.color, key: b.key })));
    shell.setLegend([['#6fa8dc', 'Collage screens (85"), left + right walls'], ['#ff5fa2', 'Claw machine'], ['#ffb547', 'Console: question screen + buttons']]);

    // ---- 85" collage screens (1.88 × 1.06 m), one on each side wall ----
    this.wallNames = ['Left wall', 'Right wall'];
    this.walls = [
      new Surface(room.addScreen({ wall: 'left', u: d / 2, v: 1.5, width: 1.88, height: 1.06, px: [1280, 720], label: 'LEFT WALL · 85"' })),
      new Surface(room.addScreen({ wall: 'right', u: d / 2, v: 1.5, width: 1.88, height: 1.06, px: [1280, 720], label: 'RIGHT WALL · 85"' })),
    ];

    // ---- central block off the back wall: claw machine, a walk-through tunnel gap, then the console ----
    // (along z: claw 1.0 m deep against the back wall, 0.7 m tunnel, console 0.6 m facing the door)
    const pink = new THREE.Color('#ff5fa2'), BW = 1.1, clawD = 1.0, gapD = 0.7, conD = 0.6;
    const z0 = -d / 2, zClaw = z0 + clawD, zCon0 = zClaw + gapD, zCon1 = zCon0 + conD;
    this.block = { zClaw, zCon0, zCon1 };
    const add = (geo, pos, op = 0.08) => { const m = room.wireMesh(geo, pink, { fillOpacity: op }); m.position.copy(pos); room.scene.add(m); return m; };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    add(new THREE.BoxGeometry(BW, 0.8, clawD), V(0, 0.4, z0 + clawD / 2), 0.12);                 // claw base
    add(new THREE.BoxGeometry(BW, 1.2, clawD), V(0, 1.4, z0 + clawD / 2), 0.03);                 // glass
    add(new THREE.BoxGeometry(BW, 0.35, clawD + gapD + conD), V(0, 2.2, z0 + (clawD + gapD + conD) / 2), 0.14); // header over the tunnel
    add(new THREE.BoxGeometry(BW, 1.0, conD), V(0, 0.5, zCon0 + conD / 2), 0.12);                 // console body
    add(new THREE.BoxGeometry(BW, 1.03, 0.3), V(0, 1.515, zCon0 + 0.15), 0.12);                    // console upper (screen)
    const desk = add(new THREE.BoxGeometry(BW, 0.08, 0.32), V(0, 1.02, zCon1 - 0.14), 0.18); desk.rotation.x = 0.22;
    const lineMat = new THREE.LineBasicMaterial({ color: pink });
    const seg = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); room.scene.add(new THREE.LineSegments(g, lineMat)); };
    const zc = z0 + clawD / 2;
    seg([-0.5, 1.95, zc, 0.5, 1.95, zc, 0.1, 1.95, z0 + 0.1, 0.1, 1.95, zClaw - 0.1, 0.1, 1.95, zc, 0.1, 1.6, zc,
      0.1, 1.6, zc, 0.02, 1.48, zc, 0.1, 1.6, zc, 0.18, 1.48, zc, 0.1, 1.6, zc, 0.1, 1.48, zc + 0.08]);
    for (let i = 0; i < 16; i++) {
      const b = room.wireMesh(new THREE.SphereGeometry(0.08 + Math.random() * 0.04, 8, 6), new THREE.Color().setHSL(Math.random(), 0.7, 0.65), { fillOpacity: 0.25, threshold: 30 });
      b.position.set(-0.42 + Math.random() * 0.84, 0.88 + Math.random() * 0.1, z0 + 0.12 + Math.random() * (clawD - 0.24)); room.scene.add(b);
    }
    room.label('CLAW MACHINE', V(0, 2.55, zc), { color: '#ff5fa2', size: 0.11 });
    room.label('TUNNEL', V(0, 0.25, zClaw + gapD / 2), { color: '#8094ae', size: 0.08 });
    this.btn3d = {};
    BTN.forEach((b, i) => {
      const col = new THREE.Color(b.color), mat = new THREE.MeshBasicMaterial({ color: col.clone() });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 20), mat);
      cap.position.set(-0.36 + i * 0.24, 1.08, zCon1 - 0.12); cap.rotation.x = 0.22; room.scene.add(cap);
      this.btn3d[b.id] = { mesh: cap, mat, base: col };
      room.clickable(cap, b.id, `Button ${b.letter}`);
    });

    // console screens face the door: question screen, and the credit display on the tunnel header
    this.main = new Surface(room.addScreen({ wall: 'back', u: w / 2, v: 1.55, width: 0.8, height: 0.45, px: [1280, 720], inset: zCon1 - z0 + 0.01, frameColor: 0xffb547, label: 'QUESTION SCREEN' }));
    this.creditScr = new Surface(room.addScreen({ wall: 'back', u: w / 2, v: 2.2, width: 0.86, height: 0.25, px: [700, 200], inset: zCon1 - z0 + 0.01, frameColor: 0xff5fa2 }));
    shell.addPanel(this.main, 'Question screen', 'on the console · answer with buttons A–D');
    shell.addPanel(this.creditScr, 'Claw credits', 'on the tunnel header');

    // collage thumbnails (click to enlarge)
    const body = shell.addCard('Collage screens', 'click one to view it full size');
    body.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px';
    this.walls.forEach((S, i) => {
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; cv.className = 'screen clickable'; cv.title = this.wallNames[i];
      cv.onclick = () => this.openLightbox(i); body.appendChild(cv); S.thumb = cv;
    });
    this._buildLightbox();
    room.onFrame((dt, t) => this._animate(dt, t));
    this.collageDirty = true;
  }

  // ---------- flow ----------
  themesOffered() {
    const t = (this.shell.settings.themes || []).filter(x => THEMES[x]);
    const list = t.length ? t : ['sport', 'emoji', 'teddies', 'space'];
    while (list.length < 4) list.push(THEME_IDS.find(x => !list.includes(x)));
    return list.slice(0, 4);
  }
  begin(run) {
    this.run = run; this.phase = 'theme'; this.theme = null; this.score = 0; this.correct = 0; this.asked = 0; this.credits = 0; this.round = null; this.popup = 0; this.pack = null;
    this.offered = this.themesOffered();
    this.shell.setLit(BTN.map(b => b.id));
    this.collageDirty = true;
  }
  press(id) {
    const ix = BTN.findIndex(b => b.id === id); if (ix < 0) return;
    this.flashes[id] = 0.2;
    if (this.phase === 'theme') {
      this.theme = this.offered[ix];
      this.shell.beep(660, 0.08); setTimeout(() => this.shell.beep(990, 0.12), 90);
      this._loadPack();
      this.shell.startClock(this.run.settings.gameLength);
      this.next();
    } else if (this.phase === 'question' && ix < this.round.q.answers.length) this.resolve(ix);
  }
  // The theme's fixed collage + every question it answers. Question order is shuffled each game.
  _loadPack() {
    const s = this.shell.settings;
    this.pack = makePack(this.theme, { countMin: Math.min(s.countMin, s.countMax), countMax: Math.max(s.countMin, s.countMax), size: s.size, rotate: s.rotate, seed: s.collageSeed, screens: this.wallNames });
    this.queue = [];
    this.collageDirty = true;
  }
  _nextQuestion() {
    const s = this.shell.settings, types = s.types.length ? s.types : ['count'];
    if (!this.queue.length) {
      const fixed = this.pack.pack.filter(q => types.includes(q.type)).slice(0, Math.max(1, s.packSize));
      this.queue = (fixed.length ? fixed : this.pack.pack.slice(0, s.packSize)).sort(() => Math.random() - 0.5);
      if (this.round && this.queue.length > 1 && this.queue[this.queue.length - 1] === this.round.q) this.queue.unshift(this.queue.pop());
    }
    return this.queue.pop();
  }
  next() {
    if (!this.shell.clock.running) return;
    const s = this.shell.settings, q = this._nextQuestion();
    this.round = { screens: this.pack.screens, q: this.styled(q, s.pictures) };
    this.asked++; this.phase = 'question'; this.elapsed = 0; this.choice = null;
    this.shell.setLit(BTN.slice(0, q.answers.length).map(b => b.id));
    this.collageDirty = true;
  }
  // Easy shows pictures beside names; hard is words only.
  styled(q, pictures) {
    const text = pictures && q.subject ? q.text.replace(q.subject.plural, `${q.subject.plural} ${q.subject.e}`).replace(`the ${q.subject.name}?`, `the ${q.subject.name} ${q.subject.e}?`) : q.text;
    return { ...q, text, answers: q.answers.map(a => ({ label: a.label, e: pictures ? a.e : null })) };
  }
  resolve(choice) {
    const s = this.shell.settings, q = this.round.q;
    this.choice = choice; this.phase = 'reveal'; this.timer = s.revealTime; this.shell.setLit([]);
    if (choice === q.correct) {
      this.result = 'correct'; this.correct++;
      this.gained = Math.round(s.pointsCorrect + s.speedBonus * Math.max(0, 1 - this.elapsed / s.questionTime));
      this.score += this.gained;
      [784, 988, 1319].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.12, 'square', 0.1), i * 80));
      if (this.correct % s.creditEvery === 0) {
        this.credits++; this.popup = s.creditPopup; this.timer = Math.max(this.timer, s.creditPopup);
        [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.14, 'triangle', 0.14), 350 + i * 90));
      }
    } else {
      this.result = choice === 'timeout' ? 'timeout' : 'wrong'; this.gained = 0;
      this.shell.beep(choice === 'timeout' ? 220 : 140, 0.4, 'sawtooth', 0.1);
    }
    this.collageDirty = true; // show where the answer was
  }
  tick(dt) {
    if (this.popup > 0) this.popup -= dt;
    if (this.phase === 'question') { this.elapsed += dt; if (this.elapsed >= this.shell.settings.questionTime) this.resolve('timeout'); }
    else if (this.phase === 'reveal') { this.timer -= dt; if (this.timer <= 0) this.next(); }
  }
  onTimeUp() {
    this.phase = 'over'; this.shell.setLit([]);
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.18, 'square', 0.1), i * 120));
    this.shell.finish({ score: this.score, line: `${this.correct} of ${this.asked} correct · ${this.credits} claw credit${this.credits === 1 ? '' : 's'}` });
  }
  reset() { this.phase = 'off'; this.round = null; this.credits = 0; this.popup = 0; this.collageDirty = true; }
  scoreboard() {
    if (this.phase === 'off') return { score: 0 };
    return { score: this.score, sub: `${this.credits} CREDIT${this.credits === 1 ? '' : 'S'}`, footer: this.theme ? `${THEMES[this.theme].label} · ${this.correct} correct · next credit in ${this.toNext()}` : 'Pick a theme' };
  }
  toNext() { const e = this.shell.settings.creditEvery; return e - (this.correct % e); }

  // ---------- 3D ----------
  _animate(dt, t) {
    for (const b of BTN) {
      const o = this.btn3d[b.id]; if (!o) continue;
      const lit = this.shell.lit.has(b.id), fl = this.flashes[b.id] || 0; if (fl > 0) this.flashes[b.id] = fl - dt;
      o.mat.color.copy(o.base).multiplyScalar(lit ? 0.7 + 0.3 * Math.sin(t * 6) : 0.25);
      if (fl > 0) o.mat.color.setRGB(1, 1, 1);
    }
  }

  // ---------- screens ----------
  draw() {
    this._drawMain(); this._drawCredits();
    const hl = this.shell.settings.demoHighlight;
    if (hl !== this._lastHl) { this._lastHl = hl; this.collageDirty = true; }
    if (this.collageDirty) { this.collageDirty = false; this.walls.forEach((S, i) => this._drawWall(S, i)); }
    if (this.lb && !this.lb.hidden) this._paintLightbox();
  }
  _drawWall(S, i) {
    const ctx = S.begin(), W = 1280, H = 720;
    ctx.fillStyle = '#101826'; ctx.fillRect(0, 0, W, H);
    // neutral "vinyl-like" backdrop pattern
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 2;
    for (let x = -H; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
    rr(ctx, 18, 16, 250, 64, 12); ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
    fit(ctx, this.wallNames[i].toUpperCase(), 143, 64, 220, 44, { color: '#ffffff', align: 'center' });
    const ph = this.phase, r = this.round;
    if (ph === 'theme' && this.offered) {
      // preview of each theme on its own screen
      [0, 1].forEach(h => {
        const k = i * 2 + h, tid = this.offered[k], th = THEMES[tid], b = BTN[k], y0 = 120 + h * 300;
        fit(ctx, `${b.letter} · ${th.label.toUpperCase()}`, 160, y0 + 90, 560, 90, { color: b.color });
        th.items.slice(0, 4).map(item).forEach((it, n) => this._emoji(ctx, it.e, 760 + n * 130, y0 + 60, 100, 0));
      });
    } else if (r && (ph === 'question' || ph === 'reveal' || ph === 'over')) {
      const showKeys = ph === 'reveal' || this.shell.settings.demoHighlight;
      for (const p of r.screens[i]) {
        this._emoji(ctx, p.it.e, p.x, p.y, p.size, p.rot);
        if (showKeys && r.q.keys.includes(p.it)) { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.62, 0, Math.PI * 2); ctx.strokeStyle = ph === 'reveal' ? C.good : '#ffffff'; ctx.lineWidth = 6; ctx.setLineDash(ph === 'reveal' ? [] : [12, 8]); ctx.stroke(); ctx.setLineDash([]); }
      }
    } else {
      fit(ctx, 'HIJINX HOTEL', W / 2, 360, W - 200, 90, { color: 'rgba(255,255,255,0.18)', align: 'center' });
      fit(ctx, 'CLAW QUIZ', W / 2, 430, W - 200, 46, { color: 'rgba(255,255,255,0.12)', align: 'center', weight: 600 });
    }
    S.commit();
    const tc = S.thumb.getContext('2d'); tc.drawImage(S.canvas, 0, 0, 320, 180);
  }
  _emoji(ctx, e, x, y, size, rot) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e, 0, size * 0.06); ctx.restore();
  }
  _drawCredits() {
    const S = this.creditScr, ctx = S.begin(), W = 700, H = 200;
    clear(ctx);
    const e = this.shell.settings.creditEvery, inPlay = this.phase !== 'off';
    fit(ctx, 'CREDITS', 30, 78, 300, 46, { color: '#ff5fa2' });
    fit(ctx, String(inPlay ? this.credits : 0), 30, 175, 200, 96, { color: C.fg });
    const done = inPlay ? this.correct % e : 0;
    fit(ctx, 'NEXT CREDIT', W - 30, 78, 330, 34, { color: C.muted, align: 'right', weight: 500 });
    for (let k = 0; k < e; k++) {
      const x = W - 30 - (e - k) * 58 + 10, y = 120;
      ctx.beginPath(); ctx.arc(x + 20, y + 22, 20, 0, Math.PI * 2);
      if (k < done) { ctx.fillStyle = C.accent; ctx.fill(); } else { ctx.strokeStyle = C.rule; ctx.lineWidth = 4; ctx.stroke(); }
    }
    S.commit();
  }
  _drawMain() {
    const S = this.main, ctx = S.begin(), W = 1280, H = 720, ph = this.phase, s = this.shell.settings;
    clear(ctx);
    if (ph === 'off' || (this.shell.state !== 'inroom' && ph !== 'over')) {
      fit(ctx, 'CLAW QUIZ', W / 2, 300, W - 120, 150, { color: C.fg, align: 'center' });
      fit(ctx, 'Search the screens. Answer fast. Win claw credits.', W / 2, 380, W - 160, 40, { color: C.muted, align: 'center', weight: 500 });
      fit(ctx, this.shell.state === 'result' ? 'THANKS FOR PLAYING' : 'TAP YOUR CARD OUTSIDE TO START', W / 2, 600, W - 120, 40, { color: C.accent, align: 'center' });
      return S.commit();
    }
    if (ph === 'theme') {
      fit(ctx, 'PICK YOUR THEME', W / 2, 120, W - 120, 90, { color: C.fg, align: 'center' });
      fit(ctx, 'The pictures and questions will match it', W / 2, 172, W - 120, 32, { color: C.muted, align: 'center', weight: 500 });
      this._tiles(ctx, 210, (b, i, x, y, tw, th) => {
        const t = THEMES[this.offered[i]];
        fit(ctx, t.label, x + 130, y + th / 2 + 4, tw - 330, 74, { color: C.fg });
        t.items.slice(0, 3).forEach((it, k) => this._emoji(ctx, it[0], x + tw - 170 + k * 62, y + th / 2 - 6, 52, 0));
      });
      return S.commit();
    }
    if (ph === 'over') {
      fit(ctx, "TIME'S UP!", W / 2, 200, W - 120, 120, { color: C.accent, align: 'center' });
      fit(ctx, fmtNum(this.score), W / 2, 380, W - 120, 170, { color: C.fg, align: 'center' });
      fit(ctx, `${this.credits} CLAW CREDIT${this.credits === 1 ? '' : 'S'} EARNED`, W / 2, 470, W - 120, 52, { color: '#ff5fa2', align: 'center' });
      fit(ctx, `${this.correct} of ${this.asked} correct`, W / 2, 530, W - 120, 32, { color: C.muted, align: 'center', weight: 500 });
      return S.commit();
    }
    const r = this.round; if (!r) return S.commit();
    fit(ctx, `QUESTION ${this.asked}`, 40, 64, 400, 44, { color: C.fg });
    fit(ctx, THEMES[this.theme].label.toUpperCase(), 40, 100, 400, 26, { color: C.muted, weight: 500 });
    const e = s.creditEvery, done = this.correct % e;
    fit(ctx, 'NEXT CREDIT', W - 40, 54, 300, 24, { color: C.muted, align: 'right', weight: 500 });
    for (let k = 0; k < e; k++) { const x = W - 40 - (e - k) * 38 + 6; ctx.beginPath(); ctx.arc(x + 14, 86, 13, 0, Math.PI * 2); if (k < done) { ctx.fillStyle = '#ff5fa2'; ctx.fill(); } else { ctx.strokeStyle = C.rule; ctx.lineWidth = 3; ctx.stroke(); } }
    const frac = ph === 'question' ? Math.min(1, this.elapsed / s.questionTime) : 1;
    rr(ctx, 40, 124, W - 80, 12, 6); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    if (ph === 'question') { rr(ctx, 40, 124, Math.max(12, (W - 80) * (1 - frac)), 12, 6); ctx.fillStyle = frac > 0.75 ? C.bad : C.accent; ctx.fill(); }
    // question text (emoji drawn with the emoji font)
    ctx.font = `700 52px ${DISPLAY}, ${EMOJI_FONT}`;
    wrap(ctx, r.q.text, W / 2, 160, W - 120, 58, { size: 52, weight: 700, family: `${DISPLAY}, ${EMOJI_FONT}`, align: 'center', maxLines: 2 });
    this._tiles(ctx, 300, (b, i, x, y, tw, th) => {
      const a = r.q.answers[i]; if (!a) return;
      if (a.e) this._emoji(ctx, a.e, x + 150, y + th / 2, 64, 0);
      fit(ctx, a.label, x + (a.e ? 200 : 130), y + th / 2 + 20, tw - (a.e ? 230 : 160), 58, { color: C.fg });
    }, (i) => ph === 'reveal' ? (i === r.q.correct ? 'correct' : i === this.choice ? 'wrong' : 'dim') : (s.demoHighlight && i === r.q.correct ? 'demo' : ''), r.q.answers.length);
    if (ph === 'reveal' && this.popup <= 0) {
      const msg = this.result === 'correct' ? `CORRECT! +${fmtNum(this.gained)}` : this.result === 'wrong' ? 'NOT QUITE' : "TIME'S UP ON THAT ONE";
      const col = this.result === 'correct' ? C.good : C.bad;
      rr(ctx, 40, 150, W - 80, 120, 18); ctx.fillStyle = 'rgba(6,11,20,0.95)'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
      fit(ctx, msg, W / 2, 232, W - 140, 72, { color: col, align: 'center' });
    }
    if (this.popup > 0) {
      const p = 0.5 + 0.5 * Math.sin(performance.now() / 120);
      ctx.fillStyle = 'rgba(6,11,20,0.82)'; ctx.fillRect(0, 0, W, H);
      rr(ctx, 120, 150, W - 240, 420, 32); ctx.fillStyle = '#2a0f22'; ctx.fill(); ctx.strokeStyle = `rgba(255,95,162,${0.6 + 0.4 * p})`; ctx.lineWidth = 10; ctx.stroke();
      fit(ctx, 'CREDIT EARNED!', W / 2, 330, W - 320, 140, { color: '#ff5fa2', align: 'center' });
      fit(ctx, `Head to the claw machine · ${this.credits} credit${this.credits === 1 ? '' : 's'} so far`, W / 2, 420, W - 320, 40, { color: C.fg, align: 'center', weight: 500 });
      fit(ctx, 'Keep answering to earn more', W / 2, 490, W - 320, 32, { color: C.muted, align: 'center', weight: 500 });
    }
    S.commit();
  }
  _tiles(ctx, top, body, state = () => '', n = 4) {
    const W = 1280, gap = 22, tw = (W - 80 - gap) / 2, rows = Math.ceil(n / 2), th = n <= 2 ? 720 - top - 30 : (720 - top - 30 - gap) / 2;
    BTN.slice(0, n).forEach((b, i) => {
      const x = 40 + (i % 2) * (tw + gap), y = top + Math.floor(i / 2) * (th + gap), st = state(i);
      ctx.globalAlpha = st === 'dim' ? 0.3 : 1;
      rr(ctx, x, y, tw, th, 18);
      ctx.fillStyle = st === 'correct' ? 'rgba(95,211,141,0.18)' : st === 'wrong' ? 'rgba(255,107,98,0.18)' : b.color + '14'; ctx.fill();
      ctx.lineWidth = st ? 6 : 3; ctx.strokeStyle = st === 'correct' ? C.good : st === 'wrong' ? C.bad : b.color;
      if (st === 'demo') { ctx.setLineDash([14, 10]); ctx.strokeStyle = '#ffffff'; }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x + 64, y + th / 2, 42, 0, Math.PI * 2); ctx.fillStyle = b.color; ctx.fill();
      fit(ctx, b.letter, x + 64, y + th / 2 + 20, 60, 56, { color: '#0a1220', align: 'center' });
      body(b, i, x, y, tw, th);
      ctx.globalAlpha = 1;
    });
  }

  // ---------- full-size collage viewer ----------
  _buildLightbox() {
    const lb = this.lb = document.createElement('div'); lb.className = 'lightbox'; lb.hidden = true;
    lb.innerHTML = `<div class="lb-bar"><b id="lb-title"></b><span class="spacer"></span><button id="lb-prev">&larr; Prev</button><button id="lb-next">Next &rarr;</button><button id="lb-close">Close</button></div><canvas width="1280" height="720"></canvas>`;
    document.body.appendChild(lb);
    this.lbCanvas = lb.querySelector('canvas');
    const n = () => this.walls.length;
    lb.querySelector('#lb-prev').onclick = () => this.openLightbox((this.lbIx + n() - 1) % n());
    lb.querySelector('#lb-next').onclick = () => this.openLightbox((this.lbIx + 1) % n());
    lb.querySelector('#lb-close').onclick = () => { lb.hidden = true; };
    lb.addEventListener('click', e => { if (e.target === lb) lb.hidden = true; });
    addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') lb.hidden = true;
      if (e.key === 'ArrowRight') this.openLightbox((this.lbIx + 1) % n());
      if (e.key === 'ArrowLeft') this.openLightbox((this.lbIx + n() - 1) % n());
    });
  }
  openLightbox(i) { this.lbIx = i; this.lb.hidden = false; this.lb.querySelector('#lb-title').textContent = this.wallNames[i]; this._paintLightbox(); }
  _paintLightbox() { this.lbCanvas.getContext('2d').drawImage(this.walls[this.lbIx].canvas, 0, 0); }

  // ---------- admin ----------
  adminInfo() {
    const r = this.round;
    return [['Phase', this.phase], ['Theme', this.theme ? THEMES[this.theme].label : '—'],
      ['Question pack', this.pack ? `${Math.min(this.shell.settings.packSize, this.pack.pack.length)} questions · layout ${this.shell.settings.collageSeed} · ${this.pack.screens.map(x => x.length).join(' + ')} pictures` : '—'],
      ['Question', r ? r.q.text : '—'], ['Answer', r ? `${BTN[r.q.correct].letter}: ${r.q.answers[r.q.correct].label}` : '—'],
      ['Correct', `${this.correct || 0} of ${this.asked || 0}`], ['Credits', this.credits || 0], ['Score', fmtNum(this.score || 0)]];
  }
  adminActions() {
    return [
      { label: 'Answer correctly (demo)', fn: () => { if (this.phase === 'question') this.press(BTN[this.round.q.correct].id); } },
      { label: 'Skip question', fn: () => { if (this.phase === 'question') this.resolve('timeout'); else if (this.phase === 'reveal') this.next(); } },
      { label: 'Give a credit (show pop-up)', fn: () => { if (this.phase === 'off') return; this.credits++; this.popup = this.shell.settings.creditPopup; if (this.phase === 'reveal') this.timer = Math.max(this.timer, this.popup); } },
      { label: 'New collage layout (saved)', fn: () => {
        const sh = this.shell, d = sh.difficulty, seed = (sh.presetValue(d, 'collageSeed') || 1) + 1;
        sh.store.presets[d].collageSeed = seed; sh._saveSettings();
        if (this.theme && (this.phase === 'question' || this.phase === 'reveal')) { this._loadPack(); this.asked--; this.next(); }
      } },
    ];
  }
}

const shell = new GameShell({
  id: 'clawquiz', title: 'Claw Quiz', roomId: 'R9',
  schema: SCHEMA, presets: PRESETS,
  instructions: [
    'Inside, pick a theme: Sport, Emoji, Teddies or Space.',
    'Read the question on the console, then search the big wall screens for the answer.',
    'Hit button A, B, C or D. Faster answers score more.',
    'Every 4 correct answers wins a go on the claw machine!',
  ],
  blurbs: { easy: 'Big, clear pictures, simpler questions, 20 s each.', hard: 'Busier screens, tilted pictures, trickier questions, 15 s each.' },
  footnote: 'Placeholder pictures are emoji. Click a collage thumbnail to search it full size.',
  game: new ClawQuizGame(),
});
shell.start();
window.__shell = shell; // handy for debugging in the browser console
