"""
agents/base.py — Common agent adapter interface (Phase 5)

Any agent that can be evaluated by BenchmarkRunner must satisfy this interface.

Design
──────
- Kept deliberately minimal: ``get_policy_id()`` + ``predict()``.
- ``reset()`` is provided for agents that maintain per-episode state
  (e.g. recurrent policies).  Stateless agents can leave it as a no-op.
- The interface is expressed as both an abstract base class (ABC) and a
  Protocol so that external agents can satisfy it structurally (duck-typing)
  without inheriting from our ABC.

Usage::

    class MyAgent(BenchmarkAgent):
        def get_policy_id(self) -> str:
            return "my-agent-v1"

        def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
            ...
"""

from __future__ import annotations

import abc
from typing import runtime_checkable, Protocol

import numpy as np


# ─── Protocol (structural typing) ─────────────────────────────────────────────

@runtime_checkable
class AgentProtocol(Protocol):
    """
    Structural protocol for benchmarkable agents.

    External agents that implement these methods satisfy this protocol without
    inheriting from BenchmarkAgent.  Use ``isinstance(agent, AgentProtocol)``
    to check compatibility at runtime.
    """

    def get_policy_id(self) -> str:
        """Return a short, stable string identifying this agent."""
        ...

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """
        Return an action given an observation.

        Args:
            obs:          1-D float32 array of shape (OBS_DIM,).
            deterministic: If True, return the most likely action.
                           If False, may sample from a distribution.

        Returns:
            Action array of shape (2,) in the range [-1, 1].
        """
        ...

    def reset(self) -> None:
        """
        Called at the start of each evaluation episode.

        Stateless agents may implement this as a no-op.  Recurrent policies
        should clear their hidden state here.
        """
        ...


# ─── Abstract base class ──────────────────────────────────────────────────────

class BenchmarkAgent(abc.ABC):
    """
    Abstract base class for benchmarkable agents.

    Inheriting from this class enforces the interface at class-definition time
    rather than at evaluation time.  Preferred for agents defined within this
    repository.
    """

    @abc.abstractmethod
    def get_policy_id(self) -> str:
        """Return a short, stable string identifying this agent."""

    @abc.abstractmethod
    def predict(self, obs: np.ndarray, deterministic: bool = True) -> np.ndarray:
        """
        Return an action given an observation.

        Args:
            obs:          1-D float32 array of shape (OBS_DIM,).
            deterministic: If True, return the most likely action.

        Returns:
            Action array of shape (2,) in the range [-1, 1].
        """

    def reset(self) -> None:
        """
        Called at the start of each evaluation episode.

        Default implementation is a no-op; override for stateful agents.
        """
