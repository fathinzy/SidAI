import { useState } from "react";
import { api } from "../api";

export default function TripOrder() {
  const [loadKg, setLoadKg] = useState(8000);
  const [distance, setDistance] = useState(150);
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>("");     // chosen lorry_id
  const [booked, setBooked] = useState<any>(null);

  async function run() {
    setBusy(true); setBooked(null);
    try {
      const r = await api.suggestVehicle({
        load_weight_kg: loadKg, distance_km: distance,
        etd: etd || null, eta: eta || null,
      });
      setResult(r);
      setSelected(r.recommended?.lorry_id ?? "");
    } finally {
      setBusy(false);
    }
  }

  const candidates: any[] = result
    ? [result.recommended, ...(result.alternatives ?? [])].filter(Boolean)
    : [];
  const chosen = candidates.find((c) => c.lorry_id === selected);

  async function proceed() {
    if (!chosen) return;
    setBusy(true);
    try {
      const res = await api.bookTrip({
        lorry_id: chosen.lorry_id, etd: etd || null, eta: eta || null,
        load_weight_kg: loadKg, distance_km: distance,
        predicted_co2_kg: chosen.predicted_co2_kg,
      });
      setBooked(res.booking);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid two-col">
      {/* Order form */}
      <div className="card">
        <h3>New Trip / Order</h3>
        <p className="sub">Enter the shipment details. Lorriq AI scores every capable vehicle on CO₂, load right-sizing and fuel type.</p>
        <div style={{ display: "grid", gap: 14 }}>
          <label className="ff"><span>Load weight (kg)</span>
            <input type="number" value={loadKg} min={100} step={100} onChange={(e) => setLoadKg(+e.target.value)} /></label>
          <label className="ff"><span>Travel distance (km)</span>
            <input type="number" value={distance} min={1} step={5} onChange={(e) => setDistance(+e.target.value)} /></label>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="ff"><span>ETD (departure)</span>
              <input type="datetime-local" value={etd} onChange={(e) => setEtd(e.target.value)} /></label>
            <label className="ff"><span>ETA (arrival)</span>
              <input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} /></label>
          </div>
          <button className="primary" style={{ cursor: "pointer" }} onClick={run} disabled={busy}>
            {busy ? "Analysing fleet…" : "Get AI recommendation"}
          </button>
        </div>

        {booked && (
          <div className="rec-item info" style={{ marginTop: 16 }}>
            <div className="msg">✓ {booked.lorry_id} booked for next trip — {booked.trip_id}</div>
            <div className="meta">Status: {booked.status} · view it under Trip / Order → List of Trip</div>
          </div>
        )}
      </div>

      {/* Recommendation + selection */}
      <div className="card">
        <h3>AI Vehicle Recommendation</h3>
        {!result && <p className="sub">Submit an order to see ranked vehicle suggestions.</p>}
        {result && !candidates.length && <div className="rec-item high"><div className="msg">{result.note}</div></div>}

        {candidates.length > 0 && (
          <>
            <p className="sub">Select a vehicle, then Proceed to book it. Recommended is pre-selected.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {candidates.map((c, i) => (
                <div
                  key={c.lorry_id}
                  onClick={() => setSelected(c.lorry_id)}
                  className={`candidate ${selected === c.lorry_id ? "sel" : ""}`}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {c.lorry_id} {i === 0 && <span className="pill A" style={{ marginLeft: 6 }}>Recommended</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.registration_no} · {c.class}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 18, color: "var(--accent)" }}>Score {c.score}</div>
                      <span className={`pill ${c.fuel === "electric" ? "A" : c.fuel === "biodiesel-b20" ? "B" : "neutral"}`}>{c.fuel}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{c.reason}</div>
                </div>
              ))}
            </div>
            <button className="primary" style={{ marginTop: 14, cursor: "pointer", width: "100%" }}
                    onClick={proceed} disabled={busy || !chosen}>
              {busy ? "Booking…" : `Proceed & book ${chosen?.lorry_id ?? ""}`}
            </button>
            <p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>{result.note}</p>
          </>
        )}
      </div>
    </div>
  );
}
