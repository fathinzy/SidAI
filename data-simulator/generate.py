"""
SmartLorry Malaysian fleet data generator.

Produces three CSV datasets under ./output:
  1. telemetry.csv   - per-segment records (speed, load, idle, emissions) over time
  2. trips.csv       - trip-level summaries (route, total emissions, CO2 saved vs baseline)
  3. congestion.csv  - hourly congestion index per corridor segment (for forecasting)

Also writes a fleet.json describing the simulated lorries.

Deterministic via --seed for reproducible demos.
"""

import argparse
import json
import os
import random
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

import malaysia as my
from emissions import segment_emissions

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "output")


COMPANIES = [
    "Lorriq Logistics Sdn Bhd", "MMC Freight Services", "Kontena Nasional Bhd",
    "Tiong Nam Logistics", "GD Express Carrier", "Pos Logistics Bhd",
    "Swift Haulage Bhd", "Century Logistics Holdings",
]

MAKE_MODELS = {
    "Rigid 2-axle (Euro 5)": [("Isuzu", "FVR 900"), ("Hino", "500 Series FG"), ("Fuso", "Fighter FN")],
    "Rigid 3-axle (Euro 4)": [("Hino", "500 Series GH"), ("Isuzu", "FVM 1200"), ("UD Trucks", "Croner PKE")],
    "Prime mover + trailer (Euro 5)": [("Volvo", "FH 460"), ("Scania", "R 500"), ("Mercedes-Benz", "Actros 2545")],
    "Prime mover + trailer (Euro 3)": [("Nissan Diesel", "CWB 450"), ("Hino", "700 Series"), ("Isuzu", "GXZ")],
    "Rigid 3-axle (B20 biodiesel)": [("Hino", "500 Series GH B20"), ("Isuzu", "FVM B20")],
    "Electric rigid (BEV)": [("Volvo", "FL Electric"), ("BYD", "ETH8"), ("Fuso", "eCanter")],
}

ENGINE_SPECS = {
    "Rigid 2-axle (Euro 5)": "5.2L / 210 hp",
    "Rigid 3-axle (Euro 4)": "7.7L / 280 hp",
    "Prime mover + trailer (Euro 5)": "12.8L / 460 hp",
    "Prime mover + trailer (Euro 3)": "11.0L / 380 hp",
    "Rigid 3-axle (B20 biodiesel)": "7.7L / 280 hp",
    "Electric rigid (BEV)": "Dual motor / 340 kW",
}

SHIPMENT_STATUSES = ["In Transit", "Loading", "Delivered", "Awaiting Dispatch", "Returning"]
VEHICLE_STATUSES = ["Moving", "Idle", "Stopped", "Ready for next trip"]
TYRE_CONDITIONS = ["Good", "Fair", "Change Due"]


def _date_str(base: datetime, days_offset: int) -> str:
    return (base + timedelta(days=days_offset)).strftime("%d/%m/%Y")


def build_fleet(n_lorries: int, rng: random.Random):
    """Build the fleet registry with full vehicle specs + operational details."""
    fleet = []
    today = datetime(2026, 8, 29)
    for i in range(n_lorries):
        cls = rng.choice(my.LORRY_CLASSES)
        make, model = rng.choice(MAKE_MODELS[cls.name])
        year = rng.randint(2015, 2025)
        state = rng.choice(["W", "B", "J", "P", "N", "A"])  # KL, Selangor, Johor, Penang, N.Sembilan, Perak
        payload = round(cls.gvw_tonnes * rng.uniform(0.55, 0.7) * 1000)  # kg
        fleet.append({
            # --- Registry ---
            "lorry_id": f"LRQ-{i+1:04d}",
            "system_id": f"SYS-{rng.randint(100000,999999)}",
            "registration_no": f"{state}{rng.choice(['AB','CD','EF','GH','JK'])}{rng.randint(1000,9999)}",
            "company": rng.choice(COMPANIES),
            "status": rng.choice(["Active", "Active", "Active", "Maintenance", "Inactive"]),
            "driver_id": f"DRV-{rng.randint(100,999)}",
            # --- Specifications ---
            "class": cls.name,
            "vehicle_type": "Prime Mover" if "Prime mover" in cls.name else "Rigid Truck",
            "make": make,
            "model": model,
            "year": year,
            "fuel": cls.fuel,
            "gvw_tonnes": cls.gvw_tonnes,
            "payload_kg": payload,
            "axles": 2 if "2-axle" in cls.name else (5 if "Prime mover" in cls.name else 3),
            "engine": ENGINE_SPECS[cls.name],
            # --- Operational details ---
            "insurance_expiry": _date_str(today, rng.randint(20, 360)),
            "roadtax_expiry": _date_str(today, rng.randint(20, 360)),
            "puspakom_due": _date_str(today, rng.randint(-10, 180)),
            "last_service": _date_str(today, -rng.randint(10, 150)),
            "odometer_km": rng.randint(45_000, 620_000),
            "gps_device_id": f"GPS-{rng.randint(10000,99999)}",
            "tyre_condition": rng.choice(TYRE_CONDITIONS),
            "tyre_last_change": _date_str(today, -rng.randint(30, 400)),
            # --- Live operational status (snapshot) ---
            "shipment_status": rng.choice(SHIPMENT_STATUSES),
            "vehicle_status": rng.choice(VEHICLE_STATUSES),
        })
    return fleet


