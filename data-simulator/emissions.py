"""
Emissions physics for SmartLorry.

Models tailpipe emissions of CO, CO2, NOx and Methane (CH4) for heavy goods
vehicles as a function of speed, load and idling. The core idea (SDG 13 relevant):
emissions per km form a U-shaped curve against speed. They are worst at very low
speeds (stop-go congestion, idling) and lowest around a "sweet spot" cruise speed.

References the general shape used in road-transport emission models (e.g. COPERT-style
speed-dependent emission factors), simplified for a hackathon-grade simulator.
All outputs are grams unless stated.
"""

from dataclasses import dataclass
from math import exp

from malaysia import LorryClass


# Reference emission rates (grams per litre of diesel burned), Euro 4 baseline.
# CO2 from diesel is well established (~2.68 kg CO2 per litre).
G_PER_LITRE = {
    "co2": 2680.0,   # g CO2 / litre diesel
    "co": 9.0,       # g CO / litre (incomplete combustion, worse when idling)
    "nox": 33.0,     # g NOx / litre
    "ch4": 0.15,     # g methane / litre
}

CRUISE_SWEET_SPOT_KMH = 65.0  # most efficient cruising speed for HGV


@dataclass
class EmissionResult:
    co_g: float
    co2_g: float
    nox_g: float
    ch4_g: float
    fuel_l: float

    def as_dict(self):
        return {
            "co_g": round(self.co_g, 3),
            "co2_g": round(self.co2_g, 2),
            "nox_g": round(self.nox_g, 4),
            "ch4_g": round(self.ch4_g, 5),
            "fuel_l": round(self.fuel_l, 4),
        }


def _speed_penalty(speed_kmh: float) -> float:
    """
    Multiplier on fuel/emissions vs the cruise sweet spot.
    U-shaped: high at low speed (congestion/idle), min near sweet spot,
    slight rise at very high speed (aero drag).
    """
    if speed_kmh < 1.0:
        # effectively idling: very high per-distance penalty handled separately
        return 3.2
    low = 55.0 * exp(-speed_kmh / 12.0)          # steep penalty at crawl speeds
    high = 0.00025 * (max(speed_kmh - CRUISE_SWEET_SPOT_KMH, 0) ** 2)
    return 1.0 + low + high


def _load_penalty(load_ratio: float) -> float:
    """More cargo -> more fuel. load_ratio in 0..1 of max payload."""
    return 1.0 + 0.45 * max(0.0, min(load_ratio, 1.2))


def segment_emissions(
    lorry: LorryClass,
    distance_km: float,
    avg_speed_kmh: float,
    load_ratio: float,
    idle_seconds: float,
) -> EmissionResult:
    """
    Compute emissions for a road segment (moving portion + idling portion).
    Electric lorries produce zero tailpipe emissions.
    """
    if lorry.fuel == "electric":
        return EmissionResult(0.0, 0.0, 0.0, 0.0, 0.0)

    # --- moving portion ---
    base_l = lorry.base_l_per_100km / 100.0 * distance_km
    moving_l = base_l * _speed_penalty(avg_speed_kmh) * _load_penalty(load_ratio)

    # --- idling portion --- HGV diesel idles ~2.5 L/hour
    idle_l = 2.5 * (idle_seconds / 3600.0) * _load_penalty(load_ratio)

    total_l = (moving_l + idle_l)

    ef = lorry.emission_factor
    # CO and CH4 disproportionately worse during idling / incomplete combustion
    idle_dirtiness = 1.0 + 1.8 * (idle_l / total_l if total_l > 0 else 0)

    return EmissionResult(
        co_g=total_l * G_PER_LITRE["co"] * ef * idle_dirtiness,
        co2_g=total_l * G_PER_LITRE["co2"] * ef,
        nox_g=total_l * G_PER_LITRE["nox"] * ef,
        ch4_g=total_l * G_PER_LITRE["ch4"] * ef * idle_dirtiness,
        fuel_l=total_l,
    )
