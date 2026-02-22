import { useState, useMemo } from "react";
import { downloadCSV } from "../utils/export";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  IDF_RETURN_PERIODS,
  interpolateIntensity,
  calculateTc, roundUpPipe, calcPipeDiameter,
  C_ROOF, C_PAVEMENT, C_LAWN, C_GREEN_ROOF, C_PERMEABLE_PAVE, C_PRE_DEV,
  SOIL_INFILTRATION, type SoilType, SLOPE_OPTIONS,
} from "../utils/hydrology";
import type { IDFData } from "../hooks/useStationIDF";

interface DrainageProps {
  lotSize: number;
  buildingArea: number;
  address: string;
  zoning?: string;
  zoningImpervious?: number;
  zoningPaveFrac?: number;
  idfData?: IDFData;
}

interface LIDState {
  greenRoof: boolean;
  rainGarden: boolean;
  permeablePavement: boolean;
  bioswale: boolean;
}

function compositeC(
  buildingArea: number,
  pavementArea: number,
  lawnArea: number,
  totalArea: number,
  lid: LIDState,
): number {
  let roofC = C_ROOF;
  let paveC = C_PAVEMENT;

  if (lid.greenRoof)          roofC = 0.5 * C_GREEN_ROOF + 0.5 * C_ROOF;
  if (lid.permeablePavement)  paveC = C_PERMEABLE_PAVE;

  let C = (roofC * buildingArea + paveC * pavementArea + C_LAWN * lawnArea) / totalArea;

  if (lid.rainGarden) C *= 0.85; // ~15% reduction from captured first-flush

  return Math.max(0.1, Math.min(C, 0.95));
}

// ─── Component ────────────────────────────────────────────────────────

