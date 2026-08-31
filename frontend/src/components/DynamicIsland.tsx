import { useState } from "react";

interface Props {
  fleetCount: number;
  activeCount: number;
  co2SavedT: number;
  topAlert?: string;
}

// iPhone-style dynamic island: a floating status pill that expands on click.
export default function DynamicIsland({ fleetCount, activeCount, co2SavedT, topAlert }: Props) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="island-wrap">
      <div className={`island ${expanded ? "expanded" : ""}`} onClick={() => setExpanded((e) => !e)}>
        <div className="island-row">
          <span className="live-dot" />
          <strong>SidAI Live</strong>
          <span className="sep">|</span>
          <span>{activeCount}/{fleetCount} active</span>
          <span className="sep">|</span>
          <span>{co2SavedT.toLocaleString()} t CO₂ saved</span>
        </div>
        {expanded && (
          <div className="island-detail">
            <span>Fleet: {fleetCount} lorries</span>
            <span>{topAlert ? `⚠ ${topAlert}` : "No active incidents"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
