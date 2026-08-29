import { useEffect, useState } from "react";
import { api } from "../api";

interface Props { vehicles: string[]; }

export default function VehicleProfile({ vehicles }: Props) {
  const [selected, setSelected] = useState<string>("");
  const [vehicle, setVehicle] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>({});

  useEffect(() => {
    if (!selected && vehicles.length) setSelected(vehicles[0]);
  }, [vehicles, selected]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    Promise.all([api.registry(selected), api.vehicleHistory(selected)]).then(([r, h]) => {
      if (!active) return;
      setVehicle(r.vehicle); setDraft(r.vehicle ?? {}); setHistory(h); setEditing(false);
    });
    return () => { active = false; };
  }, [selected]);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((d: any) => ({ ...d, photo: reader.result }));
    reader.readAsDataURL(file);
  }

  if (!vehicle) return <div className="loading">Loading profile…</div>;

  const v = editing ? draft : vehicle;
  const setF = (k: string, val: string) => setDraft((d: any) => ({ ...d, [k]: val }));

  return (
    <>
      <div className="filters">
        <div className="field">
          <label>Vehicle</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {vehicles.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          {!editing ? (
            <button className="primary" style={{ cursor: "pointer" }} onClick={() => setEditing(true)}>✎ Edit Profile</button>
          ) : (
            <>
              <button className="primary" style={{ cursor: "pointer" }} onClick={() => { setVehicle(draft); setEditing(false); }}>Save</button>
              <button className="ghost" style={{ cursor: "pointer" }} onClick={() => { setDraft(vehicle); setEditing(false); }}>Cancel</button>
            </>
          )}
        </div>
      </div>

      {/* Profile hero */}
      <div className="card profile-hero">
        <div className="profile-photo">
          {v.photo ? <img src={v.photo} alt="vehicle" /> : <div className="photo-placeholder" style={{ fontSize: 48 }}>🚚</div>}
          {editing && (
            <label className="ghost photo-edit">
              Change
              <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
            </label>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 26 }}>{v.lorry_id}</h2>
            <span className={`pill ${v.status}`}>{v.status}</span>
          </div>
          <p className="sub" style={{ margin: "6px 0 0" }}>{v.make} {v.model} · {v.registration_no} · {v.company}</p>
          <div className="profile-stats">
            <div><div className="ps-v">{history?.total_trips ?? 0}</div><div className="ps-k">Trips</div></div>
            <div><div className="ps-v">{(history?.total_distance_km ?? 0).toLocaleString()} km</div><div className="ps-k">Distance</div></div>
            <div><div className="ps-v">{(history?.total_co2_kg ?? 0).toLocaleString()} kg</div><div className="ps-k">CO₂ Emitted</div></div>
          </div>
        </div>
      </div>

      <div className="grid two-col" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="reg-section-title" style={{ marginTop: 0 }}>a) Vehicle Registry</div>
          <Row label="Lorry ID / System ID" val={`${v.lorry_id} · ${v.system_id}`} />
          <EditRow label="Registration Number" k="registration_no" v={v} editing={editing} setF={setF} />
          <EditRow label="Company / Owner" k="company" v={v} editing={editing} setF={setF} />
          <EditRow label="Status" k="status" v={v} editing={editing} setF={setF} />

          <div className="reg-section-title">b) Vehicle Specifications</div>
          <EditRow label="Vehicle Type" k="vehicle_type" v={v} editing={editing} setF={setF} />
          <EditRow label="Make" k="make" v={v} editing={editing} setF={setF} />
          <EditRow label="Model" k="model" v={v} editing={editing} setF={setF} />
          <EditRow label="Year" k="year" v={v} editing={editing} setF={setF} />
          <EditRow label="GVW (t)" k="gvw_tonnes" v={v} editing={editing} setF={setF} />
          <EditRow label="Payload (kg)" k="payload_kg" v={v} editing={editing} setF={setF} />
          <EditRow label="Axles" k="axles" v={v} editing={editing} setF={setF} />
          <EditRow label="Fuel" k="fuel" v={v} editing={editing} setF={setF} />
          <EditRow label="Engine" k="engine" v={v} editing={editing} setF={setF} />
        </div>

        <div className="card">
          <div className="reg-section-title" style={{ marginTop: 0 }}>c) Operational Details</div>
          <EditRow label="Insurance Expiry" k="insurance_expiry" v={v} editing={editing} setF={setF} />
          <EditRow label="Road Tax Expiry" k="roadtax_expiry" v={v} editing={editing} setF={setF} />
          <EditRow label="Puspakom / Inspection Due" k="puspakom_due" v={v} editing={editing} setF={setF} />
          <EditRow label="Last Service Date" k="last_service" v={v} editing={editing} setF={setF} />
          <EditRow label="Odometer (km)" k="odometer_km" v={v} editing={editing} setF={setF} />
          <EditRow label="GPS / Telematics ID" k="gps_device_id" v={v} editing={editing} setF={setF} />
          <EditRow label="Tyre Condition" k="tyre_condition" v={v} editing={editing} setF={setF} />
          <EditRow label="Tyre Last Change" k="tyre_last_change" v={v} editing={editing} setF={setF} />

          <div className="reg-section-title">d) Vehicle History</div>
          <div className="detail-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="detail-cell"><div className="k">Total Travel Distance</div><div className="v">{(history?.total_distance_km ?? 0).toLocaleString()} km</div></div>
            <div className="detail-cell"><div className="k">Total CO₂ Emitted</div><div className="v">{(history?.total_co2_kg ?? 0).toLocaleString()} kg</div></div>
            <div className="detail-cell"><div className="k">Total Trips</div><div className="v">{history?.total_trips ?? 0}</div></div>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, val }: { label: string; val: string }) {
  return (
    <div className="prow">
      <span className="prow-k">{label}</span>
      <span className="prow-v">{val}</span>
    </div>
  );
}
function EditRow({ label, k, v, editing, setF }: any) {
  return (
    <div className="prow">
      <span className="prow-k">{label}</span>
      {editing
        ? <input className="prow-input" value={v[k] ?? ""} onChange={(e) => setF(k, e.target.value)} />
        : <span className="prow-v">{v[k] || "—"}</span>}
    </div>
  );
}
