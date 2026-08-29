"""
Shared feature engineering for SmartLorry models.

CRITICAL: both training (ml/) and inference (backend/) import this exact logic so
there is no train/serve skew. Keep this dependency-light (stdlib + optional numpy)
so it loads cleanly inside AWS Lambda.
"""

from typing import Dict, List

# Categorical vocabularies (must stay stable across train + serve)
FUEL_TYPES: List[str] = ["diesel", "biodiesel-b20", "electric"]

LORRY_CLASSES: List[str] = [
    "Rigid 2-axle (Euro 5)",
    "Rigid 3-axle (Euro 4)",
    "Prime mover + trailer (Euro 5)",
    "Prime mover + trailer (Euro 3)",
    "Rigid 3-axle (B20 biodiesel)",
    "Electric rigid (BEV)",
]

# Numeric feature order used by the model
NUMERIC_FEATURES: List[str] = [
    "distance_km",
    "avg_speed_kmh",
    "congestion_index",
    "load_ratio",
    "idle_seconds",
    "hour",
    "day_of_week",
]

EMISSION_TARGETS: List[str] = ["co_g", "co2_g", "nox_g", "ch4_g"]


def _one_hot(value: str, vocab: List[str]) -> List[float]:
    return [1.0 if value == v else 0.0 for v in vocab]


def feature_names() -> List[str]:
    """Human-readable feature names in the exact model input order."""
    names = list(NUMERIC_FEATURES)
    names += [f"fuel={v}" for v in FUEL_TYPES]
    names += [f"class={v}" for v in LORRY_CLASSES]
    return names


def row_to_features(row: Dict) -> List[float]:
    """
    Convert a telemetry-like dict into the ordered numeric feature vector.
    Unknown categoricals map to all-zeros (safe default).
    """
    numeric = [float(row.get(k, 0.0) or 0.0) for k in NUMERIC_FEATURES]
    fuel = _one_hot(str(row.get("fuel", "")), FUEL_TYPES)
    klass = _one_hot(str(row.get("class", "")), LORRY_CLASSES)
    return numeric + fuel + klass
