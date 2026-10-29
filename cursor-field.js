// Cursor particle field modelled on antigravity.google:
// an even grid of particles that mostly stay put and drift on noise; a wide, breathing ring lazily
// follows the cursor, and particles inside its band grow into small capsules pointing at its centre.
// Colours flow blue → red → yellow on noise. Our own WebGL2 implementation.
(() => {
  "use strict";

  const canvas = document.getElementById("field");
  if (!canvas) return;
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return;

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = ["#4b7bff", "#f84242", "#ffcf03"];

  const RING = 0.175;        // ring radius, in field units (0.35 units = screen height)
  const RING_WIDTH = 0.107;  // wide soft band
  const RING_WIDTH2 = 0.05;  // tight bright band
  const RING_PUSH = 0.15;    // how far the bright band pushes particles outwards

  // 2D simplex noise: Ian McEwan / Ashima Arts, MIT licence (github.com/ashima/webgl-noise)
  const NOISE = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }`;

  const VERTEX = `#version 300 es
  precision highp float;
  layout(location = 0) in vec2 aCorner;
  layout(location = 1) in vec2 aHome;
  uniform vec2 uSize;
  uniform vec2 uCenter;
  uniform float uUnit;
  uniform vec2 uRing;
  uniform float uRadius;
  uniform float uW1;
  uniform float uW2;
  uniform float uPush;
  uniform float uTime;
  uniform float uDot;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  out vec2 vUV;
  out vec3 vColor;
  out float vAlpha;
  ${NOISE}
  void main() {
    vec2 p = (aHome - uCenter) / uUnit;
    float time = uTime * 0.5;
    float d = distance(p, uRing);
    float n0 = snoise(p * 0.2 + vec2(18.49, 72.97) + time * 0.25);
    float dn = distance(p + n0 * 0.005, uRing);

    // how strongly this particle belongs to the ring
    float wide = smoothstep(uRadius - uW1 * 2.0, uRadius, d) - smoothstep(uRadius, uRadius + uW1, dn);
    float tight = smoothstep(uRadius - uW2 * 2.0, uRadius, d) - smoothstep(uRadius, uRadius + uW2, dn);
    float inner = smoothstep(uRadius + uW2, uRadius, d);
    wide = wide * wide;
    tight = max(tight, 0.0);
    tight = tight * tight * tight;
    float s = wide + tight * 3.0 + inner * 0.4;
    s += snoise(p * 30.0 + vec2(11.49, 12.97) + time * 0.25) * inner * 0.5;
    float blob = snoise(p * 2.0 + vec2(18.49, 72.97) + vec2(time * 0.25, -time * 0.2));
    s += pow((blob + 1.5) * 0.5, 2.0) * 0.6;

    // slow drift on noise + a soft wave further from the ring
    vec2 disp = vec2(snoise(p * 4.0 + vec2(88.49, 32.44) + time * 0.18), snoise(p * 4.0 + vec2(50.90, 120.95) - time * 0.18)) * 0.03;
    disp += vec2(snoise(p * 20.0 + vec2(18.49, 72.97) + time * 0.25), snoise(p * 20.0 + vec2(50.90, 120.95) - time * 0.25)) * 0.005;
    float far = clamp(d, 0.0, 1.0);
    disp.x += sin(p.x * 20.0 + time * 4.0) * 0.02 * far;
    disp.y += cos(p.y * 20.0 + time * 3.0) * 0.02 * far;
    vec2 q = p + disp;
    q += (q - uRing) * pow(tight, 0.75) * uPush * 1.25;

    // capsule pointing at the ring centre, with a little noise in the angle
    float angle = atan(q.y - uRing.y, q.x - uRing.x) + snoise(p * 10.0 + vec2(18.49, 72.97) + time * 0.42) * 0.5;
    float size = max(s, 0.0) * uDot;
    vec2 local = aCorner * 0.6 * size;
    vec2 rotated = vec2(local.x * cos(angle) - local.y * sin(angle), local.x * sin(angle) + local.y * cos(angle));
    vec2 world = uCenter + q * uUnit + rotated;
    gl_Position = vec4(world.x / uSize.x * 2.0 - 1.0, 1.0 - world.y / uSize.y * 2.0, 0.0, 1.0);
    vUV = aCorner * 0.6;

    float tone = (snoise(p * 2.0 + vec2(74.66, 91.56) + time * 0.25) + 1.0) * 0.5;
    float k = smoothstep(0.0, 0.75, tone * tone);
    vColor = k < 0.8 ? mix(uC1, uC2, k / 0.8) : mix(uC2, uC3, (k - 0.8) / 0.2);
    vAlpha = smoothstep(0.1, 0.2, s);
  }`;

  const FRAGMENT = `#version 300 es
  precision highp float;
  in vec2 vUV;
  in vec3 vColor;
  in float vAlpha;
  out vec4 outColor;
  float roundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }
  void main() {
    float shape = smoothstep(0.1, 0.0, roundBox(vUV, vec2(0.5, 0.2), 0.25));
    float a = shape * vAlpha;
    if (a < 0.01) discard;
    outColor = vec4(vColor * a, a);
  }`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(sh)); return null; }
    return sh;
  }
  const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(program)); return; }
  const U = {};
  ["uSize", "uCenter", "uUnit", "uRing", "uRadius", "uW1", "uW2", "uPush", "uTime", "uDot", "uC1", "uC2", "uC3"]
    .forEach((n) => { U[n] = gl.getUniformLocation(program, n); });

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const corners = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const homes = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, homes);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(1, 1);

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  let W = 1, H = 1, unit = 1, dot = 1, count = 0;

  // even spread: a jittered grid, roughly what a Poisson-disc fill looks like
  function build() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    unit = Math.min(H, W * 1.4) / 0.35;
    dot = 3.5 * Math.min(0.6, Math.max(0.3, (W / 2000) * 0.6));
    const gap = 0.0145 * unit;
    const pad = gap * 3;
    const pts = [];
    for (let y = -pad; y < H + pad; y += gap) for (let x = -pad; x < W + pad; x += gap) {
      pts.push(x + (Math.random() - 0.5) * gap * 0.8, y + (Math.random() - 0.5) * gap * 0.8);
    }
    count = pts.length / 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, homes);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
  }

  // ring position, in field units around the screen centre
  const ring = { x: 0, y: 0 };
  const ptr = { x: 0, y: 0, active: false, until: 0 };
  const wobble = (t, a, b) => (Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.7) * 0.4);

  let t0 = performance.now(), last = t0, raf = 0;
  function frame(now) {
    raf = 0;
    const time = still ? 0 : (now - t0) / 1000;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const n = wobble(time * 0.66, 1.0, 1.9), r = wobble(time * 0.75, 1.3, 0.7);
    let tx, ty, ease;
    if (ptr.active || now < ptr.until) {
      tx = (ptr.x - W / 2) / unit + n * 0.1 * 0.5;
      ty = (ptr.y - H / 2) / unit + r * 0.1 * 0.5;
      ease = 0.02;
    } else {
      tx = n * 0.2; ty = r * 0.1;
      ease = 0.01;
    }
    // the original eases ~once per two frames; keep that lazy feel regardless of refresh rate
    const k = 1 - Math.pow(1 - ease, dt * 30);
    ring.x += (tx - ring.x) * k;
    ring.y += (ty - ring.y) * k;
    const radius = RING + Math.sin(time) * 0.03 + Math.cos(time * 3) * 0.02;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(U.uSize, W, H);
    gl.uniform2f(U.uCenter, W / 2, H / 2);
    gl.uniform1f(U.uUnit, unit);
    gl.uniform2f(U.uRing, ring.x, ring.y);
    gl.uniform1f(U.uRadius, radius);
    gl.uniform1f(U.uW1, RING_WIDTH);
    gl.uniform1f(U.uW2, RING_WIDTH2);
    gl.uniform1f(U.uPush, RING_PUSH);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uDot, dot);
    gl.uniform3fv(U.uC1, rgb(COLORS[0]));
    gl.uniform3fv(U.uC2, rgb(COLORS[1]));
    gl.uniform3fv(U.uC3, rgb(COLORS[2]));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

    if (!still && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };

  const point = (x, y) => { ptr.x = x; ptr.y = y; ptr.active = true; };
  addEventListener("pointermove", (e) => point(e.clientX, e.clientY), { passive: true });
  addEventListener("touchmove", (e) => e.touches[0] && point(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  addEventListener("touchend", () => { ptr.active = false; ptr.until = performance.now() + 2500; }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { ptr.active = false; });
  addEventListener("blur", () => { ptr.active = false; });
  addEventListener("resize", () => { build(); wake(); });
  document.addEventListener("visibilitychange", wake);

  // the bottom input calls this when an answer is found: the ring swings over to it for a moment
  window.fieldBurst = (x, y) => { ptr.x = x; ptr.y = y; ptr.until = performance.now() + 2500; wake(); };

  build();
  wake();
})();
