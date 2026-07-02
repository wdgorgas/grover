/**
 * The Grover Orb, v2 — modeled on orb.jpg:
 * a dense dot-matrix sphere built from latitude scan-bands, with turbulent
 * radial displacement that burns hotter at the edges (core → violet →
 * magenta → gold), breathing bands, and soft additive glow.
 *
 * Stateful, not decoration (§16.1). Colors derive from CSS design tokens so
 * every theme recolors the orb. Mouse influence is a critically-damped
 * spring — it drifts toward the cursor and settles home; it never snaps.
 */

const STATES = {
  idle:      { turb: 0.16, speed: 0.10, pulse: 0.035, heat: 0.55, band: 0.5, label: 'Idle' },
  listening: { turb: 0.22, speed: 0.16, pulse: 0.06,  heat: 0.65, band: 0.9, label: 'Listening' },
  thinking:  { turb: 0.40, speed: 0.30, pulse: 0.05,  heat: 0.80, band: 1.4, label: 'Thinking' },
  memory:    { turb: 0.26, speed: 0.20, pulse: 0.05,  heat: 0.70, band: 0.8, stream: true, label: 'Reading memory' },
  tools:     { turb: 0.34, speed: 0.26, pulse: 0.05,  heat: 0.75, band: 1.1, label: 'Using tools' },
  frontier:  { turb: 0.52, speed: 0.34, pulse: 0.09,  heat: 1.0,  band: 1.7, gold: true, label: 'Frontier model' },
  approval:  { turb: 0.10, speed: 0.05, pulse: 0.16,  heat: 0.9,  band: 0.3, gold: true, label: 'Awaiting approval' },
  error:     { turb: 0.85, speed: 0.45, pulse: 0.04,  heat: 1.0,  band: 2.2, red: true, label: 'Blocked' },
  success:   { turb: 0.12, speed: 0.16, pulse: 0.20,  heat: 0.75, band: 0.6, label: 'Done' },
};

/**
 * Ambient overlays: when idle, the orb reflects what Grover is *working on*
 * (the active loop's status from /api/status) — a presence, not a screensaver.
 */
