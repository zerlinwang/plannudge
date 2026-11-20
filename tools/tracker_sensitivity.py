"""Sensitivity of the nuPlan LQR tracker's command to each dimension of a plan and to each dimension of a nudge.
Usage: sens.py <nuplan-devkit root> <transform.py> <out.json>"""
import sys, json, types, importlib.util
import numpy as np

devkit, transform_path, out_path = sys.argv[1:4]
T = devkit + "/nuplan/planning/simulation/controller/tracker/"

# ---- stand-ins for the nuPlan imports that the numerical code does not need ----
def stub(name, **attrs):
    m = types.ModuleType(name); m.__dict__.update(attrs); sys.modules[name] = m; return m
class _Any:
    def __init__(self, *a, **k): pass
class _Vehicle:
    wheel_base = 3.089  # Chrysler Pacifica, get_pacifica_parameters()
for pkg in ["nuplan", "nuplan.common", "nuplan.common.actor_state", "nuplan.common.geometry", "nuplan.database", "nuplan.database.utils",
            "nuplan.planning", "nuplan.planning.simulation", "nuplan.planning.simulation.controller", "nuplan.planning.simulation.controller.tracker",
            "nuplan.planning.simulation.simulation_time_controller", "nuplan.planning.simulation.trajectory"]:
    stub(pkg)
stub("nuplan.common.actor_state.state_representation", TimePoint=_Any, StateVector2D=_Any)
stub("nuplan.common.geometry.compute", principal_value=lambda a, min_=-np.pi: (a - min_) % (2 * np.pi) + min_)
stub("nuplan.common.actor_state.dynamic_car_state", DynamicCarState=_Any)
stub("nuplan.common.actor_state.ego_state", EgoState=_Any)
stub("nuplan.common.actor_state.vehicle_parameters", VehicleParameters=_Vehicle, get_pacifica_parameters=lambda: _Vehicle())
stub("nuplan.database.utils.measure", angle_diff=lambda x, y, period: (x - y + period / 2) % period - period / 2)
stub("nuplan.planning.simulation.controller.tracker.abstract_tracker", AbstractTracker=object)
stub("nuplan.planning.simulation.simulation_time_controller.simulation_iteration", SimulationIteration=_Any)
stub("nuplan.planning.simulation.trajectory.abstract_trajectory", AbstractTrajectory=_Any)

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); sys.modules[name] = m; spec.loader.exec_module(m); return m
utils = load("nuplan.planning.simulation.controller.tracker.tracker_utils", T + "tracker_utils.py")
lqr = load("nuplan.planning.simulation.controller.tracker.lqr", T + "lqr.py")
tf = load("transform", transform_path)

# lqr_tracker.yaml
DT, H = 0.1, 10
tracker = lqr.LQRTracker(q_longitudinal=[10.0], r_longitudinal=[1.0], q_lateral=[1.0, 10.0, 0.0], r_lateral=[1.0],
                         discretization_time=DT, tracking_horizon=H, jerk_penalty=1e-4, curvature_rate_penalty=1e-2,
                         stopping_proportional_gain=0.5, stopping_velocity=0.2)

SPEED = 6.0
def base_plan():  # the base plan of the widget: 80 waypoints (x, y, heading)
    k = np.arange(1, 81); x = SPEED * DT * k; u = np.minimum(1, x / 12)
    y = -0.25 * u * u * (3 - 2 * u); slope = np.where(x < 12, -0.25 * 6 * u * (1 - u) / 12, 0.0)
    return np.stack([x, y, np.arctan(slope)], -1)

def command(plan):
    """plan [80, 3] -> (acceleration, steering rate), as LQRTracker.track_trajectory computes them. The ego is on the plan's start."""
    poses = np.vstack([[0.0, 0.0, 0.0], plan]).astype(np.float64)
    vel, _, curv, _ = utils.get_velocity_curvature_profiles_with_derivatives_from_poses(
        discretization_time=DT, poses=poses, jerk_penalty=1e-4, curvature_rate_penalty=1e-2)
    ref_v, curv_profile = float(vel[H]), curv[:H]          # the two np.interp reads of _compute_reference_velocity_and_curvature_profile
    accel = tracker._longitudinal_lqr_controller(SPEED, ref_v)
    vprof = utils._generate_profile_from_initial_condition_and_derivatives(SPEED, np.ones(H) * accel, DT)[:H]
    steer = tracker._lateral_lqr_controller(np.zeros(3), vprof, curv_profile)
    return np.array([accel, steer])

plan = base_plan()
c0 = command(plan)
eps = 1e-4
J = np.zeros((2, 80, 3))
for k in range(80):
    for d in range(3):
        p = plan.copy(); p[k, d] += eps
        J[:, k, d] = (command(p) - c0) / eps

spec = tf.ResidualActionSpec(mode="speed_curvature")
def nudged(a):
    p4 = np.stack([plan[:, 0], plan[:, 1], np.cos(plan[:, 2]), np.sin(plan[:, 2])], -1)[None]
    o = tf.apply_speed_curvature_residual(p4, np.array([a], dtype=np.float32), spec)[0].astype(np.float64)
    return np.stack([o[:, 0], o[:, 1], np.arctan2(o[:, 3], o[:, 2])], -1)
h = 0.05
Jn = np.stack([(command(nudged([h, 0])) - command(nudged([-h, 0]))) / (2 * h),
               (command(nudged([0, h])) - command(nudged([0, -h]))) / (2 * h)], -1)   # [command, nudge dim]

print("command at the base plan: accel %.4f m/s^2, steering rate %.5f rad/s" % tuple(c0))
A = np.abs(J)
for name, i in [("acceleration", 0), ("steering rate", 1)]:
    tot = A[i].sum()
    print(name, "share of the summed |sensitivity| in the first 10 / 12 / 15 / 20 waypoints: " +
          " / ".join("%.1f%%" % (100 * A[i, :n].sum() / tot) for n in (10, 12, 15, 20)),
          "| largest beyond waypoint 20, relative to the maximum: %.2e" % (A[i, 20:].max() / A[i].max()))
print("nudge: d accel / d speed action = %.3f, d steer / d speed action = %.4f, d accel / d curvature action = %.4f, d steer / d curvature action = %.3f"
      % (Jn[0, 0], Jn[1, 0], Jn[0, 1], Jn[1, 1]))
# one number per cell: each command row is scaled by its own maximum, and a cell takes the larger of its two values
rel = np.maximum(A[0] / A[0].max(), A[1] / A[1].max())           # [80, 3]
print("cells with relative influence > 0.5: %d, > 0.1: %d, > 0.01: %d of 240" % ((rel > 0.5).sum(), (rel > 0.1).sum(), (rel > 0.01).sum()))
print("relative influence per waypoint (max of x, y, heading), waypoints 1..24:", np.round(rel.max(1)[:24], 3).tolist())
json.dump({"relative": np.round(rel, 4).tolist(), "accel": J[0].tolist(), "steer": J[1].tolist(), "nudge": Jn.tolist()}, open(out_path, "w"))
