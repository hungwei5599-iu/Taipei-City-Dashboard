# Pre-Hackathon Tools

Last updated: 2026-05-01

This folder stores source for local pre-hackathon helper tools.

These tools are not competition implementation code. They may be used to understand data and generate evidence before the competition, but their source must not be copied into the official fork as a substitute for competition work.

## Tools

| Folder | Purpose |
|---|---|
| `event-generator/` | Local scenario event generator for prototype data |
| `geocoding-proxy/` | Local geocoding helper with SQLite cache |

## Environment Rule

Do not commit `venv`, `.venv`, runtime logs, or local secrets. Recreate the environment from `requirements.txt`.
