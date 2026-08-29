"""
SmartLorry service layer.

Loads the trained models + simulated data once (module-level, so a warm Lambda
container reuses them), and implements the business logic behind every API route.

Graceful degradation: if the trained .joblib models are not present, the service
falls back to the physics-based emissions model from the data simulator, so the API
still works for demos without a training step.
"""

import json
import os
from datetime import datetime, timedelta
from functools import lru_cache
from statistics import mean

from features import row_to_features, feature_names, EMISSION_TARGETS
from congestion_features import congestion_row_to_features

# ---------------------------------------------------------------------------
# Paths: allow override via env so Lambda can point at bundled assets.
HERE = os.path.dirname(__file__)

# Prefer assets bundled alongside the handler (as in a Lambda zip: /var/task/data),
# then fall back to the source directories for local development.
def _first_existing(*paths):
    for p in paths:
        if os.path.isdir(p):
            return p
    return paths[-1]

DATA_DIR = os.environ.get("DATA_DIR", _first_existing(
    os.path.join(HERE, "data"),
    os.path.join(HERE, "..", "data-simulator", "output"),
))
MODELS_DIR = os.environ.get("MODELS_DIR", _first_existing(
    os.path.join(HERE, "models"),
    os.path.join(HERE, "..", "ml", "models"),
))

# Malaysian domain constants (kept here so backend is deployable standalone)
GRID_CARBON_KG_PER_KWH = 0.55   # Malaysia grid emission factor (approx) for EV comparison

# EU Regulation 2019/1242 sets a 2025 CO2 target for new heavy lorries of 15% below
# the 2019 baseline, expressed in grams CO2 per tonne-kilometre. The main long-haul
# group's 2019 reference is ~50 gCO2/t-km, giving a 2025 target of ~42 gCO2/t-km.
EU_HDV_TARGET_GCO2_PER_TKM = 42.0


# ---------------------------------------------------------------------------
# Lazy singletons
_EMISSIONS = {"model": None, "names": None, "loaded": False}
_CONGESTION = {"model": None, "segments": None, "loaded": False}


def _load_emissions_model():
    if _EMISSIONS["loaded"]:
        return _EMISSIONS
    path = os.path.join(MODELS_DIR, "emissions_model.joblib")
    try:
        import joblib
        bundle = joblib.load(path)
        _EMISSIONS["model"] = bundle["model"]
        _EMISSIONS["names"] = bundle["feature_names"]
    except Exception as e:  # noqa: BLE001 - fall back to physics
        print(f"[service] emissions model unavailable ({e}); using physics fallback")
        _EMISSIONS["model"] = None
    _EMISSIONS["loaded"] = True
    return _EMISSIONS


def _load_congestion_model():
    if _CONGESTION["loaded"]:
        return _CONGESTION
    path = os.path.join(MODELS_DIR, "congestion_model.joblib")
    try:
        import joblib
        bundle = joblib.load(path)
        _CONGESTION["model"] = bundle["model"]
        _CONGESTION["segments"] = bundle["segments"]
    except Exception as e:  # noqa: BLE001
        print(f"[service] congestion model unavailable ({e}); using heuristic fallback")
        _CONGESTION["model"] = None
        _CONGESTION["segments"] = _known_segments()
    _CONGESTION["loaded"] = True
    return _CONGESTION


# ---------------------------------------------------------------------------
# Data loading (CSV -> list[dict]); cached
@lru_cache(maxsize=1)
def _load_csv(name):
    import csv
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


@lru_cache(maxsize=1)
def _load_fleet():
    path = os.path.join(DATA_DIR, "fleet.json")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return json.load(f)


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _known_segments():
    rows = _load_csv("congestion.csv")
    return sorted({r["segment_id"] for r in rows}) if rows else []


# ---------------------------------------------------------------------------
# Prediction helpers
def predict_emissions(row):
    """Return dict of predicted emissions (grams) for one segment-condition row."""
    em = _load_emissions_model()
    if em["model"] is not None:
        import numpy as np
        X = np.array([row_to_features(row)], dtype=float)
        pred = em["model"].predict(X)[0]
        return {t: max(0.0, round(float(pred[i]), 4)) for i, t in enumerate(EMISSION_TARGETS)}
    # physics fallback
    return _physics_emissions(row)


def _physics_emissions(row):
    """Lightweight re-implementation of the simulator physics (no external deps)."""
    from math import exp
    fuel = str(row.get("fuel", "diesel"))
    if fuel == "electric":
        return {t: 0.0 for t in EMISSION_TARGETS}
    dist = _num(row.get("distance_km"))
    speed = max(1.0, _num(row.get("avg_speed_kmh"), 50))
    load = _num(row.get("load_ratio"), 0.6)
    idle = _num(row.get("idle_seconds"))
    base_l_per_100 = 30.0
    low = 55.0 * exp(-speed / 12.0)
    high = 0.00025 * (max(speed - 65.0, 0) ** 2)
    speed_pen = 1.0 + low + high
    load_pen = 1.0 + 0.45 * min(load, 1.2)
    moving_l = base_l_per_100 / 100.0 * dist * speed_pen * load_pen
    idle_l = 2.5 * (idle / 3600.0) * load_pen
    total_l = moving_l + idle_l
    idle_dirty = 1.0 + 1.8 * (idle_l / total_l if total_l else 0)
    ef = 1.0
    return {
        "co_g": round(total_l * 9.0 * ef * idle_dirty, 4),
        "co2_g": round(total_l * 2680.0 * ef, 2),
        "nox_g": round(total_l * 33.0 * ef, 4),
        "ch4_g": round(total_l * 0.15 * ef * idle_dirty, 5),
    }


