"""
Shared feature engineering for congestion model (backend copy).
MUST stay identical to ml/congestion_features.py to avoid train/serve skew.
"""

from math import sin, cos, pi
from typing import Dict, List


def cyclical(value: float, period: float) -> List[float]:
    angle = 2.0 * pi * (value / period)
    return [sin(angle), cos(angle)]


def congestion_feature_names(segments: List[str]) -> List[str]:
    names = ["hour_sin", "hour_cos", "dow_sin", "dow_cos", "is_weekend"]
    names += [f"seg={s}" for s in segments]
    return names


def congestion_row_to_features(row: Dict, segments: List[str]) -> List[float]:
    hour = float(row.get("hour", 0))
    dow = float(row.get("day_of_week", 0))
    feats = []
    feats += cyclical(hour, 24.0)
    feats += cyclical(dow, 7.0)
    feats.append(1.0 if dow >= 5 else 0.0)
    seg = str(row.get("segment_id", ""))
    feats += [1.0 if seg == s else 0.0 for s in segments]
    return feats
