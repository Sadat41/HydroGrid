import { useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { EDMONTON_CENTER } from "../config/layers";
import { BASEMAPS, type BasemapKey } from "../config/basemaps";
import BasemapSwitcher, { getSavedBasemap } from "./BasemapSwitcher";
import { useState } from "react";
import type { PropertyResult, NearbyFacility, AnalysisData } from "../hooks/usePropertySearch";
import { fmtArea, ZONING_IMPERVIOUS } from "../hooks/usePropertySearch";
import "leaflet/dist/leaflet.css";

// ─── Map helpers ────────────────────────────────────────
function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const prev = useRef<string>("");
  const key = `${lat},${lng}`;
  if (key !== prev.current) {
    prev.current = key;
    map.flyTo([lat, lng], 17, { duration: 1.2 });
  }
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// ─── Sidebar input panel (shared across views) ──────────
interface SidebarInputProps {
  mode: "search" | "manual";
  setMode: (m: "search" | "manual") => void;
  query: string;
  handleInput: (val: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  results: PropertyResult[];
  selected: PropertyResult | null;
  setSelected: (p: PropertyResult | null) => void;
  loading: boolean;
  searched: boolean;
  manualLot: string;
  setManualLot: (v: string) => void;
  manualBuilding: string;
  setManualBuilding: (v: string) => void;
  manualAddress: string;
  setManualAddress: (v: string) => void;
  manualZoning: string;
  setManualZoning: (v: string) => void;
  manualNeighbourhood: string;
  setManualNeighbourhood: (v: string) => void;
  manualYearBuilt: string;
  setManualYearBuilt: (v: string) => void;
  manualGarage: boolean;
  setManualGarage: (v: boolean) => void;
  clickLoading: boolean;
  setClickMarker: (v: { lat: number; lng: number } | null) => void;
  runSearch: (q: string) => void;
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
  analysisData: AnalysisData | null;
  nearbyFacilities?: NearbyFacility[];
  facilitiesLoading?: boolean;
}

export function SidebarInputPanel(props: SidebarInputProps) {
  const {
    mode, setMode, query, handleInput, handleKeyDown,
    results, selected, setSelected, loading, searched,
    manualLot, setManualLot, manualBuilding, setManualBuilding,
    manualAddress, setManualAddress,
    manualZoning, setManualZoning, manualNeighbourhood, setManualNeighbourhood,
    manualYearBuilt, setManualYearBuilt, manualGarage, setManualGarage,
    clickLoading,
    setClickMarker, runSearch, debounceRef, analysisData,
    nearbyFacilities, facilitiesLoading,
  } = props;

  return (
    <>
      {/* Mode toggle */}
      <div className="precip-section">
        <div className="precip-toggle-row">
          <button className={`precip-btn ${mode === "search" ? "active" : ""}`} onClick={() => setMode("search")}>
            Address Search
          </button>
          <button className={`precip-btn ${mode === "manual" ? "active" : ""}`} onClick={() => setMode("manual")}>
            Manual Input
          </button>
        </div>
      </div>

      {/* Search Mode */}
      {mode === "search" && (
        <>
          <div className="precip-section">
            <label className="precip-label">Edmonton Address</label>
            <div className="prop-search-row">
              <input
                type="text" className="prop-input"
                placeholder="e.g. 4719 111A Street"
                value={query}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="prop-search-btn"
                onClick={() => { clearTimeout(debounceRef.current); runSearch(query); }}
                disabled={loading}>
                {loading ? (
                  <div className="prop-spinner-sm" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                )}
              </button>
            </div>
            <p className="prop-hint">Search an address, or click on the map to find the nearest property.</p>
          </div>

          {searched && !selected && (
            <div className="precip-section">
              <label className="precip-label">
                Results {results.length > 0 && <span className="prop-count">{results.length}</span>}
              </label>
              {loading ? (
                <div className="prop-loading"><div className="prop-spinner" /><span>Searching...</span></div>
              ) : results.length === 0 ? (
                <p className="prop-empty">No properties found. Try a different address.</p>
              ) : (
                <div className="prop-results">
                  {results.map((r) => (
                    <button key={r.accountNumber} className="prop-result-card"
                      onClick={() => { setSelected(r); setClickMarker(null); }}>
                      <div className="prop-result-addr">{r.address}</div>
                      <div className="prop-result-meta">
                        {r.lotSize ? fmtArea(r.lotSize) : ""}
                        {r.zoning ? ` · ${r.zoning}` : ""}
                        {r.neighbourhood ? ` · ${r.neighbourhood}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selected && analysisData && (
            <div className="precip-section">
              <div className="prop-detail-header">
                <button className="prop-back-btn" onClick={() => { setSelected(null); setClickMarker(null); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                  </svg>
                  Back to results
                </button>
              </div>
              <div className="eng-prop-summary">
                <h3 className="eng-prop-addr">{selected.address}</h3>
                <div className="eng-prop-meta">
                  <span>Lot: {fmtArea(selected.lotSize)}</span>
                  <span>Bldg: {fmtArea(selected.totalGrossArea)}</span>
                  <span>Zoning: {selected.zoning || "N/A"}{analysisData.zoningLabel && analysisData.zoningLabel !== "Unknown" ? ` (${analysisData.zoningLabel})` : ""}</span>
                  <span>Year: {selected.yearBuilt || "N/A"}{selected.garage ? " · Garage" : ""}</span>
                  <span>{selected.neighbourhood}{selected.ward ? ` · ${selected.ward}` : ""}</span>
                  {selected.legalDescription && <span style={{fontSize:10,opacity:0.5}}>Legal: {selected.legalDescription}</span>}
                </div>
                {analysisData.zoning && (
                  <div className="eng-prop-derived" style={{marginTop:6,fontSize:11,opacity:0.7,lineHeight:1.6}}>
                    <span>Est. impervious ratio: <strong>{(analysisData.zoningImpervious*100).toFixed(0)}%</strong></span>
                    <span> · Est. pavement fraction: <strong>{(analysisData.zoningPaveFrac*100).toFixed(0)}%</strong></span>
                    <span style={{display:"block",fontSize:10,opacity:0.6}}>Estimated from zoning type — verify with site survey</span>
                  </div>
                )}
              </div>

              {/* Nearby stormwater facilities */}
              {nearbyFacilities && nearbyFacilities.length > 0 && (
                <div style={{marginTop:10}}>
                  <label className="precip-label" style={{fontSize:11}}>Nearby Storm Facilities (Edmonton Open Data)</label>
                  <div style={{maxHeight:100,overflowY:"auto",fontSize:10,lineHeight:1.5,opacity:0.7}}>
                    {nearbyFacilities.slice(0,5).map((f,i)=>(
                      <div key={i} style={{padding:"2px 0",borderBottom:"1px solid var(--hg-border)"}}>
                        <strong>{f.name}</strong> — {f.type} ({f.owner}) · {f.distKm} km
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {facilitiesLoading && <div style={{fontSize:10,opacity:0.5,marginTop:4}}>Loading nearby facilities...</div>}
            </div>
          )}

          {clickLoading && (
            <div className="precip-section">
              <div className="prop-loading"><div className="prop-spinner" /><span>Looking up property...</span></div>
            </div>
          )}
        </>
      )}

      {/* Manual Mode */}
      {mode === "manual" && (
        <div className="precip-section">
          <label className="precip-label">Site Parameters</label>
          <div className="eng-manual-form">
            <div className="eng-field">
              <label className="eng-field-label">Lot Area (m²) <span className="eng-required">*</span></label>
              <input type="number" className="prop-input" placeholder="e.g. 450"
                value={manualLot} onChange={(e) => setManualLot(e.target.value)} min="1" />
            </div>
            <div className="eng-field">
              <label className="eng-field-label">Building Area (m²)</label>
              <input type="number" className="prop-input" placeholder="e.g. 180"
                value={manualBuilding} onChange={(e) => setManualBuilding(e.target.value)} min="0" />
            </div>
            <div className="eng-field">
              <label className="eng-field-label">Site Name / Address</label>
              <input type="text" className="prop-input" placeholder="e.g. Proposed Lot 12"
                value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} />
            </div>
            <div className="eng-field">
              <label className="eng-field-label">Zoning</label>
              <select className="dc-select" style={{width:"100%"}} value={manualZoning} onChange={(e) => setManualZoning(e.target.value)}>
                <option value="">— Select (optional) —</option>
                {Object.entries(ZONING_IMPERVIOUS).map(([code, info]) => (
                  <option key={code} value={code}>{code} — {info.label}</option>
                ))}
              </select>
            </div>
            <div className="eng-field">
              <label className="eng-field-label">Neighbourhood</label>
              <input type="text" className="prop-input" placeholder="e.g. Bonnie Doon"
                value={manualNeighbourhood} onChange={(e) => setManualNeighbourhood(e.target.value)} />
            </div>
            <div className="eng-field">
              <label className="eng-field-label">Year Built</label>
              <input type="text" className="prop-input" placeholder="e.g. 1985"
                value={manualYearBuilt} onChange={(e) => setManualYearBuilt(e.target.value)} />
            </div>
            <div className="eng-field" style={{flexDirection:"row",alignItems:"center",gap:8}}>
              <input type="checkbox" checked={manualGarage} onChange={(e) => setManualGarage(e.target.checked)} id="manual-garage" />
              <label htmlFor="manual-garage" className="eng-field-label" style={{margin:0}}>Has Garage</label>
            </div>
          </div>
          {!analysisData && (
            <p className="prop-hint" style={{ marginTop: 10 }}>Enter at least a lot area to run the analysis.</p>
          )}
        </div>
      )}
    </>
  );
}

// ─── Map panel (shared across views) ──────────────────
interface MapPanelProps {
  handleMapClick: (lat: number, lng: number) => void;
  markerPos: { lat: number; lng: number } | null;
  visibleMarkers: PropertyResult[];
  selected: PropertyResult | null;
  setSelected: (p: PropertyResult | null) => void;
  setClickMarker: (v: { lat: number; lng: number } | null) => void;
  clickMarker: { lat: number; lng: number } | null;
  clickLoading: boolean;
  mode: "search" | "manual";
  compact?: boolean;
}

export function SiteMapPanel(props: MapPanelProps) {
  const {
    handleMapClick, markerPos, visibleMarkers, selected, setSelected,
    setClickMarker, clickMarker, clickLoading, mode, compact,
  } = props;

  const [basemap, setBasemap] = useState<BasemapKey>(getSavedBasemap);
  const bm = BASEMAPS[basemap];

  return (
    <div className={`site-map-panel ${compact ? "site-map-compact" : ""}`}
      style={compact ? { position: "relative" } : undefined}>
      <MapContainer center={EDMONTON_CENTER} zoom={11}
        className={compact ? "site-map-compact-container" : "precip-map-full"}
        zoomControl={true}>
        <MapClickHandler onMapClick={handleMapClick} />
        <TileLayer key={basemap} attribution={bm.attr} url={bm.url} />
        {"labelsUrl" in bm && (
          <TileLayer key={basemap + "-labels"} url={bm.labelsUrl as string} zIndex={650} />
        )}
        {markerPos && <FlyTo lat={markerPos.lat} lng={markerPos.lng} />}

        {mode === "search" && visibleMarkers.map((r) => (
          <CircleMarker key={r.accountNumber} center={[r.lat, r.lng]}
            radius={selected?.accountNumber === r.accountNumber ? 10 : 6}
            pathOptions={{
              color: selected?.accountNumber === r.accountNumber ? "#22d3ee" : "#38bdf8",
              fillColor: selected?.accountNumber === r.accountNumber ? "#22d3ee" : "#38bdf8",
              fillOpacity: selected?.accountNumber === r.accountNumber ? 0.9 : 0.5,
              weight: selected?.accountNumber === r.accountNumber ? 3 : 1.5,
            }}
            eventHandlers={{ click: () => { setSelected(r); setClickMarker(null); } }}>
            <Popup className="hydrogrid-popup" maxWidth={360}>
              <div style={{ fontFamily: "system-ui", fontSize: 13, maxWidth: 320 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, borderBottom: "2px solid #22d3ee", paddingBottom: 4 }}>
                  {r.address}
                </div>
                <table style={{ borderCollapse: "collapse" }}>
                  <tbody>
                    <tr><td style={{ fontWeight: 600, padding: "2px 8px 2px 0", opacity: 0.65 }}>Lot Area</td><td style={{ fontWeight: 700 }}>{fmtArea(r.lotSize)}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: "2px 8px 2px 0", opacity: 0.65 }}>Building</td><td>{fmtArea(r.totalGrossArea)}</td></tr>
                    <tr><td style={{ fontWeight: 600, padding: "2px 8px 2px 0", opacity: 0.65 }}>Zoning</td><td>{r.zoning || "N/A"}</td></tr>
                  </tbody>
                </table>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {clickMarker && !selected && (
          <CircleMarker center={[clickMarker.lat, clickMarker.lng]} radius={8}
            pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.7, weight: 2 }}>
            <Popup className="hydrogrid-popup">
              <div style={{ fontFamily: "system-ui", fontSize: 12 }}>
                {clickLoading ? "Searching nearby properties..." : "No property found at this location"}
              </div>
            </Popup>
          </CircleMarker>
        )}
      </MapContainer>
      <BasemapSwitcher active={basemap} onChange={setBasemap} />
    </div>
  );
}
