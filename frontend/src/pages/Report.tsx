import { useEffect, useRef, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { api, Filters } from "../api";
import FilterBar from "../components/FilterBar";

const FUEL_COLORS: Record<string, string> = {
  diesel: "#c0392b", "biodiesel-b20": "#c8901f", electric: "#0e9f6e", hybrid: "#3f6b8c",
};

interface ReportProps { vehicles?: string[]; years?: number[]; }

export default function Report({ vehicles = [], years = [2026] }: ReportProps) {
  const [filters, setFilters] = useState<Filters>({ period: "all", vehicle: "all" });
  const [kpis, setKpis] = useState<any>(null);            // KPI summary (filtered)
  const [series, setSeries] = useState<any>(null);        // emission trend
  const [ranking, setRanking] = useState<any[]>([]);      // per-vehicle CO2
  const [fuelMix, setFuelMix] = useState<any[]>([]);      // fuel type distribution
  const [recs, setRecs] = useState<any[]>([]);            // AI recommendations
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // chart card refs so we can snapshot them into the PDF
  const trendRef = useRef<HTMLDivElement>(null);
  const fuelRef = useRef<HTMLDivElement>(null);
  const rankRef = useRef<HTMLDivElement>(null);

  const vehicle = filters.vehicle ?? "all";

  // KPIs + emission trend follow the full filter (time range + vehicle),
  // identical to the Emission Tracker.
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([api.kpis(filters), api.emissionSeries(filters)]).then(([k, s]) => {
      if (!active) return;
      setKpis(k); setSeries(s); setLoading(false);
    });
    return () => { active = false; };
  }, [filters]);

  // ranking / fuel mix / recommendations follow the vehicle filter
  useEffect(() => {
    Promise.all([
      api.vehicleRanking({ period: "all", vehicle }),
      api.fleet(),
      api.recommendations(),
    ]).then(([r, f, rec]) => {
      setRanking((r.ranking ?? []).slice(0, 8));
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

  function periodLabel(): string {
    const p = filters.period ?? "all";
    if (p === "all") return "All time";
    if (p === "year") return `Year ${filters.year}`;
    if (p === "month") return `${MONTH_NAMES[(filters.month ?? 1) - 1]} ${filters.year}`;
    return `${filters.day}/${filters.month}/${filters.year}`;
  }
  function xAxisLabel(): string {
    return {
      all: "by year", year: "by month (Jan–Dec)",
      month: "by day of month", day: "by hour (24h)",
    }[filters.period ?? "all"] ?? "";
  }

  async function captureChart(el: HTMLElement | null) {
    if (!el) return null;
    const { default: html2canvas } = await import("html2canvas");
    // solid background so the chart isn't transparent on the white PDF page
    const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
    const canvas = await html2canvas(el, { backgroundColor: bg, scale: 2, logging: false });
    return canvas.toDataURL("image/png");
  }

  async function download() {
    if (!kpis?.available || exporting) return;
    setExporting(true);
    try {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"), import("jspdf-autotable"),
    ]);
    // snapshot the three chart cards before building the PDF
    const [trendImg, fuelImg, rankImg] = await Promise.all([
      captureChart(trendRef.current),
      captureChart(fuelRef.current),
      captureChart(rankRef.current),
    ]);
    const k = kpis;
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const contentW = pageW - margin * 2;

    // helper: add an image scaled to content width, paginating if needed
    const addImage = (img: string | null, title: string) => {
      if (!img) return;
      const props = doc.getImageProperties(img);
      const h = (props.height / props.width) * contentW;
      let y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : 68;
      if (y + h + 12 > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage(); y = margin + 6;
      }
      doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(40, 33, 25);
      doc.text(title, margin, y);
      doc.addImage(img, "PNG", margin, y + 3, contentW, h);
      (doc as any).lastAutoTable = { finalY: y + 3 + h }; // track vertical cursor
    };
    doc.setFillColor(217, 102, 43);
    doc.rect(0, 0, 210, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text("Lorriq", 14, 13);
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text("AI Fleet Emissions & Congestion Intelligence", 14, 20);
    doc.setTextColor(40, 33, 25); doc.setFontSize(15); doc.setFont("helvetica", "bold");
    doc.text("ESG Report", 14, 40);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(120, 110, 95);
    doc.text(`Reporting period: ${periodLabel()}`, 14, 47);
    doc.text(`Vehicle scope: ${vehicle === "all" ? "All vehicles (fleet-wide)" : vehicle}`, 14, 53);
    doc.text(`SDG 13 - Climate Action  |  Generated ${new Date().toLocaleString()}`, 14, 59);
    autoTable(doc, {
      startY: 68,
      head: [["ESG Metric", "Value"]],
      body: [
        ["Total trips", (k.total_trips ?? 0).toLocaleString()],
        ["Distance covered", `${(k.total_distance_km ?? 0).toLocaleString()} km`],
        ["Total CO2 (with AI)", `${(k.total_co2_tonnes ?? 0).toLocaleString()} t`],
        ["Total CO2 (without AI / BAU)", `${(k.total_co2_without_ai_tonnes ?? 0).toLocaleString()} t`],
        ["CO2 avoided", `${(k.co2_saved_tonnes ?? 0).toLocaleString()} t`],
        ["Emission reduction", `${k.co2_saved_pct ?? 0}%`],
        ["Total fuel", `${(k.total_fuel_litres ?? 0).toLocaleString()} L`],
        ["Trees equivalent (annual absorption)", `${(k.trees_equivalent ?? 0).toLocaleString()} trees`],
      ],
      headStyles: { fillColor: [217, 102, 43] },
      alternateRowStyles: { fillColor: [246, 241, 234] },
      styles: { fontSize: 10, cellPadding: 3 },
    });

    // Chart images captured from the dashboard
    addImage(trendImg, `Carbon Emissions Trend (${xAxisLabel()})`);
    addImage(fuelImg, "Fleet Fuel Type Distribution");
    addImage(rankImg, "Vehicle CO2 Ranking");

    // Per-vehicle CO2 ranking table (reflects the vehicle filter)
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

    // AI-powered recommendations
    if (recs.length) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [["Priority", "Location", "AI Recommendation"]],
        body: recs.slice(0, 8).map((r) => [
          (r.priority ?? "").toUpperCase(),
          r.segment_id?.split("::")[1]?.trim() ?? "Congestion hotspot",
          r.message ?? "",
        ]),
        headStyles: { fillColor: [217, 102, 43] },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 40 } },
        styles: { fontSize: 9, cellPadding: 2.5, overflow: "linebreak" },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 0) {
            const v = String(data.cell.raw).toLowerCase();
            if (v === "high") data.cell.styles.textColor = [192, 57, 43];
            else if (v === "medium") data.cell.styles.textColor = [217, 138, 31];
          }
        },
      });
    }

    const vtag = vehicle === "all" ? "fleet" : vehicle;
    const ptag = (filters.period ?? "all");
    doc.save(`Lorriq_${ptag}_${vtag}_ESG_report.pdf`);
    } finally {
      setExporting(false);
    }
  }

  const k = kpis;

  // build the trend rows (with-AI vs standard) from the emission series
  const trendRows = (series?.points ?? []).map((p: any) => ({
    label: p.label,
    "With AI": p.with_ai_t,
    "Without AI": p.without_ai_t,
  }));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <FilterBar filters={filters} onChange={setFilters} vehicles={vehicles} years={years} showTime />
        <button className="primary" style={{ cursor: "pointer" }}
                onClick={download} disabled={!k?.available || exporting}>
          {exporting ? "Generating PDF…" : "⬇ Download PDF"}
        </button>
      </div>

      {/* KPI target cards */}
      {loading ? <div className="loading">Compiling analytics…</div> : !k?.available ? (
        <div className="card"><p className="sub">No data available for this period.</p></div>
      ) : (
        <>
          <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
            <TargetCard label="CO₂ Avoided" value={`${(k.co2_saved_tonnes ?? 0).toLocaleString()} t`}
                        pct={Math.min(100, (k.co2_saved_pct ?? 0) * 2)} target={`${k.co2_saved_pct ?? 0}% reduction`} tone="green" />
            <TargetCard label="Emission Reduction" value={`${k.co2_saved_pct ?? 0}%`}
                        pct={Math.min(100, (k.co2_saved_pct ?? 0) * 2.5)} target="Target: 15% (EU 2025)" tone="green" />
            <TargetCard label="Trees Equivalent" value={(k.trees_equivalent ?? 0).toLocaleString()}
                        pct={70} target="mature trees / year" tone="gold" />
            <TargetCard label="Distance" value={`${(k.total_distance_km ?? 0).toLocaleString()} km`}
                        pct={80} target={`${(k.total_trips ?? 0).toLocaleString()} trips`} tone="blue" />
          </div>

          {/* Charts row */}
          <div className="grid" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 16 }}>
            <div className="card" ref={trendRef}>
              <h3>Carbon Emissions Trend</h3>
              <p className="sub">CO₂ (tonnes): AI-optimised vs standard routing · {xAxisLabel()}.</p>
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

            <div className="card" ref={fuelRef}>
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
          <div className="card" ref={rankRef} style={{ marginBottom: 16 }}>
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
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
