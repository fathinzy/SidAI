"""
Train the SmartLorry congestion forecasting model.

Predicts congestion_index (0..1) for a road segment at a given hour / day-of-week,
so the fleet can proactively re-route lorries away from idle-heavy jams (SDG 13).

Model: RandomForestRegressor with cyclical time features.

Outputs:
  ml/models/congestion_model.joblib
  ml/models/congestion_metrics.json
"""

import json
import os

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
import joblib

from congestion_features import congestion_row_to_features, congestion_feature_names

HERE = os.path.dirname(__file__)
DATA = os.path.join(HERE, "..", "data-simulator", "output", "congestion.csv")
MODELS_DIR = os.path.join(HERE, "models")


def main():
    if not os.path.exists(DATA):
        raise SystemExit(
            f"Congestion data not found at {DATA}. Run data-simulator/generate.py first."
        )
    os.makedirs(MODELS_DIR, exist_ok=True)

    df = pd.read_csv(DATA)
    print(f"Loaded {len(df)} congestion rows")

    segments = sorted(df["segment_id"].unique().tolist())
    X = np.array(
        [congestion_row_to_features(r, segments) for r in df.to_dict("records")],
        dtype=float,
    )
    y = df["congestion_index"].values.astype(float)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(
        n_estimators=150, max_depth=14, min_samples_leaf=2,
        n_jobs=-1, random_state=42,
    )
    model.fit(X_train, y_train)

    pred = np.clip(model.predict(X_test), 0.0, 1.0)
    r2 = r2_score(y_test, pred)
    mae = mean_absolute_error(y_test, pred)
    print(f"  congestion_index: R2={r2:.4f}  MAE={mae:.4f}")

    metrics = {
        "r2": round(float(r2), 4),
        "mae": round(float(mae), 4),
        "n_segments": len(segments),
    }

    joblib.dump(
        {"model": model, "segments": segments},
        os.path.join(MODELS_DIR, "congestion_model.joblib"),
    )
    with open(os.path.join(MODELS_DIR, "congestion_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"Segments: {len(segments)}")
    print(f"Saved model -> {os.path.join(MODELS_DIR, 'congestion_model.joblib')}")


if __name__ == "__main__":
    main()