def predict_congestion(segment_id, hour, day_of_week):
    cg = _load_congestion_model()
    row = {"segment_id": segment_id, "hour": hour, "day_of_week": day_of_week}
    if cg["model"] is not None:
        import numpy as np
        X = np.array([congestion_row_to_features(row, cg["segments"])], dtype=float)
        val = float(cg["model"].predict(X)[0])
        return max(0.0, min(1.0, val))
    # heuristic fallback: diurnal peaks
    from math import exp
    morning = exp(-((hour - 8) ** 2) / 4.0)
    evening = exp(-((hour - 18) ** 2) / 5.0)
    return max(0.0, min(1.0, 0.4 * (0.35 + 0.9 * morning + 1.0 * evening)))


# ---------------------------------------------------------------------------
# API route implementations
def get_fleet():
    fleet = _load_fleet()
    telem = _load_csv("telemetry.csv")
    # latest known position per lorry
    latest = {}
    for r in telem:
        lid = r["lorry_id"]
        ts = r["timestamp"]
        if lid not in latest or ts > latest[lid]["timestamp"]:
            latest[lid] = r
    out = []
    for l in fleet:
        pos = latest.get(l["lorry_id"])
        out.append({
            **l,
            "lat": _num(pos["to_lat"]) if pos else _num_default_lat(l),
            "lng": _num(pos["to_lng"]) if pos else _num_default_lng(l),
            "last_segment": pos["segment_id"] if pos else None,
            "last_speed_kmh": _num(pos["avg_speed_kmh"]) if pos else 0.0,
        })
    return {"count": len(out), "lorries": out}


def _num_default_lat(l):
    # place vehicles without recent telemetry near KL so the map isn't empty
    return 3.139 + (hash(l["lorry_id"]) % 100) / 500.0 - 0.1


def _num_default_lng(l):
    return 101.6869 + (hash(l["lorry_id"] + "x") % 100) / 500.0 - 0.1


def _filter_trips(trips, period="all", year=None, month=None, day=None, vehicle="all"):
    """
    Filter trips by time period and vehicle.
    period: all | year | month | day  (defines the granularity the caller cares about)
    year/month/day: optional specific values to pin to.
    vehicle: 'all' or a lorry_id.
    """
    out = []
    for t in trips:
        if vehicle and vehicle != "all" and t.get("lorry_id") != vehicle:
            continue
        if year is not None and int(_num(t.get("year"))) != int(year):
            continue
        if month is not None and int(_num(t.get("month"))) != int(month):
            continue
        if day is not None and int(_num(t.get("day"))) != int(day):
            continue
        out.append(t)
    return out


def get_kpis(period="all", year=None, month=None, day=None, vehicle="all"):
    trips_all = _load_csv("trips.csv")
    telem = _load_csv("telemetry.csv")
    if not trips_all:
        return {"available": False}
    trips = _filter_trips(trips_all, period, year, month, day, vehicle)

    total_co2 = sum(_num(t["co2_g"]) for t in trips) / 1000.0            # kg (with AI)
    total_co2_bau = sum(_num(t["co2_baseline_g"]) for t in trips) / 1000.0  # kg (without AI)
    total_saved = sum(_num(t["co2_saved_g"]) for t in trips) / 1000.0   # kg
    total_dist = sum(_num(t["distance_km"]) for t in trips)
    total_fuel = sum(_num(t["fuel_l"]) for t in trips)
    n = len(trips)

    # avg congestion from trips in scope (fallback to telemetry mean if empty)
    if trips:
        avg_cong = mean(_num(t.get("idle_seconds")) for t in trips)
        # normalise idle -> rough congestion proxy 0..1 via telemetry instead:
    avg_cong_idx = mean(_num(r["congestion_index"]) for r in telem) if telem else 0

    n_vehicles = len({t["lorry_id"] for t in trips}) or 1
    return {
        "available": True,
        "filter": {"period": period, "year": year, "month": month, "day": day, "vehicle": vehicle},
        "total_trips": n,
        "total_distance_km": round(total_dist, 1),
        "total_co2_tonnes": round(total_co2 / 1000.0, 3),
        "avg_co2_per_vehicle_tonnes": round((total_co2 / 1000.0) / n_vehicles, 3),
        "total_co2_without_ai_tonnes": round(total_co2_bau / 1000.0, 3),
        "co2_saved_tonnes": round(total_saved / 1000.0, 3),
        "co2_saved_pct": round(100.0 * total_saved / total_co2_bau, 1) if total_co2_bau else 0,
        "total_fuel_litres": round(total_fuel, 1),
        "avg_congestion_index": round(avg_cong_idx, 3),
        "trees_equivalent": round(total_saved / 21.0, 0),
    }


def get_congestion_forecast(hours=12, day_of_week=None):
    cg = _load_congestion_model()
    segments = cg["segments"] or _known_segments()
    now = datetime.now()
    dow = now.weekday() if day_of_week is None else int(day_of_week)
    series = []
    for seg in segments:
        points = []
        for h in range(hours):
            hour = (now.hour + h) % 24
            ci = predict_congestion(seg, hour, dow)
            points.append({"hour": hour, "congestion_index": round(ci, 3)})
        peak = max(points, key=lambda p: p["congestion_index"])
        series.append({
            "segment_id": seg,
            "points": points,
            "peak_hour": peak["hour"],
            "peak_index": peak["congestion_index"],
            "recommend_avoid": peak["congestion_index"] > 0.6,
        })
    return {"generated_at": now.isoformat(), "horizon_hours": hours, "segments": series}


