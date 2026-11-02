/* The dust behind /culture-capital: a few thousand glowing grains that take
   one shape per scene and drift between them. A shape is a list of target
   points; a free scene (drift, boil, ember) lets the grains move on a slow
   flow field instead. The pointer pushes grains aside. With reduced motion
   the grains jump straight to each shape and nothing animates. */

const SERIF = '"Instrument Serif", "Iowan Old Style", Georgia, serif';
const PINK = [236, 23, 143];
const EMBER = [255, 122, 74];
const BONE = [243, 238, 232];

// Shapes drawn from words: [text, font size, centre y].
const TEXT = {
  ten: (w, h) => ["10", Math.min(h * 0.62, w * 0.62), h * 0.4],
  fund: (w, h, small) => ["75M", Math.min(h * 0.5, w * (small ? 0.36 : 0.4)), h * (small ? 0.3 : 0.36)],
  love: (w, h, small) => ["love", Math.min(w * (small ? 0.34 : 0.24), h * 0.42), h * 0.36],
};
const FREE = { drift: { rise: 0, speed: 0.35, alpha: 0.55 }, boil: { rise: 0.55, speed: 0.6, alpha: 0.85 }, ember: { rise: 0.18, speed: 0.22, alpha: 0.28 } };

export class DustField {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.scene = "fund";
    this.cache = new Map();
    this.pointer = { x: -1e4, y: -1e4 };
    this.t = 0;
    this.raf = 0;
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    this.onMove = (e) => { this.pointer.x = e.clientX; this.pointer.y = e.clientY; };
    this.onLeave = () => { this.pointer.x = this.pointer.y = -1e4; };
    this.onVisible = () => { if (!document.hidden) this.start(); };
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onMove, { passive: true });
    document.addEventListener("pointerleave", this.onLeave);
    document.addEventListener("visibilitychange", this.onVisible);
    this.resize();
    // The text shapes need the serif; draw them again once it has loaded.
    document.fonts?.load(`italic 200px ${SERIF}`).then(() => {
      this.cache.clear();
      this.kick();
    }).catch(() => {});
    this.start();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.small = this.w < 760;
    const n = this.small ? 1400 : 2600;
    if (!this.x || this.x.length !== n) this.seed(n);
    this.cache.clear();
    this.kick();
  }

  seed(n) {
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.size = new Float32Array(n);
    this.tone = new Uint8Array(n); // 0 bone, 1 pink, 2 ember
    this.phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = Math.random() * window.innerWidth;
      this.y[i] = Math.random() * window.innerHeight;
      this.size[i] = 0.8 + Math.random() * Math.random() * 2.4;
      const r = Math.random();
      this.tone[i] = r < 0.12 ? 1 : r < 0.2 ? 2 : 0;
      this.phase[i] = Math.random() * Math.PI * 2;
    }
  }

  setScene(name) {
    if (name === this.scene) return;
    this.scene = name;
    this.kick();
  }

  kick() {
    if (this.reduced) {
      const target = this.targets(this.scene);
      if (target) for (let i = 0; i < this.n; i++) { this.x[i] = target[i * 2]; this.y[i] = target[i * 2 + 1]; }
      this.draw(FREE[this.scene]?.alpha ?? 0.9);
    }
  }

  start() {
    if (this.reduced || this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onMove);
    document.removeEventListener("pointerleave", this.onLeave);
    document.removeEventListener("visibilitychange", this.onVisible);
  }

  // Target points for a shaped scene, cached per viewport size; null = free.
  targets(scene) {
    if (FREE[scene]) return null;
    if (this.cache.has(scene)) return this.cache.get(scene);
    const { w, h, n, small } = this;
    const out = new Float32Array(n * 2);
    const put = (i, x, y) => { out[i * 2] = x; out[i * 2 + 1] = y; };
    if (TEXT[scene]) {
      const [text, size, y] = TEXT[scene](w, h, small);
      const pts = this.textPoints(text, size, w / 2, y);
      for (let i = 0; i < n; i++) {
        const p = pts.length ? pts[(Math.random() * pts.length) | 0] : [w / 2, h / 2];
        put(i, p[0] + (Math.random() - 0.5) * 1.6, p[1] + (Math.random() - 0.5) * 1.6);
      }
    } else if (scene === "rings") {
      const cx = small ? w / 2 : w * 0.68;
      const cy = small ? h * 0.36 : h / 2;
      const R = Math.min(small ? w * 0.46 : w * 0.3, h * 0.44);
      const rings = [[0, 0.05, 0.12], [0.22, 0.14, 0.012], [0.48, 0.24, 0.014], [1, 0.57, 0.05]]; // radius, share, spread
      let i = 0;
      rings.forEach(([r, share, spread], k) => {
        const count = k === rings.length - 1 ? n - i : Math.round(n * share);
        for (let j = 0; j < count; j++, i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = k === 0 ? Math.sqrt(Math.random()) * R * spread : R * (r + (Math.random() - 0.5) * spread * (k === 3 ? 2.4 : 1));
          put(i, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
      });
    } else if (scene === "ten-points") {
      const cx = w / 2;
      const cy = small ? h * 0.15 : h / 2;
      const R = small ? Math.min(w * 0.3, h * 0.09) : Math.min(w, h) * 0.38;
      for (let i = 0; i < n; i++) {
        const k = i % 10;
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const spread = Math.pow(Math.random(), 2.2) * (small ? 9 : 26);
        const b = Math.random() * Math.PI * 2;
        put(i, cx + Math.cos(a) * R * (small ? 1.6 : 1.35) + Math.cos(b) * spread, cy + Math.sin(a) * R + Math.sin(b) * spread);
      }
    } else if (scene === "reach") {
      // Ten bright cores, each with the crowd it moves around it.
      const cols = small ? 2 : 5;
      const rows = 10 / cols;
      const unit = Math.min(w / cols, h / rows);
      for (let i = 0; i < n; i++) {
        const k = i % 10;
        const cx = (w / cols) * ((k % cols) + 0.5) + Math.sin(k * 7.3) * unit * 0.12;
        const cy = (h / rows) * (Math.floor(k / cols) + 0.5) + Math.cos(k * 5.1) * unit * 0.12;
        const a = Math.random() * Math.PI * 2;
        const core = Math.random() < 0.18;
        const r = core ? Math.pow(Math.random(), 2) * 6 : unit * (0.12 + Math.pow(Math.random(), 0.8) * 0.42);
        put(i, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    } else if (scene === "split") {
      for (let i = 0; i < n; i++) {
        const left = i % 2 === 0;
        const cx = left ? w * (small ? 0.3 : 0.28) : w * (small ? 0.7 : 0.72);
        const cy = small ? h * 0.13 : h * 0.32;
        const a = Math.random() * Math.PI * 2;
        const unit = small ? w * 0.17 : Math.min(w, h) * 0.16;
        const r = Math.pow(Math.random(), 0.7) * unit;
        // Give = a soft cloud; invest = a ring that holds its shape.
        const rr = left ? r : unit * 0.82 + (Math.random() - 0.5) * (small ? 6 : 10);
        put(i, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
    } else if (scene === "city") {
      // A dotted map: grains on a grid inside a coast-like blob, Stockholm glowing.
      const sx = small ? w * 0.62 : w * 0.7;
      const sy = h * 0.4;
      const step = small ? 11 : 14;
      const grid = [];
      for (let gx = step / 2; gx < w; gx += step) {
        for (let gy = step / 2; gy < h; gy += step) {
          const dx = (gx - sx) / (w * 0.55);
          const dy = (gy - sy) / (h * 0.7);
          const wobble = Math.sin(gx * 0.011) * 0.18 + Math.cos(gy * 0.017) * 0.14;
          if (dx * dx + dy * dy < 1 + wobble) grid.push([gx, gy]);
        }
      }
      for (let i = 0; i < n; i++) {
        if (i < n * 0.2) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.pow(Math.random(), 2) * 30;
          put(i, sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        } else {
          const p = grid[(Math.random() * grid.length) | 0] || [sx, sy];
          put(i, p[0], p[1]);
        }
      }
    }
    this.cache.set(scene, out);
    return out;
  }

  textPoints(text, size, cx, cy) {
    const c = document.createElement("canvas");
    const s = 0.25; // sample at quarter size
    c.width = Math.max(1, Math.round(this.w * s));
    c.height = Math.max(1, Math.round(this.h * s));
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `italic 400 ${Math.round(size * s)}px ${SERIF}`;
    g.fillText(text, cx * s, cy * s);
    const { data } = g.getImageData(0, 0, c.width, c.height);
    const pts = [];
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] > 128) pts.push([(x + Math.random()) / s, (y + Math.random()) / s]);
      }
    }
    return pts;
  }

  frame() {
    this.raf = 0;
    if (document.hidden) return;
    this.t += 1;
    const { n, w, h, t, pointer } = this;
    const target = this.targets(this.scene);
    const free = FREE[this.scene];
    for (let i = 0; i < n; i++) {
      let ax = 0;
      let ay = 0;
      if (target) {
        const breath = Math.sin(t * 0.02 + this.phase[i]) * 0.35;
        ax = (target[i * 2] + breath - this.x[i]) * 0.012;
        ay = (target[i * 2 + 1] + breath - this.y[i]) * 0.012;
      } else {
        const a = Math.sin(this.x[i] * 0.0042 + t * 0.004) * 1.6 + Math.cos(this.y[i] * 0.0051 - t * 0.003) * 1.6 + this.phase[i] * 2;
        ax = Math.cos(a) * 0.05 * free.speed;
        ay = Math.sin(a) * 0.05 * free.speed - 0.03 * free.rise * (0.4 + this.size[i] / 2.5);
      }
      const dx = this.x[i] - pointer.x;
      const dy = this.y[i] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 14400) {
        const f = (1 - d2 / 14400) * 0.9;
        const d = Math.sqrt(d2) || 1;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }
      this.vx[i] = (this.vx[i] + ax) * (target ? 0.9 : 0.96);
      this.vy[i] = (this.vy[i] + ay) * (target ? 0.9 : 0.96);
      this.x[i] += this.vx[i];
      this.y[i] += this.vy[i];
      if (!target) {
        if (this.y[i] < -10) { this.y[i] = h + 10; this.x[i] = Math.random() * w; }
        if (this.y[i] > h + 10) this.y[i] = -10;
        if (this.x[i] < -10) this.x[i] = w + 10;
        if (this.x[i] > w + 10) this.x[i] = -10;
      }
    }
    this.draw(free ? free.alpha : 0.95);
    this.raf = requestAnimationFrame(this.frame);
  }

  draw(alpha) {
    const { ctx, n, w, h, t } = this;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    for (const tone of [0, 1, 2]) {
      const [r, g, b] = tone === 1 ? PINK : tone === 2 ? EMBER : BONE;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      for (let i = 0; i < n; i++) {
        if (this.tone[i] !== tone) continue;
        const twinkle = 0.7 + 0.3 * Math.sin(t * 0.03 + this.phase[i] * 3);
        ctx.globalAlpha = Math.min(1, alpha * twinkle * (tone === 0 ? 1.05 : 1.2));
        const s = this.size[i];
        ctx.fillRect(this.x[i] - s / 2, this.y[i] - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }
}
