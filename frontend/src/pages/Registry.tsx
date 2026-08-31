import { useState } from "react";
import { api } from "../api";

const FUELS = ["Diesel", "Biodiesel", "Electric", "Hybrid"];
const VEHICLE_TYPES = ["Rigid Truck", "Prime Mover", "Box Truck", "Tanker", "Flatbed"];

const EMPTY = {
  registration_no: "", company: "", vehicle_type: "", make: "", model: "",
  year: "", gvw_tonnes: "", payload_kg: "", axles: "", fuel: "Diesel", engine: "",
  insurance_expiry: "", roadtax_expiry: "", puspakom_due: "", last_service: "",
  odometer_km: "", gps_device_id: "", tyre_condition: "", tyre_last_change: "",
};

interface RegistryProps { sub?: string; }

export default function Registry({ sub = "vehicle" }: RegistryProps) {
  if (sub === "driver") return <DriverRegistry />;
  return <VehicleRegistry />;
}

function VehicleRegistry() {
  const [form, setForm] = useState<Record<string, string>>({ ...EMPTY });
  const [photo, setPhoto] = useState<string>("");
  const [saved, setSaved] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await api.registerVehicle({ ...form, photo });
      setSaved(res.vehicle);
      setForm({ ...EMPTY });
      setPhoto("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "260px 1fr", gap: 16 }}>
      {/* Photo upload */}
      <div className="card" style={{ textAlign: "center" }}>
        <h3>Vehicle Photo</h3>
        <div className="photo-drop">
          {photo
            ? <img src={photo} alt="vehicle" />
            : <div className="photo-placeholder">🚚<div style={{ fontSize: 12, marginTop: 6 }}>No photo</div></div>}
        </div>
        <label className="primary" style={{ display: "inline-block", marginTop: 12, cursor: "pointer", padding: "9px 16px", borderRadius: 9 }}>
          Upload picture
          <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
        </label>
        {saved && (
          <div className="rec-item info" style={{ marginTop: 14, textAlign: "left" }}>
            <div className="msg">✓ {saved.lorry_id} registered</div>
            <div className="meta">{saved.registration_no || "no plate"} · {saved.company || "no owner"}</div>
          </div>
        )}
      </div>

      {/* Registration form */}
      <div className="card">
        <h3>Register New Vehicle</h3>
        <p className="sub">Key in the vehicle details. Lorry / System ID are auto-generated on save.</p>

        <div className="reg-section-title">a) Vehicle Registry</div>
        <div className="form-grid">
          <Field label="Vehicle Registration Number" k="registration_no" form={form} set={set} placeholder="e.g. WXY 1234" />
          <Field label="Company / Owner" k="company" form={form} set={set} placeholder="e.g. Lorriq Logistics Sdn Bhd" />
        </div>

        <div className="reg-section-title">b) Vehicle Specifications</div>
        <div className="form-grid">
          <SelectField label="Vehicle Type" k="vehicle_type" form={form} set={set} options={VEHICLE_TYPES} />
          <Field label="Make & Model" k="make" form={form} set={set} placeholder="e.g. Volvo FH 460" />
          <Field label="Year of Manufacture" k="year" form={form} set={set} type="number" placeholder="2024" />
          <Field label="Gross Vehicle Weight (t)" k="gvw_tonnes" form={form} set={set} type="number" placeholder="40" />
          <Field label="Payload Capacity (kg)" k="payload_kg" form={form} set={set} type="number" placeholder="24000" />
          <Field label="Number of Axles" k="axles" form={form} set={set} type="number" placeholder="5" />
          <SelectField label="Fuel Type" k="fuel" form={form} set={set} options={FUELS} />
          <Field label="Engine Capacity / Power" k="engine" form={form} set={set} placeholder="12.8L / 460 hp" />
        </div>

        <div className="reg-section-title">c) Operational Details</div>
        <div className="form-grid">
          <Field label="Insurance Expiry" k="insurance_expiry" form={form} set={set} placeholder="dd/mm/yyyy" />
          <Field label="Road Tax Expiry" k="roadtax_expiry" form={form} set={set} placeholder="dd/mm/yyyy" />
          <Field label="Puspakom / Inspection Due" k="puspakom_due" form={form} set={set} placeholder="dd/mm/yyyy" />
          <Field label="Last Service Date" k="last_service" form={form} set={set} placeholder="dd/mm/yyyy" />
          <Field label="Current Odometer (km)" k="odometer_km" form={form} set={set} type="number" placeholder="125000" />
          <Field label="GPS / Telematics ID" k="gps_device_id" form={form} set={set} placeholder="GPS-12345" />
          <Field label="Tyre Condition" k="tyre_condition" form={form} set={set} placeholder="Good" />
          <Field label="Tyre Last Change" k="tyre_last_change" form={form} set={set} placeholder="mm/yyyy" />
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? "Registering…" : "Register Vehicle"}
          </button>
          <button className="ghost" style={{ cursor: "pointer" }} onClick={() => { setForm({ ...EMPTY }); setPhoto(""); setSaved(null); }}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

