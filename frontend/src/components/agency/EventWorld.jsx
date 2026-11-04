import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "./i18n.js";

/* The event tool page's opening (/eventverktyg), one pinned scene played by
   scrolling, in the same language as the front page's FunnelWorld:
   0. the hero on pink: a crowd of dots, the city, drifting;
   1. one event, one link: pink fades to black and an event page appears;
   2. they sign up: the dots fly into the page one by one, the count climbs;
   3. the room fills: the list becomes a room of 120 seats with a stage, the
      rest queue on the waitlist, and people are checked in at the door;
   4. they come back: the room turns into a world of your own people, the CRM,
      the ones who want to hear more glowing pink.
   Plain canvas. Positions are a function of scroll (plus a little drift), so
   scrolling back plays it backwards. Reduced motion keeps the scroll and drops
   the drift. The hero's text is passed in as children. Every step's text is
   in the markup, so the pre-rendered page reads in full. */

const SEATS = 120;
const WAIT = 12;
const N = SEATS + WAIT;
const COLS = 12;
const AMBIENT = 260;
const AT = { dark: [0.01, 0.12], phone: [0.07, 0.15], stream: [0.2, 0.5], room: [0.52, 0.62], door: [0.6, 0.74], crm: [0.76, 0.92] };
const STEPS = [
  { at: 0.07, title: "One event. One link.", line: "Title, time, place and your own look. The page is ready in a minute and looks sharp wherever you share it." },
  { at: 0.2, title: "They sign up.", line: "Name and email. No app, no account. Everyone gets a confirmation with a calendar invite, and you watch the list grow." },
  { at: 0.52, title: "The room fills.", line: "Set the number of spots. When it's full, the next person lands on the waitlist, automatically. At the door you check off who came." },
  { at: 0.76, title: "They come back.", line: "Everyone who came lands in your own CRM: how often they've been and who wants to hear more. Next time you invite them in one go." },
];
const CRM_WORDS = ["Regular", "Came 3 times", "Wants more", "New", "Plus one", "Said yes", "First time", "VIP"];

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function fibonacci(i, n) {
  const y = 1 - (i / Math.max(1, n - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = i * 2.399963;
  return [Math.cos(th) * r, y, Math.sin(th) * r];
}
const smooth = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const clamp = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, k) => a + (b - a) * k;
const span = (p, [a, b]) => clamp((p - a) / (b - a));
// The page's accent, as the negative turns it (see NEGATIVE_GRADIENT below):
// cyan, cornflower, lavender, sepia. Each dot gets one, so the glowing ones
// read as the same gradient as the hero.
const TINTS = [[236, 23, 143], [240, 74, 106], [232, 96, 74], [111, 138, 94]];
const rgbaOf = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const INK = [10, 10, 10];
const WHITE = [255, 255, 255];
const mixc = (a, b, k) => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

function guests() {
  const rand = seeded(41);
  // Who signs up when: mostly in order, a little shuffled, so it reads as a stream.
  const order = Array.from({ length: N }, (_, i) => i).map((i) => ({ i, k: i + rand() * 18 })).sort((a, b) => a.k - b.k);
  const when = new Array(N);
  order.forEach(({ i }, n) => { when[i] = n / N; });
  return Array.from({ length: N }, (_, i) => ({
    u: rand(),
    v: rand(),
    vx: (rand() - 0.5) * 0.02,
    vy: (rand() - 0.5) * 0.014,
    when: when[i],
    door: rand(),
    more: rand() < 0.62,
    sphere: fibonacci(i, N),
    // Where it stands in the hero's crowd: a loose disc, denser in the middle.
    ca: rand() * Math.PI * 2,
    cr: Math.sqrt(rand()) * 0.95,
    cw: 0.15 + rand() * 0.25,
    size: 0.85 + rand() * 0.4,
    tint: TINTS[Math.min(3, Math.floor(rand() ** 1.3 * 4))],
  }));
}
function ambient() {
  const rand = seeded(7);
  return Array.from({ length: AMBIENT }, () => ({ u: rand(), v: rand(), vx: (rand() - 0.5) * 0.03, vy: (rand() - 0.5) * 0.02, s: 0.5 + rand() * 0.9, o: rand() }));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function EventWorld({ children }) {
  const t = useT();
  const lang = useLang();
  const wrap = useRef(null);
  const ref = useRef(null);
  const pinkRef = useRef(null);
  const heroRef = useRef(null);
  const readRef = useRef(null);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    const canvas = ref.current;
    const box = wrap.current;
    if (!canvas || !box) return undefined;
    const ctx = canvas.getContext("2d");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pts = guests();
    const dust = ambient();
    const font = getComputedStyle(canvas).fontFamily;
    const mono = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
    const words = CRM_WORDS.map((w, i) => ({ word: t(w), at: fibonacci(i, CRM_WORDS.length) }));
    const label = {
      title: t("Release party"),
      when: t("Sat 7 Nov · 19:00"),
      cta: t("Sign up"),
      stage: t("Stage").toUpperCase(),
      wait: t("Waitlist").toUpperCase(),
      of: (n) => t(`${n} of 120 coming`),
    };
    const start = performance.now();
    let last = start;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let shown = -1;
    let p = -1;
    let tone = -1;

    const size = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(r.width * r.height > 700000 ? 1.5 : 2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    function draw(now) {
      const time = still ? 0 : (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const r = box.getBoundingClientRect();
      const target = clamp(-r.top / Math.max(1, r.height - window.innerHeight));
      p = still || p < 0 ? target : p + (target - p) * (1 - Math.exp(-dt * 9));
      if (Math.abs(target - p) < 0.0003) p = target;
      const at = STEPS.reduce((n, s, i) => (p >= s.at ? i : n), -1);
      if (at !== shown) {
        shown = at;
        setStep(at);
      }

      const dark = smooth(span(p, AT.dark));
      const phoneIn = smooth(span(p, AT.phone));
      const q = span(p, AT.stream);
      const room = smooth(span(p, AT.room));
      const door = span(p, AT.door);
      const crm = smooth(span(p, AT.crm));
      const crowdK = 1 - smooth(span(p, [0.015, 0.14]));

      const toneNow = Math.round(dark * 500) / 500;
      if (toneNow !== tone) {
        tone = toneNow;
        if (pinkRef.current) pinkRef.current.style.opacity = String(1 - tone);
        document.documentElement.style.setProperty("--pc-tone", String(tone));
      }
      if (heroRef.current) {
        const k = clamp(p / 0.06);
        heroRef.current.style.opacity = String(1 - k);
        heroRef.current.style.transform = `translateY(${-k * 40}px)`;
        heroRef.current.style.visibility = k >= 1 ? "hidden" : "visible";
      }

      const phone = w < 760;
      // The scene's centre: right of the text on desktop, under it on phones.
      const below = phone && readRef.current ? readRef.current.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top + 24 : 0;
      const cx = phone ? w * 0.5 : w * 0.68;
      const top = phone ? Math.max(h * 0.4, below) : h * 0.1;
      const room0 = phone ? h - top - 24 : h * 0.8;
      const cy = top + room0 / 2;

      // The event page.
      const pw = phone ? Math.min(w * 0.5, room0 * 0.5, 210) : Math.min(w * 0.21, h * 0.4, 300);
      const ph = Math.min(pw * 1.95, room0);
      const px = cx - pw / 2;
      const py = cy - ph / 2;
      const gx0 = px + pw * 0.09;
      const gw = pw * 0.82;
      const gy0 = py + ph * 0.56;
      const cell = gw / COLS;
      const listSlot = (i) => [gx0 + cell * ((i % COLS) + 0.5), gy0 + cell * (Math.floor(i / COLS) + 0.5) * 0.9];

      // The room: 12 × 10 seats under a stage, the waitlist in a row below.
      const rw = phone ? Math.min(w * 0.84, room0 * 0.7) : Math.min(w * 0.4, h * 0.62, 560);
      const seat = rw / COLS;
      const rh = seat * 10;
      const rx = cx - rw / 2;
      const ry = cy - rh / 2 + seat * 0.2;
      const seatSlot = (i) => i < SEATS
        ? [rx + seat * ((i % COLS) + 0.5), ry + seat * (Math.floor(i / COLS) + 0.5)]
        : [rx + seat * (i - SEATS + 0.5), ry + rh + seat * 1.6];

      // The CRM world.
      const R = phone ? Math.min(w * 0.36, room0 * 0.4) : Math.min(w * 0.19, h * 0.33);
      const spin = time * 0.2 + crm * 1.4;
      const cs = Math.cos(spin);
      const sn = Math.sin(spin);
      const ct = Math.cos(0.4);
      const st = Math.sin(0.4);
      const sphere = ([sx, sy, sz], RR) => {
        const x = sx * cs - sz * sn;
        let z = sx * sn + sz * cs;
        const y = sy * ct - z * st;
        z = sy * st + z * ct;
        const s = 3.2 / (3.2 - z);
        return [cx + x * RR * s, cy + y * RR * s, z];
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Dust: the city around the event, gone once the page takes over.
      const dustA = 1 - phoneIn * 0.85;
      if (dustA > 0.02) {
        const c = mixc(INK, WHITE, dark);
        ctx.fillStyle = `rgba(${c.map(Math.round).join(",")},${0.28 * dustA})`;
        ctx.beginPath();
        for (const d of dust) {
          const x = ((((d.u + time * d.vx) % 1) + 1) % 1) * w;
          const y = ((((d.v + time * d.vy) % 1) + 1) % 1) * h;
          ctx.moveTo(x + d.s, y);
          ctx.arc(x, y, d.s, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      // How many have signed up right now (the dot has landed).
      let arrived = 0;
      for (const d of pts) if (clamp((q * 1.25 - d.when) / 0.12) >= 1) arrived += 1;
      const seated = Math.min(SEATS, arrived);
      const waiting = Math.max(0, arrived - SEATS);
      let checked = 0;
      let wants = 0;

      // The page itself.
      // The hero's crowd: right of the headline on desktop, above it on phones.
      const crowdR = phone ? Math.min(w * 0.36, h * 0.17) : Math.min(w * 0.2, h * 0.34);
      const crowdX = phone ? w * 0.5 : w * 0.74;
      const crowdY = phone ? 72 + crowdR * 1.1 : h * 0.44;
      const pageA = phoneIn * (1 - room);
      if (pageA > 0.01) {
        ctx.globalAlpha = pageA;
        const lift = (1 - phoneIn) * 30;
        ctx.save();
        ctx.translate(0, lift);
        ctx.shadowColor = "rgba(232,96,74,.3)";
        ctx.shadowBlur = 60;
        ctx.fillStyle = "#141414";
        roundRect(ctx, px, py, pw, ph, pw * 0.11);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,.16)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.save();
        roundRect(ctx, px, py, pw, ph, pw * 0.11);
        ctx.clip();
        const cover = ctx.createRadialGradient(px + pw * 0.3, py + ph * 0.06, 0, px + pw * 0.3, py + ph * 0.06, pw * 1.1);
        cover.addColorStop(0, "#ec178f");
        cover.addColorStop(0.4, "#f04a6a");
        cover.addColorStop(0.75, "#e8604a");
        cover.addColorStop(1, "#3d8f6a");
        ctx.fillStyle = cover;
        ctx.fillRect(px, py, pw, ph * 0.34);
        ctx.restore();
        ctx.fillStyle = "#0a0a0a";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.font = `700 ${Math.round(pw * 0.12)}px ${font}`;
        ctx.fillText(label.title, px + pw * 0.08, py + ph * 0.3);
        ctx.fillStyle = "rgba(255,255,255,.6)";
        ctx.font = `500 ${Math.round(pw * 0.055)}px ${font}`;
        ctx.fillText(label.when, px + pw * 0.08, py + ph * 0.41);
        // The count and its bar.
        const by = py + ph * 0.46;
        ctx.fillStyle = "rgba(255,255,255,.12)";
        roundRect(ctx, px + pw * 0.08, by, pw * 0.84, 5, 3);
        ctx.fill();
        const bar = ctx.createLinearGradient(px + pw * 0.08, 0, px + pw * 0.92, 0);
        bar.addColorStop(0, "#ec178f");
        bar.addColorStop(0.45, "#f04a6a");
        bar.addColorStop(0.8, "#e8604a");
        bar.addColorStop(1, "#3d8f6a");
        ctx.fillStyle = bar;
        roundRect(ctx, px + pw * 0.08, by, Math.max(4, pw * 0.84 * (seated / SEATS)), 5, 3);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.font = `600 ${Math.round(pw * 0.05)}px ${mono}`;
        ctx.fillText(label.of(seated), px + pw * 0.08, by + pw * 0.09);
        // The button.
        const bh = ph * 0.075;
        ctx.fillStyle = "#fff";
        roundRect(ctx, px + pw * 0.08, py + ph - bh - ph * 0.04, pw * 0.84, bh, bh / 2);
        ctx.fill();
        ctx.fillStyle = "#0a0a0a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `700 ${Math.round(pw * 0.058)}px ${font}`;
        ctx.fillText(label.cta, cx, py + ph - bh / 2 - ph * 0.04);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // The room's stage and the waitlist tag.
      if (room > 0.01 && crm < 0.99) {
        const a = room * (1 - crm);
        ctx.globalAlpha = a;
        ctx.strokeStyle = "rgba(255,255,255,.22)";
        ctx.lineWidth = 1;
        roundRect(ctx, rx - seat * 0.4, ry - seat * 1.5, rw + seat * 0.8, rh + seat * 2, 10);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.1)";
        roundRect(ctx, rx + rw * 0.2, ry - seat * 1.2, rw * 0.6, seat * 0.6, 4);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.font = `700 ${phone ? 9 : 11}px ${mono}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label.stage, cx, ry - seat * 0.9);
        if (waiting > 0) {
          ctx.textAlign = "left";
          ctx.fillStyle = "rgba(255,255,255,.55)";
          ctx.fillText(label.wait, rx, ry + rh + seat * 0.75);
        }
        ctx.globalAlpha = 1;
      }

      // The guests.
      const groups = new Map();
      const add = (color, a, x, y, rad) => {
        if (a <= 0.01) return;
        const key = `${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])},${Math.round(Math.min(1, a) * 20)}`;
        let path = groups.get(key);
        if (!path) {
          path = new Path2D();
          groups.set(key, path);
        }
        path.moveTo(x + rad, y);
        path.arc(x, y, Math.max(0.4, rad), 0, Math.PI * 2);
      };
      pts.forEach((d, i) => {
        let fx = ((((d.u + time * d.vx) % 1) + 1) % 1) * w;
        let fy = ((((d.v + time * d.vy) % 1) + 1) % 1) * h;
        if (crowdK > 0) {
          const a0 = d.ca + time * d.cw * 0.4;
          const mx = crowdX + Math.cos(a0) * d.cr * crowdR;
          const my = crowdY + Math.sin(a0) * d.cr * crowdR * 0.92;
          fx = mix(fx, mx, crowdK);
          fy = mix(fy, my, crowdK);
        }
        const land = smooth(clamp((q * 1.25 - d.when) / 0.12));
        // Mid-flight, a dot arcs a little, like it's being pulled in.
        const [lx, ly] = listSlot(i);
        const arc = Math.sin(land * Math.PI) * 40;
        let x = mix(fx, lx, land);
        let y = mix(fy, ly, land) - arc;
        let rad = mix(mix(phone ? 2.2 : 2.8, phone ? 4.2 : 6.5, crowdK), cell * 0.28, land) * d.size;
        const [sx, sy] = seatSlot(i);
        x = mix(x, sx, room);
        y = mix(y, sy, room);
        rad = mix(rad, seat * 0.3, room);
        const isIn = i < SEATS;
        const here = isIn && door * 1.15 > d.door;
        if (here) checked += 1;
        let color = mixc(INK, WHITE, dark);
        let a = 1;
        if (land > 0) color = mixc(color, WHITE, land);
        if (land >= 1 && phoneIn > 0) a = 0.95;
        if (!isIn && room > 0) a = mix(a, 0.45, room);
        if (here) color = d.tint;
        if (crm > 0) {
          const [ox, oy, oz] = sphere(d.sphere, R);
          const depth = clamp((oz + 1) / 2);
          x = mix(x, ox, crm);
          y = mix(y, oy, crm);
          rad = mix(rad, (1.2 + depth * 2.2), crm);
          a = mix(a, 0.3 + depth * 0.7, crm);
          if (d.more) wants += 1;
          color = mixc(color, d.more ? d.tint : WHITE, crm);
        }
        add(color, a, x, y, rad);
        // A ring flashes where a sign-up lands.
        if (land > 0.85 && land < 1 && crm === 0) {
          ctx.strokeStyle = rgbaOf(d.tint, (1 - land) * 6);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(x, y, rad + (land - 0.85) * 60, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      for (const [key, path] of groups) {
        const [cr, cg, cb, ca] = key.split(",");
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${ca / 20})`;
        ctx.fill(path);
      }

      // The CRM's words and its pulse.
      if (crm > 0.3) {
        const k = clamp((crm - 0.3) / 0.5);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const { word, at: pos } of words) {
          const [x, y, z] = sphere(pos.map((v) => v * 1.18), R);
          const depth = clamp((z + 1) / 2);
          ctx.font = `${depth > 0.55 ? 700 : 500} ${Math.round((phone ? 11 : 13) + depth * (phone ? 4 : 8))}px ${font}`;
          ctx.fillStyle = `rgba(255,255,255,${k * (0.15 + depth * 0.85)})`;
          ctx.fillText(word, x, y);
        }
        ctx.lineWidth = 1.5;
        for (let n = 0; n < 3; n += 1) {
          const f = ((still ? 0.2 : time * 0.4) + n / 3) % 1;
          ctx.strokeStyle = rgbaOf(TINTS[n], (1 - f) * 0.4 * k);
          ctx.beginPath();
          ctx.arc(cx, cy, R * 0.2 + f * R * 1.6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // The readout under the text, written here so scrolling never re-renders.
      const panel = readRef.current;
      if (panel) {
        const live = { seated, waiting, checked, wants: Math.round(wants * crm), people: N, mail: seated + waiting };
        panel.style.setProperty("--ew-seated", String(Math.round((seated / SEATS) * 200) / 200));
        panel.style.setProperty("--ew-checked", String(Math.round((checked / SEATS) * 200) / 200));
        panel.style.setProperty("--ew-wants", String(Math.round((live.wants / N) * 200) / 200));
        panel.querySelectorAll("[data-live]").forEach((el) => {
          const v = String(live[el.dataset.live]);
          if (el.textContent !== v) el.textContent = v;
        });
      }
    }

    const loop = (now) => {
      raf = 0;
      if (!visible || document.hidden) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (!raf && visible && !document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };
    const resize = new ResizeObserver(() => { size(); draw(performance.now()); });
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      wake();
    });
    resize.observe(canvas);
    seen.observe(box);
    size();
    document.addEventListener("visibilitychange", wake);
    wake();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      document.removeEventListener("visibilitychange", wake);
      document.documentElement.style.removeProperty("--pc-tone");
    };
  }, [lang, t]);

  return (
    <section className="fw ew" ref={wrap} data-pc-blend="" data-pc-section="hero" data-pc-order="1">
      <div className="fw-pin">
        <div className="fw-pink" ref={pinkRef} aria-hidden="true" />
        <canvas ref={ref} className="fw-canvas" aria-hidden="true" />
        <div className="fw-hero" ref={heroRef}>{children}</div>
        <div className="fw-text">
          {STEPS.map((s, i) => (
            <div key={s.title} className={i === step ? "is-on" : ""}>
              <h2>{t(s.title)}</h2>
              <p>{t(s.line)}</p>
            </div>
          ))}
          <Readout step={step} panel={readRef} />
        </div>
      </div>
    </section>
  );
}

const READOUT = [
  { head: "Event page", tag: "Live", rows: (t) => (
    <>
      <div className="fw-row"><span>{t("Ready in")}</span><b>{t("1 min")}</b></div>
      <div className="fw-row"><span>{t("Link")}</span><b>pullup.se/e/…</b></div>
      <div className="fw-bar is-full"><i style={{ width: "100%" }} /></div>
    </>
  ) },
  { head: "Sign-ups", tag: "Open", rows: (t) => (
    <>
      <div className="fw-row"><span>{t("Signed up")}</span><b><span data-live="seated">0</span> / 120</b></div>
      <div className="fw-row"><span>{t("Confirmations sent")}</span><b data-live="seated">0</b></div>
      <div className="fw-bar"><i style={{ width: "calc(var(--ew-seated, 0) * 100%)" }} /></div>
    </>
  ) },
  { head: "At the door", tag: "Full", rows: (t) => (
    <>
      <div className="fw-row"><span>{t("Waitlist")}</span><b data-live="waiting">0</b></div>
      <div className="fw-row"><span>{t("Checked in")}</span><b><span data-live="checked">0</span> / 120</b></div>
      <div className="fw-bar"><i style={{ width: "calc(var(--ew-checked, 0) * 100%)" }} /></div>
    </>
  ) },
  { head: "Your CRM", tag: "Yours", rows: (t) => (
    <>
      <div className="fw-row"><span>{t("People")}</span><b data-live="people">132</b></div>
      <div className="fw-row"><span>{t("Want to hear more")}</span><b data-live="wants">0</b></div>
      <div className="fw-bar"><i style={{ width: "calc(var(--ew-wants, 0) * 100%)" }} /></div>
    </>
  ) },
];

function Readout({ step, panel }) {
  const t = useT();
  const r = READOUT[step];
  return (
    <div className={`fw-read${r ? " is-on" : ""}`} ref={panel} aria-hidden="true">
      {r && (
        <>
          <div className="fw-read-head">
            <span className="fw-read-no">{String(step + 1).padStart(2, "0")}/04</span>
            <b>{t(r.head)}</b>
            <em><i className="fw-led" />{t(r.tag)}</em>
          </div>
          <div className="fw-read-body" key={step}>{r.rows(t)}</div>
        </>
      )}
    </div>
  );
}

// The page is shown as a negative (ProductPage: invert + hue-rotate 60°), so
// these colours are chosen for what they turn into: #ec178f → electric cyan,
// #f04a6a → cornflower, #e8604a → lavender, #3d8f6a → sepia. The hero is a
// gradient from cyan at the crowd, through blue and lilac, to sepia edges.
export const NEGATIVE_GRADIENT = "radial-gradient(110% 95% at 74% 46%, #ec178f 0%, #f04a6a 28%, #e8604a 52%, #6f8a5e 76%, #3d8f6a 100%)";
export const NEGATIVE_LINEAR = "linear-gradient(90deg, #ec178f 0%, #f04a6a 40%, #e8604a 75%, #3d8f6a 100%)";
export const EVENT_WORLD_CSS = `
  .ew { height: 520vh; }
  .ew .fw-bar i { background: ${NEGATIVE_LINEAR}; }
  .ew .fw-led { background: ${NEGATIVE_LINEAR}; box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 8px #e8604a; }
  .ew .fw-pink { background: ${NEGATIVE_GRADIENT}; }
  @media (max-width: 759px) { .ew .fw-pink { background: radial-gradient(120% 80% at 50% 28%, #ec178f 0%, #f04a6a 28%, #e8604a 52%, #6f8a5e 76%, #3d8f6a 100%); } }
`;
