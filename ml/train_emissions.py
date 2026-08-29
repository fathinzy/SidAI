"""
Train the SmartLorry emission prediction model.

Predicts CO, CO2, NOx and Methane (grams) for a road segment from operational
features (speed, load, idle, congestion, fuel, lorry class).

Model: multi-output RandomForestRegressor.
  - trains in seconds, no GPU
  - exports a small .joblib that runs inside AWS Lambda
  - exposes feature importances for the Explainable-AI dashboard panel

Outputs:
  ml/models/emissions_model.joblib   (the trained model + metadata)
  ml/models/emissions_metrics.json   (R2 / MAE per target + feature importances)
"""

import json
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
import joblib

from features import (
    row_to_features, feature_names, EMISSION_TARGETS,
)

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data-simulator", "output", "telemetry.csv")
MODELS_DIR = os.path.join(HERE, "models")


def main():
    if not os.path.exists(DATA):
        raise SystemExit(
            f"Telemetry not found at {DATA}. Run data-simulator/generate.py first."
        )
    os.makedirs(MODELS_DIR, exist_ok=True)

    df = pd.read_csv(DATA)
    print(f"Loaded {len(df)} telemetry rows")

    X = np.array([row_to_features(r) for r in df.to_dict("records")], dtype=float)
    y = df[EMISSION_TARGETS].values.astype(float)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=120,
        max_depth=16,
        min_samples_leaf=3,
        n_jobs=-1,
        random_state=42,
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    metrics = {"per_target": {}, "feature_importances": {}}
    for i, target in enumerate(EMISSION_TARGETS):
        r2 = r2_score(y_test[:, i], pred[:, i])
        mae = mean_absolute_error(y_test[:, i], pred[:, i])
        metrics["per_target"][target] = {"r2": round(float(r2), 4), "mae": round(float(mae), 3)}
        print(f"  {target:>7}: R2={r2:.4f}  MAE={mae:.3f}")

    names = feature_names()
    importances = model.feature_importances_
    ranked = sorted(zip(names, importances), key=lambda kv: kv[1], reverse=True)
    metrics["feature_importances"] = {n: round(float(v), 4) for n, v in ranked}

    joblib.dump(
        {"model": model, "feature_names": names, "targets": EMISSION_TARGETS},
        os.path.join(MODELS_DIR, "emissions_model.joblib"),
    )
    with open(os.path.join(MODELS_DIR, "emissions_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    print("\nTop feature importances:")
    for n, v in ranked[:6]:
        print(f"  {n:>28}: {v:.3f}")
    print(f"\nSaved model -> {os.path.join(MODELS_DIR, 'emissions_model.joblib')}")


if __name__ == "__main__":
    main()
