import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { api } from "../api";

type Scope = "daily" | "weekly" | "monthly";

const FUEL_COLORS: Record<string, string> = {
  diesel: "#c0392b", "biodiesel-b20": "#c8901f", electric: "#0e9f6e", hybrid: "#3f6b8c",
};

interface ReportProps { vehicles?: string[]; }

export default function Report({ vehicles = [] }: ReportProps) {
  const [scope, setScope] = useState<Scope>("weekly");
  const [vehicle, setVehicle] = useState<string>("all");
  const [data, setData] = useState<any>(null);           // report summary (for PDF + KPIs)
  const [series, setSeries] = useState<any>(null);        // emission trend
  const [ranking, setRanking] = useState<any[]>([]);      // per-vehicle CO2
  const [fuelMix, setFuelMix] = useState<any[]>([]);      // fuel type distribution
  const [recs, setRecs] = useState<any[]>([]);            // AI recommendations
  const [loading, setLoading] = useState(true);

  // report summary follows the scope selector
  useEffect(() => {
    let active = true;
    setLoading(true);
    api.report(scope).then((d) => { if (active) { setData(d); setLoading(false); } });
    return () => { active = false; };
  }, [scope]);

  // analytics datasets follow the vehicle filter
  useEffect(() => {
    const vf = { period: "year" as const, year: 2026, vehicle };
    Promise.all([
      api.emissionSeries(vf),
      api.vehicleRanking({ period: "all", vehicle }),
      api.fleet(),
      api.recommendations(),
    ]).then(([s, r, f, rec]) => {
      setSeries(s);
      setRanking((r.ranking ?? []).slice(0, 8));
      // fuel mix: whole fleet, or just the one vehicle when filtered
      const lorries = (f.lorries ?? []).filter(
        (l: any) => vehicle === "all" || l.lorry_id === vehicle);
      const counts: Record<string, number> = {};
      lorries.forEach((l: any) => {
        const k = String(l.fuel).toLowerCase();
        counts[k] = (counts[k] ?? 0) + 1;
      });
      setFuelMix(Object.entries(counts).map(([name, value]) => ({ name, value })));
      setRecs(rec.recommendations ?? []);
    });
  }, [vehicle]);

  async function download() {
    if (!data?.available) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"), import("jspdf-autotable"),
    ]);
    const s = data.summary;
    const doc = new jsPDF();
    doc.setFillColor(217, 102, 43);
    doc.rect(0, 0, 210, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text("Lorriq", 14, 13);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text("AI Fleet Emissions & Congestion Intelligence", 14, 20);
    doc.setTextColor(40, 33, 25); doc.setFontSize(15); doc.setFont("helvetica", "bold");
    doc.text(`${cap(scope)} ESG Report`, 14, 40);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(120, 110, 95);
    doc.text(`Reporting period: ${data.period.from} - ${data.period.to}`, 14, 47);
    doc.text(`Vehicle scope: ${vehicle === "all" ? "All vehicles (fleet-wide)" : vehicle}`, 14, 53);
    doc.text(`SDG 13 - Climate Action  |  Generated ${new Date().toLocaleString()}`, 14, 59);
    autoTable(doc, {
      startY: 68,
      head: [["ESG Metric", "Value"]],
      body: [
        ["Total trips", s.trips.toLocaleString()],
        ["Distance covered", `${s.distance_km.toLocaleString()} km`],
        ["Total CO2 (with AI)", `${s.total_co2_kg.toLocaleString()} kg`],
        ["Total CO2 (without AI / BAU)", `${s.total_co2_without_ai_kg.toLocaleString()} kg`],
        ["CO2 avoided", `${s.co2_saved_kg.toLocaleString()} kg`],
        ["Emission reduction", `${s.co2_saved_pct}%`],
        ["Fuel saved", `${s.fuel_saved_litres.toLocaleString()} L`],
        ["Trees equivalent (annual absorption)", `${s.trees_equivalent.toLocaleString()} trees`],
      ],
      headStyles: { fillColor: [217, 102, 43] },
      alternateRowStyles: { fillColor: [246, 241, 234] },
      styles: { fontSize: 10, cellPadding: 3 },
    });

    // Per-vehicle CO2 ranking (reflects the vehicle filter)
    if (ranking.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [["Vehicle", "Fuel", "CO2 (t)", "CO2 saved (t)", "Trips"]],
        body: ranking.map((r) => [
          r.lorry_id, r.fuel, String(r.co2_t), String(r.co2_saved_t), String(r.trips),
        ]),
        headStyles: { fillColor: [63, 107, 140] },
        alternateRowStyles: { fillColor: [240, 245, 250] },
        styles: { fontSize: 9, cellPadding: 2.5 },
      });
    }

    const vtag = vehicle === "all" ? "fleet" : vehicle;
    doc.save(`Lorriq_${scope}_${vtag}_ESG_report_${data.period.to.replace(/\//g, "-")}.pdf`);
  }

  const s = data?.summary;

  // build the trend rows (with-AI vs standard) from the emission series
  const trendRows = (series?.points ?? []).map((p: any) => ({
    label: p.label,
    "With AI": p.with_ai_t,
    "Without AI": p.without_ai_t,
  }));

  return (
    <>
      <div className="filters">
        <div className="field">
          <label>Report scope</label>
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="field">
          <label>Vehicle</label>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            <option value="all">All vehicles</option>
            {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="primary" onClick={download} disabled={!data?.available}>⬇ Download PDF</button>
        </div>
      </div>

      {/* KPI target cards */}
      {loading ? <div className="loading">Compiling analytics…</div> : !s ? (
        <div className="card"><p className="sub">No data available for this period.</p></div>
      ) : (
        <>
          <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
            <TargetCard label="CO₂ Avoided" value={`${s.co2_saved_kg.toLocaleString()} kg`}
                        pct={Math.min(100, s.co2_saved_pct * 2)} target={`${s.co2_saved_pct}% reduction`} tone="green" />
            <TargetCard label="Emission Reduction" value={`${s.co2_saved_pct}%`}
                        pct={Math.min(100, s.co2_saved_pct * 2.5)} target="Target: 15% (EU 2025)" tone="green" />
            <TargetCard label="Fuel Saved" value={`${s.fuel_saved_litres.toLocaleString()} L`}
                        pct={Math.min(100, 70)} target={`${s.trees_equivalent.toLocaleString()} trees/yr`} tone="gold" />
            <TargetCard label="Distance" value={`${s.distance_km.toLocaleString()} km`}
                        pct={80} target={`${s.trips.toLocaleString()} trips`} tone="blue" />
          </div>

          {/* Charts row */}
          <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
            <div className="card">
              <h3>Carbon Emissions Trend</h3>
              <p className="sub">Monthly CO₂ (tonnes): AI-optimised vs standard routing.</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendRows} margin={{ top: 5, right: 10, bottom: 5, left: -18 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} />
                  <YAxis stroke="var(--muted)" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Without AI" stroke="#c0392b" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                  <Line type="monotone" dataKey="With AI" stroke="#0e9f6e" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3>Fleet Fuel Type Distribution</h3>
              <p className="sub">Current fleet composition by fuel.</p>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={fuelMix} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={(e: any) => `${e.name} ${e.value}`}>
                    {fuelMix.map((f) => <Cell key={f.name} fill={FUEL_COLORS[f.name] ?? "#8ea1b8"} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Vehicle CO2 ranking bar chart */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Vehicle CO₂ Ranking</h3>
            <p className="sub">Top emitters by total CO₂ (tonnes). Targets for optimisation.</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ranking} margin={{ top: 5, right: 10, bottom: 5, left: -18 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="lorry_id" stroke="var(--muted)" fontSize={10} angle={-20} textAnchor="end" height={50} />
                <YAxis stroke="var(--muted)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="co2_t" name="CO₂ (t)" fill="#c0392b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="co2_saved_t" name="CO₂ saved (t)" fill="#0e9f6e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* AI recommendations */}
          <div className="card">
            <h3>⚡ AI-Powered Recommendations</h3>
            <p className="sub">Actionable insights generated from congestion + emissions analysis.</p>
            {recs.length === 0 ? (
              <p className="sub">No high-priority actions right now. Fleet operating within targets.</p>
            ) : (
              <div className="rec-cards">
                {recs.slice(0, 6).map((r, i) => (
                  <div key={i} className={`rec-card ${r.priority}`}>
                    <div className="rec-card-top">
                      <span className="rec-card-title">{r.segment_id?.split("::")[1]?.trim() ?? "Congestion hotspot"}</span>
                      <span className={`pill ${r.priority === "high" ? "high" : "medium"}`}>{r.priority} impact</span>
                    </div>
                    <p className="rec-card-body">{r.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

const tooltipStyle = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)",
};

function TargetCard({ label, value, pct, target, tone }: any) {
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="util-track" style={{ marginTop: 8 }}>
        <div className={`util-fill ${tone === "green" ? "good" : tone === "gold" ? "warn" : "good"}`} style={{ width: `${pct}%` }} />
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>{target}</div>
    </div>
  );
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
