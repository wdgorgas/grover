/**
 * Grover Orb v3 — ported from the Command Center v2 design
 * (GROVER Command Center v2.dc.html): a solid occluding body whose skin is
 * a dot lattice, with interior volume particles, nucleus glow, surface mesh
 * (latitude rings + sparse meridians), radial spikes where displacement runs
 * hot, glints, motes, and per-state motion. Colors come from CSS tokens, so
 * every skin recolors it; light themes switch compositing automatically.
 */

const MOTION = {
  idle:      { turb: 0.16, speed: 0.10, pulse: 0.035, heat: 0.55, band: 0.5, label: 'Idle', desc: 'awaiting input' },
  listening: { turb: 0.22, speed: 0.16, pulse: 0.06,  heat: 0.65, band: 0.9, mic: true, label: 'Listening', desc: 'capturing input' },
  thinking:  { turb: 0.40, speed: 0.30, pulse: 0.05,  heat: 0.80, band: 1.4, label: 'Reasoning', desc: 'planning approach' },
  memory:    { turb: 0.26, speed: 0.20, pulse: 0.05,  heat: 0.70, band: 0.8, stream: true, label: 'Memory', desc: 'reading the vault' },
  tools:     { turb: 0.34, speed: 0.26, pulse: 0.05,  heat: 0.75, band: 1.1, label: 'Tool use', desc: 'executing tools' },
  agents:    { turb: 0.30, speed: 0.24, pulse: 0.06,  heat: 0.80, band: 1.2, label: 'Agent team', desc: 'agents active' },
  coding:    { turb: 0.48, speed: 0.48, pulse: 0.04,  heat: 0.95, band: 2.4, create: true, label: 'Coding', desc: 'writing & testing' },
  frontier:  { turb: 0.52, speed: 0.34, pulse: 0.09,  heat: 1.0,  band: 1.7, gold: true, label: 'Frontier model', desc: 'high-attention mode' },
  approval:  { turb: 0.10, speed: 0.05, pulse: 0.16,  heat: 0.90, band: 0.3, gold: true, hold: true, label: 'Awaiting approval', desc: 'holding for you' },
  error:     { turb: 0.85, speed: 0.45, pulse: 0.04,  heat: 1.0,  band: 2.2, red: true, label: 'Blocked', desc: 'needs your input' },
  success:   { turb: 0.12, speed: 0.16, pulse: 0.20,  heat: 0.75, band: 0.6, ok: true, label: 'Done', desc: 'task complete' },
};

/** Ambient overlays: idle carries the active loop's status (PQ2 behavior). */
const AMBIENTS = {
  approved:  { ...MOTION.idle, turb: 0.20, speed: 0.14, heat: 0.62, band: 0.7, label: 'Loop queued', desc: 'plan approved' },
  running:   { ...MOTION.idle, turb: 0.30, speed: 0.22, pulse: 0.06, heat: 0.72, band: 1.0, label: 'Loop running', desc: 'work in flight' },
  verifying: { ...MOTION.idle, turb: 0.22, speed: 0.18, pulse: 0.10, heat: 0.85, band: 0.9, gold: true, label: 'Loop verifying', desc: 'checking the work' },
};

function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

