"""Agent implementations for the Abyssal benchmark."""

from .ppo_agent import PPOAgent, DEFAULT_PPO_KWARGS, DEFAULT_POLICY_KWARGS

__all__ = [
    "PPOAgent",
    "DEFAULT_PPO_KWARGS",
    "DEFAULT_POLICY_KWARGS",
]