export default function DrainageCalculator({ lotSize, buildingArea, address, zoningPaveFrac, idfData }: DrainageProps) {
  const [lid, setLid] = useState<LIDState>({
    greenRoof: false,
    rainGarden: false,
    permeablePavement: false,
    bioswale: false,
  });
  const [soil, setSoil] = useState<SoilType>("clay");
  const [siteSlope, setSiteSlope] = useState(0.02);
  const defaultPave = zoningPaveFrac ? Math.round(zoningPaveFrac * 100) : 15;
  const [pavementPct, setPavementPct] = useState(defaultPave);

  if (!lotSize || lotSize <= 0) {
    return (
      <div className="dc-empty">
        <p>Lot size data is required for drainage analysis.</p>
      </div>
    );
  }

  const clampedBuilding = Math.min(buildingArea || 0, lotSize * 0.85);
  const pavementArea    = lotSize * (pavementPct / 100);
  const lawnArea        = Math.max(0, lotSize - clampedBuilding - pavementArea);
  const imperviousArea  = clampedBuilding + pavementArea;
  const imperviousRatio = imperviousArea / lotSize;

  const tc = calculateTc(lotSize, siteSlope);

  const baseC = compositeC(clampedBuilding, pavementArea, lawnArea, lotSize, {
    greenRoof: false, rainGarden: false, permeablePavement: false, bioswale: false,
  });
  const lidC = compositeC(clampedBuilding, pavementArea, lawnArea, lotSize, lid);

  const area_ha = lotSize / 10000;

  // Use live IDF from nearest station if available, fallback to static ECCC table
  const getI = idfData?.getIntensity ?? interpolateIntensity;
  const idfLive = idfData?.live ?? false;
  const idfStation = idfData?.station;

  // Local detention calc using whichever IDF source is active
  function localDetention(C_post: number, C_pre: number, areaHa: number, tcMin: number, rp: number) {
    const durations = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 360, 720, 1440];
    let maxVol = 0, critDur = tcMin, bestRelease = 0, bestInflow = 0;
    const Q_release = (C_pre * getI(tcMin, rp) * areaHa) / 360;
    for (const d of durations) {
      if (d < tcMin) continue;
      const i = getI(d, rp);
      const Q_in = (C_post * i * areaHa) / 360;
      const vol_in = Q_in * d * 60;
      const vol_out = Q_release * d * 60;
      const storage = vol_in - vol_out;
      if (storage > maxVol) { maxVol = storage; critDur = d; bestRelease = Q_release; bestInflow = Q_in; }
    }
    return { critDur, volume_m3: Math.max(0, maxVol), release_Ls: bestRelease * 1000, inflow_Ls: bestInflow * 1000 };
  }

  const results = useMemo(() => {
    return IDF_RETURN_PERIODS.map((rp) => {
      const i = getI(tc, rp);
      let Q_base = (baseC * i * area_ha) / 360;
      let Q_lid  = (lidC  * i * area_ha) / 360;
      if (lid.bioswale) Q_lid *= 0.80;

      const pipe_base = roundUpPipe(calcPipeDiameter(Q_base));
      const pipe_lid  = roundUpPipe(calcPipeDiameter(Q_lid));

      const depth_mm = i * (tc / 60);
      const vol_base = (baseC * depth_mm * lotSize) / 1000;
      let vol_lid    = (lidC  * depth_mm * lotSize) / 1000;
      if (lid.bioswale) vol_lid *= 0.95;

      return { rp, i, Q_base, Q_lid, pipe_base, pipe_lid, vol_base, vol_lid };
    });
  }, [tc, baseC, lidC, area_ha, lid.bioswale, lotSize, getI]);

  const preDevResults = useMemo(() => {
    return IDF_RETURN_PERIODS.map((rp) => {
      const i = getI(tc, rp);
      const Q_pre = (C_PRE_DEV * i * area_ha) / 360;
      return { rp, i, Q_pre };
    });
  }, [tc, area_ha, getI]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const detention5 = useMemo(() => localDetention(baseC, C_PRE_DEV, area_ha, tc, 5), [baseC, area_ha, tc, getI]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const detention100 = useMemo(() => localDetention(baseC, C_PRE_DEV, area_ha, tc, 100), [baseC, area_ha, tc, getI]);
  const detentionLid5 = useMemo(() => {
    const effectiveC = lid.bioswale ? lidC * 0.80 : lidC;
    return localDetention(effectiveC, C_PRE_DEV, area_ha, tc, 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lidC, lid.bioswale, area_ha, tc, getI]);
  const detentionLid100 = useMemo(() => {
    const effectiveC = lid.bioswale ? lidC * 0.80 : lidC;
    return localDetention(effectiveC, C_PRE_DEV, area_ha, tc, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lidC, lid.bioswale, area_ha, tc, getI]);

  const soilInfo = SOIL_INFILTRATION[soil];
  const infiltrationDepth = soilInfo.rate * (tc / 60);
  const potentialInfiltration = (soilInfo.rate * (tc / 60) * lawnArea) / 1000;

  const minorRow = results.find((r) => r.rp === 5) ?? results[1];
  const designRow = results.find((r) => r.rp === 100) ?? results[results.length - 1];
  const anyLid = lid.greenRoof || lid.rainGarden || lid.permeablePavement || lid.bioswale;
  const reductionPct = anyLid && designRow
    ? ((1 - designRow.Q_lid / designRow.Q_base) * 100)
    : 0;

  const chartData = results.map((r, idx) => ({
    name: `${r.rp}-yr`,
    "Pre-Dev": +(preDevResults[idx].Q_pre * 1000).toFixed(2),
    "Post-Dev": +(r.Q_base * 1000).toFixed(2),
    ...(anyLid ? { "With LID": +(r.Q_lid * 1000).toFixed(2) } : {}),
  }));

  const tooltipStyle = {
    background: "#0a150a",
    border: "1px solid rgba(57,211,83,0.35)",
    borderRadius: 2,
    color: "#39d353",
    fontSize: 11,
    fontFamily: "'Share Tech Mono', monospace",
  };

  function toggle(key: keyof LIDState) {
    setLid((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="dc">
      <div className="dc-header">
        <h3 className="dc-title">Engineering Analysis</h3>
        <span className="dc-subtitle">Drainage & Site Hydrology — {address}</span>
      </div>

      {/* ── Site Hydrology ──────────────────────────────── */}
      <div className="dc-section">
        <h4 className="dc-section-label">Site Hydrology</h4>
        <div className="dc-stat-grid">
          <div className="dc-stat highlight">
            <span className="dc-stat-value">{lotSize.toLocaleString()} m²</span>
            <span className="dc-stat-label">Lot Area</span>
          </div>
          <div className="dc-stat highlight">
            <span className="dc-stat-value">{clampedBuilding.toLocaleString()} m²</span>
            <span className="dc-stat-label">Building Area</span>
          </div>
          <div className="dc-stat">
            <span className="dc-stat-value">{(imperviousRatio * 100).toFixed(0)}%</span>
            <span className="dc-stat-label">Impervious Ratio</span>
          </div>
          <div className="dc-stat">
            <span className="dc-stat-value">{C_PRE_DEV} → {baseC.toFixed(2)}</span>
            <span className="dc-stat-label">C (pre → post)</span>
          </div>
          <div className="dc-stat">
            <span className="dc-stat-value">{tc.toFixed(1)} min</span>
            <span className="dc-stat-label">t<sub>c</sub> (Kirpich)</span>
          </div>
          <div className="dc-stat">
            <span className="dc-stat-value">{lawnArea.toFixed(0)} m²</span>
            <span className="dc-stat-label">Pervious Area</span>
          </div>
        </div>

        <div className="dc-control-row">
          <label className="dc-control-label">
            Pavement %
            <input
              type="range"
              min="0" max="40" step="1"
              value={pavementPct}
              onChange={(e) => setPavementPct(+e.target.value)}
              className="dc-range"
            />
            <span className="dc-range-val">{pavementPct}%</span>
          </label>
          <label className="dc-control-label">
            Soil Type
            <select
              value={soil}
              onChange={(e) => setSoil(e.target.value as SoilType)}
              className="dc-select"
            >
              {(Object.keys(SOIL_INFILTRATION) as SoilType[]).map((k) => (
                <option key={k} value={k}>{SOIL_INFILTRATION[k].label}</option>
              ))}
            </select>
          </label>
          <label className="dc-control-label">
            Site Slope
            <select
              value={siteSlope}
              onChange={(e) => setSiteSlope(parseFloat(e.target.value))}
              className="dc-select"
            >
              {SLOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="dc-soil-desc">
          {soilInfo.desc} — Infiltration rate: <strong>{soilInfo.rate} mm/hr</strong>
          {" "}({infiltrationDepth.toFixed(1)} mm during t<sub>c</sub>,
          {" "}{potentialInfiltration.toFixed(2)} m³ absorbed on pervious area)
        </p>
      </div>

      {/* ── Design Storms ──────────────────────────────── */}
      <div className="dc-section">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <h4 className="dc-section-label" style={{margin:0}}>Design Storms — Rational Method (Q = CiA)</h4>
          <button className="export-btn" onClick={() => downloadCSV(results.map(r => ({Return_Period_yr: r.rp, Intensity_mm_hr: r.i.toFixed(1), Q_Baseline_m3s: r.Q_base.toFixed(4), Q_LID_m3s: r.Q_lid.toFixed(4), Pipe_Baseline_mm: r.pipe_base, Pipe_LID_mm: r.pipe_lid, Vol_Baseline_m3: r.vol_base.toFixed(2), Vol_LID_m3: r.vol_lid.toFixed(2)})), "drainage_design.csv")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            CSV
          </button>
        </div>
        <p className="dc-note">
          {idfLive && idfStation
            ? <>IDF derived from <strong>{idfStation.name}</strong> (Stn {idfStation.id}) daily precipitation · {idfData?.gumbel?.nYears ?? "?"} years ({idfData?.gumbel?.yearRange?.[0]}–{idfData?.gumbel?.yearRange?.[1]}) · Gumbel analysis + temporal disaggregation</>
            : <>IDF data: ECCC Edmonton Blatchford (Stn 3012209) v3.30 · Fallback static table</>
          } · Duration = t<sub>c</sub> = {tc.toFixed(1)} min
          <br />
          Edmonton design standard: <strong>5-yr</strong> return period for minor (pipe) system · <strong>100-yr</strong> for major (overland) system
        </p>

        <div className="dc-table-wrap">
          <table className="dc-table">
            <thead>
              <tr>
                <th>Return Period</th>
                <th>Intensity (mm/hr)</th>
                <th>Q (L/s)</th>
                <th>Pipe (mm)</th>
                <th>Volume (m³)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.rp} className={r.rp === 5 || r.rp === 100 ? "dc-row-highlight" : ""}>
                  <td>{r.rp}-yr{r.rp === 5 ? " ★" : r.rp === 100 ? " ★" : ""}</td>
                  <td>{r.i.toFixed(1)}</td>
                  <td>{(r.Q_base * 1000).toFixed(2)}</td>
                  <td>{r.pipe_base}</td>
                  <td>{r.vol_base.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pre vs Post Development ──────────────────── */}
      <div className="dc-section">
        <h4 className="dc-section-label">Pre vs Post Development — Detention Requirement</h4>
        <p className="dc-note">
          Edmonton requires post-development release ≤ pre-development runoff (C<sub>pre</sub> = {C_PRE_DEV}).
          The excess must be detained on-site.
        </p>
        <div className="dc-table-wrap">
          <table className="dc-table">
            <thead>
              <tr>
                <th>Return Period</th>
                <th>Q<sub>pre</sub> (L/s)</th>
                <th>Q<sub>post</sub> (L/s)</th>
                <th>Increase</th>
                <th>Δ Excess (L/s)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => {
                const Qpre = preDevResults[idx].Q_pre * 1000;
                const Qpost = r.Q_base * 1000;
                const excess = Qpost - Qpre;
                const pctIncrease = Qpre > 0 ? ((Qpost - Qpre) / Qpre) * 100 : 0;
                return (
                  <tr key={r.rp} className={r.rp === 5 || r.rp === 100 ? "dc-row-highlight" : ""}>
                    <td>{r.rp}-yr{r.rp === 5 ? " ★" : r.rp === 100 ? " ★" : ""}</td>
                    <td>{Qpre.toFixed(2)}</td>
                    <td>{Qpost.toFixed(2)}</td>
                    <td style={{color:"#ef4444"}}>+{pctIncrease.toFixed(0)}%</td>
                    <td style={{color:"#ef4444"}}>+{excess.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h4 className="dc-section-label" style={{marginTop:16}}>Required On-Site Detention (Modified Rational Method)</h4>
        <p className="dc-note">
          Iterates storm durations to find the critical duration that produces the maximum storage requirement.
          Release rate = pre-development Q at the design t<sub>c</sub>.
        </p>
        <div className="dc-stat-grid" style={{marginTop:8}}>
          <div className="dc-stat highlight">
            <span className="dc-stat-value">{detention5.volume_m3.toFixed(2)} m³</span>
            <span className="dc-stat-label">5-yr Detention Volume</span>
          </div>
          <div className="dc-stat highlight">
            <span className="dc-stat-value">{detention100.volume_m3.toFixed(2)} m³</span>
            <span className="dc-stat-label">100-yr Detention Volume</span>
          </div>
          <div className="dc-stat">
            <span className="dc-stat-value">{detention5.critDur} min</span>
            <span className="dc-stat-label">Critical Duration (5-yr)</span>
          </div>
          <div className="dc-stat">
            <span className="dc-stat-value">{detention100.critDur} min</span>
            <span className="dc-stat-label">Critical Duration (100-yr)</span>
          </div>
          <div className="dc-stat">
            <span className="dc-stat-value">{detention5.release_Ls.toFixed(2)} L/s</span>
            <span className="dc-stat-label">Max Release (5-yr)</span>
          </div>
          <div className="dc-stat">
            <span className="dc-stat-value">{detention100.release_Ls.toFixed(2)} L/s</span>
            <span className="dc-stat-label">Max Release (100-yr)</span>
          </div>
        </div>
        {anyLid && (
          <div className="dc-lid-results" style={{marginTop:12}}>
            <div className="dc-lid-result-row">
              <span className="dc-lid-result-label">5-yr Detention with LID</span>
              <span className="dc-lid-result-value">
                {detention5.volume_m3.toFixed(2)} → <strong>{detentionLid5.volume_m3.toFixed(2)} m³</strong>
                <span className="dc-reduction">▼ {(detention5.volume_m3 - detentionLid5.volume_m3).toFixed(2)} m³ saved</span>
              </span>
            </div>
            <div className="dc-lid-result-row">
              <span className="dc-lid-result-label">100-yr Detention with LID</span>
              <span className="dc-lid-result-value">
                {detention100.volume_m3.toFixed(2)} → <strong>{detentionLid100.volume_m3.toFixed(2)} m³</strong>
                <span className="dc-reduction">▼ {(detention100.volume_m3 - detentionLid100.volume_m3).toFixed(2)} m³ saved</span>
              </span>
            </div>
          </div>
        )}
        <p className="dc-note" style={{marginTop:8}}>
          <strong>Typical facility:</strong> For {detention100.volume_m3.toFixed(1)} m³ of detention — underground tank ≈{" "}
          {Math.ceil(detention100.volume_m3 / 2)} m long × 1.5 m wide × {Math.min(1.5, detention100.volume_m3 / (Math.ceil(detention100.volume_m3 / 2) * 1.5)).toFixed(1)} m deep,
          or a dry pond ≈ {(detention100.volume_m3 / 0.5).toFixed(0)} m² at 0.5m average depth.
          Actual sizing depends on site constraints and outlet control design.
        </p>
      </div>

      {/* ── LID Simulator ──────────────────────────────── */}
      <div className="dc-section">
        <h4 className="dc-section-label">LID Simulator — Low Impact Development</h4>
        <p className="dc-note">
          Toggle green infrastructure to see how it reduces peak runoff and required pipe sizing.
        </p>

        <div className="dc-lid-grid">
          <label className={`dc-lid-card ${lid.greenRoof ? "on" : ""}`}>
            <input type="checkbox" checked={lid.greenRoof} onChange={() => toggle("greenRoof")} />
            <div className="dc-lid-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 8c.7-1 1-2.2 1-3.5C18 2.6 16.4 1 14.5 1c-.5 0-1 .1-1.4.3C12.4.5 11.5 0 10.5 0 8.6 0 7 1.6 7 3.5c0 .6.1 1.1.3 1.6" />
                <path d="M12 22V8" />
                <rect x="4" y="18" width="16" height="4" rx="1" opacity="0.3" />
              </svg>
            </div>
            <span className="dc-lid-name">Green Roof</span>
            <span className="dc-lid-desc">50% of building area · C: 0.95 → 0.40</span>
          </label>

          <label className={`dc-lid-card ${lid.rainGarden ? "on" : ""}`}>
            <input type="checkbox" checked={lid.rainGarden} onChange={() => toggle("rainGarden")} />
            <div className="dc-lid-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C12 2 5 12 5 16a7 7 0 0 0 14 0c0-4-7-14-7-14z" />
                <path d="M7 19q5-4 10 0" />
              </svg>
            </div>
            <span className="dc-lid-name">Rain Garden</span>
            <span className="dc-lid-desc">8% of lot · Captures first-flush runoff (~15%)</span>
          </label>

          <label className={`dc-lid-card ${lid.permeablePavement ? "on" : ""}`}>
            <input type="checkbox" checked={lid.permeablePavement} onChange={() => toggle("permeablePavement")} />
            <div className="dc-lid-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8" cy="8" r="1" fill="currentColor" opacity="0.4" />
                <circle cx="16" cy="8" r="1" fill="currentColor" opacity="0.4" />
                <circle cx="12" cy="12" r="1" fill="currentColor" opacity="0.4" />
                <circle cx="8" cy="16" r="1" fill="currentColor" opacity="0.4" />
                <circle cx="16" cy="16" r="1" fill="currentColor" opacity="0.4" />
              </svg>
            </div>
            <span className="dc-lid-name">Permeable Pavement</span>
            <span className="dc-lid-desc">Replaces driveway · C: 0.90 → 0.30</span>
          </label>

          <label className={`dc-lid-card ${lid.bioswale ? "on" : ""}`}>
            <input type="checkbox" checked={lid.bioswale} onChange={() => toggle("bioswale")} />
            <div className="dc-lid-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
                <path d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
                <line x1="12" y1="2" x2="12" y2="10" />
                <path d="M9 5l3-3 3 3" />
              </svg>
            </div>
            <span className="dc-lid-name">Bio-swale</span>
            <span className="dc-lid-desc">Vegetated channel · 20% peak attenuation</span>
          </label>
        </div>

        {anyLid && (
          <div className="dc-lid-results">
            <div className="dc-lid-result-row">
              <span className="dc-lid-result-label">Adjusted Runoff Coeff</span>
              <span className="dc-lid-result-value">
                {baseC.toFixed(2)} → <strong>{lidC.toFixed(2)}</strong>
              </span>
            </div>
            <div className="dc-lid-result-row">
              <span className="dc-lid-result-label">100-yr Peak Discharge</span>
              <span className="dc-lid-result-value">
                {(designRow.Q_base * 1000).toFixed(2)} → <strong>{(designRow.Q_lid * 1000).toFixed(2)} L/s</strong>
                <span className="dc-reduction">▼ {reductionPct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="dc-lid-result-row">
              <span className="dc-lid-result-label">Required Pipe (100-yr)</span>
              <span className="dc-lid-result-value">
                {designRow.pipe_base}mm → <strong>{designRow.pipe_lid}mm</strong>
              </span>
            </div>
            <div className="dc-lid-result-row">
              <span className="dc-lid-result-label">Runoff Volume (100-yr)</span>
              <span className="dc-lid-result-value">
                {designRow.vol_base.toFixed(2)} → <strong>{designRow.vol_lid.toFixed(2)} m³</strong>
                <span className="dc-reduction">▼ {(designRow.vol_base - designRow.vol_lid).toFixed(2)} m³ captured</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Peak Discharge Chart ───────────────────────── */}
      <div className="dc-section">
        <h4 className="dc-section-label">
          Peak Discharge — Pre vs Post Development {anyLid ? "vs. LID" : ""}
        </h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(57,211,83,0.12)" />
            <XAxis
              dataKey="name"
              stroke="rgba(57,211,83,0.4)"
              tick={{ fontSize: 10, fill: "rgba(57,211,83,0.6)" }}
            />
            <YAxis
              stroke="rgba(57,211,83,0.4)"
              tick={{ fontSize: 10, fill: "rgba(57,211,83,0.6)" }}
              unit=" L/s"
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number | undefined) => [`${v ?? 0} L/s`]} />
            <Legend
              wrapperStyle={{ fontSize: 10, color: "rgba(57,211,83,0.6)" }}
            />
            <Bar dataKey="Pre-Dev" fill="#6b7280" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Post-Dev" fill="#ef4444" radius={[2, 2, 0, 0]} />
            {anyLid && (
              <Bar dataKey="With LID" fill="#22d3ee" radius={[2, 2, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Design Summary ─────────────────────────────── */}
      <div className="dc-section dc-summary">
        <h4 className="dc-section-label">Design Summary</h4>
        <div className="dc-summary-grid">
          <div className="dc-summary-item highlight">
            <span className="dc-summary-label">Minor System Pipe (5-yr)</span>
            <span className="dc-summary-value lg">
              {anyLid ? minorRow.pipe_lid : minorRow.pipe_base} mm
            </span>
          </div>
          <div className="dc-summary-item highlight">
            <span className="dc-summary-label">Major System Pipe (100-yr)</span>
            <span className="dc-summary-value lg">
              {anyLid ? designRow.pipe_lid : designRow.pipe_base} mm
            </span>
          </div>
          <div className="dc-summary-item highlight">
            <span className="dc-summary-label">On-Site Detention (5-yr)</span>
            <span className="dc-summary-value lg">
              {(anyLid ? detentionLid5.volume_m3 : detention5.volume_m3).toFixed(1)} m³
            </span>
          </div>
          <div className="dc-summary-item highlight">
            <span className="dc-summary-label">On-Site Detention (100-yr)</span>
            <span className="dc-summary-value lg">
              {(anyLid ? detentionLid100.volume_m3 : detention100.volume_m3).toFixed(1)} m³
            </span>
          </div>
          <div className="dc-summary-item">
            <span className="dc-summary-label">Pre-Dev C (baseline)</span>
            <span className="dc-summary-value">{C_PRE_DEV}</span>
          </div>
          <div className="dc-summary-item">
            <span className="dc-summary-label">Post-Dev C</span>
            <span className="dc-summary-value">{(anyLid ? lidC : baseC).toFixed(2)}</span>
          </div>
          <div className="dc-summary-item">
            <span className="dc-summary-label">Peak Q₅ (minor)</span>
            <span className="dc-summary-value">
              {((anyLid ? minorRow.Q_lid : minorRow.Q_base) * 1000).toFixed(2)} L/s
            </span>
          </div>
          <div className="dc-summary-item">
            <span className="dc-summary-label">Peak Q₁₀₀ (major)</span>
            <span className="dc-summary-value">
              {((anyLid ? designRow.Q_lid : designRow.Q_base) * 1000).toFixed(2)} L/s
            </span>
          </div>
          <div className="dc-summary-item">
            <span className="dc-summary-label">Max Release Rate</span>
            <span className="dc-summary-value">{detention100.release_Ls.toFixed(2)} L/s (pre-dev equivalent)</span>
          </div>
          <div className="dc-summary-item">
            <span className="dc-summary-label">100-yr Runoff Volume</span>
            <span className="dc-summary-value">
              {(anyLid ? designRow.vol_lid : designRow.vol_base).toFixed(2)} m³
            </span>
          </div>
          <div className="dc-summary-item">
            <span className="dc-summary-label">Soil Infiltration Potential</span>
            <span className="dc-summary-value">{potentialInfiltration.toFixed(2)} m³ during storm</span>
          </div>
          <div className="dc-summary-item">
            <span className="dc-summary-label">Site Slope</span>
            <span className="dc-summary-value">{(siteSlope * 100).toFixed(1)}%</span>
          </div>
          <div className="dc-summary-item" style={{gridColumn:"1 / -1"}}>
            <span className="dc-summary-label">Methodology</span>
            <span className="dc-summary-value sm">
              Rational Method (Q=CiA) · Manning's pipe sizing · Modified Rational (detention) · Edmonton IDF · Kirpich t<sub>c</sub>
            </span>
          </div>
        </div>
        <p className="dc-disclaimer">
          <strong>Real data:</strong> Property — Edmonton Open Data API.
          Soil infiltration — Rawls et al. (1983).
          Runoff coefficients — standard ranges (Bedient et al., 2019).
          Manning's n=0.013 (PVC), S=0.5%.
          Pre-dev C={C_PRE_DEV} assumes undeveloped prairie on glacial till.
          <br />
          <strong>IDF source:</strong>{" "}
          {idfLive && idfStation
            ? <>Derived from ECCC daily precipitation — {idfStation.name} (Stn {idfStation.id}), {idfData?.gumbel?.nYears ?? "?"} years of record ({idfData?.gumbel?.yearRange?.[0]}–{idfData?.gumbel?.yearRange?.[1]}), Gumbel Method of Moments + temporal disaggregation ratios.</>
            : <>ECCC Engineering Climate Datasets v3.30, Station 3012209 (Edmonton Blatchford), 75 years of record (1914–2021). Static fallback.</>
          }
          <br />
          <strong>Not for construction</strong> — preliminary analysis only.
        </p>
      </div>
    </div>
  );
}
