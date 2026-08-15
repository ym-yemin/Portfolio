---
layout: project
title: "Wind Resource Analysis Using Japanese Meteorological Data"
date: 2026-07-01
category: "Wind Energy Â· Data Analysis"
description: "Building a Japan-wide air-density screening tool from JMA monthly observations, Python data pipelines and regression modelling."
tools:
  - Python
  - JMA
  - Pandas
  - NumPy
  - Beautiful Soup
  - Regression
status: "Research Project"
permalink: /projects/jma-air-density-estimator/
featured_image: /assets/images/projects/jma-air-density-regression.png
---

## Overview

Japan's dense meteorological observation network is a valuable independent reference for wind-resource work. Wind speed and direction are the obvious variables, but pressure, temperature and humidity are also important because they determine air densityâ€”and therefore the kinetic power available in the wind.

I developed this project to answer a practical early-stage question:

> **Can I estimate a representative long-term air density for a location in Japan using only its latitude and elevation?**

The result is an end-to-end Python workflow that:

1. discovers observation stations from the Japan Meteorological Agency (JMA) station maps;
2. collects monthly pressure, temperature and humidity observations;
3. calculates humid-air density for every station-month;
4. fits a transparent elevation-and-latitude regression model; and
5. exposes the fitted model as an interactive screening tool on this page.

The estimator provides a **long-term climatological value**, not the air density at a particular hour. It is intended for preliminary wind-resource screening, measurement planning and engineering reasonableness checks.

## Project objectives

- Build a reproducible catalogue of JMA observation stations.
- Assemble a consistent monthly dataset across Japan.
- Preserve station coordinates and elevation alongside the meteorological variables.
- Calculate moist-air density from physical inputs rather than assuming a universal constant.
- Quantify the effects of elevation and Japan's northâ€“south climate gradient.
- Package the fitted relationship as a simple tool for project screening.

## Workflow

```text
JMA station maps
      â†“
Station catalogue: ID, type, latitude, longitude, elevation
      â†“
Monthly pressure, temperature and humidity: 2006â€“2025
      â†“
Humid-air density for each station-month
      â†“
Long-term station means
      â†“
Elevation model + latitude residual correction
      â†“
Interactive latitude/elevation estimator
```

## 1. Building the station catalogue

JMA's [historical weather-data selector](https://www.data.jma.go.jp/stats/etrn/) uses regional image maps. The underlying HTML contains the identifiers and metadata needed to turn the visual map into a structured station catalogue.

The two key identifiers are:

- `prec_no`: JMA's regional code; and
- `block_no`: the observation-station code.

