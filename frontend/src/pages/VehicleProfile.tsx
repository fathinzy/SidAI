import { useEffect, useState } from "react";
import { api } from "../api";

interface Props { vehicles: string[]; }

export default function VehicleProfile({ vehicles }: Props) {
  const [selected, setSelected] = useState<string>("");
  const [vehicle, setVehicle] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [maint, setMaint] = useState<any>(null);
  const [showMaint, setShowMaint] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>({});

  useEffect(() => {
    if (!selected && vehicles.length) setSelected(vehicles[0]);
  }, [vehicles, selected]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    Promise.all([api.registry(selected), api.vehicleHistory(selected), api.vehicleMaintenance(selected)])
      .then(([r, h, m]) => {
        if (!active) return;
        setVehicle(r.vehicle); setDraft(r.vehicle ?? {}); setHistory(h); setMaint(m); setEditing(false);
      });
    return () => { active = false; };
  }, [selected]);

  async function markDone(field: string) {
    const res = await api.maintenanceDone({ lorry_id: selected, field });
    if (res?.maintenance) setMaint(res.maintenance);
  }

  // status -> traffic-light color for a maintenance date field (by key)
  function statusOf(key: string): string {
    const item = maint?.items?.find((i: any) => i.key === key);
    return item?.status ?? "unknown";
  }

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
          {maint?.overall_status && maint.overall_status !== "ok" && !editing && (
            <button
              className={`maint-btn ${maint.overall_status}`}
              style={{ cursor: "pointer" }}
              onClick={() => setShowMaint(true)}
            >
              {maint.overall_status === "overdue" ? "🔧 Maintenance Due" : "🔧 Maintenance Almost Due"}
            </button>
          )}
          {!editing ? (
            <>
            <button className="ghost" style={{ cursor: "pointer" }} onClick={() => setShowMaint(true)}>🔧 Maintenance</button>
            <button className="primary" style={{ cursor: "pointer" }} onClick={() => setEditing(true)}>✎ Edit Profile</button>
            </>
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
          <EditRow label="Insurance Expiry" k="insurance_expiry" v={v} editing={editing} setF={setF} status={statusOf("insurance_expiry")} />
          <EditRow label="Road Tax Expiry" k="roadtax_expiry" v={v} editing={editing} setF={setF} status={statusOf("roadtax_expiry")} />
          <EditRow label="Puspakom / Inspection Due" k="puspakom_due" v={v} editing={editing} setF={setF} status={statusOf("puspakom_due")} />
          <EditRow label="Last Service Date" k="last_service" v={v} editing={editing} setF={setF} status={statusOf("last_service")} />
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

      {showMaint && (
        <MaintenanceModal
          maint={maint}
          onClose={() => setShowMaint(false)}
          onMarkDone={markDone}
        />
      )}
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
function EditRow({ label, k, v, editing, setF, status }: any) {
  return (
    <div className="prow">
      <span className="prow-k">
        {status && status !== "unknown" && <span className={`status-dot ${status}`} title={status} />}
        {label}
      </span>
      {editing
        ? <input className="prow-input" value={v[k] ?? ""} onChange={(e) => setF(k, e.target.value)} />
        : <span className={`prow-v ${status && status !== "ok" && status !== "unknown" ? `mv-${status}` : ""}`}>{v[k] || "—"}</span>}
    </div>
  );
}

function MaintenanceModal({ maint, onClose, onMarkDone }: any) {
  if (!maint) return null;
  const items = maint.items ?? [];
  const label: Record<string, string> = {
    overdue: "Overdue", due_soon: "Almost due", ok: "OK", unknown: "No date",
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Maintenance & Compliance</h3>
          <button className="ghost" style={{ cursor: "pointer" }} onClick={onClose}>✕</button>
        </div>
        <p className="sub">Mark an item as done once completed. The next due date updates automatically.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
          {items.map((it: any) => (
            <div key={it.key} className={`maint-item ${it.status}`}>
              <div>
                <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`status-dot ${it.status}`} />{it.label}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                  {it.is_service && it.last_done ? `Last done ${it.last_done} · ` : ""}
                  Due {it.due_date || "—"}
                  {it.days_remaining != null && (
                    <> · {it.days_remaining < 0
                      ? `${Math.abs(it.days_remaining)} days overdue`
                      : `${it.days_remaining} days left`}</>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`pill ${it.status === "overdue" ? "high" : it.status === "due_soon" ? "medium" : "A"}`}>
                  {label[it.status] ?? it.status}
                </span>
                <button className="primary" style={{ cursor: "pointer", padding: "6px 12px" }}
                        onClick={() => onMarkDone(it.key)}>
                  {it.is_service ? "Mark Serviced" : "Mark Renewed"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
