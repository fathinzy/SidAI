import { useEffect, useRef, useState } from "react";
import { api, Filters } from "../api";
import { Theme } from "../theme";
import FilterBar from "../components/FilterBar";
import LiveMap from "../components/LiveMap";
import ForecastChart from "../components/ForecastChart";

interface Props {
  vehicles: string[];
  theme: Theme;
}

export default function LiveTracking({ vehicles, theme }: Props) {
  const [filters, setFilters] = useState<Filters>({ vehicle: "all" });
  const [hotspots, setHotspots] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [incidents, setIncidents] = useState<any>(null);
  const [updates, setUpdates] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // live data
  const [positions, setPositions] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const vehicle = filters.vehicle ?? "all";

  // static-ish data loaded once
  useEffect(() => {
    let active = true;
    (async () => {
      const [h, fc, inc, up] = await Promise.all([
        api.hotspots(), api.forecast(12), api.incidents(), api.vehicleUpdates(),
      ]);
      if (!active) return;
      setHotspots(h); setForecast(fc); setIncidents(inc); setUpdates(up);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  // LIVE vehicle positions — poll every 2s to animate movement
  useEffect(() => {
    let active = true;
    let timer: any;
    const tick = async () => {
      try { const p = await api.livePositions(); if (active) setPositions(p); } catch { /* keep last */ }
      timer = setTimeout(tick, 2000);
    };
    tick();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  // LIVE driver feed — poll every 4s, append new messages chat-style (per-vehicle)
  useEffect(() => {
    let active = true;
    let timer: any;
    seenIds.current = new Set();
    setFeed([]);
    const tick = async () => {
      try {
        const res = await api.liveFeed(vehicle, 5);
        if (active) {
          setFeed((prev) => {
            const fresh = (res.messages ?? []).filter((m: any) => !seenIds.current.has(m.id));
            fresh.forEach((m: any) => seenIds.current.add(m.id));
            return [...fresh, ...prev].slice(0, 30);
          });
        }
      } catch { /* keep last */ }
      timer = setTimeout(tick, 4000);
    };
    tick();
    return () => { active = false; clearTimeout(timer); };
  }, [vehicle]);

  // per-vehicle detail when a specific vehicle is selected
  useEffect(() => {
    let active = true;
    if (vehicle && vehicle !== "all") {
      api.vehicleDetail(vehicle).then((d) => { if (active) setDetail(d); });
    } else {
      setDetail(null);
    }
    return () => { active = false; };
  }, [vehicle]);

  if (loading) return <div className="loading">Loading live fleet telemetry…</div>;

  const filteredUpdates = vehicle === "all"
    ? (updates?.updates ?? [])
    : (updates?.updates ?? []).filter((u: any) => u.lorry_id === vehicle);

  return (
    <>
      <FilterBar filters={filters} onChange={setFilters} vehicles={vehicles} years={[]} showTime={false} />

      {/* Per-vehicle special detail panel */}
      {detail?.available && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>{detail.vehicle} — Live Trip Detail</h3>
          <p className="sub">
            {detail.registry?.registration_no} · {detail.registry?.make} {detail.registry?.model} · {detail.current_trip.corridor}
          </p>
          <div className="detail-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <Cell k="ETA" v={fmtTime(detail.current_trip.eta)} />
            <Cell k="Distance Travelled" v={`${detail.current_trip.distance_travelled_km} km`} />
            <Cell k="Time Travel" v={`${detail.current_trip.time_travel_min} min`} />
            <Cell k="Total Idle" v={`${detail.current_trip.total_idle_min} min`} />
            <Cell k="Avg Speed" v={`${detail.current_trip.avg_speed_kmh} km/h`} />
            <Cell k="CO₂ Emitted" v={`${detail.current_trip.co2_emitted_kg} kg`} />
            <Cell k="Fuel Consumption" v={`${detail.current_trip.fuel_consumption_l} L`} />
            <Cell k="Lifetime Trips" v={`${detail.lifetime.trips}`} />
          </div>
        </div>
      )}

      <div className="grid two-col">
        <div className="card">
          <h3>Live Fleet Map {vehicle !== "all" && `· ${vehicle}`}</h3>
          <p className="sub">Vehicles move in real time along Malaysian freight corridors. Updates every 2s.</p>
          <LiveMap positions={positions} filterVehicle={vehicle} theme={theme} />
          <div className="legend">
            <span><i className="dot" style={{ background: "#1f6feb" }} /> Diesel lorry</span>
            <span><i className="dot" style={{ background: "#0e9f6e" }} /> Electric lorry</span>
            <span><i className="dot" style={{ background: "#1f6feb", opacity: 0.5 }} /> Freight corridor</span>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="live-dot" style={{ background: "#0e9f6e", width: 9, height: 9, borderRadius: "50%", display: "inline-block" }} />
            <h3 style={{ margin: 0 }}>Live Driver Advisory {vehicle !== "all" && `· ${vehicle}`}</h3>
          </div>
          <p className="sub">
            {vehicle === "all" ? "Real-time guidance streaming to drivers across the fleet." : `Live guidance for ${vehicle} only.`}
          </p>
          <div className="chat-feed">
            {feed.length === 0 && <div style={{ color: "var(--muted)" }}>Connecting to driver channel…</div>}
            {feed.map((m) => (
              <div key={m.id} className={`chat-msg ${m.severity}`}>
                <div className="chat-text">{m.message}</div>
                <div className="chat-meta">
                  Peak {m.peak_hour}:00 · index {m.peak_index} · {fmtClock(m.ts)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid two-col" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Congestion Forecast</h3>
          <ForecastChart forecast={forecast} />
        </div>
        <div className="card">
          <h3>Incident Feed — Automated Response</h3>
          <p className="sub">{incidents?.count ?? 0} incidents. High severity auto-triggers reroute + operator alert.</p>
          <table>
            <thead><tr><th>Vehicle</th><th>Segment</th><th>Severity</th><th>Action</th></tr></thead>
            <tbody>
              {(incidents?.incidents ?? []).slice(0, 8).map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.lorry_id}</td>
                  <td>{seg(r.segment_id)}</td>
                  <td><span className={`pill ${r.severity}`}>{r.severity}</span></td>
                  <td style={{ color: "var(--muted)" }}>{r.auto_action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid two-col" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Vehicle Updates</h3>
          <p className="sub">Shipment and vehicle status board.</p>
          <table>
            <thead><tr><th>Vehicle</th><th>Company</th><th>Shipment</th><th>Vehicle</th></tr></thead>
            <tbody>
              {filteredUpdates.slice(0, 12).map((u: any) => (
                <tr key={u.lorry_id}>
                  <td>{u.lorry_id}</td>
                  <td style={{ color: "var(--muted)" }}>{u.company}</td>
                  <td>{u.shipment_status}</td>
                  <td><span className={`pill ${statusClass(u.vehicle_status)}`}>{u.vehicle_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Congestion Hotspot Analysis</h3>
          <p className="sub">Ranked segments with road-network recommendations.</p>
          <table>
            <thead><tr><th>Segment</th><th>Congestion</th><th>Idle</th><th>Recommendation</th></tr></thead>
            <tbody>
              {(hotspots?.hotspots ?? []).slice(0, 6).map((h: any, i: number) => (
                <tr key={i}>
                  <td>{seg(h.segment_id)}</td>
                  <td>{(h.avg_congestion * 100).toFixed(0)}%</td>
                  <td>{(h.avg_idle_seconds / 60).toFixed(1)}m</td>
                  <td style={{ color: "var(--muted)" }}>{h.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Cell({ k, v }: { k: string; v: string }) {
  return <div className="detail-cell"><div className="k">{k}</div><div className="v">{v}</div></div>;
}
function seg(s: string) { return s?.split("::")[1]?.trim() ?? s; }
function fmtClock(ts: number) {
  try { return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return ""; }
}
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function statusClass(s: string) {
  if (s === "Moving") return "Moving";
  if (s === "Idle") return "Idle";
  if (s === "Stopped") return "Stopped";
  return "neutral";
}
