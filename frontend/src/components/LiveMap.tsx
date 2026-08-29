import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Theme } from "../theme";

interface Props {
  positions: any;           // { vehicles:[...], corridors:[...] }
  filterVehicle?: string;   // 'all' or lorry_id
  theme: Theme;
}

// Free, no-API-key raster style using OpenStreetMap tiles (Carto basemaps).
function styleFor(theme: Theme): maplibregl.StyleSpecification {
  const tiles = theme === "dark"
    ? ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"]
    : ["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"];
  return {
    version: 8,
    sources: {
      osm: { type: "raster", tiles, tileSize: 256, attribution: "© OpenStreetMap © CARTO" },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

export default function LiveMap({ positions, filterVehicle = "all", theme }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<Record<string, maplibregl.Marker>>({});
  const styleReady = useRef(false);

  // init map once
  useEffect(() => {
    if (!ref.current || map.current) return;
    map.current = new maplibregl.Map({
      container: ref.current,
      style: styleFor(theme),
      center: [101.9, 3.6],
      zoom: 6.4,
      attributionControl: false,
    });
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.current.on("load", () => {
      styleReady.current = true;
      drawCorridors();
    });
    return () => { map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // react to theme change: swap basemap style, then redraw
  useEffect(() => {
    if (!map.current) return;
    styleReady.current = false;
    map.current.setStyle(styleFor(theme));
    map.current.once("styledata", () => {
      styleReady.current = true;
      drawCorridors();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  function drawCorridors() {
    const m = map.current;
    if (!m || !positions?.corridors) return;
    const fc = {
      type: "FeatureCollection",
      features: positions.corridors.map((c: any) => ({
        type: "Feature",
        properties: { name: c.name },
        geometry: { type: "LineString", coordinates: c.points.map((p: number[]) => [p[1], p[0]]) },
      })),
    };
    if (m.getSource("corridors")) {
      (m.getSource("corridors") as maplibregl.GeoJSONSource).setData(fc as any);
    } else {
      m.addSource("corridors", { type: "geojson", data: fc as any });
      m.addLayer({
        id: "corridors-line", type: "line", source: "corridors",
        paint: { "line-color": "#1f6feb", "line-width": 3, "line-opacity": 0.5 },
      });
    }
  }

  // update vehicle markers whenever positions change (creates the animation)
  useEffect(() => {
    const m = map.current;
    if (!m || !styleReady.current || !positions?.vehicles) return;
    drawCorridors();

    let list = positions.vehicles;
    if (filterVehicle && filterVehicle !== "all") {
      list = list.filter((v: any) => v.lorry_id === filterVehicle);
    }
    const seen = new Set<string>();

    for (const v of list) {
      seen.add(v.lorry_id);
      const color = v.fuel === "electric" ? "#0e9f6e" : "#1f6feb";
      let mk = markers.current[v.lorry_id];
      if (!mk) {
        const el = document.createElement("div");
        el.style.cssText =
          `width:14px;height:14px;border-radius:50%;background:${color};` +
          `border:2px solid #fff;box-shadow:0 0 0 2px ${color}55;cursor:pointer;transition:transform .2s;`;
        el.title = `${v.lorry_id} (${v.registration_no})`;
        mk = new maplibregl.Marker({ element: el })
          .setLngLat([v.lng, v.lat])
          .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(
            `<b>${v.lorry_id}</b><br/>${v.registration_no}<br/>Fuel: ${v.fuel}<br/>Status: ${v.vehicle_status}`
          ))
          .addTo(m);
        markers.current[v.lorry_id] = mk;
      } else {
        // smooth-ish move to new position (CSS transition handles the tween)
        mk.setLngLat([v.lng, v.lat]);
      }
    }
    // remove markers no longer in the filtered list
    for (const id of Object.keys(markers.current)) {
      if (!seen.has(id)) { markers.current[id].remove(); delete markers.current[id]; }
    }

    // when filtered to one vehicle, keep it centered
    if (filterVehicle && filterVehicle !== "all" && list[0]) {
      m.easeTo({ center: [list[0].lng, list[0].lat], zoom: 9, duration: 800 });
    }
  }, [positions, filterVehicle]);

  return <div ref={ref} className="map-wrap" style={{ height: 440 }} />;
}