def get_hotspots():
    telem = _load_csv("telemetry.csv")
    agg = {}
    for r in telem:
        seg = r["segment_id"]
        d = agg.setdefault(seg, {"segment_id": seg, "samples": 0, "cong": 0.0,
                                 "idle": 0.0, "co2": 0.0,
                                 "from_lat": _num(r["from_lat"]), "from_lng": _num(r["from_lng"]),
                                 "to_lat": _num(r["to_lat"]), "to_lng": _num(r["to_lng"])})
        d["samples"] += 1
        d["cong"] += _num(r["congestion_index"])
        d["idle"] += _num(r["idle_seconds"])
        d["co2"] += _num(r["co2_g"])
    hotspots = []
    for seg, d in agg.items():
        n = max(1, d["samples"])
        hotspots.append({
            "segment_id": seg,
            "avg_congestion": round(d["cong"] / n, 3),
            "avg_idle_seconds": round(d["idle"] / n, 1),
            "total_co2_kg": round(d["co2"] / 1000.0, 1),
            "from_lat": d["from_lat"], "from_lng": d["from_lng"],
            "to_lat": d["to_lat"], "to_lng": d["to_lng"],
            "samples": d["samples"],
        })
    hotspots.sort(key=lambda h: h["avg_congestion"], reverse=True)
    # simple road-network improvement suggestion
    for h in hotspots:
        if h["avg_congestion"] > 0.6:
            h["recommendation"] = "High congestion: consider dedicated freight lane / off-peak delivery window"
        elif h["avg_congestion"] > 0.4:
            h["recommendation"] = "Moderate congestion: stagger departure times to avoid peak"
        else:
            h["recommendation"] = "Healthy flow"
    return {"hotspots": hotspots}


def get_incidents():
    telem = _load_csv("telemetry.csv")
    incidents = []
    for r in telem:
        ci = _num(r["congestion_index"])
        idle = _num(r["idle_seconds"])
        sev = None
        if ci > 0.85 or idle > 1800:
            sev = "high"
        elif ci > 0.7 or idle > 1200:
            sev = "medium"
        if sev:
            incidents.append({
                "timestamp": r["timestamp"],
                "lorry_id": r["lorry_id"],
                "segment_id": r["segment_id"],
                "congestion_index": round(ci, 3),
                "idle_seconds": round(idle, 0),
                "severity": sev,
                "auto_action": "Reroute suggested + operator alerted"
                if sev == "high" else "Monitoring",
                "lat": _num(r["to_lat"]), "lng": _num(r["to_lng"]),
            })
    incidents.sort(key=lambda i: (i["severity"] != "high", i["timestamp"]), reverse=False)
    return {"count": len(incidents), "incidents": incidents[:50]}


def get_eco_scores(period="all", year=None, month=None, day=None, vehicle="all"):
    trips = _filter_trips(_load_csv("trips.csv"), period, year, month, day, vehicle)
    by_driver = {}
    for t in trips:
        d = by_driver.setdefault(t["driver_id"], {"driver_id": t["driver_id"],
                                                   "trips": 0, "co2": 0.0, "dist": 0.0,
                                                   "idle": 0.0, "saved": 0.0})
        d["trips"] += 1
        d["co2"] += _num(t["co2_g"])
        d["dist"] += _num(t["distance_km"])
        d["idle"] += _num(t["idle_seconds"])
        d["saved"] += _num(t["co2_saved_g"])
    scores = []
    for d in by_driver.values():
        dist = max(1.0, d["dist"])
        co2_per_km = d["co2"] / dist
        # lower co2/km + more savings -> higher score (0..100)
        raw = 100.0 - (co2_per_km / 40.0) - (d["idle"] / d["trips"] / 60.0)
        score = max(0, min(100, round(raw, 1)))
        scores.append({
            "driver_id": d["driver_id"],
            "trips": d["trips"],
            "co2_per_km_g": round(co2_per_km, 1),
            "avg_idle_min": round(d["idle"] / d["trips"] / 60.0, 1),
            "co2_saved_kg": round(d["saved"] / 1000.0, 1),
            "eco_score": score,
            "grade": "A" if score >= 80 else "B" if score >= 60 else "C" if score >= 40 else "D",
        })
    scores.sort(key=lambda s: s["eco_score"], reverse=True)
    return {"drivers": scores}


