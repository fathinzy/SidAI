import { Theme } from "../theme";

export type Tab = "dashboard" | "trip" | "profile" | "report" | "registry";
export type SubTab = string;

interface Props {
  tab: Tab;
  subTab: SubTab;
  onTab: (t: Tab) => void;
  onSubTab: (s: SubTab) => void;
  collapsed: boolean;
  onCollapse: () => void;
  theme: Theme;
  onTheme: () => void;
}

interface NavDef {
  id: Tab;
  label: string;
  ico: string;
  subs?: { id: string; label: string }[];
}

const NAV: NavDef[] = [
  {
    id: "dashboard", label: "Dashboard", ico: "◧",
    subs: [
      { id: "emissions", label: "Emission Tracker" },
      { id: "tracking", label: "Live Tracking" },
    ],
  },
  {
    id: "trip", label: "Trip / Order", ico: "⇄",
    subs: [
      { id: "neworder", label: "New Order" },
      { id: "triplist", label: "List of Trip" },
    ],
  },
  {
    id: "profile", label: "Profile", ico: "☰",
    subs: [
      { id: "vehicle", label: "Vehicle Profile" },
      { id: "driver", label: "Driver Profile" },
    ],
  },
  { id: "report", label: "Report", ico: "▤" },
  {
    id: "registry", label: "Registry", ico: "＋",
    subs: [
      { id: "vehicle", label: "Vehicle Registry" },
      { id: "driver", label: "Driver Registry" },
    ],
  },
];

export default function Sidebar({
  tab, subTab, onTab, onSubTab, collapsed, onCollapse, theme, onTheme,
}: Props) {
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="side-brand">
        <div className="side-logo">🚚</div>
        <span className="name">Lorriq</span>
      </div>

      <nav className="nav-group">
        {NAV.map((n) => (
          <div key={n.id}>
            <div
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => {
                onTab(n.id);
                if (n.subs && n.subs.length) onSubTab(n.subs[0].id);
              }}
              title={n.label}
            >
              <span className="ico">{n.ico}</span>
              <span className="nav-label">{n.label}</span>
            </div>
            {n.subs && tab === n.id && !collapsed && (
              <div className="nav-sub">
                {n.subs.map((s) => (
                  <div
                    key={s.id}
                    className={`nav-subitem ${subTab === s.id ? "active" : ""}`}
                    onClick={() => onSubTab(s.id)}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <button className="theme-btn" onClick={onTheme}>
          <span className="ico">{theme === "dark" ? "☀" : "☾"}</span>
          <span className="nav-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
        <button className="collapse-btn" onClick={onCollapse}>
          <span className="ico">{collapsed ? "»" : "«"}</span>
          <span className="nav-label">Collapse</span>
        </button>
      </div>
    </aside>
  );
}