const AMBIENTS = {
  approved:  { turb: 0.20, speed: 0.14, pulse: 0.05,  heat: 0.62, band: 0.7, label: 'Loop queued' },
  running:   { turb: 0.30, speed: 0.22, pulse: 0.06,  heat: 0.72, band: 1.0, label: 'Loop running' },
  verifying: { turb: 0.22, speed: 0.18, pulse: 0.10,  heat: 0.85, band: 0.9, gold: true, label: 'Loop verifying' },
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
const lerp = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export class GroverOrb {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = 'idle';
    this.def = STATES.idle;
    this.p = { turb: 0.16, speed: 0.1, pulse: 0.035, heat: 0.55, band: 0.5 };
    this.flash = 0;
    this.t = 0;
    this.rot = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Color ramp (core → mid → hot → edge), re-read on theme change.
    this.readPalette();
    this.rampNow = this.ramp.map((c) => c.slice());

    // Spring-damped pointer influence: pos chases target, target chases mouse.
    this.ptr = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };

    // --- Build the dot lattice: latitude bands, like orb.jpg's scan lines ---
    this.dots = [];
    const BANDS = 44;
    for (let b = 0; b < BANDS; b++) {
      const phi = ((b + 0.5) / BANDS) * Math.PI;         // latitude 0..π
      const ringR = Math.sin(phi);
      const count = Math.max(6, Math.round(ringR * 110));
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2 + (b % 2) * (Math.PI / count);
        this.dots.push({
          phi, theta,
          y: Math.cos(phi),
          seed: Math.random() * 100,
          jag: Math.random(),                              // which dots spike
        });
      }
    }
    this.quality = 1; // adaptive: drops if frames are slow

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
    // 4-stop ramp: deep core → accent mid → hot → edge-burn.
    this.basePalette = {
      core: hexToRgb(cssColor('--orb-core', '#1b2a8f')),
      mid:  hexToRgb(cssColor('--orb-mid', '#6a3fd8')),
      hot:  hexToRgb(cssColor('--orb-hot', '#e0409a')),
      edge: hexToRgb(cssColor('--orb-edge', '#ffb454')),
      gold: hexToRgb(cssColor('--state-frontier', '#ffb703')),
      red:  hexToRgb(cssColor('--state-err', '#ff4d4d')),
      ok:   hexToRgb(cssColor('--state-ok', '#2ee6a8')),
    };
    this.ramp = this.currentRamp();
    if (!this.rampNow) this.rampNow = this.ramp.map((c) => c.slice());
  }

  currentRamp() {
    const P = this.basePalette;
    const d = this.def || STATES.idle;
    if (d.red)  return [P.core, mixRgb(P.mid, P.red, 0.5), P.red, mixRgb(P.red, P.edge, 0.4)];
    if (d.gold) return [mixRgb(P.core, P.gold, 0.15), mixRgb(P.mid, P.gold, 0.35), mixRgb(P.hot, P.gold, 0.5), P.gold];
    if (this.state === 'success') return [P.core, mixRgb(P.mid, P.ok, 0.4), P.ok, mixRgb(P.ok, P.edge, 0.3)];
    return [P.core, P.mid, P.hot, P.edge];
  }

  /** Reflect the active loop's status while idle (called from /api/status polling). */
  setAmbient(loopStatus) {
    this.ambient = AMBIENTS[loopStatus] ? loopStatus : null;
    if (this.state === 'idle') this.setState('idle');
  }

  setState(name, detail) {
    // Idle inherits the ambient overlay if a loop is in flight.
    if ((name === 'idle' || !STATES[name]) && this.ambient) {
      this.def = AMBIENTS[this.ambient];
      this.state = 'idle';
      this.ramp = this.currentRamp();
      const label = document.getElementById('orb-state-label');
      const det = document.getElementById('orb-state-detail');
      if (label) {
        label.textContent = this.def.label;
        const c = this.ramp[2];
        label.style.color = `rgb(${c.map(Math.round).join(',')})`;
      }
      if (det) det.textContent = detail || '';
      return;
    }
    this.def = STATES[name] || STATES.idle;
    this.state = STATES[name] ? name : 'idle';
    this.ramp = this.currentRamp();
    if (name === 'success') this.flash = 1;

    const label = document.getElementById('orb-state-label');
    const det = document.getElementById('orb-state-detail');
    if (label) {
      label.textContent = this.def.label;
      const c = this.ramp[2];
      label.style.color = `rgb(${c.map(Math.round).join(',')})`;
    }
    if (det) det.textContent = detail || '';

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

  // Cheap organic noise: three incommensurate sines per axis.
  noise(a, b) {
    return (
      Math.sin(a * 2.1 + b * 1.7 + this.t * 0.7) * 0.5 +
      Math.sin(a * 4.7 - b * 3.1 + this.t * 1.1) * 0.3 +
      Math.sin(a * 9.3 + b * 6.9 - this.t * 1.7) * 0.2
    );
  }

  frame(now) {
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.t += dt;

    // Adaptive quality: if the frame budget is blown, draw fewer dots.
    if (dt > 0.03 && this.quality > 0.5) this.quality -= 0.05;
    else if (dt < 0.02 && this.quality < 1) this.quality += 0.02;

    // Ease params toward the state's targets.
    const e = 1 - Math.pow(0.002, dt);
    const scale = this.reduced ? 0.35 : 1;
    this.p.turb = lerp(this.p.turb, this.def.turb * scale, e);
    this.p.speed = lerp(this.p.speed, this.def.speed * scale, e);
    this.p.pulse = lerp(this.p.pulse, this.def.pulse, e);
    this.p.heat = lerp(this.p.heat, this.def.heat, e);
    this.p.band = lerp(this.p.band, this.def.band * scale, e);
    for (let i = 0; i < 4; i++) this.rampNow[i] = mixRgb(this.rampNow[i], this.ramp[i], e);

    // Spring-damped pointer (stiffness k, damping c ≈ critical).
    const k = 26, c = 10;
    this.ptr.vx += (k * (this.ptr.tx - this.ptr.x) - c * this.ptr.vx) * dt;
    this.ptr.vy += (k * (this.ptr.ty - this.ptr.y) - c * this.ptr.vy) * dt;
    this.ptr.x += this.ptr.vx * dt;
    this.ptr.y += this.ptr.vy * dt;

    // Micro-life: irregular rotation drift + occasional surface glints, so
    // idle reads as alive rather than looping (docs/QUALITY_RUBRIC.md §3).
    this.rot += dt * this.p.speed * (1 + 0.18 * Math.sin(this.t * 0.13) + 0.07 * Math.sin(this.t * 0.041));
    this.flash = Math.max(0, this.flash - dt * 1.1);
    if (!this.reduced) {
      if (!this.glints) this.glints = [];
      const rate = this.state === 'idle' ? 0.5 : 1.6;
      if (this.glints.length < 5 && Math.random() < dt * rate) {
        const phi = Math.acos(2 * Math.random() - 1);
        const theta = Math.random() * Math.PI * 2;
        this.glints.push({ phi, theta, life: 1 });
      }
      for (const g of this.glints) g.life -= dt * 1.4;
      this.glints = this.glints.filter((g) => g.life > 0);
    }

    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  draw() {
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    // Breathe with an occasional heartbeat thump (sharp harmonic spike).
    const thump = Math.max(0, Math.sin(this.t * 0.9)) ** 12 * 0.045;
    const breathe = 1 + Math.sin(this.t * 1.5) * this.p.pulse + thump + this.flash * 0.10;
    const R = W * 0.285 * breathe;

    const [C0, C1, C2, C3] = this.rampNow;

    // Ambient halo.
    const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 2.0);
    halo.addColorStop(0, `rgba(${C1.map(Math.round)},${0.10 + this.flash * 0.15})`);
    halo.addColorStop(0.6, `rgba(${C2.map(Math.round)},0.035)`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    // View rotation: slow spin + gentle pointer-led tilt (spring value, so smooth).
    const ry = this.rot + this.ptr.x * 0.35;
    const rx = 0.35 + Math.sin(this.t * 0.22) * 0.10 + this.ptr.y * 0.28;
    const cosy = Math.cos(ry), siny = Math.sin(ry);
    const cosx = Math.cos(rx), sinx = Math.sin(rx);

    ctx.globalCompositeOperation = 'lighter';
    const dotBase = W / 480;
    const n = Math.floor(this.dots.length * this.quality);

    for (let i = 0; i < n; i++) {
      const d = this.dots[i];

      // Banded wave: latitude rings ripple (orb.jpg's horizontal striations).
      const bandWave = Math.sin(d.phi * 26 + this.t * (1.2 + this.p.band)) * 0.02 * this.p.band;

      // Turbulent radial displacement; jaggy dots spike harder (edge bristle).
      const nse = this.noise(d.theta * 1.3 + d.seed, d.phi * 2.2);
      const spike = d.jag > 0.82 ? 1.9 : 1.0;
      const disp = nse * this.p.turb * 0.16 * spike + bandWave;
      const r = 1 + disp;

      // Sphere → world
      const sp = Math.sin(d.phi) * r;
      let x = Math.cos(d.theta) * sp;
      let z = Math.sin(d.theta) * sp;
      let y = d.y * r;

      // Rotate Y then X
      const x1 = x * cosy - z * siny;
      const z1 = x * siny + z * cosy;
      const y1 = y * cosx - z1 * sinx;
      const z2 = y * sinx + z1 * cosx;

      const persp = 1 / (1 + z2 * 0.32);
      const sx = cx + x1 * R * persp;
      const sy = cy + y1 * R * persp;
      const depth = (1 - z2) / 2;                       // 0 back → 1 front

      // Color: silhouette edge + displacement = heat (orb.jpg's rim burn).
      const rimFactor = Math.min(1, Math.hypot(x1, y1) * 1.05);
      const heat = Math.min(1, (rimFactor * 0.72 + Math.abs(disp) * 3.4) * this.p.heat);
      let col;
      if (heat < 0.45) col = mixRgb(C0, C1, heat / 0.45);
      else if (heat < 0.78) col = mixRgb(C1, C2, (heat - 0.45) / 0.33);
      else col = mixRgb(C2, C3, (heat - 0.78) / 0.22);

      const alpha = (0.10 + depth * 0.5) * (0.55 + heat * 0.6) + this.flash * 0.18;
      const size = dotBase * (0.65 + depth * 0.95) * (1 + heat * 0.35);

      ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${alpha})`;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }

    // Glints: brief bright sparks on the sphere surface.
    if (this.glints && this.glints.length) {
      for (const g of this.glints) {
        const gs = Math.sin(g.phi);
        let gx = Math.cos(g.theta) * gs, gz = Math.sin(g.theta) * gs, gy = Math.cos(g.phi);
        const gx1 = gx * cosy - gz * siny;
        const gz1 = gx * siny + gz * cosy;
        const gy1 = gy * cosx - gz1 * sinx;
        const gz2 = gy * sinx + gz1 * cosx;
        if (gz2 > 0.1) continue; // back side — skip
        const gp = 1 / (1 + gz2 * 0.32);
        const a = Math.sin(Math.min(1, g.life) * Math.PI) * 0.9;
        ctx.fillStyle = `rgba(${C3.map(Math.round)},${a})`;
        ctx.beginPath();
        ctx.arc(cx + gx1 * R * gp, cy + gy1 * R * gp, dotBase * (1.6 + (1 - g.life) * 1.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Memory streams: motes drifting into the core.
    if (this.def.stream) {
      if (!this.motes) this.motes = Array.from({ length: 22 }, () => ({ p: Math.random(), a: Math.random() * Math.PI * 2 }));
      for (const m of this.motes) {
        m.p -= 0.006;
        if (m.p < 0.04) { m.p = 1; m.a = Math.random() * Math.PI * 2; }
        const d2 = R * (0.55 + m.p * 1.15);
        ctx.fillStyle = `rgba(${C1.map(Math.round)},${(1 - m.p) * 0.6})`;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(m.a) * d2, cy + Math.sin(m.a) * d2, dotBase * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
