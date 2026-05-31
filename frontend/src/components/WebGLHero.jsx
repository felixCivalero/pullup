import { useRef, useEffect } from "react";

// The WebGL design archetype: a full-bleed, animated generative hero rendered
// by a single fullscreen fragment shader — no Three.js, no heavy dep. The AI
// art-directs it with typed params (palette + intensity), not raw shader code,
// so the same component renders identically in the editor preview and on the
// live /e/:slug page. Domain-warped fbm colored by the palette = flowing
// aurora/plasma that reads as "designed," not stock.

const DEFAULT_COLORS = ["#0a0617", "#ec178f", "#16e0c0"]; // PullUp dark / pink / teal

function hexToRgb01(hex) {
  const h = String(hex || "").trim().replace(/^#/, "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(f)) return null;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
}

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_intensity;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  uv.x *= u_res.x / u_res.y;            // aspect-correct so it doesn't smear
  vec2 p = uv * 3.0;
  float t = u_time * 0.12 * (0.4 + u_intensity);
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float f = fbm(p + q * (1.0 + u_intensity * 2.5) + t * 0.5);
  vec3 col = mix(u_c1, u_c2, smoothstep(0.15, 0.85, f));
  col = mix(col, u_c3, smoothstep(0.5, 1.0, length(q)));
  col *= 0.65 + 0.7 * u_intensity;       // intensity drives brightness/contrast
  gl_FragColor = vec4(col, 1.0);
}
`;

export function WebGLHero({ params = {} }) {
  const canvasRef = useRef(null);
  const colors = Array.isArray(params.colors) && params.colors.length ? params.colors : DEFAULT_COLORS;
  const intensity = typeof params.intensity === "number" ? Math.max(0, Math.min(1, params.intensity)) : 0.6;
  // Re-init when the visual params change (join into a stable dep key).
  const depKey = `${colors.join(",")}|${intensity}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return; // CSS gradient fallback (below) shows through

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u_res = gl.getUniformLocation(prog, "u_res");
    const u_time = gl.getUniformLocation(prog, "u_time");
    const u_intensity = gl.getUniformLocation(prog, "u_intensity");
    const palette = [colors[0], colors[1] || colors[0], colors[2] || colors[1] || colors[0]]
      .map((c) => hexToRgb01(c) || hexToRgb01(DEFAULT_COLORS[0]));
    gl.uniform3fv(gl.getUniformLocation(prog, "u_c1"), palette[0]);
    gl.uniform3fv(gl.getUniformLocation(prog, "u_c2"), palette[1]);
    gl.uniform3fv(gl.getUniformLocation(prog, "u_c3"), palette[2]);
    gl.uniform1f(u_intensity, intensity);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u_res, canvas.width, canvas.height);
    }

    let raf;
    let start = null;
    function frame(now) {
      if (start === null) start = now;
      resize();
      gl.uniform1f(u_time, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    };
  }, [depKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // CSS gradient fallback shows if WebGL is unavailable or before first paint.
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, background: `linear-gradient(135deg, ${colors[0]}, ${colors[1] || colors[0]})` }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}