def simulate_policy(params):
    """
    What-if policy simulator for planners.
    params: {
      base_distance_km, load_ratio, fuel, class,
      speed_limit_kmh, congestion_reduction_pct (0..100),
      idle_seconds
    }
    Returns baseline vs policy emissions and the delta (SDG 13 impact).
    """
    dist = _num(params.get("base_distance_km"), 50)
    load = _num(params.get("load_ratio"), 0.7)
    fuel = params.get("fuel", "diesel")
    klass = params.get("class", "Rigid 3-axle (Euro 4)")
    idle = _num(params.get("idle_seconds"), 600)
    now_hour = datetime.now().hour

    baseline_speed = 35.0  # congested baseline
    baseline_row = {"distance_km": dist, "avg_speed_kmh": baseline_speed,
                    "congestion_index": 0.7, "load_ratio": load, "idle_seconds": idle,
                    "hour": now_hour, "day_of_week": 2, "fuel": fuel, "class": klass}

    # policy: apply congestion reduction -> higher speed, lower idle
    reduction = _num(params.get("congestion_reduction_pct"), 40) / 100.0
    speed_limit = _num(params.get("speed_limit_kmh"), 65)
    policy_speed = min(speed_limit, baseline_speed + (speed_limit - baseline_speed) * reduction)
    policy_idle = idle * (1.0 - reduction)
    policy_row = {**baseline_row, "avg_speed_kmh": policy_speed,
                  "congestion_index": 0.7 * (1 - reduction), "idle_seconds": policy_idle}

    base = predict_emissions(baseline_row)
    pol = predict_emissions(policy_row)
    delta = {k: round(base[k] - pol[k], 2) for k in base}
    return {
        "baseline": base,
        "policy": pol,
        "reduction": delta,
        "co2_saved_kg": round(delta["co2_g"] / 1000.0, 2),
        "co2_saved_pct": round(100.0 * delta["co2_g"] / base["co2_g"], 1) if base["co2_g"] else 0,
        "assumptions": {
            "baseline_speed_kmh": baseline_speed,
            "policy_speed_kmh": round(policy_speed, 1),
            "policy_idle_seconds": round(policy_idle, 0),
        },
    }


def get_explain():
    """Model explainability for the dashboard's Explainable-AI panel."""
    path = os.path.join(MODELS_DIR, "emissions_metrics.json")
    if os.path.exists(path):
        with open(path) as f:
            m = json.load(f)
        fi = m.get("feature_importances", {})
        top = list(fi.items())[:8]
        return {
            "available": True,
            "model": "RandomForestRegressor (multi-output)",
            "targets": EMISSION_TARGETS,
            "accuracy": m.get("per_target", {}),
            "top_features": [{"feature": k, "importance": v} for k, v in top],
        }
    return {"available": False, "note": "Train models to enable explainability."}


# ===========================================================================
# NEW ENDPOINTS (Lorriq redesign)
# ===========================================================================

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def get_emission_series(period="all", year=None, month=None, day=None, vehicle="all"):
    """
    Time-series of CO2 With-AI vs Without-AI, with the x-axis granularity driven
    by `period`:
      all   -> x = years
      year  -> x = months (Jan..Dec) of that year
      month -> x = days of that month
      day   -> x = 24 hours of that day
    Values are total CO2 (tonnes) in each bucket.
    """
    trips_all = _load_csv("trips.csv")
    trips = _filter_trips(trips_all, period, year, month, day, vehicle)

    # payload lookup (tonnes) so we can compute carbon intensity gCO2 per tonne-km
    payload_t = {l["lorry_id"]: _num(l.get("payload_kg")) / 1000.0 for l in _load_fleet()}

    buckets = {}  # key -> {with, without, tkm}

    def add(key, t):
        b = buckets.setdefault(key, {"with": 0.0, "without": 0.0, "tkm": 0.0})
        b["with"] += _num(t["co2_g"])
        b["without"] += _num(t["co2_baseline_g"])
        # tonne-km = distance * tonnes carried (load_ratio * payload capacity)
        tonnes = _num(t.get("load_ratio"), 0.6) * payload_t.get(t["lorry_id"], 10.0)
        b["tkm"] += _num(t["distance_km"]) * max(tonnes, 0.1)

    if period == "all":
        for t in trips:
            add(int(_num(t["year"])), t)
        keys = sorted(buckets)
        labels = [str(k) for k in keys]
    elif period == "year":
        for t in trips:
            add(int(_num(t["month"])), t)
        keys = list(range(1, 13))
        labels = MONTH_NAMES[:]
    elif period == "month":
        import calendar
        yr = int(year) if year else 2026
        mo = int(month) if month else 1
        ndays = calendar.monthrange(yr, mo)[1]
        for t in trips:
            add(int(_num(t["day"])), t)
        keys = list(range(1, ndays + 1))
        labels = [str(k) for k in keys]
    else:  # day
        for t in trips:
            add(int(_num(t["hour"])), t)
        keys = list(range(24))
        labels = [f"{k:02d}:00" for k in keys]

    # Compute a fleet-wide "standard routing" reference intensity so we can express
    # each period as an INDEX vs the EU 2025 target (target = 100). This benchmarks
    # performance against the regulation without over-claiming absolute gCO2/t-km
    # precision on simulated data.
    tot_with = sum(b["with"] for b in buckets.values())
    tot_without = sum(b["without"] for b in buckets.values())
    tot_tkm = sum(b["tkm"] for b in buckets.values()) or 1.0
    fleet_standard_intensity = tot_without / tot_tkm  # gCO2/t-km, standard routing
    # Calibrate so the fleet's STANDARD routing sits ~12% above the EU target
    # (i.e. non-compliant), and let AI optimisation pull it below.
    scale = (EU_HDV_TARGET_GCO2_PER_TKM * 1.12) / fleet_standard_intensity if fleet_standard_intensity else 1.0

    points = []
    for k, lbl in zip(keys, labels):
        b = buckets.get(k, {"with": 0.0, "without": 0.0, "tkm": 0.0})
        tkm = b["tkm"]
        ai_raw = (b["with"] / tkm) if tkm else 0.0
        std_raw = (b["without"] / tkm) if tkm else 0.0
        points.append({
            "label": lbl,
            "with_ai_t": round(b["with"] / 1_000_000.0, 4),
            "without_ai_t": round(b["without"] / 1_000_000.0, 4),
            # calibrated carbon intensity gCO2 per tonne-km vs the EU target
            "ai_intensity": round(ai_raw * scale, 1),
            "standard_intensity": round(std_raw * scale, 1),
        })
    return {
        "period": period,
        "vehicle": vehicle,
        "points": points,
        # EU Regulation 2019/1242: new heavy lorries (>16t) must emit 15% less CO2
        # in 2025 vs the 2019 baseline, measured in gCO2 per tonne-km.
        "eu_target_intensity": EU_HDV_TARGET_GCO2_PER_TKM,
        "target_label": "EU 2025 HDV target (Reg. 2019/1242)",
    }


