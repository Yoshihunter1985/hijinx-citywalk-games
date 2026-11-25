// Canvas drawing helpers for in-room screens. Screens are plain canvases, so the
// same pixels show in the 3D room and in the side panel.

export const C = {
  bg: '#060b14', panel: '#0e1829', rule: '#1f3049', fg: '#e8f0fa', muted: '#8094ae',
  wire: '#6fa8dc', accent: '#ffb547', good: '#5fd38d', bad: '#ff6b62',
};
export const DISPLAY = '"Saira Condensed", "Arial Narrow", sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

export function rr(ctx, x, y, w, h, r = 12) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Draw text shrunk to fit maxW. Returns the size used.
export function fit(ctx, text, x, y, maxW, size, { weight = 700, family = DISPLAY, color = C.fg, align = 'left', base = 'alphabetic', min = 10 } = {}) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > min && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = `${weight} ${s}px ${family}`; }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
  ctx.fillText(text, x, y);
  return s;
}

export function wrap(ctx, text, x, y, maxW, lineH, { size = 22, weight = 400, family = MONO, color = C.fg, align = 'left', maxLines = 6 } = {}) {
  ctx.font = `${weight} ${size}px ${family}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y + n * lineH); n++; line = w; if (n >= maxLines) return n; }
    else line = t;
  }
  if (line) { ctx.fillText(line, x, y + n * lineH); n++; }
  return n;
}

export function clear(ctx, color = C.bg) {
  const { width: w, height: h } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  // subtle scanline grid so screens read as screens
  ctx.strokeStyle = 'rgba(111,168,220,0.05)'; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); ctx.stroke(); }
}

export function bar(ctx, x, y, w, h, frac, color) {
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
  const fw = Math.max(0, Math.min(1, frac)) * w;
  if (fw > 0) { rr(ctx, x, y, Math.max(h, fw), h, h / 2); ctx.fillStyle = color; ctx.fill(); }
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
export const fmtNum = (n) => Math.round(n).toLocaleString('en-AU');

// A clickable screen: keeps a list of hit regions that are rebuilt every draw.
export class Surface {
  constructor(screen) { this.screen = screen; this.canvas = screen.canvas; this.ctx = screen.ctx; this.hits = []; }
  begin() { this.hits = []; return this.ctx; }
  hit(x, y, w, h, fn) { this.hits.push({ x, y, w, h, fn }); }
  click(px, py) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const r = this.hits[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { r.fn(); return true; }
    }
    return false;
  }
  commit() { this.screen.update(); }
}
