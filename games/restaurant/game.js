// RESTAURANT (R6) — four round tables, each with a spinning top (lazy Susan) holding 6 food domes.
// A portrait screen above each table shows an order and an arrow; the team turns the whole
// tabletop until that food sits under the arrow, in front of the portrait. A round clears when
// every table in play is showing its order at the same time. Unused screens show animal portraits.
import { GameShell, THREE, C, DISPLAY, MONO, rr, fit, wrap, clear, fmtNum, Surface } from '../../core/shell.js';
import { FOODS, COLOUR_RIDDLE, PORTRAITS } from './foods.js';

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const STEP = Math.PI / 3;
const RED = 0x9e1b2a, GOLD = 0xd9a93a, WOODC = 0x6b3a1e;

const SCHEMA = [
  { key: 'gameLength', label: 'Time limit', type: 'number', min: 30, max: 600, step: 10, unit: 's', default: 180, group: 'Game' },
  { key: 'resultHold', label: 'Final score shown outside for', type: 'number', min: 3, max: 30, step: 1, unit: 's', default: 8, group: 'Game' },
  { key: 'clearTime', label: '"Order up" pause between rounds', type: 'number', min: 1, max: 6, step: 0.5, unit: 's', default: 2.5, group: 'Game' },
  { key: 'tableSeed', label: 'Table food layout number', type: 'number', min: 1, max: 9999, step: 1, default: 1, group: 'Game', help: 'Which 6 foods sit on each table, and in what order. Fixed until changed (reload after changing).' },
  { key: 'ptsTable', label: 'Points per table served', type: 'number', min: 0, max: 1000, step: 10, default: 100, group: 'Scoring' },
  { key: 'speedBonus', label: 'Speed bonus per round (instant)', type: 'number', min: 0, max: 2000, step: 10, default: 200, group: 'Scoring', help: 'Slides to zero over 30 seconds.' },
  // per difficulty
  { key: 'tablesStart', label: 'Tables in play, first round', type: 'number', min: 1, max: 4, step: 1, default: 2, preset: true, group: 'Rounds', help: 'Adds a table every 2 rounds, up to 4.' },
  { key: 'picRounds', label: 'Rounds that show a picture of the food', type: 'number', min: 0, max: 20, step: 1, default: 2, preset: true, group: 'Clues', help: 'After these, orders are words only.' },
  { key: 'cryptic', label: 'Cryptic clues (riddles + other tables)', type: 'bool', default: false, preset: true, group: 'Clues' },
];
const PRESETS = {
  easy: { tablesStart: 2, picRounds: 2, cryptic: false },
  hard: { tablesStart: 3, picRounds: 0, cryptic: true },
};

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

class RestaurantGame {
  constructor() { this.phase = 'off'; this.time = 0; }