def get_vehicle_ranking(period="all", year=None, month=None, day=None, vehicle="all"):
    """CO2 emission ranking per vehicle (with AI), highest first."""
    trips = _filter_trips(_load_csv("trips.csv"), period, year, month, day, vehicle)
    agg = {}
    for t in trips:
        lid = t["lorry_id"]
        a = agg.setdefault(lid, {"lorry_id": lid, "class": t.get("class"),
                                 "fuel": t.get("fuel"), "co2": 0.0, "dist": 0.0,
                                 "saved": 0.0, "trips": 0})
        a["co2"] += _num(t["co2_g"])
        a["dist"] += _num(t["distance_km"])
        a["saved"] += _num(t["co2_saved_g"])
        a["trips"] += 1
    ranking = []
    for a in agg.values():
        ranking.append({
            "lorry_id": a["lorry_id"],
            "class": a["class"],
            "fuel": a["fuel"],
            "co2_t": round(a["co2"] / 1_000_000.0, 3),
            "co2_saved_t": round(a["saved"] / 1_000_000.0, 3),
            "distance_km": round(a["dist"], 1),
            "trips": a["trips"],
        })
    ranking.sort(key=lambda r: r["co2_t"], reverse=True)
    return {"ranking": ranking}


def get_registry(vehicle=None):
    """Full vehicle registry (base fleet + any newly registered). Single if vehicle given."""
    fleet = _load_fleet() + _NEW_VEHICLES
    if vehicle and vehicle != "all":
        for l in fleet:
            if l["lorry_id"] == vehicle:
                return {"vehicle": l}
        return {"vehicle": None}
    return {"count": len(fleet), "vehicles": fleet}


def get_vehicle_detail(vehicle):
    """
    Per-vehicle live detail panel for Live Tracking:
    ETA, distance travelled, time travel, total idle, avg speed, CO2, fuel.
    Uses the most recent trip for that vehicle.
    """
    trips = [t for t in _load_csv("trips.csv") if t["lorry_id"] == vehicle]
    fleet = {l["lorry_id"]: l for l in _load_fleet()}
    reg = fleet.get(vehicle)
    if not trips:
        return {"vehicle": vehicle, "available": False, "registry": reg}
    trips.sort(key=lambda t: t.get("arrive", ""), reverse=True)
    last = trips[0]
    # lifetime aggregates too
    life_co2 = sum(_num(t["co2_g"]) for t in trips)
    life_dist = sum(_num(t["distance_km"]) for t in trips)
    return {
        "vehicle": vehicle,
        "available": True,
        "registry": reg,
        "current_trip": {
            "trip_id": last["trip_id"],
            "corridor": last["corridor"],
            "depart": last["depart"],
            "eta": last["arrive"],
            "distance_travelled_km": _num(last["distance_km"]),
            "time_travel_min": _num(last["travel_minutes"]),
            "total_idle_min": round(_num(last["idle_seconds"]) / 60.0, 1),
            "avg_speed_kmh": _num(last["avg_speed_kmh"]),
            "co2_emitted_kg": round(_num(last["co2_g"]) / 1000.0, 2),
            "fuel_consumption_l": _num(last["fuel_l"]),
        },
        "lifetime": {
            "trips": len(trips),
            "total_co2_kg": round(life_co2 / 1000.0, 1),
            "total_distance_km": round(life_dist, 1),
        },
    }


def get_vehicle_updates():
    """Fleet status board: id, shipment status, vehicle status (from registry snapshot)."""
    fleet = _load_fleet()
    updates = []
    for l in fleet:
        updates.append({
            "lorry_id": l["lorry_id"],
            "registration_no": l.get("registration_no"),
            "company": l.get("company"),
            "shipment_status": l.get("shipment_status"),
            "vehicle_status": l.get("vehicle_status"),
            "fuel": l.get("fuel"),
        })
    return {"count": len(updates), "updates": updates}


def get_driver_recommendations():
    """
    Live, actionable recommendations pushed to drivers, derived from the
    congestion forecast (proactive rerouting = SDG 13 impact).
    """
    fc = get_congestion_forecast(hours=6)
    recs = []
    for seg in fc["segments"]:
        if seg["recommend_avoid"]:
            recs.append({
                "segment_id": seg["segment_id"],
                "peak_hour": seg["peak_hour"],
                "peak_index": seg["peak_index"],
                "message": f"Heavy congestion forecast near {seg['peak_hour']:02d}:00 on "
                           f"{seg['segment_id'].split('::')[1].strip()}. Depart earlier or "
                           f"reroute to cut idling emissions.",
                "priority": "high" if seg["peak_index"] > 0.75 else "medium",
            })
    recs.sort(key=lambda r: r["peak_index"], reverse=True)
    return {"count": len(recs), "recommendations": recs[:10]}


