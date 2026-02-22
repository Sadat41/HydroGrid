<div align="center">

# HydroGrid

**Real-Time Hydrology & Infrastructure Analysis Platform**

<br>

![HydroGrid Demo](Previews/Demo.gif)

<br>

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat&logo=vite&logoColor=white)](https://vite.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?style=flat&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Three.js](https://img.shields.io/badge/Three.js-r183-000000?style=flat&logo=three.js&logoColor=white)](https://threejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)
[![HackED 2026](https://img.shields.io/badge/HackED-2026-orange?style=flat)](https://hacked.compeclub.com/)

[Live Demo](https://hydrogrid.app) · [Features](#features) · [Architecture](#architecture) · [Installation](#installation) · [Tech Stack](#tech-stack) · [Data Sources](#data-sources) · [Team](#team)

</div>

---

## Overview

HydroGrid is an interactive geospatial platform that unifies municipal open data, real-time weather information, and hydrology models into a single browser-based tool. Built for the **HackED 2026** hackathon at the University of Alberta, it is designed to help urban planners and civil engineers make informed decisions about flood risk, stormwater drainage, and infrastructure development in the Edmonton and Alberta region.

Everything runs client-side. There is no backend server -- the app fetches data directly from public APIs and performs all analysis in the browser. IDF (Intensity-Duration-Frequency) curves are derived live from ECCC historical precipitation records using Gumbel frequency analysis rather than relying on hardcoded tables.

---

## Features

### Map Layers
- 20+ toggleable GeoJSON and point layers covering infrastructure, environment, flood hazard, and energy
- 5 basemap options: Dark (CARTO), Light (CARTO Voyager), Satellite (Esri), Terrain (OpenTopoMap), Street (OpenStreetMap)
- 3 UI themes: Terminal (green-on-black), Dark (navy blue), Accessible (WCAG AAA light)
- Dynamic layer styling that adapts to the selected basemap

### Flood Hazard
- Alberta flood mapping overlays (100-year, 200-year, 500-year return periods)
- Sourced from Alberta Environment ArcGIS FeatureServer

<div align="center">

**Flood Hazard Mapping**

<img src="Previews/Flood Hazard Preview.png" alt="Flood Hazard Preview" width="80%">

</div>

### Precipitation Explorer
- Browse 1,500+ Environment Canada climate stations across Alberta
- Query daily, monthly, and normal precipitation data with custom date ranges
- Interactive timeseries charts (bar, line, area) via Recharts
- Snowfall normals and climate station metadata

### Hydrometric (River Flow)
- Real-time and historical river discharge data from Environment Canada hydrometric stations
- Flow timeseries visualization with station-level detail

### Property Lookup
- Search any Edmonton address against the city assessment database
- Returns assessed value, zoning, lot size, building area, year built, garage type, tax class
- Cross-references nearby facilities (recreation centres, LRT stations, schools)
- Instant fly-to on the map with property marker

<div align="center">

**Property Assessment**

<img src="Previews/Property Assessment .png" alt="Property Assessment" width="80%">

</div>

### Site Intelligence
- Automatic flood zone check (floodway, 100-yr, 200-yr, 500-yr) via Alberta Flood Mapping ArcGIS
- Nearest storm pipes, development permits, and stormwater facilities from Edmonton Open Data
- Nearest ECCC climate and hydrometric stations with precipitation normals

### Drainage Design (Engineering)
- Select a property or enter site parameters manually
- **Live IDF derivation** — fetches historical daily precipitation from the nearest ECCC climate station, performs **Gumbel frequency analysis** (Method of Moments) on annual maximums, and applies **temporal disaggregation ratios** to generate a complete IDF curve. No hardcoded rainfall values — all derived from real precipitation records at runtime
- Falls back to verified ECCC published IDF data (Station 3012209, Edmonton Blatchford, 75 years of record) if the live fetch fails
- Applies the **Rational Method** (Q = CiA) for peak flow estimation
- **Pre-development vs post-development** runoff comparison with detention sizing via **Modified Rational Method**
- **Manning's equation** pipe sizing for full-pipe flow
- **IDF curves** for Edmonton design storms (2-yr through 100-yr return periods)
- **Low-Impact Development (LID) simulator** — toggle rain gardens, permeable pavement, green roofs, bioswales and see runoff reduction and detention savings in real time

### Storm Simulation
- Full **SCS Type II 24-hr** hyetograph-based storm simulation
- **Green-Ampt infiltration model** with 9 soil types (Rawls, Brakensiek & Miller, 1983)
- Pre-development vs post-development runoff comparison
- Detention volume required over time, infiltration capacity vs. rainfall charts
- Cumulative water balance breakdown (precipitation, runoff, infiltration)

### Cost Analysis
- Unit-cost estimation for storm pipes, catch basins, manholes, grading, erosion control, and LID features
- Fetches **nearest storm pipe distance** from Edmonton Open Data API to estimate connection costs
- Site preparation, municipal fees (storm connection, building permit), and LID cost categories
- **With vs. without LID** total cost comparison
- Material selection (PVC, HDPE, Concrete) with pipe catalogue pricing
- Engineering (15%) and contingency (10%) factors
- Per-unit metrics ($/m² lot, $/m² impervious, $/m³ detention)

<div align="center">

**Cost Analysis**

<img src="Previews/Cost Analysis.png" alt="Cost Analysis" width="80%">

</div>

---

## Architecture

```
                           DATA SOURCES
          ┌────────────────────┬────────────────────┬──────────────────┐
          │                    │                    │                  │
          v                    v                    v                  v
 ┌─────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌─────────────┐
 │ Edmonton Open   │  │ Environment    │  │ Alberta Flood  │  │ Tile CDNs   │
 │ Data Portal     │  │ Canada         │  │ ArcGIS Server  │  │             │
 │                 │  │                │  │                │  │ CARTO       │
 │ data.edmonton.  │  │ api.weather.   │  │ services.      │  │ OSM         │
 │ ca/resource     │  │ gc.ca          │  │ arcgis.com     │  │ Esri        │
 │                 │  │                │  │                │  │ OpenTopoMap │
 │ Properties      │  │ Climate        │  │ 100yr flood    │  │             │
 │ Permits         │  │ stations       │  │ 200yr flood    │  │ Basemap     │
 │ Drainage        │  │ Precipitation  │  │ 500yr flood    │  │ tiles       │
 │ Air quality     │  │ River flow     │  │                │  │ (raster)    │
 │ Recreation      │  │ Snowfall       │  │                │  │             │
 └────────┬────────┘  └───────┬────────┘  └───────┬────────┘  └──────┬──────┘
          │                   │                    │                   │
          └───────────────────┴────────────────────┴───────────────────┘
                                       │
                                 REST / Fetch
                                       │
                                       v
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                         FRONTEND (client-side)                         │
 │                                                                        │
 │  React 19 + TypeScript + Vite                                          │
 │                                                                        │
 │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  ┌──────────────┐  │
 │  │ Leaflet.js   │  │ Recharts     │  │ Three.js  │  │ Hydrology    │  │
 │  │              │  │              │  │           │  │ Engine       │  │
 │  │ Map layers   │  │ Precip.      │  │ 3D globe  │  │              │  │
 │  │ GeoJSON      │  │ charts       │  │ landing   │  │ Rational     │  │
 │  │ Basemaps     │  │ Flow data    │  │ page      │  │ Method       │  │
 │  │ Markers      │  │ Cost graphs  │  │           │  │ Manning's    │  │
 │  │ Popups       │  │              │  │           │  │ Gumbel IDF   │  │
 │  └──────────────┘  └──────────────┘  └───────────┘  │ Green-Ampt   │  │
 │                                                      │ SCS Type II  │  │
 │                                                      └──────────────┘  │
 │                                                                        │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │
                              Analysis Output
                                     │
     ┌──────────────┬──────────────┬──────────┴──────────┬──────────────┐
     v              v              v                     v              v
┌──────────┐ ┌──────────────┐ ┌───────────┐  ┌──────────────┐  ┌──────────────┐
│ Site     │ │ Flood Risk   │ │ Drainage  │  │ Storm        │  │ Cost         │
│ Report   │ │ Mapping      │ │ Design    │  │ Simulation   │  │ Estimation   │
│          │ │              │ │           │  │              │  │              │
│ Nearby   │ │ Multi-return │ │ Pipe      │  │ Hyetograph   │  │ Pipes,       │
│ infra,   │ │ period zones │ │ sizing    │  │ Green-Ampt   │  │ catch basins │
│ climate  │ │ on map       │ │ Gumbel    │  │ runoff model │  │ LID, grading │
│ context  │ │              │ │ IDF, LID  │  │ water balance│  │ with/no LID  │
└──────────┘ └──────────────┘ └───────────┘  └──────────────┘  └──────────────┘
```

---

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (included with Node.js)

### Clone and Install

```bash
git clone https://github.com/Sadat41/HydroGrid.git
cd HydroGrid/app
npm install
```

### Development Server

```bash
npm run dev
```

Opens at `http://localhost:5173`. Vite provides hot module replacement -- changes reflect instantly.

### Production Build

```bash
npm run build
```

Outputs optimised static files to `app/dist/`. The build can be served from any static hosting provider.

### Preview Production Build Locally

```bash
npm run preview
```

### Deploy to GitHub Pages

```bash
npm run deploy
```

Builds the project and pushes the `dist/` folder to the `gh-pages` branch.

---

## Tech Stack

<div align="center">

![React](https://img.shields.io/badge/REACT_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TYPESCRIPT_5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/VITE_7-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Leaflet](https://img.shields.io/badge/LEAFLET_1.9-199900?style=for-the-badge&logo=leaflet&logoColor=white)
![Three.js](https://img.shields.io/badge/THREE.JS_r183-000000?style=for-the-badge&logo=three.js&logoColor=white)
![Recharts](https://img.shields.io/badge/RECHARTS_3-FF6384?style=for-the-badge&logo=react&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GITHUB_PAGES-222222?style=for-the-badge&logo=github-pages&logoColor=white)

</div>

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **UI Framework** | React 19, TypeScript | Component architecture, type safety |
| **Build Tool** | Vite 7 | Development server, HMR, production bundling |
| **Mapping** | Leaflet 1.9, React-Leaflet 5 | Interactive map, GeoJSON layers, tile rendering |
| **Basemaps** | OpenStreetMap, CARTO, Esri, OpenTopoMap | Dark, light, satellite, terrain, street tile layers |
| **Charts** | Recharts 3 | Precipitation timeseries, flow charts, cost breakdowns |
| **3D Globe** | Three.js r183, React Three Fiber 9 | Landing page Earth with NASA Blue Marble textures |
| **Styling** | Vanilla CSS | 3 switchable themes, no external CSS framework |
| **Deployment** | GitHub Pages (gh-pages) | Static hosting of production build |

**Frontend:** React + TypeScript with Vite for bundling. No backend server required.
**State Management:** React hooks and localStorage persistence for theme/basemap preferences.
**Charts & Visualization:** Recharts for all bar, line, area, and pie charts.
**Mapping:** Leaflet.js handles all interactive map rendering, GeoJSON overlay management, marker clustering, and popup display. Tile layers served from CARTO, OpenStreetMap, Esri, and OpenTopoMap CDNs.
**Hydrology Engine:** Shared `utils/hydrology.ts` module provides Rational Method, Manning's equation, Kirpich time of concentration, Modified Rational Method detention sizing, Gumbel frequency analysis, temporal disaggregation, Green-Ampt infiltration, and SCS Type II distribution. The `useStationIDF` hook fetches live ECCC daily precipitation, performs Gumbel fitting on annual maximums, and derives a full IDF table at runtime — falling back to a verified static ECCC table if needed.
**3D Landing Page:** Three.js globe with NASA Blue Marble colour texture, bump map, specular ocean map, cloud layer, and custom atmosphere shader. Canvas unmounts on scroll for zero GPU overhead on other sections.

---

## Data Sources

> **All data is fetched at runtime from public APIs. No data is bundled with the application. No API keys are required — every endpoint used is open and free.**

---

### 1. City of Edmonton Open Data Portal (Socrata)

**Base URL:** `https://data.edmonton.ca/resource`
**Protocol:** Socrata Open Data API (SODA) — REST/JSON with SoQL query language
**Documentation:** [https://dev.socrata.com/](https://dev.socrata.com/) · [https://data.edmonton.ca](https://data.edmonton.ca)

| Dataset | Socrata ID | API Endpoint | Used In | Description |
|---------|-----------|--------------|---------|-------------|
| Neighbourhood Boundaries | `xu6q-xcmj` | `/xu6q-xcmj.json` | Map Layers (GeoJSON overlay) | Official 2019 neighbourhood boundary polygons for Edmonton |
| Building Permits | `24uj-dj8v` | `/24uj-dj8v.json` | Map Layers (point layer) | Recent building permits showing construction activity, type, value, and location |
| Property Assessments | `q7d6-ambg` | `/q7d6-ambg.json` | Map Layers, Property Lookup | Assessed property values, tax class, ward, and neighbourhood |
| Property Details | `dkk9-cj3x` | `/dkk9-cj3x.json` | Map Layers, Property Lookup, Engineering View | Lot size (m²), building area, zoning, year built, legal description — used for Rational Method site input |
| Subdivision Applications | `5mh4-z7dk` | `/5mh4-z7dk.json` | Map Layers (polygon overlay) | Residential subdivision applications in mature neighbourhoods |
| LRT Stations | `fhxi-cnhe` | `/fhxi-cnhe.json` | Map Layers (point layer), Property Lookup (nearby facilities) | All 36 LRT stations with stop names and numbers |
| Traffic Disruptions | `k4tx-5k8p` | `/k4tx-5k8p.json` | Map Layers (point layer) | Active road closures, construction, and travel delays |
| Recreation Facilities | `nz3t-vyg3` | `/nz3t-vyg3.json` | Map Layers (point layer), Property Lookup (nearby facilities) | City-owned recreation facilities including pools, arenas, community centres |
| Stormwater Facilities | `kiu8-nsmp` | `/kiu8-nsmp.json` | Map Layers (polygon overlay), Property Lookup (nearby facilities) | Storm water management ponds (wet/dry) from EPCOR and City drainage |
| Air Quality Stations | `44dx-d5qn` | `/44dx-d5qn.json` | Map Layers (point layer) | Air quality monitoring stations with daily readings from Alberta Capital Airshed |
| Water Filling Stations | `dj78-t8ab` | `/dj78-t8ab.json` | Map Layers (point layer) | Seasonal and year-round public water bottle filling stations |
| Drainage Pipes | `bh8y-pn5j` | `/bh8y-pn5j.json` | Drainage & Water tab | 133,000+ drainage pipe segments (Storm, Sanitary, Combined, Fnd Drain, Water) with geometry, type, and construction year |
| Manholes | `6waz-yxqq` | `/6waz-yxqq.json` | Drainage & Water tab | 106,000+ manhole locations with type, construction year, road name, and coordinates |

**Query techniques used:**
- `$select` — column projection to minimise payload size
- `$where` — spatial and attribute filtering (e.g. `latitude IS NOT NULL`, bounding-box queries for viewport loading)
- `$group` / `count(*)` — server-side aggregation for statistics (pipe/manhole counts by type and year)
- `$limit` / `$offset` — pagination for batch-fetching large datasets (pipes fetched in 50,000-record batches)
- `$order` — sorting by date, value, or Socrata row ID

---

### 2. Environment and Climate Change Canada (ECCC) — Meteorological Service

**Base URL:** `https://api.weather.gc.ca`
**Protocol:** OGC API — Features (OAFeat) — REST/GeoJSON
**Documentation:** [https://eccc-msc.github.io/open-data/msc-geomet/web-services_en/](https://eccc-msc.github.io/open-data/msc-geomet/web-services_en/)

| Collection | API Endpoint | Used In | Description |
|-----------|--------------|---------|-------------|
| Climate Stations | `/collections/climate-stations/items` | Map Layers, Precipitation Explorer | 1,500+ weather stations across Alberta — location, type, elevation, data period |
| Climate Daily | `/collections/climate-daily/items` | Map Layers, Precipitation Explorer, **IDF Derivation** | Daily precipitation, rain, snow, snow depth, and temperature observations. Top 500 wettest days (sorted descending) are used for Gumbel frequency analysis to derive IDF curves at runtime. |
| Climate Monthly | `/collections/climate-monthly/items` | Map Layers, Precipitation Explorer | Monthly precipitation totals, snowfall, temperature summaries |
| Climate Normals (Precipitation) | `/collections/climate-normals/items` (NORMAL_ID=56) | Map Layers | 30-year average annual precipitation depth (mm), 1981–2010 baseline |
| Climate Normals (Snowfall) | `/collections/climate-normals/items` (NORMAL_ID=54) | Map Layers | 30-year average annual snowfall depth (cm), 1981–2010 baseline |
| Hydrometric Stations | `/collections/hydrometric-stations/items` | Map Layers, Hydrometric View | River/lake water level and flow monitoring stations across Alberta |
| Hydrometric Monthly Mean | `/collections/hydrometric-monthly-mean/items` | Hydrometric View | Monthly mean river discharge (m³/s) time series |
| Hydrometric Annual Peaks | `/collections/hydrometric-annual-peaks/items` | Hydrometric View | Annual peak flow records for flood frequency analysis |

**Query parameters used:**
- `f=json` — GeoJSON response format
- `PROVINCE_CODE=AB` / `PROV_TERR_STATE_LOC=AB` — filter to Alberta stations
- `CLIMATE_IDENTIFIER` / `STATION_NUMBER` — station-specific queries
- `datetime=YYYY-MM-DD/YYYY-MM-DD` — date range filtering
- `sortby` — chronological ordering, or `-TOTAL_PRECIPITATION` for descending precipitation sort (IDF derivation)
- `limit` — record count limit (e.g. `limit=500` for top-N wettest days)
- `properties` — field selection for payload reduction

---

### 3. Alberta Flood Mapping — ArcGIS FeatureServer

**Base URL:** `https://services.arcgis.com/wjcPoefzjpzCgffS/arcgis/rest/services/AlbertaFloodMapping_gdb/FeatureServer`
**Protocol:** Esri ArcGIS REST API — FeatureServer with JSON/GeoJSON output
**Documentation:** [https://floods.alberta.ca](https://floods.alberta.ca) · [ArcGIS REST API Reference](https://developers.arcgis.com/rest/services-reference/enterprise/feature-service.htm)

| Layer ID | API Endpoint | Used In | Description |
|----------|--------------|---------|-------------|
| Layer 0 | `/FeatureServer/0` | Map Layers (Flood Hazard Areas) | Provincial flood hazard zones — floodway and flood fringe delineation |
| Layer 11 | `/FeatureServer/11` | Map Layers (100-Year Flood) | 1:100 year return period flood inundation extent (1% annual probability) |
| Layer 12 | `/FeatureServer/12` | Map Layers (200-Year Flood) | 1:200 year return period flood inundation extent (0.5% annual probability) |
| Layer 14 | `/FeatureServer/14` | Map Layers (500-Year Flood) | 1:500 year return period flood inundation extent (0.2% annual probability) |

**Query parameters used:**
- `f=geojson` — GeoJSON output format
- `where=1=1` — retrieve all features
- `outFields=*` — return all attribute columns
- `resultRecordCount` — pagination for large polygon datasets
- `geometry` / `geometryType` / `spatialRel` — spatial queries

---

### 4. Basemap Tile Providers

| Provider | Tile URL | Used For | License |
|----------|----------|----------|---------|
| **CARTO** (Dark) | `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` | Default dark basemap | [CARTO Attribution](https://carto.com/attributions) |
| **CARTO** (Voyager) | `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png` | Light basemap | [CARTO Attribution](https://carto.com/attributions) |
| **CARTO** (Labels) | `https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png` | Label overlay on satellite | [CARTO Attribution](https://carto.com/attributions) |
| **Esri** (World Imagery) | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Satellite basemap | [Esri Attribution](https://www.esri.com/) |
| **OpenTopoMap** | `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` | Terrain basemap | [OpenTopoMap](https://opentopomap.org) (CC-BY-SA) |
| **OpenStreetMap** | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Street basemap | [ODbL](https://www.openstreetmap.org/copyright) |

---

### 5. Reference Data & Derived Analysis

| Source | Used In | Description |
|--------|---------|-------------|
| **ECCC Daily Precipitation → Live IDF** | Engineering View (Drainage Design, Storm Simulation, Cost Analysis) | IDF curves are **derived at runtime** from ECCC historical daily precipitation data. The app finds the nearest climate station, fetches its top 500 wettest days via the `climate-daily` API (sorted by descending `TOTAL_PRECIPITATION`), extracts annual maximum daily precipitation, fits a **Gumbel distribution** (Method of Moments), and applies **temporal disaggregation ratios** to generate sub-daily intensities. Ratios were calibrated against ECCC Engineering Climate Datasets v3.30, Station 3012209 (Edmonton Blatchford, 75 years 1914–2021). Fallback: static ECCC published IDF table. |
| **ECCC Engineering Climate Datasets** | Fallback IDF, temporal disaggregation ratios | [ECCC IDF v3.30 (2022-10-31)](https://collaboration.cmc.ec.gc.ca/cmc/climate/Engineer_Climate/IDF/idf_v3-30_2022_10_31/IDF_Files_Fichiers/AB.zip) — Station 3012209, Edmonton Blatchford. Used as fallback and to derive the duration-depth ratios for temporal disaggregation. |
| **NASA Blue Marble** | Landing Page (3D Globe) | Earth colour texture (`earth_8k.jpg`), bump map, specular ocean map, and cloud layer. Bundled as static assets from [NASA Visible Earth](https://visibleearth.nasa.gov/collection/1484/blue-marble). |

---

### Summary

| Provider | # of Endpoints | Data Format | Auth Required |
|----------|---------------|-------------|---------------|
| City of Edmonton Open Data | 13 datasets | JSON (Socrata) | No |
| Environment Canada (ECCC) | 8 collections | GeoJSON (OGC API) | No |
| Alberta Flood Mapping (ArcGIS) | 4 layers | GeoJSON (ArcGIS REST) | No |
| Basemap Tile CDNs | 6 tile layers | Raster PNG tiles | No |
| **Total** | **31 unique data endpoints** | | |

All API calls are made client-side using the browser `fetch()` API. There is no backend server, no proxy, and no API keys. Every endpoint is publicly accessible.

---

## Project Structure

```
HydroGrid/
├── README.md
└── app/
    ├── public/                     Static assets (favicon, logo)
    ├── src/
    │   ├── assets/                 Earth textures, logo SVG
    │   ├── components/
    │   │   ├── LandingPage.tsx     3D globe landing with scroll sections
    │   │   ├── MapView.tsx         Main Leaflet map with layer rendering
    │   │   ├── Sidebar.tsx         Layer toggle sidebar
    │   │   ├── BasemapSwitcher.tsx Basemap selection dropdown
    │   │   ├── PropertyToolsView.tsx  Property search and detail panel
    │   │   ├── PrecipitationView.tsx  Climate station explorer + charts
    │   │   ├── HydrometricView.tsx    River flow data + charts
    │   │   ├── EngineeringView.tsx    Drainage design entry point
    │   │   ├── SiteReport.tsx         Site intelligence (flood, infra, climate)
    │   │   ├── DrainageCalculator.tsx Rational Method, IDF, LID, detention
    │   │   ├── StormSimulationView.tsx Storm simulation (SCS Type II, Green-Ampt)
    │   │   ├── CostAnalysisView.tsx   Infrastructure cost estimation
    │   │   └── SiteInputPanel.tsx     Shared property/site input
    │   ├── config/
    │   │   ├── layers.ts           Layer definitions, API endpoints
    │   │   └── basemaps.ts         Basemap tile URLs and colour profiles
    │   ├── hooks/
    │   │   ├── useMapData.ts       Layer fetching and state management
    │   │   ├── usePropertySearch.ts Property API search logic
    │   │   └── useStationIDF.ts    Live IDF derivation (ECCC → Gumbel → IDF)
    │   ├── utils/
    │   │   └── hydrology.ts        Shared hydrology constants, IDF tables, Gumbel, Manning's, Rational Method
    │   ├── types/
    │   │   └── index.ts            Shared TypeScript interfaces
    │   ├── App.tsx                 Root component, routing, theme state
    │   ├── App.css                 All application styles (3 themes)
    │   ├── index.css               Base reset styles
    │   └── main.tsx                Entry point
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    └── eslint.config.js
```

---

## Browser Support

Tested on modern Chromium-based browsers (Chrome, Edge) and Firefox. Requires WebGL for the 3D landing page globe. The main application (map, charts, analysis) works without WebGL.

---

## Team

**Team Redacted** -- HackED 2026, University of Alberta

- Md Sadat Hossain
- Muhammed Ahmedtanov
- Kai Renschler

Department of Civil and Environmental Engineering.

---

## Acknowledgements

This project was built in under 48 hours with the help of [Cursor](https://cursor.com) and [Claude](https://anthropic.com). What would have taken weeks of manual development was possible in a single weekend thanks to AI-assisted coding. The architecture, 10+ API integrations, analysis engine, 3D landing page, and full deployment were all completed during the HackED 2026 hackathon.

---

## License

MIT

---

*Built for HackED 2026 at the University of Alberta.*
