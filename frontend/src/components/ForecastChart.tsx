import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Props { forecast: any; }

const COLORS = ["#d9662b", "#3f6b8c", "#c8901f", "#c0392b", "#4a7c3f", "#b8481e", "#d98a1f", "#6fa0c4", "#7bb069"];

export default function ForecastChart({ forecast }: Props) {
  const segments = forecast?.segments ?? [];
  if (!segments.length) return <div className="loading">No forecast data.</div>;

  // Pivot into rows keyed by hour index for recharts
  const horizon = segments[0].points.length;
  const rows = Array.from({ length: horizon }, (_, i) => {
    const row: any = { t: `+${i}h` };
    segments.forEach((s: any) => {
      const short = s.segment_id.split("::")[1]?.trim() ?? s.segment_id;
      row[short] = Math.round(s.points[i].congestion_index * 100);
    });
    return row;
  });

  const keys = segments.map((s: any) => s.segment_id.split("::")[1]?.trim() ?? s.segment_id);

  return (
    <div>
      <div className="sub">Predicted congestion (%) over the next {horizon} hours. Segments above 60% are flagged for re-routing.</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="t" stroke="var(--muted)" fontSize={11} />
          <YAxis stroke="var(--muted)" fontSize={11} domain={[0, 100]} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {keys.slice(0, 5).map((k: string, i: number) => (
            <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
