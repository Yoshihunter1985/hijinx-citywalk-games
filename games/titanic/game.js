// TITANIC (R1) — big blue buttons around a sinking first-class lounge. A button lights; press it
// fast. More and more light as the clock runs. Over the limit lit at once (75% easy) = the ship
// floods early. Survive to the end and the ship still sinks — but you kept her afloat.
// Two porthole screens show the voyage: night ocean, iceberg, impact, sinking.
import { GameShell, THREE, C, DISPLAY, MONO, rr, fit, wrap, clear, fmtNum, fmtTime, Surface } from '../../core/shell.js';

const GOLD = 0xd9a93a, WOOD = 0x8a5a2b, BLUE = new THREE.Color('#2f8cff'), LEAN = 0.1; // side walls lean in ~6°

const SCHEMA = [
  { key: 'gameLength', label: 'Time limit (ship sinks)', type: 'number', min: 30, max: 600, step: 10, unit: 's', default: 180, group: 'Game' },
  { key: 'resultHold', label: 'Final score shown outside for', type: 'number', min: 3, max: 30, step: 1, unit: 's', default: 8, group: 'Game' },
  { key: 'buttonCount', label: 'Buttons in the room', type: 'number', min: 6, max: 30, step: 1, default: 18, group: 'Game', help: 'Reload the page after changing this.' },
  { key: 'pointsPress', label: 'Points per button pressed', type: 'number', min: 0, max: 1000, step: 10, default: 100, group: 'Scoring' },
  { key: 'pointsSecond', label: 'Points per second afloat', type: 'number', min: 0, max: 100, step: 1, default: 5, group: 'Scoring' },
  { key: 'survivalBonus', label: 'Bonus for lasting until she sinks', type: 'number', min: 0, max: 5000, step: 50, default: 1000, group: 'Scoring' },
  // per difficulty
  { key: 'failAt', label: 'Game over when this much is lit', type: 'number', min: 30, max: 100, step: 5, unit: '%', default: 75, preset: true, group: 'Lights' },
  { key: 'gapStart', label: 'Time between new lights at the start', type: 'number', min: 0.3, max: 6, step: 0.1, unit: 's', default: 2.2, preset: true, group: 'Lights' },
  { key: 'gapEnd', label: 'Time between new lights at the end', type: 'number', min: 0.1, max: 6, step: 0.05, unit: 's', default: 0.55, preset: true, group: 'Lights' },
  { key: 'perLight', label: 'Buttons lit each time (late game)', type: 'number', min: 1, max: 4, step: 1, default: 1, preset: true, group: 'Lights', help: 'From halfway through, each new light can bring this many at once.' },
];
const PRESETS = {
  easy: { failAt: 75, gapStart: 2.2, gapEnd: 0.55, perLight: 1 },
  hard: { failAt: 65, gapStart: 1.6, gapEnd: 0.38, perLight: 2 },
};

class TitanicGame {
  constructor() { this.phase = 'off'; this.time = 0; }

