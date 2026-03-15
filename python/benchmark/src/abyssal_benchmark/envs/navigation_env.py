"""
navigation_env.py — AbyssalNavigationEnv (Phase 2 / updated Phase 7)

A Gymnasium environment for deterministic 2-D underwater navigation.

Coordinate frame
----------------
The agent navigates in the XZ plane (Y is "up" in the browser world, but is
unused here).  All positions and velocities are 2-D: [x, z].

Action space
------------
Box([-1, -1], [1, 1], float32) — normalised thrust in [x, z].
The env scales thrust by MAX_THRUST and integrates with fixed DT.

Observation space  (40-dimensional float32 vector)
------------------
Index   Quantity                        Notes
-----   --------                        -----
0–1     agent position (x, z)           metres, unbounded
2–3     agent velocity (vx, vz)         m/s
4–5     goal relative position (dx, dz) metres, goal_pos - agent_pos
6       distance to goal                metres
7       timestep fraction               [0, 1]
8–39    8 nearest obstacles × 4 floats  [rel_x, rel_z, dist, radius]
        Sorted by distance; zero-padded if fewer than 8 obstacles exist.

Degradation (Phase 7)
---------------------
When degradation_preset != "clear", the observation returned by step() and
reset() is corrupted before being returned to the agent.  The raw
(undegraded) observation is used internally for physics and reward.
Degradation is deterministic under fixed (episode_seed, step) pairs.

Termination / truncation
------------------------
terminated=True  on goal-reached or collision
truncated=True   on max_steps exceeded or out-of-bounds

Reward
------
  +dense  progress toward goal   (prev_dist - curr_dist) * PROGRESS_SCALE
  -const  step penalty           STEP_PENALTY per step
  +large  goal bonus             GOAL_REWARD on reaching goal
  -large  collision penalty      COLLISION_PENALTY on collision
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import gymnasium as gym
from gymnasium import spaces

from .world_gen import GeneratedWorld, PlacedObstacle, generate_world
from .degradation import apply_observation_degradation
from ..schemas.world_spec import DEGRADATION_PRESETS, DegradationSpec
from ..utils.seeding import derive_seed, seed_all

# ─── Physical constants ───────────────────────────────────────────────────────

DT: float = 0.1            # simulation timestep (seconds)
MAX_THRUST: float = 10.0   # max acceleration from agent action (m/s²)
MAX_SPEED: float = 5.0     # speed clamp (m/s)
AGENT_RADIUS: float = 0.3  # agent collision sphere radius (metres)

# ─── Observation layout ───────────────────────────────────────────────────────

N_OBS_OBSTACLES: int = 8   # number of obstacle slots in observation
OBS_DIM: int = 8 + N_OBS_OBSTACLES * 4  # 8 + 32 = 40

# ─── Reward constants ─────────────────────────────────────────────────────────

PROGRESS_SCALE: float = 1.0     # multiplier on dist-reduction reward
STEP_PENALTY: float = -0.005    # per-step penalty
GOAL_REWARD: float = 20.0       # sparse goal bonus
COLLISION_PENALTY: float = -10.0

# ─── Observation bounds ───────────────────────────────────────────────────────

_OBS_LOW = np.full(OBS_DIM, -1e4, dtype=np.float32)
_OBS_HIGH = np.full(OBS_DIM, 1e4, dtype=np.float32)
# Constrain timestep fraction to [0, 1]
_OBS_LOW[7] = 0.0
_OBS_HIGH[7] = 1.0
# Obstacle distances are non-negative
for _i in range(N_OBS_OBSTACLES):
    _OBS_LOW[8 + _i * 4 + 2] = 0.0   # dist slot
    _OBS_LOW[8 + _i * 4 + 3] = 0.0   # radius slot


# ─── Environment ─────────────────────────────────────────────────────────────


class AbyssalNavigationEnv(gym.Env):
    """
    Deterministic 2-D underwater navigation benchmark environment.

    The world geometry (obstacles, goal) is generated from ``world_seed``
    and never changes between episodes.  The agent always spawns at the
    world origin (0, 0).

    Parameters
    ----------
    world_seed:
        Seed for procedural world generation.  Determines obstacle layout
        and goal position.  Identical seeds produce identical worlds.
    episode_seed:
        Seed used for any per-episode randomness.  Used by the degradation
        pipeline to ensure fully deterministic observation corruption.
    max_steps:
        Hard truncation limit per episode.
    env_version:
        Version string recorded in replay headers.
    degradation_preset:
        Named degradation preset applied to observations.  One of
        "clear" (default), "mild", or "heavy".
    """

    metadata: Dict[str, Any] = {"render_modes": []}

    # ── Construction ─────────────────────────────────────────────────────────

    def __init__(
        self,
        world_seed: int = 42,
        episode_seed: int = 0,
        max_steps: int = 500,
        env_version: str = "0.1.0",
        degradation_preset: str = "clear",
    ) -> None:
        super().__init__()

        if degradation_preset not in DEGRADATION_PRESETS:
            raise ValueError(
                f"Unknown degradation_preset '{degradation_preset}'. "
                f"Valid options: {list(DEGRADATION_PRESETS)}"
            )

        self.world_seed = world_seed
        self.episode_seed = episode_seed
        self.max_steps = max_steps
        self.env_version = env_version
        self.degradation_preset = degradation_preset
        self._degradation: DegradationSpec = DEGRADATION_PRESETS[degradation_preset]

        # Generate world once at construction time
        self.world: GeneratedWorld = generate_world(world_seed)

        # ── Gymnasium spaces ─────────────────────────────────────────────
        self.action_space = spaces.Box(
            low=-1.0,
            high=1.0,
            shape=(2,),
            dtype=np.float32,
        )
        self.observation_space = spaces.Box(
            low=_OBS_LOW,
            high=_OBS_HIGH,
            dtype=np.float32,
        )

        # ── Episode state (initialised by reset) ─────────────────────────
        self._pos = np.zeros(2, dtype=np.float64)
        self._vel = np.zeros(2, dtype=np.float64)
        self._step = 0
        self._prev_dist: float = 0.0
        self._done: bool = False

    # ── Gymnasium API ─────────────────────────────────────────────────────────

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Reset the environment to the initial state.

        The world geometry does not change between episodes — only the
        agent's position/velocity are reset.

        Returns
        -------
        obs : np.ndarray  shape (OBS_DIM,) float32
        info : dict
        """
        super().reset(seed=seed)

        # Optionally re-seed with caller-provided seed
        if seed is not None:
            self.episode_seed = seed

        # Agent spawns at world centre
        self._pos[:] = [self.world.spawn_x, self.world.spawn_z]
        self._vel[:] = 0.0
        self._step = 0
        self._done = False
        self._prev_dist = self._dist_to_goal()

        obs = self._make_obs()
        info = self._make_info(reward=0.0, terminated=False, truncated=False)
        return obs, info

    def step(
        self, action: np.ndarray
    ) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """
        Advance the simulation by one timestep.

        Parameters
        ----------
        action : array-like, shape (2,)
            Normalised thrust in [-1, 1] for x and z axes.

        Returns
        -------
        obs          : np.ndarray  shape (OBS_DIM,) float32
        reward       : float
        terminated   : bool  goal reached or collision
        truncated    : bool  max_steps or out-of-bounds
        info         : dict
        """
        assert not self._done, "call reset() before step() after episode ends"

        # ── Clip action ───────────────────────────────────────────────────
        act = np.clip(np.asarray(action, dtype=np.float64), -1.0, 1.0)

        # ── Dynamics ──────────────────────────────────────────────────────
        # velocity += thrust_accel * dt
        self._vel += act * MAX_THRUST * DT
        # clamp speed
        speed = float(np.linalg.norm(self._vel))
        if speed > MAX_SPEED:
            self._vel *= MAX_SPEED / speed
        # position += velocity * dt
        self._pos += self._vel * DT

        self._step += 1

        # ── Termination conditions ────────────────────────────────────────
        curr_dist = self._dist_to_goal()
        goal_reached = curr_dist < self.world.goal_acceptance_radius
        collision = self._check_collision()
        out_of_bounds = self._check_oob()
        timed_out = self._step >= self.max_steps

        terminated = goal_reached or collision
        truncated = (not terminated) and (timed_out or out_of_bounds)

        # ── Reward (uses raw physics, not degraded obs) ────────────────────
        progress = (self._prev_dist - curr_dist) * PROGRESS_SCALE
        reward = progress + STEP_PENALTY

        if goal_reached:
            reward += GOAL_REWARD
        elif collision:
            reward += COLLISION_PENALTY

        self._prev_dist = curr_dist
        self._done = terminated or truncated

        obs = self._make_obs()
        info = self._make_info(
            reward=reward,
            terminated=terminated,
            truncated=truncated,
            goal_reached=goal_reached,
            collision=collision,
            out_of_bounds=out_of_bounds,
            timed_out=timed_out,
        )
        return obs, float(reward), terminated, truncated, info

    def render(self) -> None:
        """Not implemented for V1 — structured observations only."""
        return None

    def close(self) -> None:
        pass

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _dist_to_goal(self) -> float:
        dx = self._pos[0] - self.world.goal_x
        dz = self._pos[1] - self.world.goal_z
        return math.sqrt(dx * dx + dz * dz)

    def _check_collision(self) -> bool:
        """True if agent overlaps any obstacle (2-D disc test)."""
        px, pz = float(self._pos[0]), float(self._pos[1])
        for obs in self.world.obstacles:
            dist = math.hypot(px - obs.x, pz - obs.z)
            if dist < obs.radius + AGENT_RADIUS:
                return True
        return False

    def _check_oob(self) -> bool:
        """True if agent centre is beyond world boundary."""
        dist_from_origin = float(np.linalg.norm(self._pos))
        return dist_from_origin > self.world.world_radius

    def _sorted_obstacle_features(self) -> List[Tuple[float, float, float, float]]:
        """
        Return up to N_OBS_OBSTACLES obstacle feature tuples, sorted by
        distance from agent, padded with zeros.

        Each tuple: (rel_x, rel_z, dist, radius)
        """
        px, pz = float(self._pos[0]), float(self._pos[1])
        features: List[Tuple[float, float, float, float]] = []
        for obs in self.world.obstacles:
            rel_x = obs.x - px
            rel_z = obs.z - pz
            dist = math.hypot(rel_x, rel_z)
            features.append((rel_x, rel_z, dist, obs.radius))

        features.sort(key=lambda t: t[2])  # sort by distance

        # Pad to fixed length
        while len(features) < N_OBS_OBSTACLES:
            features.append((0.0, 0.0, 0.0, 0.0))

        return features[:N_OBS_OBSTACLES]

    def _make_obs(self) -> np.ndarray:
        """Build the observation vector and apply degradation if active."""
        obs = np.zeros(OBS_DIM, dtype=np.float32)

        px, pz = float(self._pos[0]), float(self._pos[1])
        vx, vz = float(self._vel[0]), float(self._vel[1])
        goal_dx = self.world.goal_x - px
        goal_dz = self.world.goal_z - pz
        dist = math.sqrt(goal_dx * goal_dx + goal_dz * goal_dz)
        ts_frac = min(self._step / max(self.max_steps, 1), 1.0)

        obs[0] = px
        obs[1] = pz
        obs[2] = vx
        obs[3] = vz
        obs[4] = goal_dx
        obs[5] = goal_dz
        obs[6] = dist
        obs[7] = ts_frac

        for i, (rel_x, rel_z, odist, orad) in enumerate(
            self._sorted_obstacle_features()
        ):
            base = 8 + i * 4
            obs[base]     = rel_x
            obs[base + 1] = rel_z
            obs[base + 2] = odist
            obs[base + 3] = orad

        # Apply degradation if preset is not "clear"
        if self.degradation_preset != "clear":
            obs = apply_observation_degradation(
                obs,
                self._degradation,
                self.episode_seed,
                self._step,
            )

        return obs

    def _make_info(
        self,
        reward: float,
        terminated: bool,
        truncated: bool,
        goal_reached: bool = False,
        collision: bool = False,
        out_of_bounds: bool = False,
        timed_out: bool = False,
    ) -> Dict[str, Any]:
        return {
            "world_seed": self.world_seed,
            "episode_seed": self.episode_seed,
            "degradation_preset": self.degradation_preset,
            "step": self._step,
            "pos_x": float(self._pos[0]),
            "pos_z": float(self._pos[1]),
            "vel_x": float(self._vel[0]),
            "vel_z": float(self._vel[1]),
            "dist_to_goal": self._dist_to_goal(),
            "reward": reward,
            "goal_reached": goal_reached,
            "collision": collision,
            "out_of_bounds": out_of_bounds,
            "timed_out": timed_out,
            "terminated": terminated,
            "truncated": truncated,
        }
