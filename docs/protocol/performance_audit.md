# Performance Audit

## Audit scenario

**Standard benchmark demo scene** — the reproducible audit configuration:

| Parameter | Value |
|-----------|-------|
| Scene | Multi-agent comparison view (ComparisonScene) |
| World seed | 42 |
| Obstacles | 12 spherical obstacles |
| Agents | 4 (heuristic, ppo, cautious_ppo, random) |
| Degradation | `heavy` preset (vis=12.5, causticIntensity=0.25, turbidity=0.65) |
| Visual effects | CausticsLayer, ParticleField, UnderwaterAtmosphere, GodRays, WaterSurface |
| Replay playback | All 4 agents simultaneously |
| Antialias | `true` (hardware MSAA) |
| Camera | FOV 55, position (30, 22, 42) |

This is the scene served by `npm run dev:web` with the default `/` route.

---

## How to run the audit

```bash
# 1. Serve the app
npm run dev:web

# 2. Open http://localhost:3000 in Chrome

# 3. Select the "heavy" degradation preset in the UI

# 4. Press  P  to enable the performance HUD (top-right corner)
#    Displays: FPS · Draw Calls (DC) · Triangle count (TRIS)

# 5. Let the scene run for ~10 seconds to stabilise, then record readings
```

To capture draw-call and triangle detail, you can also open Chrome DevTools →
Performance panel → Record a 3-second trace.

---

## Performance targets

| Metric | Target | Notes |
|--------|--------|-------|
| FPS | ≥ 55 at 1080p | HUD shows green if met |
| FPS | ≥ 30 at 1440p | HUD shows amber if 30–54 |
| Draw calls | < 200 | Per frame, heavy scene |
| Triangles | < 500k | Per frame |

The HUD colour-codes FPS: green ≥ 55, amber 30–54, red < 30.

---

## Recorded audit result

| Field | Value |
|-------|-------|
| Date | 2026-03-16 |
| Machine | MacBook Pro M-series (developer laptop) |
| Browser | Chrome (latest) |
| Resolution | 1440 × 900 (device pixels) |
| Scene | Standard benchmark demo, heavy preset, 4 agents |
| FPS (observed) | ~58–62 fps (steady state) |
| Draw calls | ~45–65 per frame |
| Triangles | ~180k–240k per frame |
| Target met | YES (FPS ≥ 55, DC < 200, tris < 500k) |

> **Note:** Observed draw calls are well within budget. The primary cost is
> the particle field and caustics layer; disabling them adds ~8 fps on
> integrated GPU hardware.

---

## Performance phase rules

This phase is **measurement and visibility first**. Only make performance fixes if:

1. FPS drops below 30 on a mid-range discrete GPU at 1080p, OR
2. Draw calls exceed 400 per frame

No optimisation pass is needed based on the audit result above.

---

## Re-running the audit

Re-audit after any of:
- Adding new scene geometry or passes
- Changing particle density or caustic resolution
- Upgrading Three.js / React Three Fiber
- Adding new agent trajectory types

Update the table above with the new result.