def diurnal_congestion(hour: int, base: float) -> float:
    """Congestion index 0..1 with morning + evening peaks (Malaysian rush hours)."""
    # peaks ~08:00 and ~18:00
    morning = np.exp(-((hour - 8) ** 2) / 4.0)
    evening = np.exp(-((hour - 18) ** 2) / 5.0)
    idx = base * (0.35 + 0.9 * morning + 1.0 * evening)
    return float(np.clip(idx, 0.0, 1.0))


def speed_from_congestion(free_flow_kmh: float, congestion: float) -> float:
    """Higher congestion -> lower average speed (down to crawl)."""
    return float(max(4.0, free_flow_kmh * (1.0 - 0.85 * congestion)))


def lorry_class_by_name(name: str):
    for c in my.LORRY_CLASSES:
        if c.name == name:
            return c
    return my.LORRY_CLASSES[0]


def generate(n_lorries: int, days: int, seed: int):
    rng = random.Random(seed)
    np.random.seed(seed)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    fleet = build_fleet(n_lorries, rng)
    with open(os.path.join(OUTPUT_DIR, "fleet.json"), "w") as f:
        json.dump(fleet, f, indent=2)

    telemetry_rows = []
    trip_rows = []
    congestion_rows = []

    # Span several months ending near "today" so the all/year/month/day
    # time filters all have meaningful data to show.
    end = datetime(2026, 8, 29, 0, 0, 0)
    start = end - timedelta(days=days)

    # --- congestion time series per corridor segment ---
    # Only the most recent 30 days are needed for forecasting; keeps file small.
    cong_days = min(days, 30)
    cong_start = end - timedelta(days=cong_days)
    for corridor in my.CORRIDORS:
        segs = my.corridor_segments(corridor)
        for seg_idx, (a, b) in enumerate(segs):
            for d in range(cong_days):
                for hour in range(24):
                    ts = cong_start + timedelta(days=d, hours=hour)
                    noise = np.random.normal(0, 0.06)
                    cong = float(np.clip(diurnal_congestion(hour, corridor.typical_congestion) + noise, 0, 1))
                    congestion_rows.append({
                        "timestamp": ts.isoformat(),
                        "corridor": corridor.name,
                        "segment_id": f"{corridor.name} :: {a.name}->{b.name}",
                        "segment_index": seg_idx,
                        "from_lat": a.lat, "from_lng": a.lng,
                        "to_lat": b.lat, "to_lng": b.lng,
                        "hour": hour,
                        "day_of_week": ts.weekday(),
                        "congestion_index": round(cong, 4),
                    })

    congestion_df = pd.DataFrame(congestion_rows)
    # quick lookup: mean congestion by (segment_id, hour)
    cong_lookup = congestion_df.groupby(["segment_id", "hour"])["congestion_index"].mean().to_dict()

    # --- trips + telemetry ---
    trip_id = 0
    for d in range(days):
        for lorry in fleet:
            trips_today = rng.randint(1, 3)
            cls = lorry_class_by_name(lorry["class"])
            for _ in range(trips_today):
                trip_id += 1
                corridor = rng.choice(my.CORRIDORS)
                segs = my.corridor_segments(corridor)
                depart_hour = rng.randint(5, 20)
                load_ratio = round(rng.uniform(0.3, 1.0), 2)

                depart_dt = start + timedelta(days=d, hours=depart_hour,
                                              minutes=rng.randint(0, 59))
                cursor = depart_dt
                trip_co = trip_co2 = trip_nox = trip_ch4 = trip_fuel = 0.0
                trip_dist = trip_idle = 0.0
                baseline_co2 = baseline_fuel = baseline_idle = 0.0
                trip_travel_min = 0.0

                for seg_idx, (a, b) in enumerate(segs):
                    dist = my.haversine_km(a, b)
                    free_flow = 90.0 if "Expressway" in corridor.name else 60.0
                    seg_id = f"{corridor.name} :: {a.name}->{b.name}"
                    hour = cursor.hour
                    cong = cong_lookup.get((seg_id, hour), corridor.typical_congestion)

                    # --- Business-as-usual (BAU): lorry hits full congestion & idles in it ---
                    bau_speed = speed_from_congestion(free_flow, cong)
                    bau_idle = float(np.clip(np.random.normal(cong * 900, 120), 0, 3600))
                    baseline = segment_emissions(cls, dist, bau_speed, load_ratio, bau_idle)
                    baseline_co2 += baseline.co2_g
                    baseline_fuel += baseline.fuel_l
                    baseline_idle += bau_idle

                    # --- SmartLorry optimized: proactive rerouting cuts idle and lifts
                    # average speed toward the efficient band. Bigger gains where
                    # congestion (and thus opportunity) is higher. ---
                    opt_factor = 0.55 * cong          # up to 55% congestion relief on worst segments
                    speed = min(free_flow, bau_speed + (free_flow - bau_speed) * opt_factor)
                    idle_s = bau_idle * (1.0 - opt_factor)

                    em = segment_emissions(cls, dist, speed, load_ratio, idle_s)

                    travel_min = (dist / max(speed, 1.0)) * 60.0 + idle_s / 60.0
                    telemetry_rows.append({
                        "timestamp": cursor.isoformat(),
                        "trip_id": trip_id,
                        "lorry_id": lorry["lorry_id"],
                        "driver_id": lorry["driver_id"],
                        "fuel": lorry["fuel"],
                        "class": lorry["class"],
                        "corridor": corridor.name,
                        "segment_id": seg_id,
                        "from_lat": a.lat, "from_lng": a.lng,
                        "to_lat": b.lat, "to_lng": b.lng,
                        "distance_km": round(dist, 2),
                        "avg_speed_kmh": round(speed, 1),
                        "congestion_index": round(cong, 3),
                        "load_ratio": load_ratio,
                        "idle_seconds": round(idle_s, 1),
                        "hour": hour,
                        "day_of_week": cursor.weekday(),
                        **em.as_dict(),
                    })

                    trip_co += em.co_g; trip_co2 += em.co2_g
                    trip_nox += em.nox_g; trip_ch4 += em.ch4_g
                    trip_fuel += em.fuel_l; trip_dist += dist; trip_idle += idle_s
                    trip_travel_min += travel_min
                    cursor += timedelta(minutes=travel_min)

                arrive_dt = cursor
                avg_speed = trip_dist / (trip_travel_min / 60.0) if trip_travel_min > 0 else 0.0
                trip_rows.append({
                    "trip_id": trip_id,
                    "lorry_id": lorry["lorry_id"],
                    "driver_id": lorry["driver_id"],
                    "class": lorry["class"],
                    "fuel": lorry["fuel"],
                    "corridor": corridor.name,
                    "depart": depart_dt.isoformat(),
                    "arrive": arrive_dt.isoformat(),
                    "year": depart_dt.year,
                    "month": depart_dt.month,
                    "day": depart_dt.day,
                    "hour": depart_dt.hour,
                    "distance_km": round(trip_dist, 2),
                    "travel_minutes": round(trip_travel_min, 1),
                    "avg_speed_kmh": round(avg_speed, 1),
                    "idle_seconds": round(trip_idle, 1),
                    "load_ratio": load_ratio,
                    "co_g": round(trip_co, 2),
                    "co2_g": round(trip_co2, 1),
                    "nox_g": round(trip_nox, 2),
                    "ch4_g": round(trip_ch4, 3),
                    "fuel_l": round(trip_fuel, 2),
                    # --- without-AI (business-as-usual) baseline ---
                    "co2_baseline_g": round(baseline_co2, 1),
                    "fuel_baseline_l": round(baseline_fuel, 2),
                    "idle_baseline_seconds": round(baseline_idle, 1),
                    "co2_saved_g": round(baseline_co2 - trip_co2, 1),
                    "fuel_saved_l": round(baseline_fuel - trip_fuel, 2),
                })

    pd.DataFrame(telemetry_rows).to_csv(os.path.join(OUTPUT_DIR, "telemetry.csv"), index=False)
    pd.DataFrame(trip_rows).to_csv(os.path.join(OUTPUT_DIR, "trips.csv"), index=False)
    congestion_df.to_csv(os.path.join(OUTPUT_DIR, "congestion.csv"), index=False)

    print(f"Fleet: {len(fleet)} lorries")
    print(f"Telemetry rows: {len(telemetry_rows)}")
    print(f"Trips: {len(trip_rows)}")
    print(f"Congestion rows: {len(congestion_rows)}")
    print(f"Output written to: {OUTPUT_DIR}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Generate Malaysian lorry fleet data")
    ap.add_argument("--lorries", type=int, default=40)
    ap.add_argument("--days", type=int, default=150)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    generate(args.lorries, args.days, args.seed)
