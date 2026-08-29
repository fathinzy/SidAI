"""
Stage runtime assets into backend/ before `sam build`.

Copies the simulated data CSVs (and trained models, if present) into
backend/data and backend/models so the Lambda zip is self-contained and
service.py can read them from /var/task at runtime.

Run from anywhere:
    python infra/stage_assets.py
"""

import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(ROOT, "backend")
DATA_SRC = os.path.join(ROOT, "data-simulator", "output")
MODELS_SRC = os.path.join(ROOT, "ml", "models")

DATA_DST = os.path.join(BACKEND, "data")
MODELS_DST = os.path.join(BACKEND, "models")


def copy_dir(src, dst, patterns):
    if not os.path.isdir(src):
        print(f"  (skip) source not found: {src}")
        return 0
    os.makedirs(dst, exist_ok=True)
    n = 0
    for fname in os.listdir(src):
        if any(fname.endswith(p) for p in patterns):
            shutil.copy2(os.path.join(src, fname), os.path.join(dst, fname))
            n += 1
    return n


def main():
    print("Staging SmartLorry assets into backend/ for Lambda packaging...")
    d = copy_dir(DATA_SRC, DATA_DST, [".csv", ".json"])
    print(f"  data files staged: {d}  -> {DATA_DST}")
    # Models are only used if scikit-learn is bundled (container build). For the
    # zip build the physics fallback runs, but we stage metrics for /api/explain.
    m = copy_dir(MODELS_SRC, MODELS_DST, [".json"])
    print(f"  model metadata staged: {m} -> {MODELS_DST}")
    if d == 0:
        print("\nWARNING: no data staged. Run data-simulator/generate.py first.")
    print("Done.")


if __name__ == "__main__":
    main()
