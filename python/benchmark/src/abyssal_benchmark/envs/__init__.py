"""Gymnasium environments for the Abyssal benchmark."""

from .navigation_env import (
    OBS_DIM,
    N_OBS_OBSTACLES,
    DT,
    MAX_SPEED,
    MAX_THRUST,
    AGENT_RADIUS,
    AbyssalNavigationEnv,
)
from .world_gen import GeneratedWorld, PlacedObstacle, generate_world
from .make_env import ENV_ID, make_env, register_envs

# Register on import so `gym.make("AbyssalNavigation-v0")` works after
# `import abyssal_benchmark.envs`
register_envs()

__all__ = [
    "AbyssalNavigationEnv",
    "GeneratedWorld",
    "PlacedObstacle",
    "generate_world",
    "make_env",
    "register_envs",
    "ENV_ID",
    "OBS_DIM",
    "N_OBS_OBSTACLES",
    "DT",
    "MAX_SPEED",
    "MAX_THRUST",
    "AGENT_RADIUS",
]
