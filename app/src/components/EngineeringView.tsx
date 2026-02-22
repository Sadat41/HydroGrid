import { usePropertySearch } from "../hooks/usePropertySearch";
import { useStationIDF } from "../hooks/useStationIDF";
import { SidebarInputPanel, SiteMapPanel } from "./SiteInputPanel";
import DrainageCalculator from "./DrainageCalculator";
import SiteReport from "./SiteReport";

export default function EngineeringView() {
  const ps = usePropertySearch();
  const idfData = useStationIDF(ps.analysisData?.lat ?? 0, ps.analysisData?.lng ?? 0);

  const hasData = !!ps.analysisData;
  const hasLocation = hasData && ps.analysisData!.lat !== 0;

  return (
    <div className="precip-view">
      <div className="precip-sidebar eng-sidebar">
        <div className="precip-sidebar-header">
          <h2>Site Analysis</h2>
          <p className="precip-subtitle">
            Engineering Hydrology &middot; Drainage Design
          </p>
        </div>

        <SidebarInputPanel {...ps} />

        {!hasData && !ps.searched && ps.mode === "search" && (
          <div className="precip-section">
            <div className="prop-info-card">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 16c1.5-1.5 3-2 4.5-2s3 .5 4.5 2c1.5 1.5 3 2 4.5 2s3-.5 4.5-2" />
                <path d="M2 12c1.5-1.5 3-2 4.5-2s3 .5 4.5 2c1.5 1.5 3 2 4.5 2s3-.5 4.5-2" />
                <path d="M12 2v6" /><path d="M9 5l3-3 3 3" />
              </svg>
              <div>
                <strong>Engineering Site Analysis</strong>
                <p>
                  Search any Edmonton property or enter custom site dimensions to run a
                  full drainage analysis with IDF curves, Rational Method calculations,
                  and LID simulation.
                </p>
                <p>Based on CIV E 321 principles: P &minus; R &minus; G &minus; E &minus; T = &Delta;S</p>
              </div>
            </div>
          </div>
        )}

        <div className="precip-section precip-footer-section">
          <p className="precip-hint" style={{ fontSize: 11 }}>
            <strong>Real data:</strong>{" "}
            <a href="https://data.edmonton.ca" target="_blank" rel="noopener noreferrer" style={{ color: "var(--hg-green)", textDecoration: "none" }}>Edmonton Open Data</a>
            {" "} &middot; Rawls et al. (1983) &middot; Bedient et al. (2019)
            <br /><strong>Approximate:</strong> IDF intensities — verify against{" "}
            <a href="https://climate-change.canada.ca/climate-data/#/short-duration-rainfall-intensity-idf" target="_blank" rel="noopener noreferrer" style={{ color: "var(--hg-green)", textDecoration: "none" }}>ECCC IDF tool</a>
          </p>
          <p className="footer-credit">HackED 2026 - University of Alberta</p>
        </div>
      </div>

      <div className="precip-main theme-dark">
        <div className="sim-split-main">
          <SiteMapPanel
            handleMapClick={ps.handleMapClick}
            markerPos={ps.markerPos}
            visibleMarkers={ps.visibleMarkers}
            selected={ps.selected}
            setSelected={ps.setSelected}
            setClickMarker={ps.setClickMarker}
            clickMarker={ps.clickMarker}
            clickLoading={ps.clickLoading}
            mode={ps.mode}
            compact
          />

          {!hasData ? (
            <div className="precip-overlay-loading" style={{ flex: 1 }}>
              Search or click a property to start analysis
            </div>
          ) : (
            <div className="sim-charts-area">
              {hasLocation && (
                <SiteReport
                  lat={ps.analysisData!.lat}
                  lng={ps.analysisData!.lng}
                  neighbourhood={ps.analysisData!.neighbourhood}
                  address={ps.analysisData!.address}
                />
              )}

              <DrainageCalculator
                lotSize={ps.analysisData!.lotSize}
                buildingArea={ps.analysisData!.buildingArea}
                address={ps.analysisData!.address}
                zoning={ps.analysisData!.zoning}
                zoningImpervious={ps.analysisData!.zoningImpervious}
                zoningPaveFrac={ps.analysisData!.zoningPaveFrac}
                idfData={idfData}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
