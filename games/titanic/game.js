// TITANIC (R1) — big blue buttons around a sinking first-class lounge. A button lights; press it
// fast. More and more light as the clock runs. Over the limit lit at once (75% easy) = the ship
// floods early. Survive to the end and the ship still sinks — but you kept her afloat.
// The whole lounge set is tipped (the ship is listing): walls lean the same way and half the
// fireplace is below the water-pattern floor. Two portholes on the same wall look out on one
// shared ocean, so the iceberg crosses porthole 1, then a beat later crosses porthole 2.
import { GameShell, THREE, C, DISPLAY, MONO, rr, fit, wrap, clear, fmtNum, fmtTime, Surface } from '../../core/shell.js';

const GOLD = 0xd9a93a, WOOD = 0x8a5a2b, BLUE = new THREE.Color('#2f8cff');
const ROLL = 0.14;          // ~8° list to port (left)
const SHIP_H = 2.4;         // height of the tipped set (keeps its high corner under the real ceiling)
const SHIP_IN = 0.35;       // set walls sit this far inside the real walls so the tipped set fits
const PORT_Z = [0.75, -0.75]; // porthole 1 (door end) and porthole 2 (back end), both on the left wall
const ICE_SPEED = 0.4;      // m/s the iceberg drifts past along the hull (window to window ≈ 1.5 m)

const SCHEMA = [
  { key: 'gameLength', label: 'Time limit (ship sinks)', type: 'number', min: 30, max: 600, step: 10, unit: 's', default: 180, group: 'Game' },
  { key: 'resultHold', label: 'Final score shown outside for', type: 'number', min: 3, max: 30, step: 1, unit: 's', default: 8, group: 'Game' },
  { key: 'buttonCount', label: 'Buttons in the room', type: 'number', min: 6, max: 30, step: 1, default: 18, group: 'Game', help: 'Reload the page after changing this.' },
  { key: 'pointsPress', label: 'Points per button pressed', type: 'number', min: 0, max: 1000, step: 10, default: 100, group: 'Scoring' },
  { key: 'pointsSecond', label: 'Points per second afloat', type: 'number', min: 0, max: 100, step: 1, default: 5, group: 'Scoring' },
  { key: 'survivalBonus', label: 'Bonus for lasting until she sinks', type: 'number', min: 0, max: 5000, step: 50, default: 1000, group: 'Scoring' },
  // per difficulty
  { key: 'failAt', label: 'Game over when this much is lit', type: 'number', min: 30, max: 100, step: 5, unit: '%', default: 75, preset: true, group: 'Lights' },
  { key: 'gapStart', label: 'Time between new lights at the start', type: 'number', min: 0.2, max: 6, step: 0.1, unit: 's', default: 1.6, preset: true, group: 'Lights' },
  { key: 'gapEnd', label: 'Time between new lights at the end', type: 'number', min: 0.1, max: 6, step: 0.05, unit: 's', default: 0.4, preset: true, group: 'Lights' },
  { key: 'perLight', label: 'Most buttons lit at once (end of game)', type: 'number', min: 1, max: 6, step: 1, default: 3, preset: true, group: 'Lights', help: 'Starts at 1 and ramps up to this many per burst as the game goes on.' },
];
const PRESETS = {
  easy: { failAt: 75, gapStart: 1.6, gapEnd: 0.4, perLight: 3 },
  hard: { failAt: 65, gapStart: 1.2, gapEnd: 0.28, perLight: 4 },
};

class TitanicGame {
  constructor() { this.phase = 'off'; this.time = 0; }

