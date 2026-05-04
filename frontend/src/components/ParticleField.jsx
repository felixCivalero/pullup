import { useCallback, useEffect, useRef } from "react";

/**
 * Golden particle field — extracted from LandingPage so the same backdrop
 * can carry through onboarding and login. Particles spawn near the cursor
 * and on a slow ambient drift, so the field is alive even when idle.
 */
const GLYPHS = ["♪", "♫", "♬", "✦", "✧", "·"];

export function ParticleField({ ambient = true, intensity = 1, zIndex = 0 }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const mouseRef = useRef({ x: -1, y: -1 });
  const lastSpawnRef = useRef(0);
  const lastAmbientRef = useRef(0);
  const rafRef = useRef(null);

  const spawnParticle = useCallback((x, y, jitter = 40) => {
    const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    const isNote = glyph === "♪" || glyph === "♫" || glyph === "♬";
    particlesRef.current.push({
      x: x + (Math.random() - 0.5) * jitter,
      y: y + (Math.random() - 0.5) * jitter,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(0.3 + Math.random() * 0.5),
      life: 1,
      decay: 0.008 + Math.random() * 0.008,
      size: isNote ? 10 + Math.random() * 8 : 3 + Math.random() * 3,
      glyph,
      rotation: (Math.random() - 0.5) * 0.6,
      rotSpeed: (Math.random() - 0.5) * 0.02,
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = Math.max(
        window.innerHeight,
        document.documentElement.scrollHeight,
      );
    };
    resize();
    window.addEventListener("resize", resize);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(document.documentElement);

    const onMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY + window.scrollY };
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const animate = () => {
      const now = Date.now();
      const { x, y } = mouseRef.current;

      // Cursor-driven spawn
      if (x >= 0 && now - lastSpawnRef.current > 60) {
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) spawnParticle(x, y);
        lastSpawnRef.current = now;
      }

      // Ambient drift — keeps the backdrop alive without a cursor (mobile, idle)
      if (ambient && now - lastAmbientRef.current > 220 / intensity) {
        const ax = Math.random() * canvas.width;
        const ay = Math.random() * canvas.height;
        spawnParticle(ax, ay, 0);
        lastAmbientRef.current = now;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        p.life -= p.decay;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.life * 0.45;

        if (p.glyph === "·") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(251, 191, 36, ${p.life * 0.6})`;
          ctx.fill();
        } else {
          ctx.font = `${p.size}px serif`;
          ctx.fillStyle = `rgba(251, 191, 36, ${p.life * 0.5})`;
          ctx.shadowColor = "rgba(251, 191, 36, 0.3)";
          ctx.shadowBlur = 8;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.glyph, 0, 0);
        }
        ctx.restore();
      }

      if (particles.length > 80) particles.splice(0, particles.length - 80);

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      resizeObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [spawnParticle, ambient, intensity]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex,
      }}
    />
  );
}
