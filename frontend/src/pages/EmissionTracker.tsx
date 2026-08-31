import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { api, Filters } from "../api";
import FilterBar from "../components/FilterBar";

interface Props {
  vehicles: string[];
  years: number[];
}

function Box({ label, value, unit, hint, tone }: { label: string; value: string; unit?: string; hint?: string; tone?: string }) {
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}{unit && <span className="unit"> {unit}</span>}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export default function EmissionTracker({ vehicles, years }: Props) {
  const [filters, setFilters] = useState<Filters>({ period: "all", vehicle: "all" });
  const [kpis, setKpis] = useState<any>(null);
  const [series, setSeries] = useState<any>(null);
  const [ranking, setRanking] = useState<any>(null);
  const [eco, setEco] = useState<any>(null);
  const [compare, setCompare] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<"total" | "intensity">("intensity");

  const singleVehicle = !!filters.vehicle && filters.vehicle !== "all";

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [k, s, r, e] = await Promise.all([
        api.kpis(filters), api.emissionSeries(filters),
        api.vehicleRanking(filters), api.ecoScores(filters),
      ]);
      if (!active) return;
      setKpis(k); setSeries(s); setRanking(r); setEco(e);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [filters]);

  // scenario comparison only makes sense for a single vehicle
  useEffect(() => {
    if (!singleVehicle) { setCompare(null); return; }
    let active = true;
    api.scenarioCompare(filters).then((c) => { if (active) setCompare(c); });
    return () => { active = false; };
  }, [filters, singleVehicle]);

  const chartData = (series?.points ?? []).map((p: any) => ({
    label: p.label,
    "AI-Optimized": metric === "intensity" ? p.ai_intensity : p.with_ai_t,
    "Standard Routing": metric === "intensity" ? p.standard_intensity : p.without_ai_t,
  }));
  const euTarget = series?.eu_target_intensity ?? 42;
  const yUnit = metric === "intensity" ? "gCO₂/t·km" : "tonnes";

  return (
    <>
      <FilterBar filters={filters} onChange={setFilters} vehicles={vehicles} years={years} showTime />

      {singleVehicle && compare?.available && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>🌱 "CO₂ Avoided" — {compare.vehicle}</h3>
          <p className="sub">Standard Route (business-as-usual) vs Sid-AI Optimized, across {compare.trips} trips in range.</p>
          <table className="compare-table">
            <thead>
              <tr>
                <th></th>
                <th style={{ textAlign: "right" }}>{compare.standard_label}</th>
                <th style={{ textAlign: "right" }}>{compare.ai_label}</th>
              </tr>
            </thead>
            <tbody>
              {compare.rows.map((row: any) => (
                <tr key={row.metric} className={row.highlight ? "compare-highlight" : ""}>
                  <td>{row.metric}</td>
                  <td style={{ textAlign: "right" }}>{row.standard}</td>
                  <td style={{ textAlign: "right", fontWeight: row.highlight ? 700 : 600, color: row.highlight ? "var(--green)" : "inherit" }}>{row.ai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && !kpis ? (
        <div className="loading">Loading emission intelligence…</div>
      ) : (
        <>
          {/* 9 KPI boxes */}
          <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
            <Box label="Total CO₂ (AI-Optimized)" value={fmt(kpis?.total_co2_tonnes)} unit="t" tone="" hint="SidAI applied" />
            <Box label="Avg CO₂ / Vehicle" value={fmt(kpis?.avg_co2_per_vehicle_tonnes)} unit="t" />
            <Box label="Trees Equivalent" value={fmt(kpis?.trees_equivalent, 0)} tone="green" hint="mature trees / year" />
            <Box label="Total CO₂ (Standard Routing)" value={fmt(kpis?.total_co2_without_ai_tonnes)} unit="t" tone="red" hint="without AI optimization" />
            <Box label="CO₂ Avoided" value={fmt(kpis?.co2_saved_tonnes)} unit="t" tone="green" hint="AI vs standard" />
            <Box label="Reduction" value={fmt(kpis?.co2_saved_pct, 1)} unit="%" tone="green" />
            <Box label="Fleet Trips" value={fmt(kpis?.total_trips, 0)} tone="gold" />
            <Box label="Distance" value={fmt(kpis?.total_distance_km, 0)} unit="km" tone="blue" />
            <Box label="Avg Congestion" value={fmt(kpis?.avg_congestion_index, 2)} tone="gold" />
          </div>

          {/* Left / right split */}
          <div className="grid two-col">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <h3>CO₂ Emissions — AI-Optimized vs Standard Routing</h3>
                    <p className="sub">
                      {axisHint(filters.period)} · {metric === "intensity"
                        ? "carbon intensity (gCO₂ per tonne-km) against the EU 2025 heavy-duty target."
                        : "total emissions (tonnes) per period."}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className={metric === "intensity" ? "primary" : "ghost"} style={{ fontSize: 12, padding: "6px 12px", cursor: "pointer" }} onClick={() => setMetric("intensity")}>Intensity</button>
                    <button className={metric === "total" ? "primary" : "ghost"} style={{ fontSize: 12, padding: "6px 12px", cursor: "pointer" }} onClick={() => setMetric("total")}>Total</button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="var(--muted)" fontSize={11} />
                    <YAxis stroke="var(--muted)" fontSize={11} label={{ value: yUnit, angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11, offset: 16 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {metric === "intensity" && (
                      <ReferenceLine y={euTarget} stroke="var(--accent)" strokeDasharray="6 4"
                        label={{ value: `EU 2025 target ${euTarget} gCO₂/t·km`, fill: "var(--accent)", fontSize: 10, position: "insideTopRight" }} />
                    )}
                    <Line type="monotone" dataKey="Standard Routing" stroke="var(--red)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="AI-Optimized" stroke="var(--green)" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                {metric === "intensity" && (
                  <p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>
                    SidAI's AI-optimized routing keeps carbon intensity below the EU 2025 heavy-duty
                    vehicle target (Reg. 2019/1242), while standard routing exceeds it.
                  </p>
                )}
              </div>

              <div className="card">
                <h3>Vehicle CO₂ Emission Ranking</h3>
                <p className="sub">Highest emitters first — target these for route or fuel optimisation.</p>
                <table>
                  <thead>
                    <tr><th>#</th><th>Vehicle</th><th>Class</th><th>Fuel</th><th>CO₂ (t)</th><th>Saved (t)</th><th>Trips</th></tr>
                  </thead>
                  <tbody>
                    {(ranking?.ranking ?? []).slice(0, 10).map((r: any, i: number) => (
                      <tr key={r.lorry_id}>
                        <td>{i + 1}</td>
                        <td>{r.lorry_id}</td>
                        <td style={{ color: "var(--muted)" }}>{shortClass(r.class)}</td>
                        <td><FuelPill fuel={r.fuel} /></td>
                        <td>{r.co2_t}</td>
                        <td style={{ color: "var(--green)" }}>{r.co2_saved_t}</td>
                        <td>{r.trips}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3>Driver Eco-Scores</h3>
              <p className="sub">Ranked by fuel-efficient, low-idle driving. Gamifies greener behaviour.</p>
              <table>
                <thead>
                  <tr><th>Driver</th><th>Score</th><th>Grade</th><th>CO₂/km</th><th>Saved</th></tr>
                </thead>
                <tbody>
                  {(eco?.drivers ?? []).slice(0, 12).map((d: any) => (
                    <tr key={d.driver_id}>
                      <td>{d.driver_id}</td>
                      <td>{d.eco_score}</td>
                      <td><span className={`pill ${d.grade}`}>{d.grade}</span></td>
                      <td>{d.co2_per_km_g} g</td>
                      <td style={{ color: "var(--green)" }}>{d.co2_saved_kg} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function fmt(v: number | undefined, digits = 2): string {
  if (v == null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function axisHint(period?: string) {
  return {
    all: "X-axis: years", year: "X-axis: months (Jan–Dec)",
    month: "X-axis: days of month", day: "X-axis: 24 hours",
  }[period ?? "all"] ?? "";
}
function shortClass(c?: string) {
  return (c ?? "").replace(" (", "\n(").split("\n")[0];
}
function FuelPill({ fuel }: { fuel: string }) {
  const map: Record<string, string> = { electric: "A", "biodiesel-b20": "B", diesel: "neutral" };
  return <span className={`pill ${map[fuel] ?? "neutral"}`}>{fuel}</span>;
}
const tooltipStyle = {
  background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: 10, color: "var(--text)", fontSize: 12,
} as const;
