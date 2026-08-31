"""
Framework-agnostic router for SmartLorry.

Maps (method, path) -> handler. Used by both the AWS Lambda handler and the local
dev server so behaviour is identical in both environments.
"""

import json
from urllib.parse import parse_qs

import service


def _ok(body, status=200):
    return status, {"Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"}, json.dumps(body)


def _bad(msg, status=400):
    return _ok({"error": msg}, status)


def dispatch(method, path, query=None, body=None):
    """
    method: 'GET'|'POST'|...
    path:   e.g. '/api/kpis'
    query:  dict of query params (values may be lists or scalars)
    body:   parsed JSON dict for POST, or None
    returns (status_code, headers, body_str)
    """
    query = query or {}
    body = body or {}

    def q(name, default=None):
        v = query.get(name, default)
        if isinstance(v, list):
            return v[0] if v else default
        return v

    if method == "OPTIONS":
        return _ok({}, 204)

    # shared filter params for the emission tracker
    def filters():
        def _int(name):
            v = q(name)
            return int(v) if v not in (None, "", "all") else None
        return {
            "period": q("period", "all"),
            "year": _int("year"),
            "month": _int("month"),
            "day": _int("day"),
            "vehicle": q("vehicle", "all"),
        }

    if path in ("/", "/api", "/api/health"):
        return _ok({"service": "SidAI", "status": "ok",
                    "sdg": "SDG 13 - Climate Action"})

    if method == "GET" and path == "/api/fleet":
        return _ok(service.get_fleet())

    if method == "GET" and path == "/api/kpis":
        return _ok(service.get_kpis(**filters()))

    if method == "GET" and path == "/api/emission-series":
        return _ok(service.get_emission_series(**filters()))

    if method == "GET" and path == "/api/vehicle-ranking":
        return _ok(service.get_vehicle_ranking(**filters()))

    if method == "GET" and path == "/api/registry":
        return _ok(service.get_registry(vehicle=q("vehicle")))

    if method == "POST" and path == "/api/registry":
        return _ok(service.register_vehicle(body))

    if method == "GET" and path == "/api/vehicle-history":
        v = q("vehicle")
        if not v or v == "all":
            return _bad("vehicle query param required")
        return _ok(service.get_vehicle_history(v))

    if method == "GET" and path == "/api/vehicle-detail":
        v = q("vehicle")
        if not v or v == "all":
            return _bad("vehicle query param required")
        return _ok(service.get_vehicle_detail(v))

    if method == "GET" and path == "/api/vehicle-updates":
        return _ok(service.get_vehicle_updates())

    if method == "GET" and path == "/api/recommendations":
        return _ok(service.get_driver_recommendations())

    if method == "GET" and path == "/api/live-positions":
        return _ok(service.get_live_positions())

    if method == "GET" and path == "/api/live-feed":
        return _ok(service.get_live_feed(vehicle=q("vehicle", "all"), n=int(q("n", 6))))

    if method == "POST" and path == "/api/book-trip":
        return _ok(service.book_trip(body))

    if method == "GET" and path == "/api/trips":
        return _ok(service.list_trips(vehicle=q("vehicle", "all"), status=q("status", "all")))

    if method == "GET" and path == "/api/report":
        return _ok(service.get_report(scope=q("scope", "daily")))

    if method == "POST" and path == "/api/suggest-vehicle":
        return _ok(service.suggest_vehicle(body))

    if method == "POST" and path == "/api/suggest-driver":
        return _ok(service.suggest_driver(body))

    # --- maintenance ---
    if method == "GET" and path == "/api/vehicle-maintenance":
        v = q("vehicle")
        if not v or v == "all":
            return _bad("vehicle query param required")
        return _ok(service.get_vehicle_maintenance(v))

    if method == "POST" and path == "/api/maintenance-done":
        return _ok(service.mark_maintenance_done(body))

    # --- drivers ---
    if method == "GET" and path == "/api/drivers":
        return _ok(service.get_drivers())

    if method == "POST" and path == "/api/drivers":
        return _ok(service.register_driver(body))

    if method == "GET" and path == "/api/driver-detail":
        d = q("driver")
        if not d:
            return _bad("driver query param required")
        return _ok(service.get_driver_detail(d))

    if method == "GET" and path == "/api/forecast/congestion":
        hours = int(q("hours", 12))
        dow = q("day_of_week")
        return _ok(service.get_congestion_forecast(hours=hours, day_of_week=dow))

    if method == "GET" and path == "/api/hotspots":
        return _ok(service.get_hotspots())

    if method == "GET" and path == "/api/incidents":
        return _ok(service.get_incidents())

    if method == "GET" and path == "/api/eco-scores":
        return _ok(service.get_eco_scores(**filters()))

    if method == "GET" and path == "/api/scenario-compare":
        return _ok(service.get_scenario_comparison(**filters()))

    if method == "GET" and path == "/api/explain":
        return _ok(service.get_explain())

    if method == "POST" and path == "/api/predict/emissions":
        required = ["distance_km", "avg_speed_kmh"]
        if not all(k in body for k in required):
            return _bad(f"Missing required fields: {required}")
        return _ok({"input": body, "prediction": service.predict_emissions(body)})

    if method == "POST" and path == "/api/simulate":
        return _ok(service.simulate_policy(body))

    return _bad(f"Not found: {method} {path}", 404)