export class GroverOrb {
  constructor(canvas) {
    this.canvas = canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = canvas.width; // markup sets the design resolution
    const px = Math.min(css * dpr, 1040);
    canvas.width = px;
    canvas.height = px;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle';
    this.def = MOTION.idle;
    this.ambient = null;
    this.p = { turb: 0.16, speed: 0.1, pulse: 0.035, heat: 0.55, band: 0.5 };
    this.rampNow = null;
    this.flash = 0; this.t = 0; this.rot = 0; this.quality = 1;
    this.ptr = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    this.glints = []; this.motes = null;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.readPalette();

    // Latitude-band lattice with ring bookkeeping for the mesh.
    const dots = [], rings = [];
    const BANDS = 40;
    for (let b = 0; b < BANDS; b++) {
      const phi = ((b + 0.5) / BANDS) * Math.PI;
      const count = Math.max(6, Math.round(Math.sin(phi) * 92));
      const start = dots.length;
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2 + (b % 2) * (Math.PI / count);
        dots.push({ phi, theta, y: Math.cos(phi), seed: Math.random() * 100, jag: Math.random() });
      }
      rings.push({ start, count });
    }
    // Sparse meridians: every 5th dot links to nearest-by-theta in next ring.
    const merid = [];
    for (let b = 0; b < BANDS - 1; b++) {
      const A = rings[b], B = rings[b + 1];
      for (let i = 0; i < A.count; i += 5) {
        const th = dots[A.start + i].theta;
        let best = 0, bd = 9;
        for (let j = 0; j < B.count; j++) {
          const d2 = Math.abs(((dots[B.start + j].theta - th + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (d2 < bd) { bd = d2; best = j; }
        }
        merid.push([A.start + i, B.start + best]);
      }
    }
    this.dots = dots; this.rings = rings; this.merid = merid;

    // Interior volume particles — the orb is a body, not a shell.
    const inner = [];
    for (let i = 0; i < (this.reduced ? 500 : 1500); i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const sq = Math.sqrt(1 - u * u);
      inner.push({
        x: Math.cos(th) * sq, y: u, z: Math.sin(th) * sq,
        rr: Math.cbrt(Math.random()) * 0.92, seed: Math.random() * 6.28,
        hbase: Math.pow(Math.random(), 1.4) * 0.8, ember: Math.random() > 0.9,
      });
    }
    this.inner = inner;

    const NP = dots.length;
    this.px = new Float32Array(NP); this.py = new Float32Array(NP);
    this.bx = new Float32Array(NP); this.by = new Float32Array(NP);
    this.dep = new Float32Array(NP); this.heat = new Float32Array(NP); this.dsp = new Float32Array(NP);

    const wrap = canvas.parentElement;
    wrap.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.ptr.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.ptr.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    wrap.addEventListener('pointerleave', () => { this.ptr.tx = 0; this.ptr.ty = 0; });

    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  readPalette() {
    this.pal = {
      core: hexToRgb(cssColor('--orb-core', '#292350')),
      mid:  hexToRgb(cssColor('--orb-mid', '#7a68c9')),
      hot:  hexToRgb(cssColor('--orb-hot', '#d9799d')),
      edge: hexToRgb(cssColor('--orb-edge', '#f0b46f')),
      gold: hexToRgb(cssColor('--state-frontier', '#eeb069')),
      red:  hexToRgb(cssColor('--state-err', '#e0705f')),
      ok:   hexToRgb(cssColor('--state-ok', '#8fca9c')),
      create: hexToRgb(cssColor('--state-create', '#e88aa8')),
    };
    // Light theme? Judge by --bg luminance.
    const bg = hexToRgb(cssColor('--bg', '#0e0d13'));
    this.light = (bg[0] * 0.299 + bg[1] * 0.587 + bg[2] * 0.114) > 128;
  }

  targetRamp() {
    const P = this.pal, M = this.def;
    if (M.red)    return [P.core, mix(P.mid, P.red, 0.5), P.red, mix(P.red, P.edge, 0.4)];
    if (M.gold)   return [mix(P.core, P.gold, 0.15), mix(P.mid, P.gold, 0.35), mix(P.hot, P.gold, 0.5), P.gold];
    if (M.ok)     return [P.core, mix(P.mid, P.ok, 0.4), P.ok, mix(P.ok, P.edge, 0.3)];
    if (M.create) return [P.core, mix(P.mid, P.create, 0.35), mix(P.hot, P.create, 0.6), mix(P.create, P.edge, 0.35)];
    return [P.core, P.mid, P.hot, P.edge];
  }

  setAmbient(loopStatus) {
    this.ambient = AMBIENTS[loopStatus] ? loopStatus : null;
    if (this.state === 'idle') this.setState('idle');
  }

  setState(name, detail) {
    if ((name === 'idle' || !MOTION[name]) && this.ambient) {
      this.def = AMBIENTS[this.ambient];
      this.state = 'idle';
    } else {
      this.def = MOTION[name] || MOTION.idle;
      this.state = MOTION[name] ? name : 'idle';
    }
    if (name === 'success') this.flash = 1;
    const label = document.getElementById('orb-state-label');
    const det = document.getElementById('orb-state-detail');
    if (label) {
      label.textContent = this.def.label;
      const c = this.targetRamp()[2];
      label.style.color = `rgb(${c.map(Math.round).join(',')})`;
    }
    if (det) det.textContent = detail || this.def.desc || '';
    // v2 chrome reacts to the state color: --sc tints the ring, composer,
    // context dots and footer; --agent-op reveals the orbiting satellites.
    const stateVar = {
      idle: '--state-idle', listening: '--state-idle', thinking: '--state-think',
      memory: '--state-think', tools: '--state-idle', agents: '--state-think',
      coding: '--state-create', frontier: '--state-frontier', approval: '--state-warn',
      error: '--state-err', success: '--state-ok',
    }[this.state] || '--state-idle';
    document.documentElement.style.setProperty('--sc', `var(${stateVar})`);
    document.documentElement.style.setProperty('--agent-op', this.state === 'agents' ? '1' : '0');
    const foot = document.getElementById('foot-state');
    if (foot) foot.textContent = `● ${this.def.label}`;
    document.querySelectorAll('#state-chips button').forEach((b) => {
      b.classList.toggle('on', b.dataset.state === this.state);
    });
    if (name === 'success') {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.setState('idle'), 2400);
    } else if (name === 'error') {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.setState('idle'), 3800);
    }
  }

  refreshTheme() {
    this.readPalette();
    this.setState(this.state);
  }

  frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.t += dt;
    if (dt > 0.03 && this.quality > 0.5) this.quality -= 0.05;
    else if (dt < 0.02 && this.quality < 1) this.quality += 0.02;

    const M = this.def;
    const scale = this.reduced ? 0.35 : 1;
    const e = 1 - Math.pow(0.002, dt);
    this.p.turb += (M.turb * scale - this.p.turb) * e;
    this.p.speed += (M.speed * scale - this.p.speed) * e;
    this.p.pulse += (M.pulse - this.p.pulse) * e;
    this.p.heat += (M.heat - this.p.heat) * e;
    this.p.band += (M.band * scale - this.p.band) * e;

    const ramp = this.targetRamp();
    if (!this.rampNow) this.rampNow = ramp.map((c) => c.slice());
    for (let i = 0; i < 4; i++) this.rampNow[i] = mix(this.rampNow[i], ramp[i], e);

    const k = 26, c = 10;
    this.ptr.vx += (k * (this.ptr.tx - this.ptr.x) - c * this.ptr.vx) * dt;
    this.ptr.vy += (k * (this.ptr.ty - this.ptr.y) - c * this.ptr.vy) * dt;
    this.ptr.x += this.ptr.vx * dt; this.ptr.y += this.ptr.vy * dt;

    this.rot += dt * this.p.speed * (1 + 0.18 * Math.sin(this.t * 0.13) + 0.07 * Math.sin(this.t * 0.041));
    this.flash = Math.max(0, this.flash - dt * 1.1);
    if (!this.reduced) {
      const rate = this.state === 'idle' ? 0.5 : 1.6;
      if (this.glints.length < 5 && Math.random() < dt * rate) {
        this.glints.push({ phi: Math.acos(2 * Math.random() - 1), theta: Math.random() * Math.PI * 2, life: 1 });
      }
      for (const g of this.glints) g.life -= dt * 1.4;
      this.glints = this.glints.filter((g) => g.life > 0);
    }

    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  draw() {
    const { ctx, canvas } = this;
    const W = canvas.width;
    ctx.clearRect(0, 0, W, W);
    const cx = W / 2, cy = W / 2;
    const M = this.def, light = this.light;

    let mic = 1;
    if (M.mic) mic = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 2.1) * Math.sin(this.t * 3.7) + 0.3 * Math.sin(this.t * 9));
    if (M.hold) mic = 0.8 + 0.25 * Math.sin(this.t * 1.6);
    const thump = Math.max(0, Math.sin(this.t * 0.9)) ** 12 * 0.045;
    const breathe = 1 + Math.sin(this.t * 1.5) * this.p.pulse + thump + this.flash * 0.10;
    const R = W * 0.30 * breathe;
    const [C0, C1, C2, C3] = this.rampNow;

