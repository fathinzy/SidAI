import { Filters } from "../api";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  vehicles: string[];       // list of lorry ids
  years: number[];
  showTime?: boolean;       // Emission Tracker shows time filter; Live Tracking hides it
}

const MONTHS = [
  [1, "January"], [2, "February"], [3, "March"], [4, "April"], [5, "May"], [6, "June"],
  [7, "July"], [8, "August"], [9, "September"], [10, "October"], [11, "November"], [12, "December"],
] as const;

export default function FilterBar({ filters, onChange, vehicles, years, showTime = true }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div className="filters">
      {showTime && (
        <>
          <div className="field">
            <label>Time range</label>
            <select
              value={filters.period ?? "all"}
              onChange={(e) => {
                const period = e.target.value;
                // reset finer-grained pins when the granularity changes
                set({
                  period,
                  year: period === "all" ? null : (filters.year ?? years[years.length - 1] ?? null),
                  month: period === "month" || period === "day" ? (filters.month ?? 8) : null,
                  day: period === "day" ? (filters.day ?? 1) : null,
                });
              }}
            >
              <option value="all">All time</option>
              <option value="year">By year</option>
              <option value="month">By month</option>
              <option value="day">By day</option>
            </select>
          </div>

          {filters.period && filters.period !== "all" && (
            <div className="field">
              <label>Year</label>
              <select value={filters.year ?? ""} onChange={(e) => set({ year: +e.target.value })}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {(filters.period === "month" || filters.period === "day") && (
            <div className="field">
              <label>Month</label>
              <select value={filters.month ?? ""} onChange={(e) => set({ month: +e.target.value })}>
                {MONTHS.map(([n, name]) => <option key={n} value={n}>{name}</option>)}
              </select>
            </div>
          )}

          {filters.period === "day" && (
            <div className="field">
              <label>Day</label>
              <select value={filters.day ?? ""} onChange={(e) => set({ day: +e.target.value })}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      <div className="field">
        <label>Vehicle</label>
        <select value={filters.vehicle ?? "all"} onChange={(e) => set({ vehicle: e.target.value })}>
          <option value="all">All vehicles</option>
          {vehicles.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </div>
  );
}