const DRIVER_EMPTY = {
  driver_name: "", driver_age: "", driver_gender: "", license_number: "", license_expiry: "",
};

function DriverRegistry() {
  const [form, setForm] = useState<Record<string, string>>({ ...DRIVER_EMPTY });
  const [photo, setPhoto] = useState<string>("");
  const [saved, setSaved] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await api.registerDriver({ ...form, photo });
      setSaved(res.driver);
      setForm({ ...DRIVER_EMPTY });
      setPhoto("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "260px 1fr", gap: 16 }}>
      <div className="card" style={{ textAlign: "center" }}>
        <h3>Driver Photo</h3>
        <div className="photo-drop">
          {photo
            ? <img src={photo} alt="driver" />
            : <div className="photo-placeholder">👤<div style={{ fontSize: 12, marginTop: 6 }}>No photo</div></div>}
        </div>
        <label className="primary" style={{ display: "inline-block", marginTop: 12, cursor: "pointer", padding: "9px 16px", borderRadius: 9 }}>
          Upload picture
          <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />
        </label>
        {saved && (
          <div className="rec-item info" style={{ marginTop: 14, textAlign: "left" }}>
            <div className="msg">✓ {saved.driver_id} registered</div>
            <div className="meta">{saved.driver_name || "no name"}</div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Register New Driver</h3>
        <p className="sub">Key in the driver details. Driver ID is auto-generated on save.</p>

        <div className="reg-section-title">Driver Details</div>
        <div className="form-grid">
          <Field label="Driver Name" k="driver_name" form={form} set={set} placeholder="e.g. Ahmad bin Hassan" />
          <Field label="Driver Age" k="driver_age" form={form} set={set} type="number" placeholder="35" />
          <SelectField label="Gender" k="driver_gender" form={form} set={set} options={["Male", "Female"]} />
          <Field label="License Number" k="license_number" form={form} set={set} placeholder="e.g. D1234567" />
          <Field label="License Expiry Date" k="license_expiry" form={form} set={set} placeholder="dd/mm/yyyy" />
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? "Registering…" : "Register Driver"}
          </button>
          <button className="ghost" style={{ cursor: "pointer" }} onClick={() => { setForm({ ...DRIVER_EMPTY }); setPhoto(""); setSaved(null); }}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, k, form, set, type = "text", placeholder }: any) {
  return (
    <label className="ff">
      <span>{label}</span>
      <input type={type} value={form[k]} placeholder={placeholder}
             onChange={(e) => set(k, e.target.value)} />
    </label>
  );
}
function SelectField({ label, k, form, set, options }: any) {
  return (
    <label className="ff">
      <span>{label}</span>
      <select value={form[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">Select…</option>
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
