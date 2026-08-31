import { useEffect, useState } from "react";
import { api } from "./api";
import { useTheme } from "./theme";
import Sidebar, { Tab, SubTab } from "./components/Sidebar";
import DynamicIsland from "./components/DynamicIsland";
import EmissionTracker from "./pages/EmissionTracker";
import LiveTracking from "./pages/LiveTracking";
import TripOrder from "./pages/TripOrder";
import Report from "./pages/Report";
import Registry from "./pages/Registry";
import VehicleProfile from "./pages/VehicleProfile";
import DriverProfile from "./pages/DriverProfile";
import TripList from "./pages/TripList";

export default function App() {
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [subTab, setSubTab] = useState<SubTab>("emissions");
  const [collapsed, setCollapsed] = useState(false);

  // top-line stats for the dynamic island
  const [islandData, setIslandData] = useState({ fleet: 0, active: 0, saved: 0, alert: "" });
  // shared lists for filters across pages
  const [vehicles, setVehicles] = useState<string[]>([]);
  const [years, setYears] = useState<number[]>([2026]);

  useEffect(() => {
    (async () => {
      try {
        const [fleet, kpis, incidents, series] = await Promise.all([
          api.fleet(), api.kpis(), api.incidents(), api.emissionSeries({ period: "all" }),
        ]);
        const active = (fleet.lorries ?? []).filter((l: any) => l.vehicle_status === "Moving").length;
        const topAlert = incidents.incidents?.[0]
          ? `${incidents.incidents[0].lorry_id} congestion`
          : "";
        setIslandData({
          fleet: fleet.count ?? 0,
          active,
          saved: kpis.co2_saved_tonnes ?? 0,
          alert: topAlert,
        });
        setVehicles((fleet.lorries ?? []).map((l: any) => l.lorry_id).sort());
        const ys = (series.points ?? []).map((p: any) => +p.label).filter((n: number) => !isNaN(n));
        if (ys.length) setYears(ys);
      } catch { /* island is best-effort */ }
    })();
  }, []);

  const headings: Record<string, { title: string; sub: string }> = {
    "dashboard-emissions": { title: "Emission Tracker", sub: "CO₂ intelligence: AI-Optimized vs Standard Routing, filtered by time and vehicle." },
    "dashboard-tracking": { title: "Live Tracking", sub: "Real-time fleet positions, congestion forecasts and automated incident response." },
    "trip-neworder": { title: "New Order", sub: "Plan a shipment and let SidAI AI recommend the greenest capable vehicle." },
    "trip-triplist": { title: "List of Trip", sub: "All scheduled, booked and completed trips across the fleet." },
    "profile-vehicle": { title: "Vehicle Profile", sub: "Full vehicle profile with specifications, compliance and operating history." },
    "profile-driver": { title: "Driver Profile", sub: "AI-powered driver safety and performance tracking. Click a driver for their full profile." },
    "report": { title: "Reports", sub: "Generate ESG reports for daily, weekly and monthly operations." },
    "registry-vehicle": { title: "Register Vehicle", sub: "Add a new vehicle to the fleet with full details and a photo." },
    "registry-driver": { title: "Register Driver", sub: "Add a new driver to the registry with license details and a photo." },
  };
  const hasSubs = tab === "dashboard" || tab === "trip" || tab === "profile" || tab === "registry";
  const key = hasSubs ? `${tab}-${subTab}` : tab;
  const head = headings[key] ?? headings[tab];

  return (
    <div className="shell">
      <Sidebar
        tab={tab} subTab={subTab}
        onTab={setTab} onSubTab={setSubTab}
        collapsed={collapsed} onCollapse={() => setCollapsed((c) => !c)}
        theme={theme} onTheme={toggle}
      />
      <div className="main">
        <DynamicIsland
          fleetCount={islandData.fleet}
          activeCount={islandData.active}
          co2SavedT={islandData.saved}
          topAlert={islandData.alert}
        />
        <div className="content">
          <div className="page-head">
            <h1>{head.title}</h1>
            <p>{head.sub}</p>
          </div>

          {tab === "dashboard" && subTab === "emissions" && <EmissionTracker vehicles={vehicles} years={years} />}
          {tab === "dashboard" && subTab === "tracking" && <LiveTracking vehicles={vehicles} theme={theme} />}
          {tab === "trip" && subTab === "triplist" && <TripList vehicles={vehicles} />}
          {tab === "trip" && subTab !== "triplist" && <TripOrder />}
          {tab === "profile" && subTab === "driver" && <DriverProfile />}
          {tab === "profile" && subTab !== "driver" && <VehicleProfile vehicles={vehicles} />}
          {tab === "report" && <Report vehicles={vehicles} years={years} />}
          {tab === "registry" && <Registry sub={subTab === "driver" ? "driver" : "vehicle"} />}
        </div>
      </div>
    </div>
  );
}