  setup(shell) {
    this.shell = shell; const room = this.room = shell.room, { w, d, h } = room.spec;
    shell.setInputs([]);
    shell.setLegend([['#2f8cff', 'Blue buttons'], ['#d9a93a', 'Gold mouldings · portholes'], ['#8a5a2b', 'Tipped timber walls (ship listing)'], ['#2f6fd6', 'Water-pattern carpet']]);
    const scene = room.scene, hd = d / 2;

    // ---- water-pattern carpet: opaque, level, hides the half of the set that's "under water" ----
    const wc = this.waterCanvas = document.createElement('canvas'); wc.width = 512; wc.height = 512;
    this._paintWater(0);
    const wt = this.waterTex = new THREE.CanvasTexture(wc); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(w / 1.2, d / 1.2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: wt, toneMapped: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.004; scene.add(floor);

    // ---- the tipped set: everything inside this group rolls with the ship ----
    const ship = this.ship = new THREE.Group(); ship.rotation.z = ROLL; scene.add(ship);
    const hw = w / 2 - SHIP_IN, H = SHIP_H, y0 = -0.6; // walls run below the floor so they always meet the water
    this.hwi = hw;
    const lines = (arr, color, opacity = 1) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })); ship.add(l); return l; };
    const box = (x0, x1, yA, yB, z0, z1) => [x0, yA, z0, x1, yA, z0, x1, yA, z0, x1, yB, z0, x1, yB, z0, x0, yB, z0, x0, yB, z0, x0, yA, z0].map((v, i) => v);
    // wall outlines (side walls + back wall + ceiling edge)
    for (const sx of [-1, 1]) {
      const x = sx * hw;
      lines([x, y0, -hd, x, H, -hd, x, y0, hd - 0.02, x, H, hd - 0.02, x, H, -hd, x, H, hd - 0.02], WOOD);
      for (const y of [0.95, 1.0, 2.05]) lines([x, y, -hd, x, y, hd - 0.02], GOLD, 0.9);
      for (let z = -hd + 0.2; z < hd - 0.6; z += 0.75) {
        lines([x, 1.12, z, x, 1.12, z + 0.55, x, 1.12, z + 0.55, x, 1.9, z + 0.55, x, 1.9, z + 0.55, x, 1.9, z, x, 1.9, z, x, 1.12, z], GOLD, 0.4);
        lines([x, 0.15, z, x, 0.15, z + 0.55, x, 0.15, z + 0.55, x, 0.8, z + 0.55, x, 0.8, z + 0.55, x, 0.8, z, x, 0.8, z, x, 0.15, z], GOLD, 0.4);
      }
    }
    lines([-hw, y0, -hd, hw, y0, -hd, -hw, H, -hd, hw, H, -hd, -hw, 0.95, -hd + 0.01, hw, 0.95, -hd + 0.01, -hw, 2.05, -hd + 0.01, hw, 2.05, -hd + 0.01], GOLD, 0.9);
    // faint wall fills so the tilt reads
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(d, H - y0), new THREE.MeshBasicMaterial({ color: WOOD, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })); m.rotation.y = Math.PI / 2; m.position.set(sx * hw, (H + y0) / 2, 0); ship.add(m); }
    { const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, H - y0), new THREE.MeshBasicMaterial({ color: WOOD, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false })); m.position.set(0, (H + y0) / 2, -hd + 0.005); ship.add(m); }
    // fireplace: half of it sits below the water line
    const fire = room.wireMesh(new THREE.BoxGeometry(1.1, 1.05, 0.3), new THREE.Color(0x7a4a22), { fillOpacity: 0.2 }); fire.position.set(0, -0.02, -hd + 0.15); ship.add(fire);
    lines([-0.35, -0.5, -hd + 0.31, -0.35, 0.15, -hd + 0.31, -0.35, 0.15, -hd + 0.31, 0.35, 0.15, -hd + 0.31, 0.35, 0.15, -hd + 0.31, 0.35, -0.5, -hd + 0.31, -0.65, 0.53, -hd + 0.33, 0.65, 0.53, -hd + 0.33], GOLD);
    // coffered ceiling
    const cf = []; for (let x = -hw; x <= hw + 1e-6; x += 2 * hw / 4) cf.push(x, H - 0.01, -hd, x, H - 0.01, hd); for (let z = -hd; z <= hd + 1e-6; z += d / 6) cf.push(-hw, H - 0.01, z, hw, H - 0.01, z);
    lines(cf, GOLD, 0.6);
    // sconces
    for (const [sx, z] of [[-1, 0], [1, -1.2], [1, 1.0]]) {
      const x = sx * (hw - 0.06);
      const sc = room.wireMesh(new THREE.CylinderGeometry(0.06, 0.03, 0.18, 8), new THREE.Color(GOLD), { fillOpacity: 0.5 }); sc.position.set(x, 1.95, z); ship.add(sc);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a })); fl.position.set(x, 2.08, z); ship.add(fl);
    }
    room.label('FIREPLACE (half under water)', new THREE.Vector3(0, 0.75, -hd + 0.3), { color: '#d9a93a', size: 0.07 });

    // ---- two portholes (20" glass, about 0.5 m), staggered on the left wall ----
    this.portholes = [];
    PORT_Z.forEach((z, i) => {
      const holder = new THREE.Group(); holder.position.set(-hw + 0.015, 1.5, z); holder.rotation.y = Math.PI / 2; ship.add(holder);
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.25, 48), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); glass.position.z = 0.01; holder.add(glass);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 10, 48), new THREE.MeshBasicMaterial({ color: GOLD })); ring.position.z = 0.02; holder.add(ring);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, bolt = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff0b0 })); bolt.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0.06); holder.add(bolt); }
      const S = new Surface({ canvas: cv, ctx: cv.getContext('2d'), texture: tex, mesh: glass, update() { tex.needsUpdate = true; } });
      // position along the shared outside view: facing the left wall, screen-right is toward the back (-z)
      S.s = -z; S.n = i + 1; this.portholes.push(S);
      room.label(`PORTHOLE ${i + 1}`, new THREE.Vector3(-hw + 0.05, 1.86, z), { color: '#d9a93a', size: 0.06 });
    });
    // side-panel view: both portholes side by side, as they sit on the wall
    const pc = shell.addCard('Portholes', 'left wall · 20" round screens · same ocean, iceberg passes 1 then 2');
    pc.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px';
    this.portholes.forEach(S => { S.canvas.className = 'screen'; S.canvas.style.borderRadius = '50%'; pc.appendChild(S.canvas); });

    // ---- buttons spread along the back + side walls of the set ----
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

  _paintWater(t) {
    const c = this.waterCanvas.getContext('2d'), W = 512;
    const g = c.createLinearGradient(0, 0, W, W); g.addColorStop(0, '#0b4f8f'); g.addColorStop(1, '#0a3f78'); c.fillStyle = g; c.fillRect(0, 0, W, W);
    // caustic-style ripple lines (tile seamlessly: whole sine periods across the tile)
    c.lineWidth = 3;
    for (let k = 0; k < 14; k++) {
      c.strokeStyle = `rgba(150,215,255,${0.18 + 0.12 * (k % 3)})`; c.beginPath();
      for (let x = 0; x <= W; x += 8) { const y = (k * W / 14 + 14 * Math.sin((x / W) * Math.PI * 4 + k + t) + 8 * Math.sin((x / W) * Math.PI * 2 * 3 - t * 1.3 + k * 2)) % W; x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    if (this.waterTex) this.waterTex.needsUpdate = true;
  }

  buildButtons(spec, n) {
    const { w, d } = spec, hw = this.hwi, hd = d / 2;
    // usable runs along each set wall: [wall, from, to] in metres; skip portholes (left) and fireplace (back)
    const runs = [
      ['left', -hd + 0.35, PORT_Z[1] - 0.38], ['left', PORT_Z[1] + 0.38, PORT_Z[0] - 0.38], ['left', PORT_Z[0] + 0.38, hd - 0.75],
      ['back', -hw + 0.3, -0.72], ['back', 0.72, hw - 0.3],
      ['right', -hd + 0.35, hd - 0.75],
    ];
    const total = runs.reduce((s, r) => s + (r[2] - r[1]), 0);
    this.buttons = [];
    for (let i = 0; i < n; i++) {
      let at = (i + 0.5) / n * total, run = runs[0];
      for (const r of runs) { const L = r[2] - r[1]; if (at <= L) { run = r; break; } at -= L; }
      const along = run[1] + at, y = i % 2 ? 1.45 : 1.0;
      const grp = new THREE.Group();
      if (run[0] === 'back') grp.position.set(along, y, -hd + 0.02);
      else { const sx = run[0] === 'left' ? -1 : 1; grp.position.set(sx * (hw - 0.02), y, along); grp.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2; }
      const mat = new THREE.MeshBasicMaterial({ color: BLUE.clone() });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat); dome.rotation.x = Math.PI / 2; grp.add(dome);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 8, 32), new THREE.MeshBasicMaterial({ color: GOLD })); grp.add(ring);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.19, 32), new THREE.MeshBasicMaterial({ color: 0x7fc4ff, transparent: true, opacity: 0, depthWrite: false })); halo.position.z = 0.005; grp.add(halo);
      this.ship.add(grp);
      const id = 'b' + i;
      const b = { id, i, grp, mat, halo, lit: false, litAt: 0, flash: 0, wall: run[0], x: grp.position.x, z: grp.position.z, y };
      this.room.clickable(grp, id, `Button ${i + 1}`);
      b.mx = 40 + (b.x + w / 2) / w * 300; b.my = 30 + (b.z + hd) / d * 420;
      this.buttons.push(b);
    }
  }

  // ---------- flow ----------
  begin(run) {
    this.run = run; this.phase = 'ready'; this.readyT = 3; this.score = 0; this.presses = 0; this.t = 0; this.spawnT = 0;
    this.buttons.forEach(b => { b.lit = false; }); this.sinkT = null; this.result = null; this.maxLit = 0; this.impacted = false; this.impactAt = null;
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
      // bursts grow from 1 button to perLight as the game goes on (with a bit of randomness)
      if (this.spawnT <= 0) { this.spawnT = gap; this.lightSome(Math.max(1, Math.min(s.perLight, Math.floor(1 + (s.perLight - 1) * frac * 1.15 + Math.random() * 0.8)))); }
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
    this._waterAcc = (this._waterAcc || 0) + dt;
    if (this._waterAcc > 0.08) { this._waterAcc = 0; this._paintWater(t * 0.6); }
    for (const b of this.buttons || []) {
      if (b.flash > 0) b.flash -= dt;
      const pulse = 0.75 + 0.25 * Math.sin(t * 10 + b.i);
      if (b.flash > 0) b.mat.color.setRGB(1, 1, 1);
      else if (b.lit) b.mat.color.setRGB(0.35 * pulse, 0.75 * pulse, 1);
      else b.mat.color.copy(BLUE).multiplyScalar(0.22);
      b.halo.material.opacity = b.lit ? 0.35 + 0.35 * Math.sin(t * 10 + b.i) : 0;
    }
  }
  // 0..1 voyage progress: calm → iceberg passes the portholes → impact → sinking
  voyage() {
    if (this.phase === 'off' || this.phase === 'ready') return { p: 0, sink: 0, tt: 0 };
    const len = this.shell.settings.gameLength, p = Math.min(1, this.t / len);
    let sink = p < 0.85 ? 0 : (p - 0.85) / 0.15;
    if (this.phase === 'sinking') sink = Math.max(sink, Math.min(1, this.sinkT / 3.5));
    return { p, sink, tt: this.t, len };
  }
  draw() { this._drawPortholes(); this._drawMap(); }
  // One shared outside world. Each porthole is a window onto it at its own spot along the hull,
  // so anything drifting past (the iceberg, wave crests) reaches porthole 2 after porthole 1.
  _drawPortholes() {
    const { sink, tt, len } = this.voyage(), danger = this.buttons.length ? this.litCount() / this.buttons.length : 0;
    const t = this.time, K = 1024; // pixels per metre (0.5 m glass = 512 px)
    // iceberg enters view of porthole 1 at ~55% of the game and drifts toward the back of the ship
    const iceStart = (len || 180) * 0.55, s1 = this.portholes[0].s;
    const iceS = this.phase === 'off' || this.phase === 'ready' ? -99 : s1 - 0.6 + ICE_SPEED * (tt - iceStart);
    this.iceS = iceS;
    // impact the moment the berg is alongside porthole 2
    const s2 = this.portholes[1].s;
    if (this.phase === 'play' && iceS >= s2 && !this.impacted) { this.impacted = true; this.impactAt = t; this.shell.beep(70, 0.9, 'sawtooth', 0.18); }
    const tilt = danger * 0.18 + sink * 0.55 + Math.sin(t * 0.8) * 0.02 * (1 + danger * 3);
    const horizon = 300 - sink * 520;
    for (const S of this.portholes) {
      const ctx = S.ctx, W = 512, R = 256;
      ctx.clearRect(0, 0, W, W);
      ctx.save(); ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
      ctx.translate(R, R); ctx.rotate(tilt); ctx.translate(-R, -R);
      const toPx = (worldS) => R + (worldS - S.s) * K;
      // sky + stars (far away: no parallax, the same in both windows)
      const g = ctx.createLinearGradient(0, -200, 0, horizon); g.addColorStop(0, '#02040c'); g.addColorStop(1, '#0d1f3f'); ctx.fillStyle = g; ctx.fillRect(-300, -500, W + 600, horizon + 500);
      const rnd = (k) => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 60; i++) { const x = rnd(i + 1 + S.n * 100) * W, y = rnd(i + 99 + S.n * 100) * Math.max(10, horizon - 20); ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t + i)); ctx.fillRect(x, y, 2, 2); }
      ctx.globalAlpha = 1;
      if (S.n === 2) { ctx.beginPath(); ctx.arc(380, 110, 26, 0, Math.PI * 2); ctx.fillStyle = '#f3efd8'; ctx.fill(); }
      // iceberg in shared world coordinates
      if (iceS > -50) {
        const cx = toPx(iceS);
        if (cx > -400 && cx < W + 400) {
          ctx.save(); ctx.translate(cx, horizon + 30);
          ctx.beginPath(); ctx.moveTo(-210, 0); ctx.lineTo(-120, -150); ctx.lineTo(-60, -115); ctx.lineTo(10, -260); ctx.lineTo(80, -140); ctx.lineTo(140, -175); ctx.lineTo(220, 0); ctx.closePath();
          ctx.fillStyle = '#dff3ff'; ctx.fill(); ctx.strokeStyle = '#8fc6e8'; ctx.lineWidth = 6; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(10, -260); ctx.lineTo(0, -70); ctx.lineTo(-60, -115); ctx.strokeStyle = 'rgba(120,170,210,.6)'; ctx.lineWidth = 4; ctx.stroke();
          ctx.restore();
        }
      }
      // sea + wave crests moving past the hull (shared world coordinates, so they flow window to window)
      const sg = ctx.createLinearGradient(0, horizon, 0, horizon + 600); sg.addColorStop(0, '#0b3a6e'); sg.addColorStop(1, '#03101f');
      ctx.fillStyle = sg; ctx.fillRect(-300, horizon, W + 600, 1200);
      ctx.strokeStyle = 'rgba(140,200,255,.38)'; ctx.lineWidth = 3;
      const drift = t * 0.25; // how far the water has slid past (m)
      for (let k = 0; k < 9; k++) {
        const y = horizon + 12 + k * k * 6, amp = 2 + k, wl = 0.06 + k * 0.015; ctx.beginPath();
        for (let x = -300; x <= W + 300; x += 14) { const ws = S.s + (x - R) / K - drift * (0.4 + k * 0.12); ctx.lineTo(x, y + Math.sin(ws / wl) * amp); }
        ctx.stroke();
      }
      ctx.restore();
      // impact flash
      if (this.impactAt != null && t - this.impactAt < 0.6) { ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - (t - this.impactAt) / 0.6)})`; ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.fill(); }
      // underwater: dark water and bubbles once the glass is submerged
      if (sink > 0.55) {
        ctx.save(); ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = `rgba(2,12,30,${Math.min(0.9, (sink - 0.55) * 1.8)})`; ctx.fillRect(0, 0, W, W);
        ctx.strokeStyle = 'rgba(180,220,255,.7)'; ctx.lineWidth = 3;
        for (let i = 0; i < 24; i++) { const x = (i * 71 + S.n * 37) % W, y = W - ((t * (60 + i * 7) + i * 40) % (W + 40)); ctx.beginPath(); ctx.arc(x, y, 4 + i % 5 * 2, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      }
      if (danger > 0.4 && this.phase === 'play') { ctx.strokeStyle = `rgba(255,70,60,${(danger - 0.4) * 1.5 * (0.5 + 0.5 * Math.sin(t * 8))})`; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(R, R, R - 9, 0, Math.PI * 2); ctx.stroke(); }
      fit(ctx, String(S.n), 256, 500, 60, 26, { color: 'rgba(217,169,58,.9)', align: 'center' });
      S.commit();
    }
  }
  _drawMap() {
    const c = this.mapCanvas; if (!c) return; const ctx = c.getContext('2d'), W = c.width, H = c.height, spec = this.room.spec;
    ctx.fillStyle = '#060b14'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#6fa8dc'; ctx.lineWidth = 2; ctx.strokeRect(40, 30, 300, 420);
    const inset = SHIP_IN / spec.w * 300; ctx.strokeStyle = 'rgba(138,90,43,.9)'; ctx.setLineDash([6, 5]); ctx.strokeRect(40 + inset, 30, 300 - 2 * inset, 420); ctx.setLineDash([]);
    const dx = 40 + spec.door.x / spec.w * 300, dw = spec.door.width / spec.w * 300;
    ctx.strokeStyle = '#ffb547'; ctx.beginPath(); ctx.moveTo(dx - dw / 2, 452); ctx.lineTo(dx + dw / 2, 452); ctx.stroke();
    fit(ctx, 'DOOR', dx, 472, 80, 14, { color: '#ffb547', align: 'center', weight: 600 });
    fit(ctx, 'FIREPLACE', W / 2, 52, 120, 12, { color: '#d9a93a', align: 'center', weight: 600 });
    PORT_Z.forEach((z, i) => { const y = 30 + (z + spec.d / 2) / spec.d * 420, x = 40 + inset; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.strokeStyle = '#d9a93a'; ctx.stroke(); fit(ctx, String(i + 1), x + 22, y + 5, 20, 14, { color: '#d9a93a', weight: 700 }); });
    // iceberg position along the hull (outside the left wall)
    if (this.iceS != null && this.iceS > -2 && this.iceS < 3) { const y = 30 + (-this.iceS + spec.d / 2) / spec.d * 420; ctx.fillStyle = '#dff3ff'; ctx.beginPath(); ctx.moveTo(14, y + 12); ctx.lineTo(24, y - 12); ctx.lineTo(34, y + 12); ctx.fill(); }
    const t = this.time;
    for (const b of this.buttons) {
      ctx.beginPath(); ctx.arc(b.mx, b.my, b.lit ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = b.lit ? `rgba(90,190,255,${0.75 + 0.25 * Math.sin(t * 10 + b.i)})` : '#14305a'; ctx.fill();
      ctx.strokeStyle = b.y > 1.2 ? '#ffffff' : '#d9a93a'; ctx.lineWidth = 2; ctx.stroke();
    }
    const lit = this.litCount(), n = this.buttons.length, fail = this.shell.settings.failAt / 100;
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
      { label: 'Jump to iceberg', fn: () => { if (this.phase === 'play') { const L = this.shell.settings.gameLength; this.t = L * 0.55 - 1; this.shell.clock.left = L - this.t; this.impacted = false; } } },
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
  blurbs: { easy: 'Lights speed up to 3 at a time. Game over at 75% lit.', hard: 'Faster, up to 4 at a time. Game over at 65% lit.' },
  footnote: 'Click the blue buttons in the room or on the button map. The two portholes share one ocean: the iceberg passes porthole 1, then porthole 2, then the ship starts to sink.',
  game: new TitanicGame(),
});
shell.start();
window.__shell = shell; // handy for debugging in the browser console