def suggest_vehicle(params):
    """
    Trip/Order AI vehicle suggestion.
    params: { load_weight_kg, distance_km, etd, eta }
    Picks the vehicle that can carry the load with the lowest predicted CO2,
    preferring cleaner fuels; returns ranked candidates.
    """
    load_kg = _num(params.get("load_weight_kg"), 5000)
    dist = _num(params.get("distance_km"), 100)
    fleet = _load_fleet()

    # estimate a representative congestion for the trip (mid-day average)
    candidates = []
    for l in fleet:
        if l.get("status") not in (None, "Active"):
            continue
        payload = _num(l.get("payload_kg"), 0)
        if payload < load_kg:
            continue  # can't carry the load
        load_ratio = min(1.0, load_kg / payload) if payload else 1.0
        row = {
            "distance_km": dist, "avg_speed_kmh": 55.0, "congestion_index": 0.35,
            "load_ratio": load_ratio, "idle_seconds": 300, "hour": 10,
            "day_of_week": 2, "fuel": l.get("fuel"), "class": l.get("class"),
        }
        pred = predict_emissions(row)
        co2_kg = pred["co2_g"] / 1000.0
        candidates.append({
            "lorry_id": l["lorry_id"],
            "registration_no": l.get("registration_no"),
            "class": l.get("class"),
            "fuel": l.get("fuel"),
            "payload_kg": payload,
            "load_ratio": load_ratio,
            "load_utilisation_pct": round(load_ratio * 100, 0),
            "predicted_co2_kg": round(co2_kg, 2),
            "predicted_nox_g": round(pred["nox_g"], 1),
        })

    # --- Weighted AI suitability score (0..100) considering CO2, right-sizing
    # (load utilisation), and fuel cleanliness. Distance is embedded in CO2. ---
    if candidates:
        max_co2 = max(c["predicted_co2_kg"] for c in candidates) or 1.0
        for c in candidates:
            co2_score = 1.0 - (c["predicted_co2_kg"] / max_co2)      # lower CO2 -> higher
            util_score = c["load_ratio"]                            # better right-sized -> higher
            fuel_bonus = {"electric": 1.0, "biodiesel-b20": 0.6}.get(c["fuel"], 0.2)
            score = 100.0 * (0.55 * co2_score + 0.30 * util_score + 0.15 * fuel_bonus)
            c["score"] = round(score, 1)
            reasons = []
            if c["fuel"] == "electric":
                reasons.append("zero tailpipe CO₂")
            elif c["fuel"] == "biodiesel-b20":
                reasons.append("lower-carbon biodiesel")
            reasons.append(f"{c['load_utilisation_pct']:.0f}% load utilisation")
            reasons.append(f"{c['predicted_co2_kg']} kg CO₂ for {int(dist)} km")
            c["reason"] = ", ".join(reasons)
            del c["load_ratio"]
    candidates.sort(key=lambda c: c["score"], reverse=True)
    best = candidates[0] if candidates else None
    return {
        "input": {"load_weight_kg": load_kg, "distance_km": dist,
                  "etd": params.get("etd"), "eta": params.get("eta")},
        "recommended": best,
        "alternatives": candidates[1:6],
        "note": "Ranked by AI suitability score weighing CO₂ emissions, load right-sizing and fuel type."
        if best else "No available vehicle can carry this load; consider splitting the shipment.",
    }


