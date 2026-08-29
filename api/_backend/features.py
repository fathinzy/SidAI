"""
Shared feature engineering for SmartLorry emission model (backend copy).

This MUST stay identical to ml/features.py to avoid train/serve skew.
Kept dependency-light (stdlib only) so it loads cleanly inside AWS Lambda.
"""

from typing import Dict, List

FUEL_TYPES: List[str] = ["diesel", "biodiesel-b20", "electric"]

LORRY_CLASSES: List[str] = [
    "Rigid 2-axle (Euro 5)",
    "Rigid 3-axle (Euro 4)",
    "Prime mover + trailer (Euro 5)",
    "Prime mover + trailer (Euro 3)",
    "Rigid 3-axle (B20 biodiesel)",
    "Electric rigid (BEV)",
]

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
    names = list(NUMERIC_FEATURES)
    names += [f"fuel={v}" for v in FUEL_TYPES]
    names += [f"class={v}" for v in LORRY_CLASSES]
    return names


def row_to_features(row: Dict) -> List[float]:
    numeric = [float(row.get(k, 0.0) or 0.0) for k in NUMERIC_FEATURES]
    fuel = _one_hot(str(row.get("fuel", "")), FUEL_TYPES)
    klass = _one_hot(str(row.get("class", "")), LORRY_CLASSES)
    return numeric + fuel + klass
