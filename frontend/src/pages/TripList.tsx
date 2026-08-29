import { useEffect, useState } from "react";
import { api } from "../api";

interface Props { vehicles: string[]; }

export default function TripList({ vehicles }: Props) {
  const [vehicle, setVehicle] = useState("all");
  const [status, setStatus] = useState("all");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.trips(vehicle, status).then((d) => { if (active) { setData(d); setLoading(false); } });
    return () => { active = false; };
  }, [vehicle, status]);

  const statuses = data?.statuses ?? ["Booked", "Scheduled", "In Transit", "Delivered", "Completed"];

  return (
    <>
      <div className="filters">
        <div className="field">
          <label>Vehicle</label>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            <option value="all">All vehicles</option>
            {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((s: string) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <h3>List of Trip {data && <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {data.count}</span>}</h3>
        {loading ? (
          <div className="loading">Loading trips…</div>
        ) : (
          <table>
            <thead>
              <tr><th>Trip ID</th><th>Vehicle ID</th><th>ETD</th><th>ETA</th><th>Load (kg)</th><th>Travel Distance</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(data?.trips ?? []).map((t: any) => (
                <tr key={t.trip_id}>
                  <td style={{ fontWeight: 600 }}>{t.trip_id}</td>
                  <td>{t.lorry_id}</td>
                  <td>{fmt(t.etd)}</td>
                  <td>{fmt(t.eta)}</td>
                  <td>{Number(t.load_kg).toLocaleString()}</td>
                  <td>{t.distance_km} km</td>
                  <td><span className={`pill ${statusClass(t.status)}`}>{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function fmt(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function statusClass(s: string) {
  return { Booked: "B", Scheduled: "B", "In Transit": "medium", Delivered: "A", Completed: "A" }[s] ?? "neutral";
}
