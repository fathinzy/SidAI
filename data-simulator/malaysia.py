"""
Malaysian freight domain model for SmartLorry.

Defines realistic lorry types, freight corridors, cities and road segments used by
the telemetry generator. Coordinates are approximate real lat/lng so the dashboard
map renders over actual Malaysian geography.
"""

from dataclasses import dataclass, field
from typing import List, Tuple


# --- Lorry / HGV classes common in Malaysia ---------------------------------
# emission_factor scales base emissions; diesel age & class matter a lot.
@dataclass(frozen=True)
class LorryClass:
    name: str
    fuel: str            # diesel | biodiesel-b20 | electric
    gvw_tonnes: float    # gross vehicle weight
    base_l_per_100km: float   # baseline fuel burn at cruising
    emission_factor: float    # relative dirtiness (1.0 = reference Euro 4 diesel)


LORRY_CLASSES: List[LorryClass] = [
    LorryClass("Rigid 2-axle (Euro 5)", "diesel", 12.0, 22.0, 0.85),
    LorryClass("Rigid 3-axle (Euro 4)", "diesel", 18.0, 28.0, 1.00),
    LorryClass("Prime mover + trailer (Euro 5)", "diesel", 40.0, 38.0, 0.90),
    LorryClass("Prime mover + trailer (Euro 3)", "diesel", 40.0, 42.0, 1.25),
    LorryClass("Rigid 3-axle (B20 biodiesel)", "biodiesel-b20", 18.0, 28.5, 0.80),
    LorryClass("Electric rigid (BEV)", "electric", 16.0, 0.0, 0.00),
]


# --- Malaysian cities / freight nodes ---------------------------------------
@dataclass(frozen=True)
class Node:
    name: str
    lat: float
    lng: float


NODES = {
    "port_klang":   Node("Port Klang", 3.0000, 101.3900),
    "shah_alam":    Node("Shah Alam", 3.0733, 101.5185),
    "kl":           Node("Kuala Lumpur", 3.1390, 101.6869),
    "petaling":     Node("Petaling Jaya", 3.1073, 101.6067),
    "klia":         Node("KLIA / Sepang", 2.7456, 101.7072),
    "seremban":     Node("Seremban", 2.7297, 101.9381),
    "ipoh":         Node("Ipoh", 4.5975, 101.0901),
    "johor_bahru":  Node("Johor Bahru", 1.4927, 103.7414),
    "penang":       Node("Penang (Butterworth)", 5.3991, 100.3639),
    "kuantan":      Node("Kuantan Port", 3.9639, 103.4292),
}


# --- Freight corridors (ordered sequences of nodes) -------------------------
@dataclass(frozen=True)
class Corridor:
    name: str
    node_keys: List[str]
    typical_congestion: float  # 0..1 baseline congestion propensity


CORRIDORS: List[Corridor] = [
    Corridor("Port Klang - KL Distribution", ["port_klang", "shah_alam", "petaling", "kl"], 0.75),
    Corridor("North-South Expressway (KL-JB)", ["kl", "seremban", "johor_bahru"], 0.45),
    Corridor("North-South Expressway (KL-Penang)", ["kl", "ipoh", "penang"], 0.40),
    Corridor("KLIA Air-Freight Link", ["kl", "klia"], 0.55),
    Corridor("East Coast (KL-Kuantan)", ["kl", "kuantan"], 0.35),
]


def haversine_km(a: Node, b: Node) -> float:
    """Great-circle distance in km between two nodes."""
    from math import radians, sin, cos, asin, sqrt
    lat1, lon1, lat2, lon2 = map(radians, [a.lat, a.lng, b.lat, b.lng])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


def corridor_segments(corridor: Corridor) -> List[Tuple[Node, Node]]:
    """Return consecutive (from, to) node pairs for a corridor."""
    keys = corridor.node_keys
    return [(NODES[keys[i]], NODES[keys[i + 1]]) for i in range(len(keys) - 1)]
