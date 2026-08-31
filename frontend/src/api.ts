// API client for the Lorriq backend.
// In dev, Vite proxies /api -> http://localhost:8000.
// In production, set VITE_API_BASE to your API Gateway URL at build time.

const BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
  return res.json();
}

// Build a query string from the emission-tracker filter object.
export interface Filters {
  period?: string;   // all | year | month | day
  year?: number | null;
  month?: number | null;
  day?: number | null;
  vehicle?: string;  // 'all' or lorry_id
}

function qs(f: Filters = {}): string {
  const p = new URLSearchParams();
  if (f.period) p.set("period", f.period);
  if (f.year != null) p.set("year", String(f.year));
  if (f.month != null) p.set("month", String(f.month));
  if (f.day != null) p.set("day", String(f.day));
  if (f.vehicle) p.set("vehicle", f.vehicle);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => get<any>("/api/health"),
  // filtered
  kpis: (f?: Filters) => get<any>(`/api/kpis${qs(f)}`),
  emissionSeries: (f?: Filters) => get<any>(`/api/emission-series${qs(f)}`),
  vehicleRanking: (f?: Filters) => get<any>(`/api/vehicle-ranking${qs(f)}`),
  ecoScores: (f?: Filters) => get<any>(`/api/eco-scores${qs(f)}`),
  scenarioCompare: (f?: Filters) => get<any>(`/api/scenario-compare${qs(f)}`),
  // live tracking
  fleet: () => get<any>("/api/fleet"),
  forecast: (hours = 12) => get<any>(`/api/forecast/congestion?hours=${hours}`),
  hotspots: () => get<any>("/api/hotspots"),
  incidents: () => get<any>("/api/incidents"),
  vehicleUpdates: () => get<any>("/api/vehicle-updates"),
  recommendations: () => get<any>("/api/recommendations"),
  vehicleDetail: (vehicle: string) => get<any>(`/api/vehicle-detail?vehicle=${encodeURIComponent(vehicle)}`),
  livePositions: () => get<any>("/api/live-positions"),
  liveFeed: (vehicle = "all", n = 6) => get<any>(`/api/live-feed?vehicle=${encodeURIComponent(vehicle)}&n=${n}`),
  bookTrip: (body: unknown) => post<any>("/api/book-trip", body),
  trips: (vehicle = "all", status = "all") => get<any>(`/api/trips?vehicle=${encodeURIComponent(vehicle)}&status=${encodeURIComponent(status)}`),
  // registry
  registry: (vehicle?: string) => get<any>(`/api/registry${vehicle ? `?vehicle=${encodeURIComponent(vehicle)}` : ""}`),
  registerVehicle: (body: unknown) => post<any>("/api/registry", body),
  vehicleHistory: (vehicle: string) => get<any>(`/api/vehicle-history?vehicle=${encodeURIComponent(vehicle)}`),
  vehicleMaintenance: (vehicle: string) => get<any>(`/api/vehicle-maintenance?vehicle=${encodeURIComponent(vehicle)}`),
  maintenanceDone: (body: unknown) => post<any>("/api/maintenance-done", body),
  // drivers
  drivers: () => get<any>("/api/drivers"),
  registerDriver: (body: unknown) => post<any>("/api/drivers", body),
  driverDetail: (driver: string) => get<any>(`/api/driver-detail?driver=${encodeURIComponent(driver)}`),
  suggestDriver: (body: unknown) => post<any>("/api/suggest-driver", body),
  // trip/order
  suggestVehicle: (body: unknown) => post<any>("/api/suggest-vehicle", body),
  // report
  report: (scope: string) => get<any>(`/api/report?scope=${scope}`),
  // planning extras
  explain: () => get<any>("/api/explain"),
  simulate: (body: unknown) => post<any>("/api/simulate", body),
};