  setup(shell) {
    this.shell = shell; const room = this.room = shell.room, { w, d, h } = room.spec, scene = room.scene;
    shell.setInputs([]);
    shell.setLegend([['#d9a93a', 'Portrait screens + serving arrows'], ['#9e1b2a', 'Curtains · wainscotting · carpet'], ['#6fa8dc', 'Spinning tabletops (6 domes each)']]);
    const hw = w / 2, hd = d / 2;
    const lines = (arr, color, opacity = 1) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })); scene.add(l); return l; };

    // ---- room dressing (best guess from the Karrinyup model) ----
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x3a0a10 })); carpet.rotation.x = -Math.PI / 2; carpet.position.y = 0.003; scene.add(carpet);
    const pat = []; for (let x = -hw + 0.3; x < hw; x += 0.6) for (let z = -hd + 0.3; z < hd; z += 0.6) { pat.push(x - 0.12, 0.006, z, x, 0.006, z - 0.12, x, 0.006, z - 0.12, x + 0.12, 0.006, z, x + 0.12, 0.006, z, x, 0.006, z + 0.12, x, 0.006, z + 0.12, x - 0.12, 0.006, z); }
    lines(pat, GOLD, 0.25);
    // wainscotting band
    for (const sx of [-1, 1]) lines([sx * (hw - 0.01), 0.9, -hd, sx * (hw - 0.01), 0.9, hd - 0.02, sx * (hw - 0.01), 0.1, -hd, sx * (hw - 0.01), 0.1, hd - 0.02], RED, 0.9);
    lines([-hw, 0.9, -hd + 0.01, hw, 0.9, -hd + 0.01, -hw, 0.1, -hd + 0.01, hw, 0.1, -hd + 0.01], RED, 0.9);
    // back wall: two arched windows with red curtains either side
    for (const wx of [-0.85, 0.85]) {
      const a = [], z = -hd + 0.012, x0 = wx - 0.38, x1 = wx + 0.38, yb = 0.95, ys = 1.85;
      a.push(x0, yb, z, x1, yb, z, x0, yb, z, x0, ys, z, x1, yb, z, x1, ys, z);
      for (let k = 0; k < 16; k++) { const t0 = Math.PI * k / 16, t1 = Math.PI * (k + 1) / 16; a.push(wx + Math.cos(t0) * 0.38, ys + Math.sin(t0) * 0.38, z, wx + Math.cos(t1) * 0.38, ys + Math.sin(t1) * 0.38, z); }
      a.push(wx, yb, z, wx, ys + 0.38, z); for (const y of [1.25, 1.55, 1.85]) a.push(x0, y, z, x1, y, z);
      lines(a, 0xe8d8b0, 0.9);
      for (const side of [-1, 1]) {
        const cur = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 2.3), new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); cur.position.set(wx + side * 0.55, 1.35, -hd + 0.03); scene.add(cur);
        const f = []; for (let k = 0; k < 5; k++) { const x = wx + side * 0.55 - 0.14 + k * 0.07; f.push(x, 0.2, -hd + 0.035, x, 2.5, -hd + 0.035); } lines(f, 0xd04050, 0.6);
      }
    }
    lines([-hw, 2.5, -hd + 0.05, hw, 2.5, -hd + 0.05], GOLD); // pelmet
    // columns along the side walls
    for (const sx of [-1, 1]) for (const z of [-hd + 0.25, -0.12, hd - 0.7]) {
      const col = room.wireMesh(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 14), new THREE.Color(0xe8d8b0), { fillOpacity: 0.12 }); col.position.set(sx * (hw - 0.14), 1.3, z); scene.add(col);
      const base = room.wireMesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.Color(WOODC), { fillOpacity: 0.3 }); base.position.set(sx * (hw - 0.14), 0.1, z); scene.add(base);
    }

    // ---- four tables: 1 back-left, 2 back-right, 3 front-left, 4 front-right ----
    const R = rng(1000 + (shell.settings.tableSeed || 1));
    const deck = () => { const a = FOODS.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, 6); };
    const spots = [[-0.95, -1.0], [0.95, -1.0], [-0.95, 0.75], [0.95, 0.75]];
    this.tables = spots.map(([x, z], t) => this._buildTable(t, x, z, deck(), x < 0 ? Math.PI : 0));
    this.tables.forEach((T, t) => { T.opp = this.tables[t ^ 1]; T.next = this.tables[t ^ 2]; });

    // ---- portrait screens on the side walls, above each table ----
    this.tables.forEach((T, t) => {
      const wall = T.x < 0 ? 'left' : 'right', u = wall === 'left' ? hd - T.z : hd + T.z;
      T.screen = new Surface(room.addScreen({ wall, u, v: 1.78, width: 0.6, height: 0.8, px: [600, 800], frameColor: GOLD, label: `TABLE ${t + 1}` }));
      T.portrait = PORTRAITS[t];
    });
    const sc = shell.addCard('Portrait screens', 'above each table · gold frames');
    sc.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';
    this.tables.forEach(T => { T.screen.canvas.className = 'screen'; sc.appendChild(T.screen.canvas); });

    // top-down map: click a table's left or right half to turn it
    this.mapEl = shell.addCard('Tables', 'top-down · click left or right side of a table to turn it');
    const mc = this.mapCanvas = document.createElement('canvas'); mc.width = 380; mc.height = 500; mc.className = 'screen clickable';
    this.mapEl.appendChild(mc);
    mc.addEventListener('click', e => {
      const r = mc.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * mc.width, py = (e.clientY - r.top) / r.height * mc.height;
      for (const T of this.tables) if (Math.hypot(px - T.mx, py - T.my) < 62) { shell.unlockAudio(); this.turn(T, px < T.mx ? -1 : 1); shell.redrawAll(); break; }
    });
    room.onFrame((dt) => this._animate(dt));
  }

  _buildTable(t, x, z, foods, front) {
    const room = this.room, scene = room.scene, gold = new THREE.Color(GOLD);
    const ped = room.wireMesh(new THREE.CylinderGeometry(0.08, 0.22, 0.72, 10), new THREE.Color(WOODC), { fillOpacity: 0.3 }); ped.position.set(x, 0.36, z); scene.add(ped);
    const rim = room.wireMesh(new THREE.CylinderGeometry(0.58, 0.58, 0.04, 36), new THREE.Color(WOODC), { fillOpacity: 0.35 }); rim.position.set(x, 0.74, z); scene.add(rim);
    // fixed gold serving pointer on the rim, facing the portrait
    const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 3), new THREE.MeshBasicMaterial({ color: GOLD }));
    ptr.rotation.z = Math.PI / 2 * (front === 0 ? -1 : 1); ptr.position.set(x + Math.cos(front) * 0.64, 0.78, z + Math.sin(front) * 0.64); scene.add(ptr);
    // the spinning top
    const top = new THREE.Group(); top.position.set(x, 0.77, z); scene.add(top);
    const disc = room.wireMesh(new THREE.CylinderGeometry(0.52, 0.52, 0.03, 36), new THREE.Color(0x8a5a2b), { fillOpacity: 0.5 }); top.add(disc);
    foods.forEach((f, i) => {
      const a = front + i * STEP, px = Math.cos(a) * 0.36, pz = Math.sin(a) * 0.36;
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 20), new THREE.MeshBasicMaterial({ color: 0xf2ead8 })); plate.position.set(px, 0.02, pz); top.add(plate);
      const dome = room.wireMesh(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Color(0xcfe8ff), { fillOpacity: 0.06, threshold: 30 }); dome.position.set(px, 0.025, pz); top.add(dome);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: GOLD })); knob.position.set(px, 0.15, pz); top.add(knob);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(f.e), transparent: true, depthWrite: false })); sp.scale.set(0.12, 0.12, 1); sp.position.set(px, 0.08, pz); top.add(sp);
    });
    const T = { t, x, z, foods, front, top, rot: 0, angle: 0, target: null, clue: null, active: false, ok: false };
    room.clickable(top, 'table' + t, `Table ${t + 1}: click to turn`);
    room.label(`TABLE ${t + 1}`, new THREE.Vector3(x - Math.cos(front) * 0.75, 0.95, z), { color: '#d9a93a', size: 0.08 });
    return T;
  }
  frontFood(T) { return T.foods[((T.rot % 6) + 6) % 6]; }
  turn(T, dir = 1) { T.rot += dir; this.shell.beep(300 + Math.random() * 40, 0.04, 'triangle', 0.05); this._check(); }
  pick(id) { const m = /^table(\d)$/.exec(id); if (m) this.turn(this.tables[+m[1]], 1); }

  // ---------- rounds ----------
  begin(run) {
    this.run = run; this.phase = 'play'; this.round = 0; this.score = 0; this.served = 0; this.cleared = 0;
    this.shell.startClock(run.settings.gameLength);
    this._newRound();
  }
  _newRound() {
    const s = this.shell.settings, n = Math.min(4, s.tablesStart + Math.floor(this.round / 2));
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, n);
    this.tables.forEach(T => { T.active = order.includes(T.t); T.ok = false; T.target = null; T.clue = null; });
    const style = this.round < s.picRounds ? 'pic' : s.cryptic ? 'cryptic' : 'basic';
    const act = this.tables.filter(x => x.active);
    if (style === 'cryptic') this._crypticRound(act);
    else for (const T of act) { T.target = pick(T.foods.filter(f => f !== this.frontFood(T))); T.clue = this._clue(T, style); }
    this.phase = 'play'; this.roundT = 0; this.round++;
    this._check();
  }
  // Hard rounds lean on the other tables: shared foods, foods only one table has, "whatever the
  // table opposite is serving". Every clue still points at exactly one food on its own table.
  _crypticRound(act) {
    const used = new Set();
    const free = (T) => T.foods.filter(f => f !== this.frontFood(T));
    // sometimes link two facing (or neighbouring) tables to the same dish
    let linked = Math.random() < 0.5; // at most one linked pair per round, about half the time
    for (const T of act) {
      if (T.target || !linked) continue;
      for (const [other, word] of [[T.opp, 'opposite'], [T.next, 'next door']]) {
        if (!other.active || other.target || !linked) continue;
        const shared = free(T).filter(f => other.foods.includes(f) && f !== this.frontFood(other));
        if (!shared.length) continue;
        const f = pick(shared);
        T.target = f; other.target = f;
        T.clue = { text: `Whatever the table ${word} is serving` };
        other.clue = this._clue(other, 'cryptic', used, true);
        linked = false; break;
      }
    }
    for (const T of act) {
      if (T.target) continue;
      const cross = this._crossOptions(T).filter(o => o.f !== this.frontFood(T) && !used.has(o.text));
      if (cross.length && Math.random() < 0.7) { const o = pick(cross); T.target = o.f; T.clue = { text: o.text }; used.add(o.text); continue; }
      T.target = pick(free(T)); T.clue = this._clue(T, 'cryptic', used, true);
    }
  }
  _crossOptions(T) {
    const others = this.tables.filter(x => x !== T), out = [];
    const count = (g) => this.tables.filter(x => x.foods.includes(g)).length;
    const only = (list, text) => { if (list.length === 1) out.push({ f: list[0], text }); };
    only(T.foods.filter(g => count(g) === 1), 'The one dish no other table has');
    only(T.foods.filter(g => count(g) === 4), 'The one dish every table has');
    only(T.foods.filter(g => T.opp.foods.includes(g)), 'The only dish you share with the table opposite');
    only(T.foods.filter(g => !T.opp.foods.includes(g) && T.next.foods.includes(g) && count(g) === 2), 'The dish only you and the table next door have');
    only(T.foods.filter(g => T.next.foods.includes(g)), 'The only dish you share with the table next door');
    only(T.foods.filter(g => !others.some(o => o.foods.some(h => h.colour === g.colour)) && T.foods.filter(h => h.colour === g.colour).length === 1), 'The colour no other table has');
    only(T.foods.filter(g => g.kind === 'fruit' && !T.opp.foods.includes(g)), 'The fruit the table opposite doesn\'t have');
    only(T.foods.filter(g => g.kind !== 'fruit'), 'Your only dish that isn\'t fruit');
    only(T.foods.filter(g => g.kind === 'fruit'), 'Your only piece of fruit');
    return out;
  }
  // Build the order text for a table. Every description must point at exactly one food on that table.
  _clue(T, style, used = new Set(), noCross = false) {
    const f = T.target, colourCount = T.foods.filter(x => x.colour === f.colour).length;
    if (style === 'pic') return { pic: true, text: f.name };
    if (style === 'basic') {
      const opts = [`The ${f.name}`];
      if (colourCount === 1) opts.push(`Something ${f.colour}`);
      return { text: pick(opts) };
    }
    const opts = [f.riddle];
    if (colourCount === 1) opts.push(`Something ${COLOUR_RIDDLE[f.colour]}`);
    const fresh = opts.filter(o => !used.has(o)), text = pick(fresh.length ? fresh : opts);
    used.add(text);
    return { text };
  }
  _check() {
    if (this.phase !== 'play') return;
    let all = true;
    for (const T of this.tables) { if (!T.active) continue; const was = T.ok; T.ok = this.frontFood(T) === T.target; if (T.ok && !was) this.shell.beep(1046, 0.08, 'square', 0.06); all = all && T.ok; }
    if (all) {
      const s = this.shell.settings, n = this.tables.filter(x => x.active).length;
      const gained = n * s.ptsTable + Math.round(s.speedBonus * Math.max(0, 1 - this.roundT / 30));
      this.score += gained; this.served += n; this.cleared++; this.lastGain = gained;
      this.phase = 'cleared'; this.clearT = s.clearTime;
      [784, 988, 1319].forEach((fq, i) => setTimeout(() => this.shell.beep(fq, 0.12, 'square', 0.1), i * 80));
    }
  }
  tick(dt) {
    this.time += dt;
    if (this.phase === 'play') this.roundT += dt;
    else if (this.phase === 'cleared') { this.clearT -= dt; if (this.clearT <= 0) this._newRound(); }
  }
  onTimeUp() {
    this.phase = 'over';
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.18, 'square', 0.1), i * 120));
    this.shell.finish({ score: this.score, line: `${this.cleared} round${this.cleared === 1 ? '' : 's'} cleared · ${this.served} tables served` });
  }
  reset() { this.phase = 'off'; this.tables.forEach(T => { T.active = false; T.ok = false; T.target = null; }); }
  scoreboard() {
    if (this.phase === 'off') return { score: 0 };
    const act = this.tables.filter(x => x.active), ok = act.filter(x => x.ok).length;
    return { score: this.score, sub: `ROUND ${this.round}`, footer: this.phase === 'cleared' ? 'Order up! Next round…' : `${ok} of ${act.length} tables ready` };
  }

  // ---------- 3D ----------
  _animate(dt) {
    for (const T of this.tables) {
      const goal = T.rot * STEP; T.angle += (goal - T.angle) * Math.min(1, dt * 10);
      T.top.rotation.y = T.angle;
    }
  }

  // ---------- screens ----------
  draw() { this.tables.forEach(T => this._drawScreen(T)); this._drawMap(); }
  _frame(ctx, W, H) {
    ctx.fillStyle = '#1a0a0e'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#d9a93a'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, W - 14, H - 14);
    ctx.strokeStyle = 'rgba(217,169,58,.45)'; ctx.lineWidth = 3; ctx.strokeRect(26, 26, W - 52, H - 52);
  }
  _drawScreen(T) {
    const S = T.screen, ctx = S.begin(), W = 600, H = 800, t = this.time;
    this._frame(ctx, W, H);
    const inUse = T.active && (this.phase === 'play' || this.phase === 'cleared') && this.shell.state === 'inroom';
    if (!inUse) {
      // animal portrait
      const g = ctx.createRadialGradient(W / 2, 330, 40, W / 2, 330, 320); g.addColorStop(0, '#5a3a22'); g.addColorStop(1, '#1a0d08');
      ctx.fillStyle = g; ctx.fillRect(34, 34, W - 68, H - 68);
      ctx.font = `300px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T.portrait.e, W / 2, 340);
      ctx.beginPath(); ctx.moveTo(W / 2 - 110, 520); ctx.quadraticCurveTo(W / 2, 470, W / 2 + 110, 520); ctx.lineTo(W / 2 + 140, 600); ctx.lineTo(W / 2 - 140, 600); ctx.closePath(); ctx.fillStyle = '#2b1a3a'; ctx.fill();
      rr(ctx, 90, 640, W - 180, 100, 8); ctx.fillStyle = '#c99a2e'; ctx.fill();
      fit(ctx, T.portrait.name, W / 2, 688, W - 220, 36, { color: '#2a1606', align: 'center' });
      fit(ctx, T.portrait.sub, W / 2, 724, W - 220, 22, { color: '#4a2e10', align: 'center', weight: 500 });
      return S.commit();
    }
    fit(ctx, `TABLE ${T.t + 1}`, W / 2, 90, W - 100, 40, { color: '#d9a93a', align: 'center' });
    fit(ctx, 'PLEASE SERVE', W / 2, 130, W - 100, 24, { color: 'rgba(232,216,176,.7)', align: 'center', weight: 500 });
    if (T.clue.pic) {
      ctx.beginPath(); ctx.arc(W / 2, 330, 150, 0, Math.PI * 2); ctx.fillStyle = '#f2ead8'; ctx.fill(); ctx.strokeStyle = '#d9a93a'; ctx.lineWidth = 8; ctx.stroke();
      ctx.font = `190px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(T.target.e, W / 2, 340);
    } else {
      rr(ctx, 60, 180, W - 120, 300, 16); ctx.fillStyle = 'rgba(232,216,176,.08)'; ctx.fill();
      ctx.font = `700 52px ${DISPLAY}`;
      const lines = wrapLines(ctx, T.clue.text, W - 160);
      const lh = 62, y0 = 330 - (lines.length - 1) * lh / 2;
      lines.forEach((l, i) => fit(ctx, l, W / 2, y0 + i * lh + 18, W - 140, 52, { color: '#f4ead2', align: 'center' }));
    }
    // arrow down toward the table
    const bob = Math.sin(t * 5) * 10;
    ctx.fillStyle = T.ok ? '#5fd38d' : '#d9a93a';
    ctx.beginPath(); ctx.moveTo(W / 2 - 34, 540 + bob); ctx.lineTo(W / 2 + 34, 540 + bob); ctx.lineTo(W / 2 + 34, 620 + bob); ctx.lineTo(W / 2 + 80, 620 + bob); ctx.lineTo(W / 2, 715 + bob); ctx.lineTo(W / 2 - 80, 620 + bob); ctx.lineTo(W / 2 - 34, 620 + bob); ctx.closePath(); ctx.fill();
    if (T.ok) { rr(ctx, 70, 400, W - 140, 110, 14); ctx.fillStyle = 'rgba(20,60,35,.92)'; ctx.fill(); fit(ctx, this.phase === 'cleared' ? 'ORDER UP!' : '✓ READY', W / 2, 478, W - 160, 64, { color: '#5fd38d', align: 'center' }); }
    S.commit();
  }
  _drawMap() {
    const c = this.mapCanvas; if (!c) return; const ctx = c.getContext('2d'), W = c.width, H = c.height, spec = this.room.spec;
    ctx.fillStyle = '#060b14'; ctx.fillRect(0, 0, W, H);
    const sx = 300 / spec.w, ox = 40, oy = 30, mx = (x) => ox + (x + spec.w / 2) * sx, my = (z) => oy + (z + spec.d / 2) * (420 / spec.d);
    ctx.strokeStyle = '#6fa8dc'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, 300, 420);
    const dx = ox + spec.door.x * sx; ctx.strokeStyle = '#ffb547'; ctx.beginPath(); ctx.moveTo(dx - 0.45 * sx, 452); ctx.lineTo(dx + 0.45 * sx, 452); ctx.stroke();
    fit(ctx, 'DOOR', dx, 472, 80, 14, { color: '#ffb547', align: 'center', weight: 600 });
    fit(ctx, 'WINDOWS', W / 2, 22, 120, 12, { color: '#e8d8b0', align: 'center', weight: 600 });
    for (const T of this.tables) {
      const cx = mx(T.x), cy = my(T.z); T.mx = cx; T.my = cy;
      // portrait on the wall
      const wx = T.x < 0 ? ox : ox + 300; ctx.fillStyle = T.active && this.shell.state === 'inroom' ? (T.ok ? '#5fd38d' : '#d9a93a') : '#5a4a2a'; ctx.fillRect(wx - 4, cy - 22, 8, 44);
      ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2); ctx.fillStyle = '#2a170c'; ctx.fill(); ctx.strokeStyle = T.active ? (T.ok ? '#5fd38d' : '#d9a93a') : '#4a3a2a'; ctx.lineWidth = 3; ctx.stroke();
      // serving pointer
      const fa = T.front; ctx.fillStyle = '#d9a93a'; ctx.beginPath(); ctx.moveTo(cx + Math.cos(fa) * 66, cy); ctx.lineTo(cx + Math.cos(fa) * 58, cy - 7); ctx.lineTo(cx + Math.cos(fa) * 58, cy + 7); ctx.fill();
      T.foods.forEach((f, i) => {
        const a = T.front + (i - T.angle / STEP) * STEP, px = cx + Math.cos(a) * 38, py = cy + Math.sin(a) * 38;
        ctx.font = `24px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.e, px, py + 1);
      });
      fit(ctx, String(T.t + 1), cx, cy + 6, 30, 18, { color: '#d9a93a', align: 'center' });
      fit(ctx, '⟲', cx - 46, cy + 52, 30, 18, { color: '#8094ae', align: 'center' }); fit(ctx, '⟳', cx + 46, cy + 52, 30, 18, { color: '#8094ae', align: 'center' });
    }
  }

  adminInfo() {
    return [['Phase', this.phase], ['Round', this.round || 0], ['Score', fmtNum(this.score || 0)],
      ...this.tables.map(T => [`Table ${T.t + 1}`, T.active ? `${T.target.name} (${T.clue.pic ? 'picture' : '“' + T.clue.text + '”'}) · showing ${this.frontFood(T).name}${T.ok ? ' ✓' : ''}` : `portrait · ${T.foods.map(f => f.e).join('')}`])];
  }
  adminActions() {
    return [
      { label: 'Serve all tables (demo)', fn: () => { if (this.phase !== 'play') return; this.tables.forEach(T => { if (T.active) T.rot = T.foods.indexOf(T.target) + 6 * Math.round(T.rot / 6); }); this._check(); } },
      { label: 'New orders', fn: () => { if (this.phase === 'play') { this.round = Math.max(0, this.round - 1); this._newRound(); } } },
    ];
  }
}

function emojiTexture(e) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.font = `100px ${EMOJI_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/), out = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out;
}

const shell = new GameShell({
  id: 'restaurant', title: 'Restaurant', roomId: 'R6',
  schema: SCHEMA, presets: PRESETS,
  instructions: [
    'Each table top spins, with 6 dishes under glass domes.',
    'The portrait above each table shows an order and an arrow.',
    'Turn the table until that dish is under the arrow.',
    'Serve every table in play at once to clear the round!',
  ],
  blurbs: { easy: 'Pictures first, then simple descriptions.', hard: 'Riddles and clues about the other tables.' },
  footnote: 'Click a table in the room to turn it, or click the left/right side of a table on the Tables map.',
  game: new RestaurantGame(),
});
shell.start();
window.__shell = shell; // handy for debugging in the browser console
