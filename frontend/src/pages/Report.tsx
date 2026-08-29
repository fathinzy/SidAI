import { useEffect, useState } from "react";
import { api } from "../api";

type Scope = "daily" | "weekly" | "monthly";

export default function Report() {
  const [scope, setScope] = useState<Scope>("weekly");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.report(scope).then((d) => { if (active) { setData(d); setLoading(false); } });
    return () => { active = false; };
  }, [scope]);

  async function download() {
    if (!data?.available) return;
    // Lazy-load the PDF libraries only when the user actually exports,
    // keeping the initial app bundle small.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const s = data.summary;
    const doc = new jsPDF();

    // header band
    doc.setFillColor(217, 102, 43);
    doc.rect(0, 0, 210, 26, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Lorriq", 14, 13);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("AI Fleet Emissions & Congestion Intelligence", 14, 20);

    doc.setTextColor(40, 33, 25);
    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.text(`${cap(scope)} ESG Report`, 14, 40);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 110, 95);
    doc.text(`Reporting period: ${data.period.from} - ${data.period.to}`, 14, 47);
    doc.text(`SDG 13 - Climate Action  |  Generated ${new Date().toLocaleString()}`, 14, 53);

    autoTable(doc, {
      startY: 62,
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

    const y = (doc as any).lastAutoTable.finalY + 12;
    doc.setFontSize(9);
    doc.setTextColor(120, 110, 95);
    doc.text(
      "This report quantifies the climate impact of AI-optimised routing versus business-as-usual\n" +
      "operations. CO2 avoided is the difference between predicted BAU emissions and actual\n" +
      "AI-optimised emissions across the reporting period.",
      14, y
    );

    doc.save(`Lorriq_${scope}_ESG_report_${data.period.to.replace(/\//g, "-")}.pdf`);
  }

  const s = data?.summary;

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
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="primary" onClick={download} disabled={!data?.available}>
            ⬇ Download PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Compiling report…</div>
      ) : !data?.available ? (
        <div className="card"><p className="sub">No data available for this period.</p></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>{cap(scope)} ESG Summary</h3>
            <p className="sub">Reporting period: {data.period.from} – {data.period.to} · SDG 13 Climate Action</p>
            <div className="grid kpi-grid">
              <Box label="CO₂ Avoided" value={`${s.co2_saved_kg.toLocaleString()} kg`} tone="green" />
              <Box label="Reduction" value={`${s.co2_saved_pct}%`} tone="green" />
              <Box label="Fuel Saved" value={`${s.fuel_saved_litres.toLocaleString()} L`} tone="gold" />
              <Box label="Trees Equivalent" value={s.trees_equivalent.toLocaleString()} tone="green" />
              <Box label="Trips" value={s.trips.toLocaleString()} />
              <Box label="Distance" value={`${s.distance_km.toLocaleString()} km`} tone="blue" />
              <Box label="CO₂ with AI" value={`${s.total_co2_kg.toLocaleString()} kg`} />
              <Box label="CO₂ without AI" value={`${s.total_co2_without_ai_kg.toLocaleString()} kg`} tone="red" />
            </div>
          </div>
          <div className="card">
            <h3>Report Preview</h3>
            <p className="sub">This is exactly what the exported PDF contains. Click Download PDF above to save it.</p>
            <table>
              <tbody>
                <Row k="Total trips" v={s.trips.toLocaleString()} />
                <Row k="Distance covered" v={`${s.distance_km.toLocaleString()} km`} />
                <Row k="Total CO₂ (with AI)" v={`${s.total_co2_kg.toLocaleString()} kg`} />
                <Row k="Total CO₂ (without AI)" v={`${s.total_co2_without_ai_kg.toLocaleString()} kg`} />
                <Row k="CO₂ avoided" v={`${s.co2_saved_kg.toLocaleString()} kg`} />
                <Row k="Emission reduction" v={`${s.co2_saved_pct}%`} />
                <Row k="Fuel saved" v={`${s.fuel_saved_litres.toLocaleString()} L`} />
                <Row k="Trees equivalent" v={`${s.trees_equivalent.toLocaleString()} trees`} />
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <tr><td style={{ color: "var(--muted)" }}>{k}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{v}</td></tr>;
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
