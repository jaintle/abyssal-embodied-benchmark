"""Agent implementations for the Abyssal benchmark."""

from .base import BenchmarkAgent, AgentProtocol
from .random_agent import RandomAgent
from .heuristic_agent import HeuristicAgent

# PPOAgent requires stable-baselines3; import lazily to keep base agents usable
# without the SB3 dependency.
try:
    from .ppo_agent import PPOAgent, DEFAULT_PPO_KWARGS, DEFAULT_POLICY_KWARGS
    from .cautious_agent import CautiousAgent, CautiousRewardWrapper
    _HAS_SB3 = True
except ImportError:
    _HAS_SB3 = False

__all__ = [
    "BenchmarkAgent",
    "AgentProtocol",
    "RandomAgent",
    "HeuristicAgent",
]
if _HAS_SB3:
    __all__ += [
        "PPOAgent", "DEFAULT_PPO_KWARGS", "DEFAULT_POLICY_KWARGS",
        "CautiousAgent", "CautiousRewardWrapper",
    ]