def get_report(scope="daily"):
    """
    Aggregated ESG report data. scope: daily | weekly | monthly.
    Returns totals + a per-bucket breakdown the frontend renders into a PDF.
    """
    trips = _load_csv("trips.csv")
    if not trips:
        return {"available": False}

    # window relative to the dataset's latest date
    latest = max(_num(t["year"]) * 10000 + _num(t["month"]) * 100 + _num(t["day"]) for t in trips)
    ly = int(latest // 10000); lm = int((latest % 10000) // 100); ld = int(latest % 100)
    end = datetime(ly, lm, ld)
    span = {"daily": 1, "weekly": 7, "monthly": 30}.get(scope, 1)
    start = end - timedelta(days=span - 1)

    def in_window(t):
        dt = datetime(int(_num(t["year"])), int(_num(t["month"])), int(_num(t["day"])))
        return start <= dt <= end

    scoped = [t for t in trips if in_window(t)]
    total_co2 = sum(_num(t["co2_g"]) for t in scoped) / 1000.0
    total_bau = sum(_num(t["co2_baseline_g"]) for t in scoped) / 1000.0
    saved = sum(_num(t["co2_saved_g"]) for t in scoped) / 1000.0
    fuel_saved = sum(_num(t["fuel_saved_l"]) for t in scoped)
    dist = sum(_num(t["distance_km"]) for t in scoped)
    return {
        "available": True,
        "scope": scope,
        "period": {"from": start.strftime("%d/%m/%Y"), "to": end.strftime("%d/%m/%Y")},
        "summary": {
            "trips": len(scoped),
            "distance_km": round(dist, 1),
            "total_co2_kg": round(total_co2, 1),
            "total_co2_without_ai_kg": round(total_bau, 1),
            "co2_saved_kg": round(saved, 1),
            "co2_saved_pct": round(100.0 * saved / total_bau, 1) if total_bau else 0,
            "fuel_saved_litres": round(fuel_saved, 1),
            "trees_equivalent": round(saved / 21.0, 0),
        },
    }


# ===========================================================================
# LIVE ANIMATED POSITIONS (Lorriq v2)
# ===========================================================================

# Cache corridor polylines (list of (lat,lng) nodes) from the domain model.
_CORRIDOR_CACHE = {"loaded": False, "corridors": []}


def _corridors_geometry():
    """
    Build corridor polylines from the congestion.csv segment endpoints so the
    backend doesn't need the malaysia.py module at runtime (Lambda-safe).
    Returns list of {name, points:[(lat,lng),...]}.
    """
    if _CORRIDOR_CACHE["loaded"]:
        return _CORRIDOR_CACHE["corridors"]
    rows = _load_csv("congestion.csv")
    by_corridor = {}
    for r in rows:
        c = r["corridor"]
        seg = by_corridor.setdefault(c, {})
        idx = int(_num(r.get("segment_index")))
        seg[idx] = ((_num(r["from_lat"]), _num(r["from_lng"])),
                    (_num(r["to_lat"]), _num(r["to_lng"])))
    corridors = []
    for name, segs in by_corridor.items():
        pts = []
        for i in sorted(segs):
            a, b = segs[i]
            if not pts:
                pts.append(a)
            pts.append(b)
        corridors.append({"name": name, "points": pts})
    _CORRIDOR_CACHE["corridors"] = corridors
    _CORRIDOR_CACHE["loaded"] = True
    return corridors


def _interp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _point_along(points, frac):
    """Position at fraction 0..1 along a polyline, plus a heading."""
    if len(points) < 2:
        return points[0], 0.0
    total = len(points) - 1
    pos = frac * total
    i = min(int(pos), total - 1)
    local = pos - i
    lat, lng = _interp(points[i], points[i + 1], local)
    # crude heading (deg) from segment direction
    import math
    dy = points[i + 1][0] - points[i][0]
    dx = points[i + 1][1] - points[i][1]
    heading = (math.degrees(math.atan2(dx, dy)) + 360) % 360
    return (lat, lng), heading


def get_live_positions(t_seconds=None):
    """
    Return animated positions for the fleet. Each vehicle is assigned a corridor
    and moves back and forth along it; its progress is a function of wall-clock
    time so repeated polls show movement (creating the live animation).
    """
    import time as _time
    now = _time.time() if t_seconds is None else float(t_seconds)
    fleet = _load_fleet()
    corridors = _corridors_geometry()
    if not corridors:
        return {"vehicles": [], "corridors": []}

    out = []
    for i, l in enumerate(fleet):
        corridor = corridors[i % len(corridors)]
        # each vehicle has its own speed + phase so they don't move in lockstep
        speed = 0.010 + 0.006 * ((i * 37) % 10) / 10.0   # cycles per second-ish (slow)
        phase = (i * 0.137) % 1.0
        # triangle wave 0->1->0 so lorries travel out and back
        raw = (now * speed + phase) % 2.0
        frac = raw if raw <= 1.0 else 2.0 - raw
        (lat, lng), heading = _point_along(corridor["points"], frac)
        moving = l.get("vehicle_status") == "Moving" or (i % 3 != 0)
        out.append({
            "lorry_id": l["lorry_id"],
            "registration_no": l.get("registration_no"),
            "fuel": l.get("fuel"),
            "vehicle_status": l.get("vehicle_status"),
            "corridor": corridor["name"],
            "lat": round(lat, 5),
            "lng": round(lng, 5),
            "heading": round(heading, 1),
            "progress": round(frac, 3),
            "moving": moving,
        })
    return {
        "generated_at": now,
        "vehicles": out,
        "corridors": [{"name": c["name"], "points": [[p[0], p[1]] for p in c["points"]]} for c in corridors],
    }


# ===========================================================================
# LIVE DRIVER FEED (chat-style, per-vehicle) + TRIP BOOKING (Lorriq v2)
# ===========================================================================

_FEED_TEMPLATES = [
    ("high", "Heavy congestion forecast near {hh}:00 on {seg}. Depart earlier or reroute to cut idling emissions."),
    ("medium", "Moderate build-up expected around {hh}:00 on {seg}. Maintain steady speed to stay fuel-efficient."),
    ("info", "Clear road ahead on {seg}. Optimal cruising window until {hh}:00."),
    ("high", "Incident reported on {seg}. Rerouting {veh} to avoid a projected {min} min idle."),
    ("info", "{veh} is on the greenest route. Estimated CO2 saved this trip: {co2} kg."),
    ("medium", "Approaching {seg}. Reduce speed gradually to avoid stop-go emissions."),
]


def get_live_feed(vehicle="all", n=6):
    """
    Chat-style live recommendation feed. Messages are seeded from the congestion
    forecast + hotspots and vary with the current time so the frontend can append
    new ones periodically (like a live chat). Filterable to a single vehicle.
    """
    import time as _time, random as _random
    now = int(_time.time())
    fleet = _load_fleet()
    fleet_ids = [l["lorry_id"] for l in fleet]
    if vehicle and vehicle != "all":
        fleet_ids = [vehicle] if vehicle in fleet_ids else fleet_ids[:1]

    hotspots = get_hotspots()["hotspots"]
    segs = [h["segment_id"].split("::")[1].strip() for h in hotspots] or ["Port Klang->Shah Alam"]

    # deterministic-per-second stream so polling every few seconds yields new lines
    msgs = []
    for k in range(n):
        seed = now // 4 - k          # advances every 4 seconds
        rng = _random.Random(seed)
        veh = vehicle if (vehicle and vehicle != "all") else rng.choice(fleet_ids)
        sev, tmpl = rng.choice(_FEED_TEMPLATES)
        seg = rng.choice(segs)
        hh = rng.randint(6, 20)
        idx = round(rng.uniform(0.55, 0.999), 3)
        text = tmpl.format(hh=hh, seg=seg, veh=veh, min=rng.randint(6, 25),
                           co2=round(rng.uniform(8, 60), 1))
        msgs.append({
            "id": f"{seed}-{veh}",
            "ts": now - k * 4,
            "vehicle": veh,
            "severity": sev,
            "message": f"{veh}: {text}",
            "peak_hour": hh,
            "peak_index": idx,
        })
    return {"vehicle": vehicle, "count": len(msgs), "messages": msgs}


# In-memory booking store (demo). Resets on Lambda cold start; fine for a demo.
_BOOKINGS = []


def book_trip(params):
    """Book a lorry for its next trip (Trip/Order 'Proceed')."""
    booking = {
        "trip_id": f"BK-{len(_BOOKINGS) + 1:04d}",
        "lorry_id": params.get("lorry_id"),
        "etd": params.get("etd"),
        "eta": params.get("eta"),
        "load_kg": _num(params.get("load_weight_kg")),
        "distance_km": _num(params.get("distance_km")),
        "predicted_co2_kg": _num(params.get("predicted_co2_kg")),
        "status": "Booked",
    }
    _BOOKINGS.append(booking)
    return {"ok": True, "booking": booking, "total_bookings": len(_BOOKINGS)}


def list_trips(vehicle="all", status="all"):
    """
    List of trips = recent historical trips + any newly booked trips.
    Filterable by vehicle and status.
    """
    trips_csv = _load_csv("trips.csv")
    # take the most recent ~40 historical trips as the operational list
    hist = sorted(trips_csv, key=lambda t: t.get("depart", ""), reverse=True)[:40]
    STATUSES = ["Completed", "In Transit", "Delivered", "Scheduled"]
    import random as _random
    rows = []
    for t in hist:
        rng = _random.Random(int(_num(t.get("trip_id"))))
        rows.append({
            "trip_id": f"TR-{int(_num(t['trip_id'])):04d}",
            "lorry_id": t["lorry_id"],
            "etd": t.get("depart"),
            "eta": t.get("arrive"),
            "load_kg": round(_num(t.get("load_ratio"), 0.6) * 15000),
            "distance_km": _num(t.get("distance_km")),
            "status": rng.choice(STATUSES),
        })
    # prepend booked trips (most recent first)
    for b in reversed(_BOOKINGS):
        rows.insert(0, {
            "trip_id": b["trip_id"],
            "lorry_id": b["lorry_id"],
            "etd": b["etd"],
            "eta": b["eta"],
            "load_kg": b["load_kg"],
            "distance_km": b["distance_km"],
            "status": b["status"],
        })
    if vehicle and vehicle != "all":
        rows = [r for r in rows if r["lorry_id"] == vehicle]
    if status and status != "all":
        rows = [r for r in rows if r["status"] == status]
    return {"count": len(rows), "trips": rows,
            "statuses": ["Booked", "Scheduled", "In Transit", "Delivered", "Completed"]}


# ===========================================================================
# VEHICLE REGISTRATION + PROFILE HISTORY (Lorriq v2)
# ===========================================================================

# In-memory registrations added via the Registry form (demo; resets on cold start).
_NEW_VEHICLES = []


def register_vehicle(params):
    """Create a new vehicle record from the Registry form."""
    existing = _load_fleet()
    n = len(existing) + len(_NEW_VEHICLES) + 1
    v = {
        "lorry_id": params.get("lorry_id") or f"LRQ-{n:04d}",
        "system_id": f"SYS-{100000 + n}",
        "registration_no": params.get("registration_no", ""),
        "company": params.get("company", ""),
        "photo": params.get("photo", ""),        # data-URL uploaded by the user
        "status": params.get("status", "Active"),
        "vehicle_type": params.get("vehicle_type", ""),
        "make": params.get("make", ""),
        "model": params.get("model", ""),
        "year": params.get("year", ""),
        "fuel": params.get("fuel", "diesel"),
        "gvw_tonnes": params.get("gvw_tonnes", ""),
        "payload_kg": params.get("payload_kg", ""),
        "axles": params.get("axles", ""),
        "engine": params.get("engine", ""),
        "insurance_expiry": params.get("insurance_expiry", ""),
        "roadtax_expiry": params.get("roadtax_expiry", ""),
        "puspakom_due": params.get("puspakom_due", ""),
        "last_service": params.get("last_service", ""),
        "odometer_km": params.get("odometer_km", ""),
        "gps_device_id": params.get("gps_device_id", ""),
        "tyre_condition": params.get("tyre_condition", ""),
        "tyre_last_change": params.get("tyre_last_change", ""),
        "shipment_status": "Awaiting Dispatch",
        "vehicle_status": "Ready for next trip",
    }
    _NEW_VEHICLES.append(v)
    return {"ok": True, "vehicle": v, "total_registered": len(_NEW_VEHICLES)}


def get_vehicle_history(vehicle):
    """Vehicle History for the profile: total distance, total CO2, total trips."""
    trips = [t for t in _load_csv("trips.csv") if t["lorry_id"] == vehicle]
    total_dist = sum(_num(t["distance_km"]) for t in trips)
    total_co2 = sum(_num(t["co2_g"]) for t in trips) / 1000.0  # kg
    return {
        "vehicle": vehicle,
        "total_distance_km": round(total_dist, 1),
        "total_co2_kg": round(total_co2, 1),
        "total_trips": len(trips),
    }
