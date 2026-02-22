// ─── Official ECCC IDF Data ─────────────────────────────────────────────────
// Station: 3012209 — Edmonton Blatchford (53°34'N, 113°31'W, 671 m)
// Source:  ECCC Engineering Climate Datasets v3.30 (2022-10-31)
// Table:   2b — Return Period Rainfall Rates (mm/hr), Gumbel Method of Moments
// Period:  1914–2021 (75 years of record)
// URL:     https://collaboration.cmc.ec.gc.ca/cmc/climate/Engineer_Climate/IDF/
//          idf_v3-30_2022_10_31/IDF_Files_Fichiers/AB.zip
//          → AB/idf_v3-30_2022_10_31_301_AB_3012209_EDMONTON_BLATCHFORD.txt

export const IDF_STATION_ID   = "3012209";
export const IDF_STATION_NAME = "Edmonton Blatchford";
export const IDF_VERSION      = "v3.30 (2022-10-31)";

export const IDF_DURATIONS     = [5, 10, 15, 30, 60, 120, 360, 720, 1440]; // minutes
export const IDF_RETURN_PERIODS = [2, 5, 10, 25, 50, 100]; // years

// mm/hr — rows = return period, columns = duration
export const IDF_INTENSITIES: Record<number, number[]> = {
  2:   [67.4, 51.4, 41.5, 26.5, 15.9,  9.8, 4.7, 2.9, 1.8],
  5:   [97.7, 75.0, 61.1, 40.3, 24.0, 14.3, 6.8, 4.1, 2.6],
  10:  [117.8, 90.6, 74.1, 49.5, 29.4, 17.2, 8.2, 5.0, 3.1],
  25:  [143.2, 110.4, 90.6, 61.1, 36.2, 20.9, 9.9, 6.0, 3.8],
  50:  [162.0, 125.0, 102.7, 69.7, 41.2, 23.7, 11.3, 6.8, 4.2],
  100: [180.7, 139.5, 114.8, 78.2, 46.2, 26.4, 12.5, 7.6, 4.7],
};

// Confidence intervals (±mm/hr) from ECCC Table 2b
export const IDF_CONFIDENCE: Record<number, number[]> = {
  2:   [7.1,  5.5,  4.6,  3.3,  1.9,  1.0, 0.5, 0.3, 0.2],
  5:   [12.0, 9.3,  7.8,  5.5,  3.2,  1.8, 0.8, 0.5, 0.3],
  10:  [16.2, 12.6, 10.5, 7.4,  4.3,  2.4, 1.1, 0.7, 0.4],
  25:  [21.9, 17.0, 14.2, 10.0, 5.8,  3.2, 1.5, 0.9, 0.6],
  50:  [26.2, 20.3, 16.9, 11.9, 7.0,  3.8, 1.8, 1.1, 0.7],
  100: [30.5, 23.7, 19.7, 13.9, 8.1,  4.5, 2.1, 1.3, 0.8],
};

// ─── IDF interpolation (log-log) ───────────────────────────────────────────

export function interpolateIntensity(duration_min: number, returnPeriod: number): number {
  const intensities = IDF_INTENSITIES[returnPeriod];
  if (!intensities) return 0;
  if (duration_min <= IDF_DURATIONS[0]) return intensities[0];
  if (duration_min >= IDF_DURATIONS[IDF_DURATIONS.length - 1]) return intensities[intensities.length - 1];
  for (let j = 0; j < IDF_DURATIONS.length - 1; j++) {
    if (duration_min >= IDF_DURATIONS[j] && duration_min <= IDF_DURATIONS[j + 1]) {
      const logT  = Math.log(duration_min);
      const logT1 = Math.log(IDF_DURATIONS[j]);
      const logT2 = Math.log(IDF_DURATIONS[j + 1]);
      const logI1 = Math.log(intensities[j]);
      const logI2 = Math.log(intensities[j + 1]);
      const frac  = (logT - logT1) / (logT2 - logT1);
      return Math.exp(logI1 + frac * (logI2 - logI1));
    }
  }
  return intensities[0];
}

// ─── Runoff coefficients ────────────────────────────────────────────────────

export const C_ROOF            = 0.95;
export const C_PAVEMENT        = 0.90;
export const C_LAWN            = 0.25;
export const C_GREEN_ROOF      = 0.40;
export const C_PERMEABLE_PAVE  = 0.30;
export const C_PRE_DEV         = 0.25; // undeveloped prairie/grassland on clay — Edmonton baseline

// ─── Pipe sizing (Manning's equation, full-pipe flow) ───────────────────────

export const STANDARD_PIPES = [75, 100, 125, 150, 200, 250, 300, 375, 450, 525, 600, 750, 900, 1050, 1200];

export function calcPipeDiameter(Q_m3s: number, n = 0.013, S = 0.005): number {
  if (Q_m3s <= 0) return 0;
  return Math.pow((Q_m3s * n * 10.079) / (Math.PI * Math.sqrt(S)), 0.375) * 1000;
}