  setup(shell) {
    this.shell = shell; const room = this.room = shell.room, { w, d, h } = room.spec;
    shell.setInputs([]);
    shell.setLegend([['#2f8cff', 'Blue buttons'], ['#d9a93a', 'Gold mouldings · portholes'], ['#8a5a2b', 'Leaning timber walls']]);
    const scene = room.scene;
    const lines = (arr, color, opacity = 1) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })); scene.add(l); return l; };
    const hw = w / 2, hd = d / 2, tan = Math.tan(LEAN);

    // leaning false side walls (top sits further in than the bottom)
    for (const sx of [-1, 1]) {
      const xb = sx * hw, xt = sx * (hw - h * tan);
      lines([xb, 0, -hd, xt, h, -hd, xb, 0, hd - 0.02, xt, h, hd - 0.02, xt, h, -hd, xt, h, hd - 0.02], WOOD);
      for (const y of [0.95, 1.0, 2.25]) { const x = sx * (hw - y * tan); lines([x, y, -hd, x, y, hd - 0.02], GOLD, 0.9); }
      // upper + lower panel mouldings
      for (let z = -hd + 0.25; z < hd - 0.6; z += 0.8) {
        const x1 = sx * (hw - 1.15 * tan), x2 = sx * (hw - 2.1 * tan), x3 = sx * (hw - 0.2 * tan), x4 = sx * (hw - 0.8 * tan);
        lines([x1, 1.15, z, x1, 1.15, z + 0.6, x1, 1.15, z + 0.6, x2, 2.1, z + 0.6, x2, 2.1, z + 0.6, x2, 2.1, z, x2, 2.1, z, x1, 1.15, z], GOLD, 0.45);
        lines([x3, 0.2, z, x3, 0.2, z + 0.6, x3, 0.2, z + 0.6, x4, 0.8, z + 0.6, x4, 0.8, z + 0.6, x4, 0.8, z, x4, 0.8, z, x3, 0.2, z], GOLD, 0.45);
      }
    }
    // back wall mouldings + fireplace
    lines([-hw, 0.95, -hd + 0.01, hw, 0.95, -hd + 0.01, -hw, 2.25, -hd + 0.01, hw, 2.25, -hd + 0.01], GOLD, 0.9);
    const fire = room.wireMesh(new THREE.BoxGeometry(1.1, 1.05, 0.3), new THREE.Color(0x5a3a1a), { fillOpacity: 0.2 }); fire.position.set(0, 0.525, -hd + 0.15); scene.add(fire);
    lines([-0.35, 0, -hd + 0.31, -0.35, 0.65, -hd + 0.31, -0.35, 0.65, -hd + 0.31, 0.35, 0.65, -hd + 0.31, 0.35, 0.65, -hd + 0.31, 0.35, 0, -hd + 0.31, -0.65, 1.08, -hd + 0.33, 0.65, 1.08, -hd + 0.33], GOLD);
    room.label('FIREPLACE', new THREE.Vector3(0, 1.25, -hd + 0.3), { color: '#d9a93a', size: 0.08 });
    // coffered ceiling
    const cf = []; for (let x = -hw; x <= hw + 1e-6; x += w / 4) cf.push(x, h - 0.01, -hd, x, h - 0.01, hd); for (let z = -hd; z <= hd + 1e-6; z += d / 6) cf.push(-hw, h - 0.01, z, hw, h - 0.01, z);
    lines(cf, GOLD, 0.6);
    // water-pattern floor
    const wv = []; for (let z = -hd + 0.2; z < hd; z += 0.3) for (let x = -hw; x < hw - 0.1; x += 0.1) wv.push(x, 0.004, z + 0.04 * Math.sin(x * 9 + z * 3), x + 0.1, 0.004, z + 0.04 * Math.sin((x + 0.1) * 9 + z * 3));
    lines(wv, 0x2f6fd6, 0.35);
    // sconces
    for (const [sx, z] of [[-1, -1.2], [-1, 1.0], [1, -1.2], [1, 1.0]]) {
      const x = sx * (hw - 1.95 * tan - 0.05);
      const s = room.wireMesh(new THREE.CylinderGeometry(0.06, 0.03, 0.18, 8), new THREE.Color(GOLD), { fillOpacity: 0.5 }); s.position.set(x, 1.95, z); scene.add(s);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a })); fl.position.set(x, 2.08, z); scene.add(fl);
    }

    // ---- portholes (20" glass, about 0.5 m) on each leaning side wall, centred ----
    this.portholes = [];
    for (const [sx, name] of [[-1, 'Port (left)'], [1, 'Starboard (right)']]) {
      const y = 1.5, x = sx * (hw - y * tan - 0.015), holder = new THREE.Group();
      holder.position.set(x, y, 0); holder.rotation.order = 'YXZ'; holder.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2; holder.rotation.x = LEAN;
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.25, 48), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); glass.position.z = 0.01; holder.add(glass);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 10, 48), new THREE.MeshBasicMaterial({ color: GOLD })); ring.position.z = 0.02; holder.add(ring);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, bolt = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff0b0 })); bolt.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.06); holder.add(bolt); }
      scene.add(holder);
      const S = new Surface({ canvas: cv, ctx: cv.getContext('2d'), texture: tex, mesh: glass, update() { tex.needsUpdate = true; } });
      S.side = sx; this.portholes.push(S);
      shell.addPanel(S, `Porthole · ${name}`, '20" round screen', { small: true });
    }

    // ---- buttons spread along the back + side walls, avoiding the portholes and fireplace ----
    this.buildButtons(room.spec, shell.settings.buttonCount);

    // top-down clickable map of the buttons (easier than hitting them in 3D during a demo)
    this.mapEl = shell.addCard('Button map', 'top-down · click a button to press it');
    const mc = this.mapCanvas = document.createElement('canvas'); mc.width = 380; mc.height = 500; mc.className = 'screen clickable';
    this.mapEl.appendChild(mc);
    mc.addEventListener('click', e => {
      const r = mc.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * mc.width, py = (e.clientY - r.top) / r.height * mc.height;
      let best = null, bd = 22;
      this.buttons.forEach(b => { const dd = Math.hypot(b.mx - px, b.my - py); if (dd < bd) { bd = dd; best = b; } });
      if (best) { shell.unlockAudio(); this.pick(best.id); shell.redrawAll(); }
    });
    room.onFrame((dt, t) => this._animate(dt, t));
  }

  buildButtons(spec, n) {
    const { w, d } = spec, hw = w / 2, hd = d / 2, tan = Math.tan(LEAN);
    // usable runs along each wall: [wall, from, to] in metres along the wall
    const runs = [
      ['left', -hd + 0.35, -0.45], ['left', 0.45, hd - 0.75],   // z ranges, skipping the porthole
      ['back', -hw + 0.35, -0.7], ['back', 0.7, hw - 0.35],     // x ranges, skipping the fireplace
      ['right', -hd + 0.35, -0.45], ['right', 0.45, hd - 0.75],
    ];
    const total = runs.reduce((s, r) => s + (r[2] - r[1]), 0);
    this.buttons = [];
    for (let i = 0; i < n; i++) {
      let at = (i + 0.5) / n * total, run = runs[0];
      for (const r of runs) { const L = r[2] - r[1]; if (at <= L) { run = r; break; } at -= L; }
      const along = run[1] + at, y = i % 2 ? 1.45 : 1.0;
      const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
      if (run[0] === 'back') { grp.position.set(along, y, -hd + 0.02); }
      else { const sx = run[0] === 'left' ? -1 : 1; grp.position.set(sx * (hw - y * tan - 0.02), y, along); grp.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2; grp.rotation.x = LEAN; }
      const mat = new THREE.MeshBasicMaterial({ color: BLUE.clone() });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat); dome.rotation.x = Math.PI / 2; grp.add(dome);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 8, 32), new THREE.MeshBasicMaterial({ color: GOLD })); grp.add(ring);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.19, 32), new THREE.MeshBasicMaterial({ color: 0x7fc4ff, transparent: true, opacity: 0, depthWrite: false })); halo.position.z = 0.005; grp.add(halo);
      this.room.scene.add(grp);
      const id = 'b' + i;
      const b = { id, i, grp, mat, halo, lit: false, litAt: 0, flash: 0, wall: run[0], x: grp.position.x, z: grp.position.z, y };
      this.room.clickable(grp, id, `Button ${i + 1}`);
      // position on the 2D map
      b.mx = 40 + (b.x + hw) / w * 300; b.my = 30 + (b.z + hd) / d * 420;
      this.buttons.push(b);
    }
  }

  // ---------- flow ----------
  begin(run) {
    this.run = run; this.phase = 'ready'; this.readyT = 3; this.score = 0; this.presses = 0; this.t = 0; this.spawnT = 0;
    this.buttons.forEach(b => { b.lit = false; }); this.sinkT = null; this.result = null; this.maxLit = 0;
    this.shell.startClock(run.settings.gameLength); this.shell.clock.running = false; // clock starts after the 3-2-1
  }
  pick(id) {
    const b = this.buttons.find(x => x.id === id); if (!b) return;
    b.flash = 0.18;
    if (this.phase !== 'play') return;
    if (b.lit) {
      b.lit = false; this.presses++; this.score += this.shell.settings.pointsPress;
      this.shell.beep(880 + Math.random() * 200, 0.06, 'square', 0.07);
    }
  }
  litCount() { return this.buttons.filter(b => b.lit).length; }
  lightSome(k) {
    const off = this.buttons.filter(b => !b.lit).sort(() => Math.random() - 0.5);
    off.slice(0, k).forEach(b => { b.lit = true; b.litAt = this.time; });
  }
  tick(dt) {
    this.time += dt;
    const s = this.shell.settings;
    if (this.phase === 'ready') {
      this.readyT -= dt;
      if (Math.ceil(this.readyT) !== Math.ceil(this.readyT + dt)) this.shell.beep(this.readyT > 0.05 ? 660 : 1320, 0.12);
      if (this.readyT <= 0) { this.phase = 'play'; this.shell.clock.running = true; this.lightSome(1); this.spawnT = s.gapStart; }
    } else if (this.phase === 'play') {
      this.t += dt;
      const frac = Math.min(1, this.t / s.gameLength), gap = s.gapStart * Math.pow(s.gapEnd / s.gapStart, frac);
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = gap; this.lightSome(frac > 0.5 ? s.perLight : 1); }
      const lit = this.litCount(); this.maxLit = Math.max(this.maxLit, lit);
      if (lit / this.buttons.length > s.failAt / 100) this._sink('flooded');
    } else if (this.phase === 'sinking') {
      this.sinkT += dt;
      if (this.sinkT > 4.5 && this.shell.state === 'inroom') this._finish();
    }
  }
  onTimeUp() { if (this.phase === 'play') this._sink('survived'); }
  _sink(how) {
    this.result = how; this.phase = 'sinking'; this.sinkT = 0;
    this.shell.clock.running = false;
    if (how === 'survived') this.score += this.shell.settings.survivalBonus;
    this.score += Math.floor(this.t) * this.shell.settings.pointsSecond;
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.shell.beep(f, 0.4, 'sawtooth', 0.1), i * 300));
  }
  _finish() {
    this.shell.finish({ score: this.score, line: this.result === 'survived' ? `Kept her afloat to the end · ${this.presses} buttons` : `Flooded at ${fmtTime(this.t)} · ${this.presses} buttons` });
  }
  reset() { this.phase = 'off'; this.buttons.forEach(b => b.lit = false); }
  scoreboard() {
    if (this.phase === 'off') return { score: 0 };
    const lit = this.litCount(), n = this.buttons.length;
    return { score: this.score, sub: `${lit}/${n} LIT`, footer: this.phase === 'ready' ? 'Get ready…' : this.phase === 'sinking' ? (this.result === 'survived' ? 'She held to the end!' : 'Too many lights — she\'s going down!') : `Danger ${Math.round(lit / n * 100)}% · fail at ${this.shell.settings.failAt}%` };
  }

  // ---------- 3D + screens ----------
  _animate(dt, t) {
    for (const b of this.buttons || []) {
      if (b.flash > 0) b.flash -= dt;
      const pulse = 0.75 + 0.25 * Math.sin(t * 10 + b.i);
      if (b.flash > 0) b.mat.color.setRGB(1, 1, 1);
      else if (b.lit) b.mat.color.setRGB(0.35 * pulse, 0.75 * pulse, 1);
      else b.mat.color.copy(BLUE).multiplyScalar(0.22);
      b.halo.material.opacity = b.lit ? 0.35 + 0.35 * Math.sin(t * 10 + b.i) : 0;
    }
  }
  // 0..1 voyage progress: calm → iceberg → impact → sinking
  voyage() {
    if (this.phase === 'off' || this.phase === 'ready') return { p: 0, sink: 0 };
    const len = this.shell.settings.gameLength, p = Math.min(1, this.t / len);
    let sink = p < 0.82 ? 0 : (p - 0.82) / 0.18;
    if (this.phase === 'sinking') sink = Math.max(sink, Math.min(1, this.sinkT / 3.5));
    return { p, sink };
  }
  draw() { this._drawPortholes(); this._drawMap(); }
  _drawPortholes() {
    const { p, sink } = this.voyage(), danger = this.buttons.length ? this.litCount() / this.buttons.length : 0;
    const t = this.time;
    for (const S of this.portholes) {
      const ctx = S.ctx, W = 512, R = 256;
      ctx.clearRect(0, 0, W, W);
      ctx.save(); ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
      // ship's list: tilts with danger, then hard as she sinks
      const tilt = S.side * (danger * 0.25 + sink * 0.6) + Math.sin(t * 0.8) * 0.03 * (1 + danger * 3);
      // water level rises over the glass as she sinks
      const horizon = 300 - sink * 520;
      ctx.translate(R, R); ctx.rotate(tilt); ctx.translate(-R, -R);
      // sky
      const g = ctx.createLinearGradient(0, -200, 0, horizon); g.addColorStop(0, '#02040c'); g.addColorStop(1, '#0d1f3f'); ctx.fillStyle = g; ctx.fillRect(-200, -400, W + 400, horizon + 400);
      ctx.fillStyle = '#ffffff'; const rnd = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); }; for (let i = 0; i < 40; i++) { const x = rnd(i + 1) * W, y = rnd(i + 99) * Math.max(10, horizon - 20); ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t + i)); ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(390, 110, 26, 0, Math.PI * 2); ctx.fillStyle = '#f3efd8'; ctx.fill();
      // iceberg: appears ~45%, grows until impact ~80% (only on the starboard side up close; small on port)
      if (p > 0.42) {
        const k = Math.min(1, (p - 0.42) / 0.38), sc = (S.side > 0 ? 1 : 0.45) * (0.15 + k * 1.3), ix = S.side > 0 ? 320 - k * 120 : 140;
        ctx.save(); ctx.translate(ix, horizon); ctx.scale(sc, sc);
        ctx.beginPath(); ctx.moveTo(-160, 0); ctx.lineTo(-90, -120); ctx.lineTo(-40, -90); ctx.lineTo(10, -210); ctx.lineTo(60, -110); ctx.lineTo(110, -140); ctx.lineTo(170, 0); ctx.closePath();
        ctx.fillStyle = '#dff3ff'; ctx.fill(); ctx.strokeStyle = '#8fc6e8'; ctx.lineWidth = 6; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, -210); ctx.lineTo(0, -60); ctx.lineTo(-40, -90); ctx.strokeStyle = 'rgba(120,170,210,.6)'; ctx.lineWidth = 4; ctx.stroke();
        ctx.restore();
      }
      // sea + waves
      const sg = ctx.createLinearGradient(0, horizon, 0, horizon + 600); sg.addColorStop(0, '#0b3a6e'); sg.addColorStop(1, '#03101f');
      ctx.fillStyle = sg; ctx.fillRect(-200, horizon, W + 400, 1200);
      ctx.strokeStyle = 'rgba(140,200,255,.35)'; ctx.lineWidth = 3;
      for (let k = 0; k < 9; k++) {
        const y = horizon + 12 + k * k * 6; ctx.beginPath();
        for (let x = -200; x <= W + 200; x += 16) ctx.lineTo(x, y + Math.sin(x / (30 + k * 8) + t * (1.5 + k * 0.2)) * (2 + k));
        ctx.stroke();
      }
      ctx.restore();
      // impact flash
      if (p > 0.8 && p < 0.83 && this.phase === 'play') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.fill(); }
      // underwater: bubbles once the glass is submerged
      if (sink > 0.55) {
        ctx.save(); ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = `rgba(2,12,30,${(sink - 0.55) * 1.6})`; ctx.fillRect(0, 0, W, W);
        ctx.strokeStyle = 'rgba(180,220,255,.7)'; ctx.lineWidth = 3;
        for (let i = 0; i < 24; i++) { const x = (i * 71) % W, y = W - ((t * (60 + i * 7) + i * 40) % (W + 40)); ctx.beginPath(); ctx.arc(x, y, 4 + i % 5 * 2, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
      // warning glow as danger rises
      if (danger > 0.4 && this.phase === 'play') { ctx.strokeStyle = `rgba(255,70,60,${(danger - 0.4) * 1.5 * (0.5 + 0.5 * Math.sin(t * 8))})`; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(R, R, R - 9, 0, Math.PI * 2); ctx.stroke(); }
      S.commit();
    }
  }
  _drawMap() {
    const c = this.mapCanvas; if (!c) return; const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.fillStyle = '#060b14'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#6fa8dc'; ctx.lineWidth = 2; ctx.strokeRect(40, 30, 300, 420);
    const spec = this.room.spec, dx = 40 + spec.door.x / spec.w * 300, dw = spec.door.width / spec.w * 300;
    ctx.fillStyle = '#060b14'; ctx.fillRect(dx - dw / 2, 446, dw, 8); ctx.strokeStyle = '#ffb547'; ctx.beginPath(); ctx.moveTo(dx - dw / 2, 452); ctx.lineTo(dx + dw / 2, 452); ctx.stroke();
    fit(ctx, 'DOOR', dx, 472, 80, 14, { color: '#ffb547', align: 'center', weight: 600 });
    fit(ctx, 'FIREPLACE', W / 2, 52, 120, 12, { color: '#d9a93a', align: 'center', weight: 600 });
    for (const side of [-1, 1]) { const x = side < 0 ? 40 : 340; ctx.beginPath(); ctx.arc(x, 240, 12, 0, Math.PI * 2); ctx.strokeStyle = '#d9a93a'; ctx.stroke(); }
    const t = this.time;
    for (const b of this.buttons) {
      ctx.beginPath(); ctx.arc(b.mx, b.my, b.lit ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = b.lit ? `rgba(90,190,255,${0.75 + 0.25 * Math.sin(t * 10 + b.i)})` : '#14305a'; ctx.fill();
      ctx.strokeStyle = b.y > 1.2 ? '#ffffff' : '#d9a93a'; ctx.lineWidth = 2; ctx.stroke();
    }
    const lit = this.litCount(), n = this.buttons.length, fail = this.shell.settings.failAt / 100;
    // danger bar
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(40, 8, 300, 10);
    ctx.fillStyle = lit / n > fail * 0.8 ? '#ff6b62' : '#5fd38d'; ctx.fillRect(40, 8, 300 * Math.min(1, lit / n), 10);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(40 + 300 * fail - 1, 4, 3, 18);
    fit(ctx, 'white ring = high button · gold ring = low button', W / 2, H - 8, W, 11, { color: '#8094ae', align: 'center', weight: 400, family: MONO });
  }

  adminInfo() {
    const n = this.buttons.length, lit = this.litCount(), s = this.shell.settings;
    return [['Phase', this.phase], ['Lit', `${lit}/${n} (${Math.round(lit / n * 100)}%) · fail over ${s.failAt}%`], ['Most lit at once', this.maxLit || 0],
      ['Pressed', this.presses || 0], ['Voyage', `${Math.round(this.voyage().p * 100)}%`], ['Score', fmtNum(this.score || 0)]];
  }
  adminActions() {
    return [
      { label: 'Clear all lights', fn: () => this.buttons.forEach(b => b.lit = false) },
      { label: 'Light 3 more', fn: () => { if (this.phase === 'play') this.lightSome(3); } },
      { label: 'Jump to iceberg', fn: () => { if (this.phase === 'play') { const L = this.shell.settings.gameLength; this.t = L * 0.6; this.shell.clock.left = L * 0.4; } } },
      { label: 'Jump to last 20 s', fn: () => { if (this.phase === 'play') { const L = this.shell.settings.gameLength; this.t = L - 20; this.shell.clock.left = 20; } } },
    ];
  }
}

const shell = new GameShell({
  id: 'titanic', title: 'Titanic', roomId: 'R1',
  schema: SCHEMA, presets: PRESETS,
  instructions: [
    'Blue buttons light up around the room. Hit them fast to turn them off!',
    'More and more light up the longer you last.',
    'If too many are lit at once the ship floods and it\'s game over.',
    'Keep her afloat until she sinks to win the bonus.',
  ],
  blurbs: { easy: 'Slower lights. Game over at 75% lit.', hard: 'Faster lights, two at a time. Game over at 65% lit.' },
  footnote: 'Click the blue buttons in the room or on the button map. Portholes show the voyage: ocean, iceberg, then the sinking.',
  game: new TitanicGame(),
});
shell.start();
window.__shell = shell; // handy for debugging in the browser console
