import { useState, useEffect } from "react";
import { haversineKm } from "../utils/hydrology";

interface SiteReportProps {
  lat: number;
  lng: number;
  neighbourhood: string;
  address: string;
}

interface FloodStatus {
  inFloodway: boolean | null;
  in100yr: boolean | null;
  in200yr: boolean | null;
  in500yr: boolean | null;
  loading: boolean;
}

interface NearbyPipe {
  type: string;
  yearConst: number | null;
  roadName: string;
  distM: number;
}

interface ClimateStation {
  name: string;
  id: string;
  elevation: number;
  distKm: number;
}

interface HydroStation {
  name: string;
  id: string;
  distKm: number;
  drainage_area?: number;
}

interface PrecipNormal {
  stationName: string;
  annualPrecipMm: number | null;
  annualSnowCm: number | null;
}

const FLOOD_BASE = "https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/AlbertaFloodMapping_gdb/FeatureServer";
const EDMONTON_API = "https://data.edmonton.ca/resource";
const ECCC_API = "https://api.weather.gc.ca";

async function queryFloodLayer(layerId: number, lat: number, lng: number, signal: AbortSignal): Promise<boolean> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    returnCountOnly: "true",
    f: "json",
  });
  const res = await fetch(`${FLOOD_BASE}/${layerId}/query?${params}`, { signal });
  const data = await res.json();
  return (data.count ?? 0) > 0;
}