export function roundUpPipe(d_mm: number): number {
  return STANDARD_PIPES.find(p => p >= d_mm) ?? STANDARD_PIPES[STANDARD_PIPES.length - 1];
}

// ─── Detention sizing (Modified Rational Method) ────────────────────────────
// Iterates over IDF durations to find the critical duration that maximises
// the volume difference between post-dev inflow and pre-dev release rate.

export interface DetentionResult {
  critDur: number;
  volume_m3: number;
  release_Ls: number;
  inflow_Ls: number;
}

export function calcDetention(
  C_post: number, C_pre: number, area_ha: number, tc: number,
  returnPeriod: number,
): DetentionResult {
  const durations = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 360, 720, 1440];
  let maxVol = 0, critDur = tc, bestRelease = 0, bestInflow = 0;
  const Q_release = (C_pre * interpolateIntensity(tc, returnPeriod) * area_ha) / 360;
  for (const d of durations) {
    if (d < tc) continue;
    const i = interpolateIntensity(d, returnPeriod);
    const Q_in = (C_post * i * area_ha) / 360;
    const vol_in = Q_in * d * 60;
    const vol_out = Q_release * d * 60;
    const storage = vol_in - vol_out;
    if (storage > maxVol) {
      maxVol = storage;
      critDur = d;
      bestRelease = Q_release;
      bestInflow = Q_in;
    }
  }
  return { critDur, volume_m3: Math.max(0, maxVol), release_Ls: bestRelease * 1000, inflow_Ls: bestInflow * 1000 };
}

// ─── Kirpich formula (tc in minutes, clamped to [5, 30]) ────────────────────

export function calculateTc(lotArea: number, slope: number): number {
  const flowLength = Math.sqrt(lotArea) * 1.4;
  const tc = 0.0195 * Math.pow(flowLength, 0.77) * Math.pow(slope, -0.385);
  return Math.max(5, Math.min(tc, 30));
}

// ─── Haversine distance (km) ────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Soil types ─────────────────────────────────────────────────────────────

export const SOIL_INFILTRATION = {
  sand:      { label: "Sand",                rate: 120, desc: "High infiltration — sandy river valley deposits" },
  sandyLoam: { label: "Sandy Loam",          rate: 30,  desc: "Moderate-high — mixed alluvial soils" },
  siltLoam:  { label: "Silt Loam",           rate: 12,  desc: "Moderate — typical lowland areas" },
  clayLoam:  { label: "Clay Loam",           rate: 6,   desc: "Low — glacial lacustrine deposits" },
  clay:      { label: "Clay (Glacial Till)",  rate: 2,   desc: "Very low — typical Edmonton uplands" },
} as const;

export type SoilType = keyof typeof SOIL_INFILTRATION;

// Green-Ampt soil parameters — Rawls, Brakensiek & Miller (1983)
export const GA_SOILS = {
  sand:           { label: "Sand",               Ks: 117.8, psi: 49.5,  theta_e: 0.437, theta_i: 0.10 },
  loamySand:      { label: "Loamy Sand",         Ks: 29.9,  psi: 61.3,  theta_e: 0.437, theta_i: 0.12 },
  sandyLoam:      { label: "Sandy Loam",         Ks: 10.9,  psi: 110.1, theta_e: 0.453, theta_i: 0.15 },
  loam:           { label: "Loam",               Ks: 3.4,   psi: 88.9,  theta_e: 0.463, theta_i: 0.20 },
  siltLoam:       { label: "Silt Loam",          Ks: 6.5,   psi: 166.8, theta_e: 0.501, theta_i: 0.22 },
  sandyClayLoam:  { label: "Sandy Clay Loam",    Ks: 1.5,   psi: 218.5, theta_e: 0.398, theta_i: 0.20 },
  clayLoam:       { label: "Clay Loam",          Ks: 1.0,   psi: 208.8, theta_e: 0.464, theta_i: 0.25 },
  siltyClayLoam:  { label: "Silty Clay Loam",    Ks: 1.0,   psi: 273.0, theta_e: 0.471, theta_i: 0.25 },
  clay:           { label: "Clay (Glacial Till)", Ks: 0.3,   psi: 316.3, theta_e: 0.475, theta_i: 0.30 },
} as const;

export type GASoilKey = keyof typeof GA_SOILS;

// ─── SCS Type II 24-hr distribution ─────────────────────────────────────────

export const SCS_TYPE_II: [number, number][] = [
  [0,0],[.042,.01],[.083,.022],[.125,.035],[.167,.048],[.208,.063],
  [.250,.080],[.292,.098],[.333,.120],[.375,.147],[.417,.181],
  [.438,.204],[.458,.235],[.479,.283],[.489,.357],[.500,.663],
  [.521,.735],[.542,.772],[.563,.799],[.583,.820],[.625,.850],
  [.667,.880],[.708,.916],[.750,.936],[.833,.952],[.917,.976],[1,1],
];

