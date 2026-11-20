// The PlanNudge plan transform T.
// A direct port of apply_speed_curvature_residual in hdp_nuplan/rl/residual/transform.py.
// A plan is an array of waypoints [x, y, heading] in the ego frame, one waypoint every DT seconds.
// The waypoint before the first one is the origin (0, 0).

const NUDGE_SPEC = {
  dt: 0.1,               // seconds between waypoints
  bendSteps: 15,         // the curvature offset bends the first 1.5 s
  rampSteps: 11,         // the speed offset reaches its full value after 1.1 s
  speedMax: 1.0,         // m/s, bound of the speed offset
  curvatureMax: 0.05,    // 1/m, bound of the curvature offset
  latAccelMax: 1.5,      // m/s^2, second bound of the curvature offset
};

// Bound of the curvature offset in 1/m for this base plan.
function curvatureBound(plan, spec = NUDGE_SPEC) {
  let length = 0;
  let px = 0, py = 0;
  for (let k = 0; k < spec.rampSteps - 1; k++) {
    length += Math.hypot(plan[k][0] - px, plan[k][1] - py);
    px = plan[k][0]; py = plan[k][1];
  }
  const speed = length / ((spec.rampSteps - 1) * spec.dt);
  return Math.min(spec.curvatureMax, spec.latAccelMax / Math.max(speed, 1e-3) ** 2);
}

// action = [speed, curvature], both in [-1, 1]. Returns the nudged plan.
function applyNudge(plan, action, spec = NUDGE_SPEC) {
  const clip = (v) => Math.max(-1, Math.min(1, v));
  const aSpeed = clip(action[0]);
  const aCurv = clip(action[1]);
  const dk = aCurv * curvatureBound(plan, spec);

  const out = [];
  let px = 0, py = 0;   // previous base waypoint
  let phi = 0;          // accumulated rotation
  let shiftX = 0, shiftY = 0;
  for (let k = 0; k < plan.length; k++) {
    const [x, y, th] = plan[k];
    const dx = x - px, dy = y - py;
    const hx = Math.cos(th), hy = Math.sin(th);

    // Step 1, speed: lengthen or shorten the step along the base heading.
    const ramp = Math.min(1, (k + 1) / spec.rampSteps);
    let push = aSpeed * spec.speedMax * ramp * spec.dt;
    const forward = dx * hx + dy * hy;
    push = Math.max(push, Math.min(-forward, 0)); // braking stops at zero forward motion
    const sx = dx + push * hx, sy = dy + push * hy;

    // Step 2, curvature: rotate the step by the accumulated angle.
    if (k < spec.bendSteps) phi += dk * Math.hypot(sx, sy);
    const c = Math.cos(phi), s = Math.sin(phi);
    const rx = sx * c - sy * s, ry = sy * c + sx * s;

    // Step 3: add the changed steps up again.
    shiftX += rx - dx; shiftY += ry - dy;
    out.push([x + shiftX, y + shiftY, th + phi]);
    px = x; py = y;
  }
  return out;
}

if (typeof module !== "undefined") module.exports = { NUDGE_SPEC, curvatureBound, applyNudge };
