"""
Stage backend source + data into api/_backend so Vercel bundles them with the
Python serverless function (api/index.py).

Why: the Vercel function can only import/read files that live under the function's
directory tree. The simulator output (data-simulator/output) is gitignored, so we
copy a runtime-only snapshot into api/_backend/data, which IS committed.

We deliberately ship only the stdlib physics/heuristic path (no .joblib models,
no scikit-learn), matching the free-tier Lambda build in docs/DEPLOYMENT.md. That
keeps the deployment small and cold starts fast; predictions use the same physics
model that generated the data.

Run from the repo root:
    python scripts/stage_vercel.py
"""

import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_SRC = os.path.join(ROOT, "backend")
DATA_SRC = os.path.join(ROOT, "data-simulator", "output")

DEST = os.path.join(ROOT, "api", "_backend")
DEST_DATA = os.path.join(DEST, "data")

# Backend python modules the router/service need at runtime.
PY_FILES = [
    "router.py",
    "service.py",
    "features.py",
    "congestion_features.py",
]

# Data artifacts the service reads at runtime.
DATA_FILES = [
    "fleet.json",
    "telemetry.csv",
    "trips.csv",
    "congestion.csv",
]


def _copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    print(f"  {os.path.relpath(src, ROOT)} -> {os.path.relpath(dst, ROOT)}")


def main():
    print("Staging backend source -> api/_backend")
    os.makedirs(DEST, exist_ok=True)
    for name in PY_FILES:
        src = os.path.join(BACKEND_SRC, name)
        if not os.path.exists(src):
            raise SystemExit(f"missing backend file: {src}")
        _copy(src, os.path.join(DEST, name))

    print("Staging data -> api/_backend/data")
    os.makedirs(DEST_DATA, exist_ok=True)
    missing = []
    for name in DATA_FILES:
        src = os.path.join(DATA_SRC, name)
        if not os.path.exists(src):
            missing.append(name)
            continue
        _copy(src, os.path.join(DEST_DATA, name))

    if missing:
        print("\nWARNING: missing data files (run data-simulator/generate.py first):")
        for m in missing:
            print(f"  - {m}")

    print("\nDone. api/_backend is ready for Vercel to bundle.")


if __name__ == "__main__":
    main()