export function interpolateSCS(tFrac: number): number {
  if (tFrac <= 0) return 0;
  if (tFrac >= 1) return 1;
  for (let i = 0; i < SCS_TYPE_II.length - 1; i++) {
    const [t1, p1] = SCS_TYPE_II[i], [t2, p2] = SCS_TYPE_II[i + 1];
    if (tFrac >= t1 && tFrac <= t2) return p1 + (tFrac - t1) / (t2 - t1) * (p2 - p1);
  }
  return 1;
}

// ─── Slope options for UI ───────────────────────────────────────────────────

export const SLOPE_OPTIONS = [
  { value: 0.005, label: "0.5% — Very flat (river valley floodplain)" },
  { value: 0.01,  label: "1% — Flat (lowland residential)" },
  { value: 0.02,  label: "2% — Moderate (typical Edmonton uplands)" },
  { value: 0.04,  label: "4% — Moderate-steep (hillside lots)" },
  { value: 0.08,  label: "8% — Steep (river valley escarpment)" },
];

// ─── Gumbel frequency analysis (Method of Moments) ─────────────────────────

export interface GumbelResult {
  mu: number;
  beta: number;
  nYears: number;
  yearRange: [number, number];
  annualMaxima: { year: number; max_mm: number }[];
  returnPeriodDepths: Record<number, number>;
}

export function gumbelFit(annualMaxima: { year: number; max_mm: number }[]): GumbelResult | null {
  if (annualMaxima.length < 10) return null;
  const vals = annualMaxima.map(a => a.max_mm);
  const n = vals.length;
  const mean = vals.reduce((s, x) => s + x, 0) / n;
  const variance = vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev <= 0) return null;

  const beta = stdDev * Math.sqrt(6) / Math.PI;
  const mu = mean - 0.5772 * beta;

  const returnPeriodDepths: Record<number, number> = {};
  for (const T of IDF_RETURN_PERIODS) {
    returnPeriodDepths[T] = Math.max(0, mu - beta * Math.log(-Math.log(1 - 1 / T)));
  }

  const years = annualMaxima.map(a => a.year);
  return {
    mu, beta, nYears: n,
    yearRange: [Math.min(...years), Math.max(...years)],
    annualMaxima,
    returnPeriodDepths,
  };
}

// ─── Temporal disaggregation ratios ─────────────────────────────────────────
// Depth ratios (P_duration / P_24hr), averaged across return periods.
// Derived from ECCC published IDF Table 2a for Edmonton Blatchford (Stn 3012209).
// These ratios are characteristic of Alberta prairie convective storms.

export const DISAGG_RATIOS: Record<number, number> = {
  5:    0.131,
  10:   0.201,
  15:   0.246,
  30:   0.320,
  60:   0.385,
  120:  0.462,
  360:  0.660,
  720:  0.803,
  1440: 1.000,
};

export interface LiveIDFTable {
  stationId: string;
  stationName: string;
  nYears: number;
  yearRange: [number, number];
  intensities: Record<number, number[]>;
  gumbel: GumbelResult;
}

export function deriveIDFFromGumbel(gumbel: GumbelResult, stationId: string, stationName: string): LiveIDFTable {
  const intensities: Record<number, number[]> = {};
  for (const rp of IDF_RETURN_PERIODS) {
    const depth24 = gumbel.returnPeriodDepths[rp];
    intensities[rp] = IDF_DURATIONS.map(dur => {
      const ratio = DISAGG_RATIOS[dur] ?? 1;
      const depth_mm = depth24 * ratio;
      return +(depth_mm / (dur / 60)).toFixed(1);
    });
  }
  return {
    stationId, stationName,
    nYears: gumbel.nYears,
    yearRange: gumbel.yearRange,
    intensities,
    gumbel,
  };
}

// Interpolation using a live IDF table (same log-log method)
export function interpolateFromTable(
  table: Record<number, number[]>, duration_min: number, returnPeriod: number,
): number {
  const intensities = table[returnPeriod];
  if (!intensities) return 0;
  if (duration_min <= IDF_DURATIONS[0]) return intensities[0];
  if (duration_min >= IDF_DURATIONS[IDF_DURATIONS.length - 1]) return intensities[intensities.length - 1];
  for (let j = 0; j < IDF_DURATIONS.length - 1; j++) {
    if (duration_min >= IDF_DURATIONS[j] && duration_min <= IDF_DURATIONS[j + 1]) {
      const logT  = Math.log(duration_min);
      const logT1 = Math.log(IDF_DURATIONS[j]);
      const logT2 = Math.log(IDF_DURATIONS[j + 1]);
      const logI1 = Math.log(intensities[j]);
      const logI2 = Math.log(intensities[j + 1]);
      const frac  = (logT - logT1) / (logT2 - logT1);
      return Math.exp(logI1 + frac * (logI2 - logI1));
    }
  }
  return intensities[0];
}
