# [Your Agent Name] — Abyssal Benchmark Submission

**Submission ID:** `your-agent-v1`
**Benchmark version:** `1.0.0`
**Algorithm:** PPO (replace with yours)
**Observation space:** standard (38-dim)
**Status:** provisional

---

## What this agent does

Describe your agent in 2–4 sentences. What algorithm does it use? Is it trained
with any special objectives (e.g. uncertainty penalty, auxiliary losses)?
What observation features does it exploit?

Example:
> A PPO policy trained for 200 k steps using the standard 38-dimensional
> observation space. No reward shaping beyond the built-in goal/collision
> signal. Uses the Stable Baselines3 implementation with default
> hyperparameters except clip_range=0.1.

---

## Reproducing training

Describe how to reproduce training from scratch. Include:

1. Environment setup
2. Training command
3. Approximate wall-clock time and hardware

```bash
# Example:
pip install -r requirements.txt
python train.py --env AbyssalNav-v1 --steps 200000 --seed 42
```

If model weights are included in `model/`, training reproduction is optional
but appreciated.

---

## Known limitations / caveats

- [ ] Agent was only trained on the clear preset — heavy-preset performance may degrade
- [ ] Random seed was not fixed for all framework components — results may not be bit-for-bit reproducible
- [ ] Add any other known issues here

---

## License

MIT (or replace with your license)

---

## Citation

If you use this submission in a paper, please cite:

```bibtex
@misc{yourlabel2026,
  author = {Your Name},
  title  = {Your Agent Name},
  year   = {2026},
  url    = {https://github.com/your-username/your-repo}
}
```
