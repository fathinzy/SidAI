import { useEffect, useState } from "react";
import { api } from "../api";

export default function DriverProfile() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.drivers().then((d) => {
      setDrivers(d.drivers ?? []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    api.driverDetail(selected).then((d) => { if (active) setDetail(d); });
    return () => { active = false; };
  }, [selected]);

  if (loading) return <div className="loading">Loading drivers…</div>;

  // Grid view (no driver selected yet)
  if (!selected) {
    return (
      <>
        <p className="sub" style={{ marginTop: 0 }}>
          AI-powered driver safety and performance tracking. Click a driver to open their full profile.
        </p>
        <div className="driver-grid">
          {drivers.map((d) => (
            <div key={d.driver_id} className="driver-card" onClick={() => setSelected(d.driver_id)}>
              <div className="driver-card-head">
                <div className="driver-avatar">
                  {d.photo ? <img src={d.photo} alt="" /> : "👤"}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{d.driver_name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{d.driver_id}</div>
                </div>
              </div>
              <div className={`safety-ring ${grade(d.safety_score)}`}>
                <div className="ring-score">{d.safety_score}</div>
                <div className="ring-label">Safety Score</div>
              </div>
              <div className="driver-mini-stats">
                <div><div className="v">{d.trips.toLocaleString()}</div><div className="k">Trips</div></div>
                <div><div className="v">{Math.round(d.distance_km).toLocaleString()}</div><div className="k">km</div></div>
                <div><div className="v" style={{ color: d.violations > 0 ? "var(--danger, #ef4444)" : "inherit" }}>{d.violations}</div><div className="k">Violations</div></div>
              </div>
              {d.license_status === "overdue" && <div className="license-warn">⚠ License expired</div>}
              {d.license_status === "due_soon" && <div className="license-warn soon">License expiring soon</div>}
            </div>
          ))}
        </div>
      </>
    );
  }

  // Detail view
  const drv = detail?.driver ?? {};
  const st = detail?.stats ?? {};
  return (
    <>
      <div className="filters">
        <button className="ghost" style={{ cursor: "pointer" }} onClick={() => { setSelected(""); setDetail(null); }}>
          ← Back to all drivers
        </button>
      </div>

      {!detail ? <div className="loading">Loading profile…</div> : (
        <>
          <div className="card profile-hero">
            <div className="profile-photo">
              {drv.photo ? <img src={drv.photo} alt="driver" /> : <div className="photo-placeholder" style={{ fontSize: 48 }}>👤</div>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 26 }}>{drv.driver_name}</h2>
                <span className={`pill ${gradePill(st.safety_score)}`}>{st.safety_grade}</span>
                {detail.license_status === "overdue" && <span className="pill high">License expired</span>}
                {detail.license_status === "due_soon" && <span className="pill medium">License expiring</span>}
              </div>
              <p className="sub" style={{ margin: "6px 0 0" }}>
                {drv.driver_id} · {drv.driver_gender} · Age {drv.driver_age} · License {drv.license_number} (exp {drv.license_expiry})
              </p>
              <div className="profile-stats">
                <div><div className="ps-v">{st.total_trips}</div><div className="ps-k">Trips</div></div>
                <div><div className="ps-v">{(st.total_distance_km ?? 0).toLocaleString()} km</div><div className="ps-k">Distance</div></div>
                <div><div className="ps-v">{st.violation_count}</div><div className="ps-k">Violations</div></div>
                <div><div className="ps-v">{st.safety_score}</div><div className="ps-k">Safety Score</div></div>
              </div>
            </div>
          </div>

          <div className="grid two-col" style={{ marginTop: 16 }}>
            {/* Violation history */}
            <div className="card">
              <div className="reg-section-title" style={{ marginTop: 0 }}>Violation History</div>
              {(!detail.violations || detail.violations.length === 0) ? (
                <p className="sub">No violations recorded. Clean driving record.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>Type</th><th>Severity</th><th>Detail</th><th>Vehicle</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {detail.violations.map((v: any, i: number) => (
                      <tr key={i}>
                        <td>{v.type}</td>
                        <td><span className={`pill ${v.severity === "high" ? "high" : "medium"}`}>{v.severity}</span></td>
                        <td>{v.detail}</td>
                        <td>{v.lorry_id}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(v.when)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Vehicle usage history */}
            <div className="card">
              <div className="reg-section-title" style={{ marginTop: 0 }}>Vehicle Usage History</div>
              {(!detail.vehicle_usage || detail.vehicle_usage.length === 0) ? (
                <p className="sub">No vehicle usage recorded.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr><th>Vehicle ID</th><th>Trips</th><th>Distance</th><th>Last Used</th></tr>
                  </thead>
                  <tbody>
                    {detail.vehicle_usage.map((u: any) => (
                      <tr key={u.lorry_id}>
                        <td>{u.lorry_id}</td>
                        <td>{u.trips}</td>
                        <td>{u.distance_km.toLocaleString()} km</td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(u.last_used)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function grade(score: number): string {
  return score >= 90 ? "excellent" : score >= 75 ? "good" : score >= 60 ? "fair" : "poor";
}
function gradePill(score: number): string {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "neutral" : "high";
}
function fmtDate(s: string): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString();
}