export default function SiteReport({ lat, lng, neighbourhood, address }: SiteReportProps) {
  const [flood, setFlood] = useState<FloodStatus>({ inFloodway: null, in100yr: null, in200yr: null, in500yr: null, loading: true });
  const [nearbyPipes, setNearbyPipes] = useState<NearbyPipe[]>([]);
  const [pipesLoading, setPipesLoading] = useState(true);
  const [permitCount, setPermitCount] = useState<number | null>(null);
  const [permitsLoading, setPermitsLoading] = useState(true);
  const [climateStation, setClimateStation] = useState<ClimateStation | null>(null);
  const [climateLoading, setClimateLoading] = useState(true);
  const [hydroStation, setHydroStation] = useState<HydroStation | null>(null);
  const [hydroLoading, setHydroLoading] = useState(true);
  const [precipNormal, setPrecipNormal] = useState<PrecipNormal | null>(null);
  const [precipLoading, setPrecipLoading] = useState(true);

  useEffect(() => {
    if (!lat || !lng) return;
    const controller = new AbortController();
    const { signal } = controller;

    // 1. Flood zone checks (4 layers in parallel)
    (async () => {
      setFlood(f => ({ ...f, loading: true }));
      try {
        const [floodway, yr100, yr200, yr500] = await Promise.all([
          queryFloodLayer(0, lat, lng, signal),
          queryFloodLayer(11, lat, lng, signal),
          queryFloodLayer(12, lat, lng, signal),
          queryFloodLayer(14, lat, lng, signal),
        ]);
        if (!signal.aborted) setFlood({ inFloodway: floodway, in100yr: yr100, in200yr: yr200, in500yr: yr500, loading: false });
      } catch {
        if (!signal.aborted) setFlood({ inFloodway: null, in100yr: null, in200yr: null, in500yr: null, loading: false });
      }
    })();

    // 2. Nearest storm pipes (~500m radius)
    (async () => {
      setPipesLoading(true);
      try {
        const delta = 0.005;
        const url = `${EDMONTON_API}/bh8y-pn5j.json?$where=type='STORM' AND latitude>${lat - delta} AND latitude<${lat + delta} AND longitude>${lng - delta} AND longitude<${lng + delta}&$select=type,year_const,road_name,latitude,longitude&$limit=20&$order=:id`;
        const res = await fetch(url, { signal });
        const data: { type: string; year_const?: string; road_name?: string; latitude: string; longitude: string }[] = await res.json();
        const pipes: NearbyPipe[] = data.map(p => ({
          type: p.type,
          yearConst: p.year_const ? parseInt(p.year_const) : null,
          roadName: p.road_name || "Unknown",
          distM: haversineKm(lat, lng, parseFloat(p.latitude), parseFloat(p.longitude)) * 1000,
        })).sort((a, b) => a.distM - b.distM).slice(0, 5);
        if (!signal.aborted) setNearbyPipes(pipes);
      } catch {
        if (!signal.aborted) setNearbyPipes([]);
      }
      if (!signal.aborted) setPipesLoading(false);
    })();

    // 3. Building permits count (~1km radius)
    (async () => {
      setPermitsLoading(true);
      try {
        const delta = 0.01;
        const url = `${EDMONTON_API}/24uj-dj8v.json?$select=count(*) as cnt&$where=latitude>${lat - delta} AND latitude<${lat + delta} AND longitude>${lng - delta} AND longitude<${lng + delta}`;
        const res = await fetch(url, { signal });
        const data = await res.json();
        if (!signal.aborted) setPermitCount(parseInt(data[0]?.cnt) || 0);
      } catch {
        if (!signal.aborted) setPermitCount(null);
      }
      if (!signal.aborted) setPermitsLoading(false);
    })();

    // 4. Nearest climate station
    (async () => {
      setClimateLoading(true);
      try {
        const bbox = `${lng - 0.15},${lat - 0.15},${lng + 0.15},${lat + 0.15}`;
        const url = `${ECCC_API}/collections/climate-stations/items?f=json&limit=10&bbox=${bbox}`;
        const res = await fetch(url, { signal });
        const data = await res.json();
        const features = data.features || [];
        if (features.length > 0) {
          const sorted = features.map((f: { properties: Record<string, unknown>; geometry: { coordinates: number[] } }) => {
            const coords = f.geometry.coordinates;
            return {
              name: (f.properties.STATION_NAME as string) || "Unknown",
              id: (f.properties.CLIMATE_IDENTIFIER as string) || "",
              elevation: (f.properties.ELEVATION as number) || 0,
              distKm: haversineKm(lat, lng, coords[1], coords[0]),
            };
          }).sort((a: ClimateStation, b: ClimateStation) => a.distKm - b.distKm);
          if (!signal.aborted) setClimateStation(sorted[0]);
        }
      } catch { /* ignore */ }
      if (!signal.aborted) setClimateLoading(false);
    })();

    // 5. Nearest hydrometric station
    (async () => {
      setHydroLoading(true);
      try {
        const bbox = `${lng - 0.5},${lat - 0.5},${lng + 0.5},${lat + 0.5}`;
        const url = `${ECCC_API}/collections/hydrometric-stations/items?f=json&limit=5&bbox=${bbox}`;
        const res = await fetch(url, { signal });
        const data = await res.json();
        const features = data.features || [];
        if (features.length > 0) {
          const sorted = features.map((f: { properties: Record<string, unknown>; geometry: { coordinates: number[] } }) => {
            const coords = f.geometry.coordinates;
            return {
              name: (f.properties.STATION_NAME as string) || "Unknown",
              id: (f.properties.STATION_NUMBER as string) || "",
              distKm: haversineKm(lat, lng, coords[1], coords[0]),
              drainage_area: (f.properties.DRAINAGE_AREA_GROSS as number) || undefined,
            };
          }).sort((a: HydroStation, b: HydroStation) => a.distKm - b.distKm);
          if (!signal.aborted) setHydroStation(sorted[0]);
        }
      } catch { /* ignore */ }
      if (!signal.aborted) setHydroLoading(false);
    })();

    // 6. Precipitation normals for nearest station
    (async () => {
      setPrecipLoading(true);
      try {
        const bbox = `${lng - 0.3},${lat - 0.3},${lng + 0.3},${lat + 0.3}`;
        const precipUrl = `${ECCC_API}/collections/climate-normals/items?f=json&NORMAL_ID=56&limit=5&bbox=${bbox}`;
        const snowUrl = `${ECCC_API}/collections/climate-normals/items?f=json&NORMAL_ID=54&limit=5&bbox=${bbox}`;
        const [precipRes, snowRes] = await Promise.all([
          fetch(precipUrl, { signal }),
          fetch(snowUrl, { signal }),
        ]);
        const precipData = await precipRes.json();
        const snowData = await snowRes.json();
        const pFeature = precipData.features?.[0];
        const sFeature = snowData.features?.[0];
        if (pFeature || sFeature) {
          if (!signal.aborted) setPrecipNormal({
            stationName: pFeature?.properties?.STATION_NAME || sFeature?.properties?.STATION_NAME || "Unknown",
            annualPrecipMm: pFeature?.properties?.TOTAL_PRECIPITATION ?? null,
            annualSnowCm: sFeature?.properties?.TOTAL_SNOWFALL ?? null,
          });
        }
      } catch { /* ignore */ }
      if (!signal.aborted) setPrecipLoading(false);
    })();

    return () => controller.abort();
  }, [lat, lng]);

  const currentYear = new Date().getFullYear();
  const anyFloodRisk = flood.inFloodway || flood.in100yr || flood.in200yr || flood.in500yr;
  const avgPipeAge = nearbyPipes.length > 0
    ? Math.round(nearbyPipes.filter(p => p.yearConst).reduce((sum, p) => sum + (currentYear - p.yearConst!), 0) / nearbyPipes.filter(p => p.yearConst).length)
    : null;

  return (
    <div className="dc">
      <div className="dc-header">
        <h3 className="dc-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: -2 }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Site Intelligence
        </h3>
        <span className="dc-subtitle">Hydrology facts for {address} — sourced from 6 public APIs</span>
      </div>

      {/* Flood Zone Status */}
      <div className="dc-section">
        <h4 className="dc-section-label">Flood Zone Status (Alberta Environment)</h4>
        {flood.loading ? (
          <p className="dc-note">Querying Alberta flood mapping layers...</p>
        ) : (
          <>
            <div className="dc-stat-grid">
              <div className={`dc-stat ${flood.inFloodway ? "dc-stat-danger" : "dc-stat-safe"}`}>
                <span className="dc-stat-value">{flood.inFloodway === null ? "—" : flood.inFloodway ? "YES" : "NO"}</span>
                <span className="dc-stat-label">Flood Hazard Area</span>
              </div>
              <div className={`dc-stat ${flood.in100yr ? "dc-stat-danger" : "dc-stat-safe"}`}>
                <span className="dc-stat-value">{flood.in100yr === null ? "—" : flood.in100yr ? "YES" : "NO"}</span>
                <span className="dc-stat-label">100-yr Flood Zone</span>
              </div>
              <div className={`dc-stat ${flood.in200yr ? "dc-stat-danger" : "dc-stat-safe"}`}>
                <span className="dc-stat-value">{flood.in200yr === null ? "—" : flood.in200yr ? "YES" : "NO"}</span>
                <span className="dc-stat-label">200-yr Flood Zone</span>
              </div>
              <div className={`dc-stat ${flood.in500yr ? "dc-stat-danger" : "dc-stat-safe"}`}>
                <span className="dc-stat-value">{flood.in500yr === null ? "—" : flood.in500yr ? "YES" : "NO"}</span>
                <span className="dc-stat-label">500-yr Flood Zone</span>
              </div>
            </div>
            {anyFloodRisk ? (
              <p className="dc-note" style={{ color: "var(--hg-danger, #ef4444)", fontWeight: 600 }}>
                This property is within a mapped flood zone. Development may require flood proofing, setbacks, or restricted land use per Alberta&rsquo;s Flood Recovery and Resilience Program.
              </p>
            ) : (
              <p className="dc-note">
                Property is outside all mapped Alberta flood zones (floodway, 100-yr, 200-yr, 500-yr).
              </p>
            )}
          </>
        )}
      </div>

      {/* Storm Infrastructure */}
      <div className="dc-section">
        <h4 className="dc-section-label">Storm Sewer Infrastructure (Edmonton Open Data)</h4>
        {pipesLoading ? (
          <p className="dc-note">Searching nearby storm pipes...</p>
        ) : nearbyPipes.length === 0 ? (
          <p className="dc-note">No storm pipes found within ~500m. Area may use overland drainage or private systems.</p>
        ) : (
          <>
            <div className="dc-stat-grid">
              <div className="dc-stat highlight">
                <span className="dc-stat-value">{nearbyPipes[0].distM.toFixed(0)} m</span>
                <span className="dc-stat-label">Nearest Storm Pipe</span>
              </div>
              <div className="dc-stat">
                <span className="dc-stat-value">{avgPipeAge ? `${avgPipeAge} yrs` : "N/A"}</span>
                <span className="dc-stat-label">Avg. Pipe Age (nearby)</span>
              </div>
              <div className="dc-stat">
                <span className="dc-stat-value">{nearbyPipes.length}</span>
                <span className="dc-stat-label">Storm Pipes within 500m</span>
              </div>
            </div>
            <div style={{ fontSize: 10, opacity: 0.7, lineHeight: 1.6, marginTop: 6 }}>
              {nearbyPipes.slice(0, 3).map((p, i) => (
                <div key={i} style={{ padding: "2px 0", borderBottom: "1px solid var(--hg-border)" }}>
                  <strong>{p.roadName}</strong> — Storm pipe · Built {p.yearConst || "unknown"} ({p.yearConst ? `${currentYear - p.yearConst} yrs old` : "age unknown"}) · {p.distM.toFixed(0)}m away
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Development Activity */}
      <div className="dc-section">
        <h4 className="dc-section-label">Development Activity (Building Permits)</h4>
        {permitsLoading ? (
          <p className="dc-note">Counting building permits in area...</p>
        ) : (
          <div className="dc-stat-grid">
            <div className="dc-stat highlight">
              <span className="dc-stat-value">{permitCount ?? "N/A"}</span>
              <span className="dc-stat-label">Permits within ~1 km</span>
            </div>
            <div className="dc-stat">
              <span className="dc-stat-value">{neighbourhood || "N/A"}</span>
              <span className="dc-stat-label">Neighbourhood</span>
            </div>
          </div>
        )}
        {!permitsLoading && permitCount !== null && permitCount > 30 && (
          <p className="dc-note" style={{ color: "var(--hg-warning, #f59e0b)" }}>
            High development activity — {permitCount} permits nearby. Increased impervious area may affect local drainage capacity.
          </p>
        )}
      </div>

      {/* Climate & Precipitation */}
      <div className="dc-section">
        <h4 className="dc-section-label">Climate & Precipitation (Environment Canada)</h4>
        {climateLoading && precipLoading ? (
          <p className="dc-note">Querying ECCC climate stations...</p>
        ) : (
          <>
            <div className="dc-stat-grid">
              {precipNormal?.annualPrecipMm != null && (
                <div className="dc-stat highlight">
                  <span className="dc-stat-value">{precipNormal.annualPrecipMm.toFixed(0)} mm</span>
                  <span className="dc-stat-label">Annual Precipitation (normal)</span>
                </div>
              )}
              {precipNormal?.annualSnowCm != null && (
                <div className="dc-stat highlight">
                  <span className="dc-stat-value">{precipNormal.annualSnowCm.toFixed(0)} cm</span>
                  <span className="dc-stat-label">Annual Snowfall (normal)</span>
                </div>
              )}
              {climateStation && (
                <div className="dc-stat">
                  <span className="dc-stat-value">{climateStation.distKm.toFixed(1)} km</span>
                  <span className="dc-stat-label">Nearest Climate Station</span>
                </div>
              )}
            </div>
            {climateStation && (
              <p className="dc-note">
                Station: <strong>{climateStation.name}</strong> (ID: {climateStation.id}) · Elev: {climateStation.elevation}m · {climateStation.distKm.toFixed(1)} km from site
                {precipNormal?.stationName && precipNormal.stationName !== climateStation.name ? ` · Normals from: ${precipNormal.stationName}` : ""}
              </p>
            )}
          </>
        )}
      </div>

      {/* Hydrometric / River Flow */}
      <div className="dc-section">
        <h4 className="dc-section-label">River & Stream Flow (ECCC Hydrometric)</h4>
        {hydroLoading ? (
          <p className="dc-note">Searching nearby hydrometric stations...</p>
        ) : !hydroStation ? (
          <p className="dc-note">No hydrometric stations found within ~50 km.</p>
        ) : (
          <>
            <div className="dc-stat-grid">
              <div className="dc-stat highlight">
                <span className="dc-stat-value">{hydroStation.distKm.toFixed(1)} km</span>
                <span className="dc-stat-label">Nearest River Gauge</span>
              </div>
              {hydroStation.drainage_area && (
                <div className="dc-stat">
                  <span className="dc-stat-value">{hydroStation.drainage_area.toLocaleString()} km²</span>
                  <span className="dc-stat-label">Upstream Drainage Area</span>
                </div>
              )}
            </div>
            <p className="dc-note">
              Station: <strong>{hydroStation.name}</strong> (ID: {hydroStation.id}) · {hydroStation.distKm.toFixed(1)} km from site
            </p>
          </>
        )}
      </div>
    </div>
  );
}
