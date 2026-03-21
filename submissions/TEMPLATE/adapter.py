"""
adapter.py — Abyssal Benchmark submission adapter template

Copy this file into your submission directory and implement the three
required methods: get_policy_id(), load(), and predict().

See docs/submissions/adapter_spec.md for the full adapter specification.

Observation space:
    Standard  (38-dim): indices 0–37 as documented in adapter_spec.md
    Uncertainty (41-dim): indices 0–40 (set requires_uncertainty_obs = True
                          and observation_type = "uncertainty" in metadata.json)

Action space:
    float32 shape (2,) in [-1, 1]
    Index 0: thrust  (positive = forward, negative = backward)
    Index 1: yaw     (positive = rotate right, negative = rotate left)
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

# Uncomment if inheriting from the abstract base class (recommended):
# from abyssal_benchmark.agents.base import BenchmarkAgent
# class YourAgent(BenchmarkAgent):


class YourAgent:
    """
    Template adapter — replace with your agent implementation.

    Fields
    ------
    _model : your model object, loaded in load()
    """

    # ── Optional: set to True if you use the 41-dim uncertainty observation ──

    @property
    def requires_uncertainty_obs(self) -> bool:
        """
        Return True to receive the extended 41-dim observation.
        Must match observation_type in metadata.json.
        Default: False (38-dim standard observation).
        """
        return False

    # ── Required methods ──────────────────────────────────────────────────────

    def get_policy_id(self) -> str:
        """
        Return a short, stable kebab-case identifier for this agent.

        Must match:
          - agent_id in metadata.json
          - policyId in all submitted replay headers

        Example: "cautious-ppo-v2"
        """
        # TODO: replace with your actual agent id
        return "your-agent-v1"

    def load(self, model_dir: Path) -> None:
        """
        Load model weights from model_dir before evaluation begins.

        model_dir is the absolute path to your submission's model/ directory.
        Leave as a no-op if your agent has no weights to load.

        Example (Stable Baselines3):
            from stable_baselines3 import PPO
            self._model = PPO.load(str(model_dir / "policy.zip"))
        """
        # TODO: load your model here
        # Example:
        # from stable_baselines3 import PPO
        # self._model = PPO.load(str(model_dir / "policy.zip"))
        pass

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """
        Return an action for the given observation.

        Args:
            obs:           float32 array, shape (38,) or (41,) depending on
                           requires_uncertainty_obs.
            deterministic: If True (evaluation default), return deterministic action.

        Returns:
            float32 array of shape (2,) in [-1, 1].
        """
        # TODO: replace with your inference code
        # Example (Stable Baselines3):
        # action, _ = self._model.predict(obs, deterministic=deterministic)
        # return action.astype(np.float32)

        # Fallback: zero action (stationary)
        return np.zeros(2, dtype=np.float32)

    def reset(self) -> None:
        """
        Called at the start of each evaluation episode.

        Clear any hidden state here (e.g. RNN hidden vectors).
        Leave as a no-op if your agent is stateless.
        """
        pass
