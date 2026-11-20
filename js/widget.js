// "Nudge a plan yourself": two sliders apply the plan transform T to one base plan.
// The scene is illustrative. To use a recorded scene, replace SCENE and basePlan().
(function () {
  const SPEC = typeof NUDGE_SPEC !== "undefined" ? NUDGE_SPEC : require("./transform.js").NUDGE_SPEC;
  const nudge = typeof applyNudge !== "undefined" ? applyNudge : require("./transform.js").applyNudge;
  const bound = typeof curvatureBound !== "undefined" ? curvatureBound : require("./transform.js").curvatureBound;

  const SCENE = {
    speed: 6.0, // m/s, speed of the base plan
    ego: { length: 5.18, width: 2.3, rearAxleToCenter: 1.46 },
    road: { right: -2.1, divider: 1.6, left: 5.3 }, // lateral positions in metres
    pedestrians: [{ x: 14.0, y: -1.6 }, { x: 16.8, y: -1.75 }],
    pedestrianRadius: 0.35,
    shownSteps: 40, // the first 4 s of the 8 s plan
    view: { x0: -5, x1: 31, y0: -4.6, y1: 6.6 },
  };
  // The largest offsets that the trained nudge policy used in the pedestrian scene of the paper.
  const PAPER_NUDGE = { speed: -0.36, curvature: 0.012 };

  function basePlan() {
    const plan = [];
    const drift = -0.25, reach = 12;
    for (let k = 0; k < 80; k++) {
      const x = SCENE.speed * SPEC.dt * (k + 1);
      const u = Math.min(1, x / reach);
      const y = drift * u * u * (3 - 2 * u);
      const slope = x < reach ? (drift * 6 * u * (1 - u)) / reach : 0;
      plan.push([x, y, Math.atan(slope)]);
    }
    return plan;
  }

  function egoCenter(w) {
    const d = SCENE.ego.rearAxleToCenter;
    return [w[0] + d * Math.cos(w[2]), w[1] + d * Math.sin(w[2])];
  }

  // Smallest distance between the ego box and a pedestrian over the first 4 s. Negative: overlap.
  function clearance(plan) {
    let best = { distance: Infinity, step: 0 };
    for (let k = 0; k < SCENE.shownSteps; k++) {
      const [cx, cy] = egoCenter(plan[k]);
      const c = Math.cos(plan[k][2]), s = Math.sin(plan[k][2]);
      for (const p of SCENE.pedestrians) {
        const dx = p.x - cx, dy = p.y - cy;
        const qx = Math.abs(dx * c + dy * s) - SCENE.ego.length / 2;
        const qy = Math.abs(-dx * s + dy * c) - SCENE.ego.width / 2;
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - SCENE.pedestrianRadius;
        if (d < best.distance) best = { distance: d, step: k };
      }
    }
    return best;
  }

  if (typeof document === "undefined") {
    module.exports = { SCENE, PAPER_NUDGE, basePlan, clearance };
    return;
  }

  const NS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const $ = (id) => document.getElementById(id);

  const base = basePlan();
  const kBound = bound(base);
  const V = SCENE.view;

  // ---------- scene ----------
  const svg = $("nudge-scene");
  svg.setAttribute("viewBox", `${V.x0} ${-V.y1} ${V.x1 - V.x0} ${V.y1 - V.y0}`);
  const world = el("g", { transform: "scale(1,-1)" }, svg);
  const R = SCENE.road;
  el("rect", { x: V.x0, y: R.right, width: V.x1 - V.x0, height: R.left - R.right, class: "w-road" }, world);
  for (const y of [R.right, R.left]) el("line", { x1: V.x0, x2: V.x1, y1: y, y2: y, class: "w-edge" }, world);
  el("line", { x1: V.x0, x2: V.x1, y1: R.divider, y2: R.divider, class: "w-divider" }, world);

  const basePath = el("polyline", { class: "w-base" }, world);
  const baseGhost = el("g", {}, world);
  const nudgedPath = el("polyline", { class: "w-nudged" }, world);
  const nudgedDots = el("g", {}, world);
  const ghost = el("g", {}, world);
  for (const p of SCENE.pedestrians) {
    const s = 0.45;
    el("rect", { x: p.x - s, y: p.y - s, width: 2 * s, height: 2 * s, class: "w-ped", transform: `rotate(45 ${p.x} ${p.y})` }, world);
  }
  const egoGroup = el("g", {}, world);

  function egoBox(parent, w, cls) {
    const E = SCENE.ego;
    const [cx, cy] = egoCenter(w);
    const g = el("g", { transform: `translate(${cx} ${cy}) rotate(${(w[2] * 180) / Math.PI})` }, parent);
    el("rect", { x: -E.length / 2, y: -E.width / 2, width: E.length, height: E.width, rx: 0.35, class: cls }, g);
    return g;
  }
  function points(plan, n) {
    return ["0,0"].concat(plan.slice(0, n).map((w) => `${w[0].toFixed(3)},${w[1].toFixed(3)}`)).join(" ");
  }
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // labels are drawn without the flip of the y axis
  const labels = el("g", { class: "w-labels" }, svg);
  const label = (x, y, text, cls) => (el("text", { x, y: -y, class: cls || "" }, labels).textContent = text);
  label(V.x0 + 0.6, R.left - 1.0, "left lane");
  label(V.x0 + 0.6, R.right - 1.2, "outside the drivable area");
  label(SCENE.pedestrians[1].x + 1.0, R.right - 1.2, "pedestrians", "w-ped-label");

  basePath.setAttribute("points", points(base, SCENE.shownSteps));
  const baseClear = clearance(base);
  egoBox(baseGhost, base[baseClear.step], "w-ghost-base" + (baseClear.distance < 0 ? " hit" : ""));

  // ---------- small charts ----------
  function chart(svgEl, yMin, yMax, yTicks, unit) {
    const W = 320, H = 130, L = 38, Rm = 10, T = 12, B = 24;
    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const X = (t) => L + ((W - L - Rm) * t) / 4;
    const Y = (v) => T + ((H - T - B) * (yMax - v)) / (yMax - yMin);
    for (const v of yTicks) {
      el("line", { x1: L, x2: W - Rm, y1: Y(v), y2: Y(v), class: "c-grid" }, svgEl);
      el("text", { x: L - 5, y: Y(v) + 3.5, class: "c-tick", "text-anchor": "end" }, svgEl).textContent = v + unit;
    }
    for (let t = 0; t <= 4; t++)
      el("text", { x: X(t), y: H - 7, class: "c-tick", "text-anchor": "middle" }, svgEl).textContent = t + " s";
    const band = el("rect", { y: T, height: H - T - B, class: "c-band" }, svgEl);
    const bandLabel = el("text", { y: T + 11, class: "c-band-label" }, svgEl);
    const lineBase = el("polyline", { class: "c-base" }, svgEl);
    const lineNudged = el("polyline", { class: "c-nudged" }, svgEl);
    const toPoints = (values) => values.map((v, k) => `${X((k + 1) * SPEC.dt).toFixed(1)},${Y(Math.max(yMin, Math.min(yMax, v))).toFixed(1)}`).join(" ");
    return {
      window(seconds, text) {
        band.setAttribute("x", X(0));
        band.setAttribute("width", X(seconds) - X(0));
        bandLabel.setAttribute("x", X(0) + 4);
        bandLabel.textContent = text;
      },
      draw(baseValues, nudgedValues) {
        lineBase.setAttribute("points", toPoints(baseValues));
        lineNudged.setAttribute("points", toPoints(nudgedValues));
      },
    };
  }
  const speedOf = (plan) =>
    plan.slice(0, SCENE.shownSteps).map((w, k) => {
      const p = k ? plan[k - 1] : [0, 0];
      return Math.hypot(w[0] - p[0], w[1] - p[1]) / SPEC.dt;
    });
  const turnOf = (plan) => plan.slice(0, SCENE.shownSteps).map((w, k) => ((w[2] - base[k][2]) * 180) / Math.PI);

  const speedChart = chart($("nudge-speed-chart"), 4.5, 7.5, [5, 6, 7], "");
  speedChart.window(SPEC.rampSteps * SPEC.dt, "ramp, 1.1 s");
  const maxTurn = Math.ceil((kBound * SCENE.speed * 1.2 * SPEC.bendSteps * SPEC.dt * 180) / Math.PI / 5) * 5;
  const turnChart = chart($("nudge-turn-chart"), -maxTurn, maxTurn, [-maxTurn, 0, maxTurn], "°");
  turnChart.window(SPEC.bendSteps * SPEC.dt, "bend, 1.5 s");

  // ---------- state ----------
  const speedIn = $("nudge-speed"), curvIn = $("nudge-curv");
  curvIn.min = (-kBound).toFixed(3);
  curvIn.max = kBound.toFixed(3);
  let nudged = base;
  let playing = null;

  function drawEgo(w) {
    clear(egoGroup);
    const g = egoBox(egoGroup, w, "w-ego");
    el("path", { d: "M 0.5 -0.6 L 1.7 0 L 0.5 0.6 Z", class: "w-ego-arrow" }, g);
  }

  function update() {
    const dv = parseFloat(speedIn.value), dk = parseFloat(curvIn.value);
    nudged = nudge(base, [dv / SPEC.speedMax, dk / kBound]);
    nudgedPath.setAttribute("points", points(nudged, SCENE.shownSteps));
    clear(nudgedDots);
    for (let k = 4; k < SCENE.shownSteps; k += 5)
      el("circle", { cx: nudged[k][0], cy: nudged[k][1], r: 0.22, class: "w-dot" }, nudgedDots);

    // With a zero nudge the nudged plan equals the base plan. It is hidden, so that the base plan is visible.
    const zero = dv === 0 && dk === 0;
    nudgedPath.style.display = nudgedDots.style.display = zero ? "none" : "";

    const c = clearance(nudged);
    clear(ghost);
    if (!playing && !zero) egoBox(ghost, nudged[c.step], "w-ghost" + (c.distance < 0 ? " hit" : ""));

    $("nudge-speed-value").textContent = (dv > 0 ? "+" : dv < 0 ? "−" : "") + Math.abs(dv).toFixed(2) + " m/s";
    $("nudge-curv-value").textContent =
      (dk > 0 ? "+" : dk < 0 ? "−" : "") + Math.abs(dk).toFixed(3) + " m⁻¹" + (dk > 0 ? " (left)" : dk < 0 ? " (right)" : "");
    const status = $("nudge-status");
    if (c.distance < 0) {
      status.textContent = "The vehicle hits a pedestrian";
      status.className = "status bad";
    } else if (c.distance < 0.3) {
      status.textContent = "The vehicle passes very close";
      status.className = "status warn";
    } else {
      status.textContent = "The vehicle passes with clearance";
      status.className = "status good";
    }
    $("nudge-clearance").textContent = c.distance < 0 ? "overlap " + (-c.distance).toFixed(2) + " m" : c.distance.toFixed(2) + " m";
    const last = nudged[SCENE.shownSteps - 1], lastBase = base[SCENE.shownSteps - 1];
    $("nudge-shift").textContent = Math.hypot(last[0] - lastBase[0], last[1] - lastBase[1]).toFixed(2) + " m";

    speedChart.draw(speedOf(base), speedOf(nudged));
    turnChart.draw(turnOf(base), turnOf(nudged));
    if (!playing) drawEgo([0, 0, 0]);
  }

  function set(dv, dk) {
    speedIn.value = dv;
    curvIn.value = dk;
    update();
  }

  // Drive the nudged plan for 4 s without replanning.
  function play() {
    if (playing) cancelAnimationFrame(playing);
    const start = performance.now();
    const plan = nudged;
    const frame = (now) => {
      const t = (now - start) / 1000;
      const f = Math.min(SCENE.shownSteps - 1, t / SPEC.dt - 1);
      if (f < 0) {
        const u = t / SPEC.dt;
        drawEgo([plan[0][0] * u, plan[0][1] * u, plan[0][2] * u]);
      } else {
        const k = Math.floor(f), u = f - k, a = plan[k], b = plan[Math.min(k + 1, SCENE.shownSteps - 1)];
        drawEgo([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
      }
      if (t < SCENE.shownSteps * SPEC.dt + 0.6) playing = requestAnimationFrame(frame);
      else {
        playing = null;
        update();
      }
    };
    clear(ghost);
    playing = requestAnimationFrame(frame);
  }

  speedIn.addEventListener("input", update);
  curvIn.addEventListener("input", update);
  $("nudge-reset").addEventListener("click", () => set(0, 0));
  $("nudge-paper").addEventListener("click", () => set(PAPER_NUDGE.speed, PAPER_NUDGE.curvature));
  $("nudge-play").addEventListener("click", play);
  update();
})();
