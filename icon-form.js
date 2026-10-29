// Social icons start hidden; hovering a card pulls a cloud of particles in from around it, over everything,
// that assembles into the icon, and the real icon fades in. Leaving the card blows it back apart.
(() => {
  "use strict";
  const hoverable = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!hoverable || still) return;   // phones and reduced motion just see normal icons

  const canvas = document.createElement("canvas");
  canvas.className = "icon-dust";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  addEventListener("resize", size);

  const cards = [...document.querySelectorAll(".social[data-social]")];
  document.documentElement.classList.add("icons-from-dust");

  // icon outline + inside, sampled once per card at 4x for sub-pixel dot positions
  const SCALE = 1.9;          // the dots assemble a bigger icon first, then it settles into the real one
  const cache = new Map();
  function sample(card) {
    if (cache.has(card)) return cache.get(card);
    const d = card.querySelector("i svg path").getAttribute("d");
    const box = 96;
    const off = document.createElement("canvas");
    off.width = off.height = box;
    const o = off.getContext("2d", { willReadFrequently: true });
    o.scale(box / 24, box / 24);
    o.fill(new Path2D(d));
    const data = o.getImageData(0, 0, box, box).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < box && y < box && data[(y * box + x) * 4 + 3] > 128;
    const edge = [], fill = [];
    for (let y = 0; y < box; y++) for (let x = 0; x < box; x++) {
      if (!on(x, y)) continue;
      (!on(x - 2, y) || !on(x + 2, y) || !on(x, y - 2) || !on(x, y + 2) ? edge : fill).push([x / box - 0.5, y / box - 0.5]);
    }
    const pts = [];
    for (let i = 0; i < 420; i++) {
      const src = i % 4 < 3 && edge.length ? edge : fill.length ? fill : edge;
      pts.push(src[(Math.random() * src.length) | 0]);
    }
    const colour = card.style.getPropertyValue("--c").trim() || "#d0bcff";
    const entry = { pts, colour };
    cache.set(card, entry);
    return entry;
  }

  let dust = [];       // { x, y, vx, vy, tx, ty, life, fade, colour, card, mode }
  let raf = 0;

  function iconBox(card) {
    const el = card.querySelector("i");
    const r = el.getBoundingClientRect();   // centre only: the hidden icon is scaled down
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, glyph: el.offsetWidth * 0.5 };
  }

  function form(card) {
    const { pts, colour } = sample(card);
    const { cx, cy, glyph } = iconBox(card);
    dust = dust.filter((p) => p.card !== card);
    const big = glyph * SCALE;
    for (const [u, v] of pts) {
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 190;
      dust.push({
        x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.75, vx: 0, vy: 0,
        u, v, big, small: glyph, card, colour, mode: "in",
        born: performance.now() + Math.random() * 160, life: 1, size: 1.3 + Math.random() * 0.9
      });
    }
    card._formT = setTimeout(() => card.classList.add("formed"), 520);
    run();
  }

  function scatter(card) {
    clearTimeout(card._formT);
    const wasFormed = card.classList.contains("formed");
    card.classList.remove("formed");
    const { pts, colour } = sample(card);
    const { cx, cy, glyph } = iconBox(card);
    const mine = dust.filter((p) => p.card === card);
    dust = dust.filter((p) => p.card !== card);
    // particles still in flight just let go; a finished icon breaks apart from its own shape
    const from = wasFormed ? pts.map(([u, v]) => ({ x: cx + u * glyph, y: cy + v * glyph, size: 1.4 + Math.random() * 0.8 })) : mine;
    for (const p of from) {
      const a = Math.atan2(p.y - cy, p.x - cx) + (Math.random() - 0.5) * 1.2;
      const sp = 1.5 + Math.random() * 4;
      dust.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp + 1.2, vy: Math.sin(a) * sp - 1.2, card: null, colour, mode: "out",
        born: performance.now() + Math.random() * 120, life: 1, size: p.size || 1.6 });
    }
    run();
  }

  function frame(now) {
    raf = 0;
    ctx.clearRect(0, 0, W, H);
    const boxes = new Map();
    let alive = 0;
    for (const p of dust) {
      if (p.mode === "in") {
        if (!boxes.has(p.card)) boxes.set(p.card, iconBox(p.card));
        const b = boxes.get(p.card);
        const formed = p.card.classList.contains("formed");
        const s = formed ? p.small : p.big;
        const tx = b.cx + p.u * s, ty = b.cy + p.v * s;
        if (now >= p.born) {
          p.vx += (tx - p.x) * 0.14; p.vy += (ty - p.y) * 0.14;
          p.vx *= 0.72; p.vy *= 0.72;
          p.x += p.vx; p.y += p.vy;
        }
        if (formed) p.life -= 0.06;   // the real icon takes over
      } else if (now >= p.born) {
        p.vy -= 0.04;                  // antigravity: the dust drifts up
        p.vx *= 0.97; p.vy *= 0.97;
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.022;
      }
      if (p.life <= 0) continue;
      alive++;
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.colour;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    dust = dust.filter((p) => p.life > 0);
    if (alive) raf = requestAnimationFrame(frame);
  }
  function run() { if (!raf) raf = requestAnimationFrame(frame); }

  for (const card of cards) {
    card.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") form(card); });
    card.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") scatter(card); });
    card.addEventListener("focus", () => form(card));
    card.addEventListener("blur", () => scatter(card));
  }
})();
