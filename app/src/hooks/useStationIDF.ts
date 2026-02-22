import { useState, useEffect, useRef } from "react";
import {
  haversineKm, gumbelFit, deriveIDFFromGumbel,
  IDF_INTENSITIES,
  type LiveIDFTable, type GumbelResult,
  interpolateFromTable, interpolateIntensity,
} from "../utils/hydrology";

const ECCC_API = "https://api.weather.gc.ca";

interface StationMeta {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevation: number;
  distKm: number;
  firstYear: number;
  lastYear: number;
}

export interface IDFData {
  loading: boolean;
  live: boolean;
  station: StationMeta | null;
  idf: LiveIDFTable | null;
  gumbel: GumbelResult | null;
  /** Interpolate intensity (mm/hr) for any duration/return period.
   *  Uses live data if available, falls back to static ECCC table. */
  getIntensity: (duration_min: number, returnPeriod: number) => number;
  /** The IDF intensities table (live or fallback) */
  intensities: Record<number, number[]>;
}

const FALLBACK: IDFData = {
  loading: false, live: false, station: null, idf: null, gumbel: null,
  getIntensity: interpolateIntensity,
  intensities: IDF_INTENSITIES,
};

export function useStationIDF(lat: number, lng: number): IDFData {
  const [data, setData] = useState<IDFData>(FALLBACK);
  const abortRef = useRef<AbortController>(undefined);

  useEffect(() => {
    if (!lat || !lng) { setData(FALLBACK); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setData(prev => ({ ...prev, loading: true }));

    (async () => {
      try {
        // 1. Find nearest climate station with daily data
        const bbox = `${lng - 0.3},${lat - 0.3},${lng + 0.3},${lat + 0.3}`;
        const stUrl = `${ECCC_API}/collections/climate-stations/items?f=json&limit=50&bbox=${bbox}`;
        const stRes = await fetch(stUrl, { signal });
        const stJson = await stRes.json();

        const candidates: StationMeta[] = (stJson.features || [])
          .filter((f: any) => f.properties.DLY_FIRST_DATE)
          .map((f: any) => {
            const p = f.properties;
            const sLat = f.geometry.coordinates[1];
            const sLng = f.geometry.coordinates[0];
            return {
              id: p.CLIMATE_IDENTIFIER,
              name: p.STATION_NAME,
              lat: sLat, lng: sLng,
              elevation: p.ELEVATION ?? 0,
              distKm: haversineKm(lat, lng, sLat, sLng),
              firstYear: parseInt(p.DLY_FIRST_DATE?.slice(0, 4)) || 1900,
              lastYear: parseInt(p.DLY_LAST_DATE?.slice(0, 4)) || 2024,
            };
          })
          .sort((a: StationMeta, b: StationMeta) => {
            const yearsA = a.lastYear - a.firstYear;
            const yearsB = b.lastYear - b.firstYear;
            // Prefer stations with >30 years of data that are close
            const scoreA = yearsA > 30 ? -a.distKm : 999 - yearsA;
            const scoreB = yearsB > 30 ? -b.distKm : 999 - yearsB;
            return scoreA - scoreB;
          });

        if (candidates.length === 0) throw new Error("no station");
        const station = candidates[0];

        // 2. Fetch top 500 wettest days (single API call, sorted descending)
        const dailyUrl = `${ECCC_API}/collections/climate-daily/items?f=json` +
          `&limit=500&CLIMATE_IDENTIFIER=${station.id}` +
          `&sortby=-TOTAL_PRECIPITATION` +
          `&properties=LOCAL_DATE,TOTAL_PRECIPITATION`;
        const dailyRes = await fetch(dailyUrl, { signal });
        const dailyJson = await dailyRes.json();

        const records: { year: number; precip: number }[] = (dailyJson.features || [])
          .map((f: any) => ({
            year: parseInt(f.properties.LOCAL_DATE?.slice(0, 4)),
            precip: f.properties.TOTAL_PRECIPITATION,
          }))
          .filter((r: { year: number; precip: number }) =>
            r.year > 0 && r.precip != null && r.precip > 0
          );

        // 3. Extract annual maximums
        const byYear = new Map<number, number>();
        for (const r of records) {
          const cur = byYear.get(r.year) ?? 0;
          if (r.precip > cur) byYear.set(r.year, r.precip);
        }

        const annualMaxima = Array.from(byYear.entries())
          .map(([year, max_mm]) => ({ year, max_mm }))
          .sort((a, b) => a.year - b.year);

        // 4. Gumbel frequency analysis
        const gumbel = gumbelFit(annualMaxima);
        if (!gumbel || signal.aborted) throw new Error("gumbel failed");

        // 5. Derive full IDF table via temporal disaggregation
        const idf = deriveIDFFromGumbel(gumbel, station.id, station.name);

        if (!signal.aborted) {
          setData({
            loading: false, live: true,
            station, idf, gumbel,
            getIntensity: (dur, rp) => interpolateFromTable(idf.intensities, dur, rp),
            intensities: idf.intensities,
          });
        }
      } catch {
        if (!signal.aborted) {
          setData({
            ...FALLBACK,
            loading: false,
          });
        }
      }
    })();

    return () => controller.abort();
  }, [lat, lng]);

  return data;
}