The station markup also provides the station name, latitude, longitude and elevation. The notebook follows the station-discovery idea outlined by [Seimao Sako](https://medium.com/@seimaosako/how-to-obtain-weather-data-at-locations-in-japan-12f478ec1b96), then adds geographic filtering, station typing and reusable metadata fields.

```python
import re
import time
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup

BASE = "https://www.data.jma.go.jp/stats/etrn"

session = requests.Session()
session.headers.update({
    "User-Agent": "JMA research project; contact: replace-with-your-email"
})


def soup_for(url):
    response = session.get(url, timeout=30)
    response.raise_for_status()
    response.encoding = "utf-8"
    return BeautifulSoup(response.text, "html.parser")


def build_station_catalogue(delay=1.0):
    root_url = (
        f"{BASE}/select/prefecture00.php"
        "?prec_no=&block_no=&year=&month=&day=&view="
    )
    root = soup_for(root_url)
    stations = []

    for region in root.select("area[href]"):
        href = region.get("href", "")
        match = re.search(r"prec_no=(\d+)", href)
        if not match:
            continue

        prec_no = match.group(1)
        region_page = soup_for(urljoin(root_url, href))

        for area in region_page.select("area[onmouseover]"):
            args = area["onmouseover"].split("'")
            if len(args) < 18:
                continue

            block_no = args[3]
            stations.append({
                "prec_no": prec_no,
                "block_no": block_no,
                "station": args[5],
                "station_type": "s1" if len(block_no) == 5 else "a1",
                "latitude": float(args[9]) + float(args[11]) / 60,
                "longitude": float(args[13]) + float(args[15]) / 60,
                "elevation_m": float(args[17]),
            })

        time.sleep(delay)

    stations = pd.DataFrame(stations).drop_duplicates()
    return stations[
        stations["latitude"].between(20, 46)
        & stations["longitude"].between(120, 150)
    ].reset_index(drop=True)
```

The saved notebook run retained **1,677 station records** after coordinate filtering. This catalogue becomes the common spatial index for every later step.

## 2. Collecting JMA monthly observations

The density calculation requires local pressure, mean temperature and relative humidity. These variables are available on the richer JMA `s1` surface-station pages. A monthly request is defined by the station keys and year:

```text
monthly_s1.php?prec_no={region}&block_no={station}&year={year}
```

Each response contains up to twelve monthly rows. The parser checks the table width before assigning names, selects only the fields needed for density, converts JMA symbols to missing values and attaches the station metadata.

```python
from io import StringIO

import numpy as np


def fetch_monthly_s1(station, year):
    url = (
        f"{BASE}/view/monthly_s1.php"
        f"?prec_no={station['prec_no']}"
        f"&block_no={station['block_no']}"
        f"&year={year}&month=&day=&view="
    )

    response = session.get(url, timeout=30)
    response.raise_for_status()
    response.encoding = "utf-8"
    raw_table = pd.read_html(StringIO(response.text))[0]

    # The current 'main elements' s1 table contains 28 columns.
    if raw_table.shape[1] != 28:
        raise ValueError(
            f"Unexpected JMA schema for {station['block_no']} in {year}: "
            f"{raw_table.shape[1]} columns"
        )

    monthly = pd.DataFrame({
        "month": raw_table.iloc[:12, 0],
        "local_pressure_hpa": raw_table.iloc[:12, 1],
        "mean_temperature_c": raw_table.iloc[:12, 7],
        "mean_relative_humidity_pct": raw_table.iloc[:12, 12],
    })

    for column in monthly.columns:
        monthly[column] = pd.to_numeric(monthly[column], errors="coerce")

    monthly["year"] = year
    monthly["station"] = station["station"]
    monthly["prec_no"] = station["prec_no"]
    monthly["block_no"] = station["block_no"]
    monthly["latitude"] = station["latitude"]
    monthly["longitude"] = station["longitude"]
    monthly["elevation_m"] = station["elevation_m"]

    return monthly.dropna(subset=[
        "local_pressure_hpa",
        "mean_temperature_c",
        "mean_relative_humidity_pct",
    ])
```

The collection loop is deliberately sequential. Raw responses are cached locally, completed station-years are recorded in a manifest, and failed or changed schemas stop the run rather than being silently accepted.

```python
monthly_frames = []
s1_stations = stations[stations["station_type"] == "s1"]

for station in s1_stations.to_dict("records"):
    for year in range(2006, 2026):
        try:
            monthly_frames.append(fetch_monthly_s1(station, year))
        except Exception as exc:
            record_failure(station, year, exc)
        time.sleep(1.0)

monthly = pd.concat(monthly_frames, ignore_index=True)
monthly.to_csv("jma_monthly_2006_2025.csv", index=False)
```

JMA asks users to avoid excessive automated access. In practice, I use delays, caching, limited retries and resumable jobs, and I do not parallelise requests against the public service.

### Resulting analysis dataset

| Item | Result |
| --- | ---: |
| Period | 2006â€“2025 |
| Surface stations used | 153 |
| Station-years requested | 3,060 |
| Station-month rows | 36,720 |
| Density inputs | Local pressure, temperature, relative humidity |

## 3. Calculating humid-air density

Air density is calculated for each station-month before aggregation. For moist air:

> **Ï = (p âˆ’ e) / (R<sub>d</sub>T) + e / (R<sub>v</sub>T)**

where *p* is local pressure, *e* is water-vapour partial pressure, *T* is absolute temperature, and *R*<sub>d</sub> and *R*<sub>v</sub> are the specific gas constants for dry air and water vapour.

```python
def humid_air_density(temp_c, pressure_hpa, rh_pct):
    temp_c = np.asarray(temp_c, dtype=float)
    pressure_hpa = np.asarray(pressure_hpa, dtype=float)
    rh_pct = np.asarray(rh_pct, dtype=float)

    temp_k = temp_c + 273.15
    pressure_pa = pressure_hpa * 100

    # Tetens-family saturation-vapour-pressure approximation
    saturation_hpa = 6.1078 * np.exp(
        17.27 * temp_c / (237.5 + temp_c)
    )
    vapour_pa = (rh_pct / 100) * saturation_hpa * 100

    r_dry = 287.058
    r_vapour = 461.495

    return (
        (pressure_pa - vapour_pa) / (r_dry * temp_k)
        + vapour_pa / (r_vapour * temp_k)
    )


monthly["density_kg_m3"] = humid_air_density(
    monthly["mean_temperature_c"],
    monthly["local_pressure_hpa"],
    monthly["mean_relative_humidity_pct"],
)
```

Monthly densities are averaged into station-year means and then into a 2006â€“2025 long-term mean for each station:

```python
annual = (
    monthly.groupby([
        "station", "year", "latitude", "longitude", "elevation_m"
    ])["density_kg_m3"]
    .mean()
    .rename("annual_density_kg_m3")
    .reset_index()
)

long_term = (
    annual.groupby([
        "station", "latitude", "longitude", "elevation_m"
    ])["annual_density_kg_m3"]
    .mean()
    .rename("density_kg_m3")
    .reset_index()
)
```

## 4. Developing the regression model

### Stage 1: elevation

Elevation captures the primary pressure effect. The first linear regression relates long-term density to station elevation:

> **ÏÌ‚<sub>elevation</sub> = 1.21746 âˆ’ 0.000110927z**

where *z* is elevation in metres. Within the fitted station range, the coefficient corresponds to approximately **0.0111 kg/mÂ³ less density per 100 m of elevation**.

The elevation-only model produces **RÂ² = 0.5775**. Elevation explains the dominant pressure trend, but the remaining error has a clear geographic pattern.

### Stage 2: latitude correction

The residual from the elevation model is regressed against latitude:

> **residual = âˆ’0.14008 + 0.00392261Ï†**

where *Ï†* is latitude in decimal degrees north. Latitude acts as a compact proxy for Japan's broad northâ€“south temperature gradient.

The two-stage implementation is intentionally transparent:

```python
def fit_linear(x, y):
    design = np.column_stack([np.ones(len(x)), x])
    coefficients, *_ = np.linalg.lstsq(design, y, rcond=None)
    prediction = design @ coefficients
    r2 = 1 - np.sum((y - prediction) ** 2) / np.sum((y - y.mean()) ** 2)
    return coefficients[0], coefficients[1], prediction, r2


elevation = long_term["elevation_m"].to_numpy()
latitude = long_term["latitude"].to_numpy()
density = long_term["density_kg_m3"].to_numpy()

# Stage 1: density from elevation
elev_intercept, elev_slope, elev_prediction, elev_r2 = fit_linear(
    elevation, density
)

# Stage 2: elevation residual from latitude
residual = density - elev_prediction
lat_intercept, lat_slope, residual_prediction, residual_r2 = fit_linear(
    latitude, residual
)

final_prediction = elev_prediction + residual_prediction
final_r2 = 1 - np.sum((density - final_prediction) ** 2) / np.sum(
    (density - density.mean()) ** 2
)
```

## Regression result

Combining the elevation model and latitude correction gives the final screening equation:

> **ÏÌ‚ = 1.07738 + 0.00392261Ï† âˆ’ 0.000110927z**

| Model | Inputs | RÂ² |
| --- | --- | ---: |
| Stage 1 | Elevation | 0.5775 |
| Final model | Elevation + latitude correction | 0.9824 |

![Calculated and modelled long-term air density across JMA surface stations. The elevation-only result is shown on the left; the latitude-corrected result is shown on the right.](/assets/images/projects/jma-air-density-regression.png)

*Monthly-derived long-term air density for 153 JMA surface stations, 2006â€“2025. Source: author's calculations based on Japan Meteorological Agency observations; the source data were processed and modelled by the author.*

The final equation can estimate a long-term mean density from two readily available site descriptors. If the estimate is required at turbine hub height, use the target elevation above mean sea level:

> **target elevation = ground elevation ASL + hub height AGL**

## Try the air-density estimator

Enter a latitude and elevation for a location in Japan. Hub height is optional. The calculator applies the fitted monthly 2006â€“2025 regression equation shown above.

<div class="jma-density-tool" id="jma-density-tool">
  <form class="jma-density-tool__form" id="jma-density-form">
    <div class="jma-density-tool__field">
      <label for="jma-density-latitude">Latitude (Â°N)</label>
      <input id="jma-density-latitude" name="latitude" type="number" min="20" max="46" step="0.0001" value="35.6817" required>
    </div>
    <div class="jma-density-tool__field">
      <label for="jma-density-elevation">Ground elevation (m ASL)</label>
      <input id="jma-density-elevation" name="elevation" type="number" min="-10" max="4000" step="1" value="20" required>
    </div>
    <div class="jma-density-tool__field">
      <label for="jma-density-height">Measurement or hub height (m AGL)</label>
      <input id="jma-density-height" name="height" type="number" min="0" max="400" step="1" value="130">
    </div>
    <button class="jma-density-tool__button" type="submit">Estimate air density</button>
  </form>
  <div class="jma-density-tool__result" id="jma-density-result" aria-live="polite">
    <span class="jma-density-tool__eyebrow">Estimated long-term mean</span>
    <strong class="jma-density-tool__value" id="jma-density-value">1.201 kg/mÂ³</strong>
    <span class="jma-density-tool__detail" id="jma-density-detail">Target elevation: 150 m ASL</span>
  </div>
</div>

<style>
  .jma-density-tool {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(15rem, 0.65fr);
    gap: 1.25rem;
    margin: 1.75rem 0;
    padding: 1.35rem;
    border: 1px solid rgba(30, 55, 75, 0.16);
    border-radius: 0.9rem;
    background: #f6f8fa;
  }

  .jma-density-tool__form {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.9rem;
    align-items: end;
  }

  .jma-density-tool__field {
    display: grid;
    gap: 0.35rem;
  }

  .jma-density-tool__field label {
    color: #243746;
    font-size: 0.82rem;
    font-weight: 650;
    line-height: 1.3;
  }

  .jma-density-tool__field input {
    box-sizing: border-box;
    width: 100%;
    min-height: 2.7rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid #b9c4cc;
    border-radius: 0.55rem;
    background: #ffffff;
    color: #14232e;
    font: inherit;
  }

  .jma-density-tool__field input:focus {
    border-color: #176b87;
    outline: 3px solid rgba(23, 107, 135, 0.16);
  }

  .jma-density-tool__button {
    grid-column: 1 / -1;
    min-height: 2.8rem;
    border: 0;
    border-radius: 0.55rem;
    background: #123f54;
    color: #ffffff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .jma-density-tool__button:hover {
    background: #176b87;
  }

  .jma-density-tool__result {
    display: flex;
    min-height: 8.5rem;
    flex-direction: column;
    justify-content: center;
    padding: 1.15rem;
    border-radius: 0.7rem;
    background: #123f54;
    color: #ffffff;
  }

  .jma-density-tool__eyebrow,
  .jma-density-tool__detail {
    color: rgba(255, 255, 255, 0.76);
    font-size: 0.8rem;
  }

  .jma-density-tool__value {
    margin: 0.35rem 0;
    font-size: clamp(1.8rem, 4vw, 2.55rem);
    line-height: 1.05;
  }

  .jma-density-tool__result--error .jma-density-tool__value {
    font-size: 1rem;
    line-height: 1.4;
  }

  @media (max-width: 760px) {
    .jma-density-tool,
    .jma-density-tool__form {
      grid-template-columns: 1fr;
    }
  }
</style>

<script>
  (function () {
    "use strict";

    var form = document.getElementById("jma-density-form");
    var result = document.getElementById("jma-density-result");
    var value = document.getElementById("jma-density-value");
    var detail = document.getElementById("jma-density-detail");

    if (!form || !result || !value || !detail) {
      return;
    }

    function calculate(event) {
      if (event) {
        event.preventDefault();
      }

      var latitude = Number(document.getElementById("jma-density-latitude").value);
      var groundElevation = Number(document.getElementById("jma-density-elevation").value);
      var height = Number(document.getElementById("jma-density-height").value || 0);
      var targetElevation = groundElevation + height;

      var inputIsValid = Number.isFinite(latitude)
        && Number.isFinite(groundElevation)
        && Number.isFinite(height)
        && latitude >= 20
        && latitude <= 46
        && groundElevation >= -10
        && height >= 0
        && targetElevation <= 4000;

      if (!inputIsValid) {
        result.classList.add("jma-density-tool__result--error");
        value.textContent = "Check the input values";
        detail.textContent = "Use 20â€“46Â°N and a target elevation no higher than 4,000 m.";
        return;
      }

      var density = 1.07738
        + 0.00392261 * latitude
        - 0.000110927 * targetElevation;
      var differenceFromStandard = (density / 1.225 - 1) * 100;
      var differenceText = differenceFromStandard >= 0 ? "+" : "";

      result.classList.remove("jma-density-tool__result--error");
      value.textContent = density.toFixed(3) + " kg/mÂ³";
      detail.textContent = "Target elevation: "
        + targetElevation.toFixed(0)
        + " m ASL Â· "
        + differenceText
        + differenceFromStandard.toFixed(1)
        + "% vs 1.225 kg/mÂ³";
    }

    form.addEventListener("submit", calculate);
    calculate();
  }());
</script>

### Using the result

The tool returns the modelled 2006â€“2025 long-term mean density in kg/mÂ³. It can support early-stage comparisons and provide an initial assumption before site measurements are available. It does not replace simultaneous pressure, temperature and humidity measurements for turbine power-performance or bankable energy-yield analysis.

## Project outcome

This project demonstrates a complete analytical workflow rather than an isolated model:

- parsing a public, semi-structured meteorological source;
- designing a respectful and resumable collection process;
- handling multi-level HTML tables and missing-value symbols;
- joining meteorological data with geospatial station metadata;
- translating thermodynamic relationships into vectorised Python;
- developing an interpretable residual-correction regression; and
- deploying the fitted model as a lightweight browser tool.

The main lesson is that elevation explains the pressure-driven density trend, while latitude captures much of the remaining climatic structure across Japan. Together, two readily available site descriptors provide a useful first estimate for wind-resource screening.

## References

- Japan Meteorological Agency, [Historical Weather Data Search](https://www.data.jma.go.jp/stats/etrn/).
- Japan Meteorological Agency, [Past Weather Data Download: usage notes](https://www.data.jma.go.jp/risk/obsdl/).
- Japan Meteorological Agency, [Surface Observation](https://www.jma.go.jp/jma/en/Activities/surf/surf.html).
- Sako, S. (2024), [*How to Obtain Weather Data at Locations in Japan*](https://medium.com/@seimaosako/how-to-obtain-weather-data-at-locations-in-japan-12f478ec1b96).
- Murray, F. W. (1967), [*On the Computation of Saturation Vapor Pressure*](https://doi.org/10.1175/1520-0450(1967)006%3C0203:OTCOSV%3E2.0.CO;2), *Journal of Applied Meteorology*, 6, 203â€“204.
- Picard, A., Davis, R. S., GlÃ¤ser, M. and Fujii, K. (2008), [*Revised formula for the density of moist air (CIPM-2007)*](https://doi.org/10.1088/0026-1394/45/2/004), *Metrologia*, 45, 149â€“155.
- International Electrotechnical Commission, [IEC 61400-12-1:2022](https://webstore.iec.ch/en/publication/68499).

*Method note: station counts, monthly row counts and fitted coefficients are saved-run results from the project notebook. JMA pages, schemas and observations may change. The chart and regression model are the author's derived work based on JMA observations.*
