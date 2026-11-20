// Two diagrams for the Motivation section.
(function () {
  const $ = (id) => document.getElementById(id);
  const EPISODE_STEPS = 150; // planning steps in one episode (15 s at 10 Hz)

  // ---------- Difficulty 1: iterative denoising ----------
  const K = 10; // denoising steps in the diagram
  function box(cls, text) {
    const b = document.createElement("span");
    b.className = "dn-box " + cls;
    b.textContent = text;
    return b;
  }
  const fine = $("denoise-finetune"), ours = $("denoise-ours");
  for (let i = 1; i <= K; i++) fine.appendChild(box("action", i));
  const frozen = document.createElement("span");
  frozen.className = "dn-frozen";
  for (let i = 1; i <= K; i++) frozen.appendChild(box("frozen", i));
  ours.appendChild(frozen);
  ours.appendChild(box("action nudge", "nudge"));
  $("denoise-finetune-count").textContent = K + " denoising steps = " + K + " RL decisions per plan";
  $("denoise-finetune-total").textContent = EPISODE_STEPS + " × " + K + " = " + EPISODE_STEPS * K;
  $("denoise-ours-total").textContent = EPISODE_STEPS + " × 1 = " + EPISODE_STEPS;

  // ---------- Difficulty 2: receding-horizon execution ----------
  const cells = $("horizon-cells");
  for (let i = 0; i < 80; i++) {
    const c = document.createElement("span");
    if (i === 0) c.className = "executed";
    cells.appendChild(c);
  }

  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs, parent) => {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const svg = $("horizon-scene");
  const X0 = -4, X1 = 96, Y0 = -9, Y1 = 9;
  svg.setAttribute("viewBox", `${X0} ${-Y1} ${X1 - X0} ${Y1 - Y0}`);
  const world = el("g", { transform: "scale(1,-1)" }, svg);

  const SPEED = 6, DT = 0.1, STEPS = 80;
  const road = (x) => 3.2 * Math.sin(x / 15);
  const roadLine = (offset) => {
    const pts = [];
    for (let x = X0; x <= X1; x += 1) pts.push(`${x},${(road(x) + offset).toFixed(2)}`);
    return pts.join(" ");
  };
  el("polyline", { points: roadLine(0), class: "h-road" }, world);
  const oldPlans = el("g", {}, world);
  const planLine = el("polyline", { class: "h-plan" }, world);
  const driven = el("polyline", { class: "h-driven" }, world);
  const executed = el("polyline", { class: "h-executed" }, world);
  const car = el("g", {}, world);
  el("rect", { x: -1.1, y: -1.15, width: 5.18, height: 2.3, rx: 0.4, class: "w-ego" }, car);

  // A plan from position x at time t. Its far part sways with time, so two consecutive plans differ.
  function plan(x, t) {
    const sway = 2.6 * Math.sin(t * 1.7) + 1.2 * Math.sin(t * 4.1 + 1);
    const pts = [];
    for (let k = 0; k <= STEPS; k++) {
      const s = k / STEPS;
      const px = x + SPEED * DT * k;
      pts.push([px, road(px) + sway * s * s]);
    }
    return pts;
  }
  const str = (pts) => pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");

  const START = 2, END = 44;
  let lastGhost = -1;
  function draw(t) {
    const x = START + SPEED * t;
    const p = plan(x, t);
    planLine.setAttribute("points", str(p));
    executed.setAttribute("points", str(p.slice(0, 2)));
    const trail = [];
    for (let px = START; px <= x; px += 0.5) trail.push([px, road(px)]);
    trail.push([x, road(x)]);
    driven.setAttribute("points", str(trail));
    const heading = (Math.atan((3.2 / 15) * Math.cos(x / 15)) * 180) / Math.PI;
    car.setAttribute("transform", `translate(${x} ${road(x)}) rotate(${heading})`);
    const second = Math.floor(t);
    if (second !== lastGhost) {
      lastGhost = second;
      el("polyline", { points: str(p), class: "h-old" }, oldPlans);
      while (oldPlans.childNodes.length > 4) oldPlans.removeChild(oldPlans.firstChild);
    }
    $("horizon-count").textContent = Math.floor(t / DT) + 1;
  }

  const duration = (END - START) / SPEED;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    draw(duration / 2);
    return;
  }
  let t0 = null, visible = false;
  function frame(now) {
    if (!visible) return;
    if (t0 === null) t0 = now;
    let t = (now - t0) / 1000;
    if (t > duration + 1) {
      t0 = now;
      t = 0;
      lastGhost = -1;
      oldPlans.textContent = "";
    }
    draw(Math.min(t, duration));
    requestAnimationFrame(frame);
  }
  // The animation runs only while the diagram is on the screen.
  new IntersectionObserver((entries) => {
    const now = entries[0].isIntersecting;
    if (now && !visible) {
      visible = true;
      requestAnimationFrame(frame);
    }
    visible = now;
  }).observe(svg);
  draw(0);
})();
