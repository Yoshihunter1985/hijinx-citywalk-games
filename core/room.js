// Wireframe 3D room renderer shared by every game.
// Room is centred on the origin: x across (left -> right looking in from the door),
// y up, z from the back wall (-d/2) to the door wall (+d/2).
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';

export { THREE };

const WIRE = 0x6fa8dc, FAINT = 0x1f3049, DIM = 0x35506f;

export class Room3D {
  constructor(container, spec, opts = {}) {
    this.spec = spec;
    this.container = container;
    this.clickables = [];
    this.frameFns = [];
    this.onPick = opts.onPick || (() => {});

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    r.setClearColor(0x0a1220);
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 18;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(2, 5, 3); this.scene.add(dl);

    this._buildShell();
    this.setView('overview');

    this.tip = document.createElement('div'); this.tip.className = 'tip'; container.appendChild(this.tip);
    this._bindPointer();
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(container);
    this.resize();
    this._last = performance.now();
    const loop = (t) => {
      const dt = Math.min(0.1, (t - this._last) / 1000); this._last = t;
      for (const fn of this.frameFns) fn(dt, t / 1000);
      this.controls.update();
      r.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  onFrame(fn) { this.frameFns.push(fn); }

  // ---------- wall placement helpers ----------
  // u = metres along the wall, from the left end as you face that wall from inside
  // (front-outside: as you face it from the corridor). v = height above floor.
  wallPose(wall, u, v, inset = 0.012) {
    const { w, d } = this.spec;
    switch (wall) {
      case 'back':  return { pos: new THREE.Vector3(-w / 2 + u, v, -d / 2 + inset), rotY: 0 };
      case 'front': return { pos: new THREE.Vector3(w / 2 - u, v, d / 2 - inset), rotY: Math.PI };
      case 'left':  return { pos: new THREE.Vector3(-w / 2 + inset, v, d / 2 - u), rotY: Math.PI / 2 };
      case 'right': return { pos: new THREE.Vector3(w / 2 - inset, v, -d / 2 + u), rotY: -Math.PI / 2 };
      case 'outside': return { pos: new THREE.Vector3(-w / 2 + u, v, d / 2 + inset), rotY: 0 };
      default: throw new Error('unknown wall ' + wall);
    }
  }
  // door.x is measured from the left as you look in from the doorway (= along the back wall direction)
  doorX() { return -this.spec.w / 2 + this.spec.door.x; }

  // ---------- room shell ----------
  _buildShell() {
    const { w, d, h, door, cabinet } = this.spec;
    const g = this.shell = new THREE.Group(); this.scene.add(g);

    // floor grid (0.5 m)
    const pts = [];
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += 0.5) pts.push(x, 0, -d / 2, x, 0, d / 2);
    for (let z = -d / 2; z <= d / 2 + 1e-6; z += 0.5) pts.push(-w / 2, 0, z, w / 2, 0, z);
    g.add(lines(pts, FAINT));

    // faint wall fills for depth
    const fill = (W, H, pos, rotY) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ color: 0x6fa8dc, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
      m.position.copy(pos); m.rotation.y = rotY; g.add(m);
    };
    fill(w, h, new THREE.Vector3(0, h / 2, -d / 2), 0);
    fill(d, h, new THREE.Vector3(-w / 2, h / 2, 0), Math.PI / 2);
    fill(d, h, new THREE.Vector3(w / 2, h / 2, 0), Math.PI / 2);

    // room edges
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)).translate(0, h / 2, 0),
      new THREE.LineBasicMaterial({ color: WIRE })));

    // door opening + swing arc on the front wall
    const dx = this.doorX(), dw = door.width, dh = 2.04, z = d / 2;
    g.add(lines([dx - dw / 2, 0, z, dx - dw / 2, dh, z, dx - dw / 2, dh, z, dx + dw / 2, dh, z, dx + dw / 2, dh, z, dx + dw / 2, 0, z], 0xffb547));
    const arc = [];
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI / 2, a1 = ((i + 1) / 24) * Math.PI / 2;
      arc.push(dx + dw / 2 - Math.cos(a0) * dw, 0.002, z - Math.sin(a0) * dw, dx + dw / 2 - Math.cos(a1) * dw, 0.002, z - Math.sin(a1) * dw);
    }
    g.add(lines(arc, DIM));
    this.label('DOOR', new THREE.Vector3(dx, dh + 0.12, z + 0.02), { color: '#ffb547', size: 0.11 });

    // game cabinet
    if (cabinet) {
      const cx = -w / 2 + cabinet.x, cw = 0.6, cd = 0.5, ch = 1.1;
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(cw, ch, cd)),
        new THREE.LineBasicMaterial({ color: DIM }));
      box.position.set(cx, ch / 2, d / 2 - cd / 2 - 0.02); g.add(box);
      this.label('CABINET', new THREE.Vector3(cx, ch + 0.1, d / 2 - cd / 2), { color: '#8094ae', size: 0.08 });
    }
  }

  // ---------- screens: a canvas drawn by the game, shown on a wall ----------
  addScreen({ wall, u, v, width, height, px = [960, 540], frameColor = 0x6fa8dc, label }) {
    const canvas = document.createElement('canvas');
    canvas.width = px[0]; canvas.height = px[1];
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const pose = this.wallPose(wall, u, v, 0.02);
    mesh.position.copy(pose.pos); mesh.rotation.y = pose.rotY;
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(width + 0.04, height + 0.04)),
      new THREE.LineBasicMaterial({ color: frameColor }));
    frame.position.copy(pose.pos); frame.rotation.y = pose.rotY;
    this.scene.add(mesh, frame);
    if (label) {
      const lp = this.wallPose(wall, u, v + height / 2 + Math.min(0.09, height * 0.35), 0.03);
      this.label(label, lp.pos, { color: '#8094ae', size: Math.min(0.07, width * 0.12), rotY: lp.rotY, flat: true });
    }
    return { canvas, ctx: canvas.getContext('2d'), texture: tex, mesh, update() { tex.needsUpdate = true; } };
  }

  // ---------- props ----------
  // Turn any geometry into a wireframe prop: coloured edges + faint fill.
  wireMesh(geometry, color, { fillOpacity = 0.08, threshold = 20 } = {}) {
    const grp = new THREE.Group();
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false, side: THREE.DoubleSide });
    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    grp.add(new THREE.Mesh(geometry, fillMat));
    grp.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, threshold), lineMat));
    grp.userData.fillMat = fillMat; grp.userData.lineMat = lineMat;
    return grp;
  }

  clickable(obj, id, tipText) {
    obj.traverse(o => { o.userData.pickId = id; o.userData.tip = tipText; });
    this.clickables.push(obj);
  }

  // Text label as a sprite (always faces camera) or a flat plane (flat:true).
  label(text, pos, { color = '#d9e4f2', size = 0.1, rotY = 0, flat = false, font = '600 64px "Saira Condensed", "Arial Narrow", sans-serif' } = {}) {
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    ctx.font = font; const tw = Math.ceil(ctx.measureText(text).width) + 24;
    c.width = tw; c.height = 84;
    ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, tw / 2, 44);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const aspect = tw / 84;
    let obj;
    if (flat) {
      obj = new THREE.Mesh(new THREE.PlaneGeometry(size * aspect, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      obj.rotation.y = rotY;
    } else {
      obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      obj.scale.set(size * aspect, size, 1);
    }
    obj.position.copy(pos); this.scene.add(obj);
    return obj;
  }

  // ---------- camera ----------
  setView(name) {
    const { w, d, h } = this.spec;
    const cam = this.camera, t = this.controls.target;
    if (name === 'door') { cam.position.set(this.doorX(), 1.7, d / 2 - 0.15); t.set(this.doorX() * 0.3, 1.25, -d / 2); }
    else if (name === 'top') { cam.position.set(0, Math.max(w, d) * 1.55 + h, 0.01); t.set(0, 0, 0); }
    else if (name === 'outside') { const sx = -w / 2 + Math.max(0.25, this.spec.door.x - this.spec.door.width / 2 - 0.35); cam.position.set(sx + 0.15, 1.55, d / 2 + 1.0); t.set(sx + 0.15, 1.42, d / 2); }
    else { cam.position.set(w * 0.55, h * 1.9, d * 1.0); t.set(0, h * 0.3, -d * 0.18); }
    this.view = name;
    this.controls.update();
  }

  // ---------- picking ----------
  _bindPointer() {
    const el = this.renderer.domElement, ray = new THREE.Raycaster(), p = new THREE.Vector2();
    // Lines default to a 1 m pick radius in three.js, which let wireframe edges of nearby
    // objects steal clicks (e.g. the wrong light-floor tile). Pick lines only when very close.
    ray.params.Line.threshold = 0.005; ray.params.Points.threshold = 0.005;
    let down = null;
    const hit = (e) => {
      const r = el.getBoundingClientRect();
      p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, this.camera);
      const hs = ray.intersectObjects(this.clickables, true);
      this._lastHit = hs[0] || null;
      return hs.length ? hs[0].object : null;
    };
    el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    el.addEventListener('pointerup', e => {
      if (!down) return; const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
      if (moved > 6) return; // was an orbit drag
      const o = hit(e); if (o && o.userData.pickId != null) this.onPick(o.userData.pickId, this._lastHit);
    });
    el.addEventListener('pointermove', e => {
      const o = hit(e); el.style.cursor = o ? 'pointer' : 'grab';
      if (o && o.userData.tip) {
        const r = el.getBoundingClientRect();
        this.tip.textContent = o.userData.tip; this.tip.style.display = 'block';
        this.tip.style.left = (e.clientX - r.left + 14) + 'px'; this.tip.style.top = (e.clientY - r.top + 10) + 'px';
      } else this.tip.style.display = 'none';
    });
    el.addEventListener('pointerleave', () => { this.tip.style.display = 'none'; });
  }
}

function lines(arr, color) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
}
