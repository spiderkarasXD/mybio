// Particle swarm in the "to connect" card: thousands of dots assemble into one social icon at a time,
// antigravity-style. Cycles through the icons; hovering a card pulls its icon; the cursor pushes dots away.
(() => {
  "use strict";
  const host = document.getElementById("swarm");
  if (!host) return;
  const canvas = host.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const links = [...document.querySelectorAll(".social[data-social]")];
  const icons = links.map((a) => ({
    path: new Path2D(a.querySelector("svg path").getAttribute("d")),
    rgb: hexRgb(a.style.getPropertyValue("--c").trim() || "#d0bcff"),
    href: a.href,
    name: a.querySelector("strong")?.textContent || ""
  }));
  if (!icons.length) return;

  function hexRgb(h) {
    const v = h.replace("#", "");
    const f = v.length === 3 ? v.replace(/./g, (c) => c + c) : v;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  }
  // keep dark brand colours readable on the dark card
  const lift = ([r, g, b]) => [r, g, b].map((c) => Math.round(c + (255 - c) * 0.18));

  let W = 0, H = 0, dpr = 1, parts = [], current = -1, hold = -1, timer = 0;
  const color = [208, 188, 255];
  let target = color.slice();
  const mouse = { x: -1e4, y: -1e4 };

  // dots for one icon: almost all on the outline (that's what makes the shape read), a few inside
  function sample(icon, count) {
    const box = Math.round(Math.min(H * 0.86, W * 0.6));
    const off = document.createElement("canvas");
    off.width = off.height = box;
    const o = off.getContext("2d", { willReadFrequently: true });
    o.scale(box / 24, box / 24);
    o.fill(icon.path);
    const data = o.getImageData(0, 0, box, box).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < box && y < box && data[(y * box + x) * 4 + 3] > 128;
    const edge = [], fill = [];
    for (let y = 0; y < box; y += 1) for (let x = 0; x < box; x += 1) {
      if (!on(x, y)) continue;
      const isEdge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
      (isEdge ? edge : fill).push([x, y]);
    }
    const ox = (W - box) / 2, oy = (H - box) / 2;
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];
    const pts = [];
    for (let i = 0; i < count; i++) {
      const src = (i % 12 < 11 && edge.length) || !fill.length ? edge : fill;
      const [x, y] = pick(src);
      pts.push([ox + x, oy + y]);
    }
    return pts;
  }

  function build() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(1700, Math.max(700, W * H / 70)));
    parts = Array.from({ length: n }, () => {
      const hx = Math.random() * W, hy = Math.random() * H;
      return { x: hx, y: hy + H * 0.6 * Math.random(), vx: 0, vy: 0, hx, hy, tx: hx, ty: hy, inShape: false,
        size: 0.9 + Math.random() * 1.1, seed: Math.random() * 6.28, delay: Math.random() * 0.25 };
    });
    const i = current < 0 ? 0 : current;
    current = -1;
    show(i);
  }

  function show(i) {
    if (i === current) return;
    current = i;
    const icon = icons[i];
    target = lift(icon.rgb);
    host.setAttribute("aria-label", icon.name);
    host.dataset.href = icon.href;
    const shapeCount = Math.round(parts.length * 0.62);
    const pts = sample(icon, shapeCount);
    const order = parts.map((_, k) => k).sort(() => Math.random() - 0.5);
    order.forEach((k, j) => {
      const p = parts[k];
      p.inShape = j < shapeCount;
      if (p.inShape) { [p.tx, p.ty] = pts[j]; }
      else { p.hx = Math.random() * W; p.hy = Math.random() * H; }
      p.wait = performance.now() + p.delay * 1000;
      // a little kick so the swap reads as an explosion → reassembly
      p.vx += (Math.random() - 0.5) * 9;
      p.vy += (Math.random() - 0.5) * 9;
    });
  }

  function next() { if (hold < 0) show((current + 1) % icons.length); }
  function loop() { clearInterval(timer); timer = setInterval(next, 4200); }

  function frame(now) {
    for (let k = 0; k < 3; k++) color[k] += (target[k] - color[k]) * 0.06;
    ctx.clearRect(0, 0, W, H);
    const t = now / 1000;
    const shapeCol = `rgb(${color.map(Math.round).join(",")})`;
    const dustCol = "rgba(202,196,208,0.32)";
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? shapeCol : dustCol;
      for (const p of parts) {
        if (p.inShape !== !!pass) continue;
        if (pass === 0) {
          // free dust floats upward slowly, wraps around
          p.hy -= 0.12; if (p.hy < -4) { p.hy = H + 4; p.y = p.hy; p.x = p.hx; }
          p.tx = p.hx + Math.sin(t * 0.6 + p.seed) * 6;
          p.ty = p.hy + Math.cos(t * 0.5 + p.seed) * 6;
        }
        if (now >= (p.wait || 0)) {
          const k = p.inShape ? 0.16 : 0.03;
          p.vx += (p.tx + (p.inShape ? Math.sin(t * 2 + p.seed) * 0.5 : 0) - p.x) * k;
          p.vy += (p.ty + (p.inShape ? Math.cos(t * 2 + p.seed) * 0.5 : 0) - p.y) * k;
        }
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 90 * 90) {
          const d = Math.sqrt(d2) || 1, f = (1 - d / 90) * 2.6;
          p.vx += (dx / d) * f; p.vy += (dy / d) * f;
        }
        p.vx *= 0.7; p.vy *= 0.7;
        p.x += p.vx; p.y += p.vy;
        const s = p.inShape ? 1.7 : p.size * 0.8;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    if (!still) requestAnimationFrame(frame);
  }

  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
  });
  host.addEventListener("pointerleave", () => { mouse.x = mouse.y = -1e4; });
  host.addEventListener("click", () => { if (host.dataset.href) window.open(host.dataset.href, "_blank", "noopener"); });
  links.forEach((a, i) => {
    a.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { hold = i; show(i); } });
    a.addEventListener("pointerleave", () => { hold = -1; loop(); });
    a.addEventListener("focus", () => { hold = i; show(i); });
    a.addEventListener("blur", () => { hold = -1; });
  });
  let rt = 0;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(build, 120); }).observe(host);

  build();
  loop();
  if (still) { for (const p of parts) { p.x = p.inShape ? p.tx : p.hx; p.y = p.inShape ? p.ty : p.hy; } }
  requestAnimationFrame(frame);
})();