    // Ambient halo
    const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2);
    halo.addColorStop(0, rgba(C1, (light ? 0.07 : 0.10) + this.flash * 0.15));
    halo.addColorStop(0.6, rgba(C2, light ? 0.02 : 0.035));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, W);

    const ry = this.rot + this.ptr.x * 0.35;
    const rx = 0.35 + Math.sin(this.t * 0.22) * 0.10 + this.ptr.y * 0.28;
    const cosy = Math.cos(ry), siny = Math.sin(ry), cosx = Math.cos(rx), sinx = Math.sin(rx);

    // Solid occluding body — the lattice is its skin.
    const bodyR = R * 1.005;
    const bodyLit = mix(C0, C1, 0.55);
    const bodyDark = [C0[0] * 0.38, C0[1] * 0.38, C0[2] * 0.42];
    const bgrad = ctx.createRadialGradient(cx - bodyR * 0.32, cy - bodyR * 0.36, bodyR * 0.05, cx, cy, bodyR);
    bgrad.addColorStop(0, rgba(bodyLit, light ? 0.22 : 0.94));
    bgrad.addColorStop(0.55, rgba(C0, light ? 0.15 : 0.92));
    bgrad.addColorStop(0.95, rgba(bodyDark, light ? 0.10 : 0.90));
    bgrad.addColorStop(1, rgba(bodyDark, 0));
    ctx.fillStyle = bgrad;
    ctx.beginPath(); ctx.arc(cx, cy, bodyR, 0, Math.PI * 2); ctx.fill();
    const rimg = ctx.createRadialGradient(cx, cy, bodyR * 0.8, cx, cy, bodyR);
    rimg.addColorStop(0, 'rgba(0,0,0,0)');
    rimg.addColorStop(0.85, rgba(C2, light ? 0.12 : 0.22));
    rimg.addColorStop(1, rgba(C2, 0));
    ctx.fillStyle = rimg;
    ctx.beginPath(); ctx.arc(cx, cy, bodyR, 0, Math.PI * 2); ctx.fill();

    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    const dotBase = W / 480;
    const turb = this.p.turb * mic;
    const { dots, px, py, bx, by, dep, heat, dsp } = this;
    const NP = dots.length;

    // Project every lattice point twice: displaced + base surface.
    for (let i = 0; i < NP; i++) {
      const dd = dots[i];
      const bandWave = Math.sin(dd.phi * 26 + this.t * (1.2 + this.p.band)) * 0.02 * this.p.band;
      const nse = Math.sin(dd.theta * 2.1 + dd.phi * 1.7 + this.t * 0.7 + dd.seed) * 0.5 +
                  Math.sin(dd.theta * 4.7 - dd.phi * 3.1 + this.t * 1.1) * 0.3 +
                  Math.sin(dd.theta * 9.3 + dd.phi * 6.9 - this.t * 1.7 + dd.seed) * 0.2;
      const spike = dd.jag > 0.82 ? 1.9 : 1.0;
      const disp = nse * turb * 0.16 * spike + bandWave;
      dsp[i] = disp;
      for (let pass = 0; pass < 2; pass++) {
        const r = pass === 0 ? 1 + disp : 1 + bandWave;
        const sp = Math.sin(dd.phi) * r;
        const x = Math.cos(dd.theta) * sp, z = Math.sin(dd.theta) * sp, y = dd.y * r;
        const x1 = x * cosy - z * siny, z1 = x * siny + z * cosy;
        const y1 = y * cosx - z1 * sinx, z2 = y * sinx + z1 * cosx;
        const persp = 1 / (1 + z2 * 0.32);
        if (pass === 0) {
          px[i] = cx + x1 * R * persp; py[i] = cy + y1 * R * persp;
          dep[i] = (1 - z2) / 2;
          const rim = Math.min(1, Math.hypot(x1, y1) * 1.05);
          heat[i] = Math.min(1, (rim * 0.72 + Math.abs(disp) * 3.4) * this.p.heat);
        } else {
          bx[i] = cx + x1 * R * persp; by[i] = cy + y1 * R * persp;
        }
      }
    }

    const colOf = (h) => {
      if (h < 0.45) return mix(C0, C1, h / 0.45);
      if (h < 0.78) return mix(C1, C2, (h - 0.45) / 0.33);
      return mix(C2, C3, (h - 0.78) / 0.22);
    };

    // Interior: nucleus glow + drifting volume particles.
    const ry2 = ry * 0.7, cosy2 = Math.cos(ry2), siny2 = Math.sin(ry2);
    const ng = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.68);
    ng.addColorStop(0, rgba(C2, (light ? 0.14 : 0.22) + this.flash * 0.18));
    ng.addColorStop(0.42, rgba(C1, light ? 0.11 : 0.19));
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ng;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.68, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < this.inner.length; i++) {
      const q = this.inner[i];
      const rr = q.rr * (1 + Math.sin(this.t * 0.6 + q.seed) * 0.05);
      const x = q.x * rr, z = q.z * rr, y = q.y * rr;
      const x1 = x * cosy2 - z * siny2, z1 = x * siny2 + z * cosy2;
      const y1 = y * cosx - z1 * sinx, z2 = y * sinx + z1 * cosx;
      const persp = 1 / (1 + z2 * 0.32);
      const sx = cx + x1 * R * persp, sy = cy + y1 * R * persp;
      const dp = (1 - z2) / 2, inw = 1 - q.rr;
      const shimmer = 0.5 + 0.5 * Math.sin(this.t * 0.45 + q.seed * 2);
      const cc = q.ember ? colOf(0.82 + shimmer * 0.15) : colOf(Math.min(1, q.hbase + inw * 0.3 + shimmer * 0.18));
      const al = (light ? 0.22 + dp * 0.4 : 0.16 + dp * 0.38) * (0.5 + inw) + this.flash * 0.1;
      const sz = dotBase * (0.85 + dp * 0.85 + inw);
      ctx.fillStyle = rgba(cc, al);
      ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
    }

    // Surface mesh: latitude rings (every 2nd point) + sparse meridians.
    const meshK = 0.55;
    ctx.lineWidth = W / 1040;
    for (let b = 0; b < this.rings.length; b++) {
      const rg = this.rings[b];
      for (let i = 0; i < rg.count; i += 2) {
        const a = rg.start + i, b2 = rg.start + ((i + 2) % rg.count);
        const dp = (dep[a] + dep[b2]) / 2;
        if (dp < 0.35) continue;
        const cc = colOf((heat[a] + heat[b2]) / 2);
        ctx.strokeStyle = rgba(cc, (light ? 0.10 * dp : 0.05 + 0.16 * dp) * meshK);
        ctx.beginPath(); ctx.moveTo(bx[a], by[a]); ctx.lineTo(bx[b2], by[b2]); ctx.stroke();
      }
    }
    for (let m = 0; m < this.merid.length; m++) {
      const [a, b2] = this.merid[m];
      const dp = (dep[a] + dep[b2]) / 2;
      if (dp < 0.4) continue;
      const cc = colOf((heat[a] + heat[b2]) / 2);
      ctx.strokeStyle = rgba(cc, (light ? 0.09 : 0.04 + 0.13 * dp) * meshK);
      ctx.beginPath(); ctx.moveTo(bx[a], by[a]); ctx.lineTo(bx[b2], by[b2]); ctx.stroke();
    }

    // Radial spikes where displacement runs hot.
    ctx.lineWidth = (W / 1040) * 1.45;
    const spikeTh = 0.045 + (1 - Math.min(1, turb * 2.2)) * 0.06;
    for (let i = 0; i < NP; i++) {
      if (dsp[i] < spikeTh) continue;
      const cc = colOf(Math.min(1, heat[i] * 1.15));
      ctx.strokeStyle = rgba(cc, light ? 0.45 : 0.12 + 0.38 * dep[i]);
      ctx.beginPath(); ctx.moveTo(bx[i], by[i]); ctx.lineTo(px[i], py[i]); ctx.stroke();
    }

    // Dot matrix skin.
    const n = Math.floor(NP * this.quality);
    for (let i = 0; i < n; i++) {
      const cc = colOf(heat[i]);
      const alpha = (light ? 0.15 + dep[i] * 0.55 : 0.10 + dep[i] * 0.5) * (0.55 + heat[i] * 0.6) + this.flash * 0.18;
      const size = dotBase * (0.65 + dep[i] * 0.95) * (1 + heat[i] * 0.35);
      ctx.fillStyle = rgba(cc, alpha);
      ctx.fillRect(px[i] - size / 2, py[i] - size / 2, size, size);
    }

    // Glints.
    for (const g of this.glints) {
      const gs = Math.sin(g.phi);
      const gx = Math.cos(g.theta) * gs, gz = Math.sin(g.theta) * gs, gy = Math.cos(g.phi);
      const gx1 = gx * cosy - gz * siny, gz1 = gx * siny + gz * cosy;
      const gy1 = gy * cosx - gz1 * sinx, gz2 = gy * sinx + gz1 * cosx;
      if (gz2 > 0.1) continue;
      const gp = 1 / (1 + gz2 * 0.32);
      ctx.fillStyle = rgba(C3, Math.sin(Math.min(1, g.life) * Math.PI) * 0.9);
      ctx.beginPath();
      ctx.arc(cx + gx1 * R * gp, cy + gy1 * R * gp, dotBase * (1.6 + (1 - g.life) * 1.2), 0, Math.PI * 2);
      ctx.fill();
    }

    // Memory motes drifting inward.
    if (M.stream) {
      if (!this.motes) this.motes = Array.from({ length: 22 }, () => ({ p: Math.random(), a: Math.random() * Math.PI * 2 }));
      for (const m of this.motes) {
        m.p -= 0.006;
        if (m.p < 0.04) { m.p = 1; m.a = Math.random() * Math.PI * 2; }
        const d2 = R * (0.55 + m.p * 1.15);
        ctx.fillStyle = rgba(C1, (1 - m.p) * 0.6);
        ctx.beginPath(); ctx.arc(cx + Math.cos(m.a) * d2, cy + Math.sin(m.a) * d2, dotBase * 1.4, 0, Math.PI * 2); ctx.fill();
      }
    } else this.motes = null;

    ctx.globalCompositeOperation = 'source-over';
  }
}
