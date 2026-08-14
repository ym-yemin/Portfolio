---
layout: post
title: "Estimating Long-Term Air Density Anywhere in Japan"
description: "Developing a practical latitude-and-elevation air-density estimator for wind-resource screening in Japan."
date: 2026-08-15 00:00:00 +0900
author: Ye Min
categories:
  - wind-analysis
  - data
tags:
  - air-density
  - wind-energy
  - JMA
  - climatology
  - Python
  - Japan
image: /assets/images/posts/japan-air-density-estimator.png
---

When I begin looking at a potential wind site in Japan, air density is often one of the first environmental quantities I want to understand. It appears directly in the power available in the wind and influences how a turbine power curve should be interpreted. Yet at an early screening stage, the pressure, temperature and humidity measurements needed to calculate it may not exist at the site.

What I usually have are two simple pieces of information: **latitude and elevation**.

That led me to a practical question:

> Can I estimate a representative long-term air density anywhere in Japan using only latitude and elevation?

The answer is yesâ€”with an important qualification. Latitude and elevation cannot reproduce the density of the air at a particular hour. Actual density changes with weather. What they can provide is a **climatological screening estimate**: a plausible long-term mean for early wind-resource work, measurement planning and reasonableness checks.

This article describes how I developed that estimator from Japan Meteorological Agency observations, what the fitted relationships reveal, and how I turned the model into a small Python tool.

## Defining the quantity first

Air density is not controlled by elevation alone. For moist air, it depends on local atmospheric pressure, temperature and water-vapour content:

> **Ï = (p âˆ’ e) / (R<sub>d</sub>T) + e / (R<sub>v</sub>T)**

where:

- *Ï* is moist-air density in kg/mÂ³;
- *p* is local station pressure in Pa;
- *e* is water-vapour partial pressure in Pa;
- *T* is absolute temperature in K; and
- *R*<sub>d</sub> and *R*<sub>v</sub> are the specific gas constants for dry air and water vapour.

Local pressure is essential here. Sea-level pressure has already been adjusted to remove much of the elevation effect, so using it would defeat the purpose of a site-density calculation.

The reference dataset in my notebook contains monthly mean local pressure, temperature and relative humidity from 153 JMA surface stations for 2006â€“2025. That gives 36,720 station-month records. The stations span Japan's northâ€“south climate gradient and elevations from near sea level to roughly 1,300 m.

I calculate density for every station-month first, then aggregate those monthly values into station-year and long-term means. This order preserves more of the seasonal thermodynamic structure than inserting annual-average pressure, temperature and humidity into the equation only once.

```python
import numpy as np


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
```

This is an engineering approximation. The saturation-vapour-pressure expression belongs to the Tetens family discussed by Murray (1967). For precision metrology, the fuller CIPM-2007 moist-air formulation is the stronger reference.

## Stage one: elevation captures the pressure effect

The first model uses only station elevation:

> **ÏÌ‚ = 1.21746 âˆ’ 0.000110927z**

where *z* is elevation above mean sea level in metres.

The coefficient corresponds to approximately **0.0111 kg/mÂ³ less density for every 100 m of elevation** within the fitted range. That is physically intuitive: atmospheric pressure falls as height increases, so the mass of air in a fixed volume also falls.

Elevation alone explains 57.75% of the cross-station variation in the monthly-derived long-term densities. It captures the dominant pressure mechanism, but it leaves almost half of the observed variation unresolved.

The residuals show why. Low-elevation stations in northern Japan tend to be denser than the elevation-only estimate, while low-elevation stations in the south tend to be less dense. Two sites can be close to sea level and still have meaningfully different long-term densities because their temperature and humidity climates differ.

Elevation is necessary, but it is not sufficient.

## Stage two: latitude reveals the missing structure

When I regress the elevation-model residuals against latitude, the geographic pattern becomes clear:

> **residual = âˆ’0.14008 + 0.00392261Ï†**

where *Ï†* is latitude in decimal degrees north.

Latitude is acting as a compact proxy for Japan's broad temperature gradient. Holding elevation constant, the fitted long-term density rises by about **0.0392 kg/mÂ³ for every ten degrees north**.

Combining the elevation and latitude terms gives the empirical model:

> **ÏÌ‚ = 1.07738 + 0.00392261Ï† âˆ’ 0.000110927z**

For the 153-station dataset, this combined fit achieves:

- **RÂ²:** 0.9824
- **RMSE:** 0.00359 kg/mÂ³
- **MAE:** 0.00284 kg/mÂ³

Those are strong in-sample results. They show that a simple two-variable surface captures most of the spatial structure in the calculated station climatologies.

![Monthly-derived long-term air density at 153 JMA surface stations. The left panel shows an elevation-only fit; the right adds a latitude correction.](/assets/images/posts/japan-air-density-estimator.png)

*Monthly-derived long-term air density, 2006â€“2025. Elevation captures much of the pressure effect; latitude captures much of Japan's northâ€“south climate gradient. Source: author's calculations based on Japan Meteorological Agency monthly observations; the source data were processed and modelled by the author. Results are in-sample descriptive fits, not an independent validation.*

The improvement is substantial, but RÂ² is not the same as generalisation. Nearby stations share climate, and an ordinary in-sample fit can look stronger than performance at a genuinely unseen location. A production version should be evaluated with spatially blocked cross-validation.

## Turning the fit into a Japan-wide tool

The empirical plane works well across the elevation range represented by the stations. But the phrase "any elevation" creates a problem: a straight line should not be extrapolated indefinitely up a mountain.

For the tool, I therefore separate the model into two parts:

1. A latitude-dependent density baseline at sea level.
2. A nonlinear vertical adjustment based on the standard atmosphere.

The fitted sea-level baseline is:

> **Ïâ‚€(Ï†) = 1.07738 + 0.00392261Ï†**

I then apply a tropospheric density ratio:

> **Ï(Ï†,z) = Ïâ‚€(Ï†) [1 âˆ’ Lz/Tâ‚€]<sup>g/(R<sub>d</sub>L) âˆ’ 1</sup>**

using *T*<sub>0</sub> = 288.15 K, *L* = 0.0065 K/m, *g* = 9.80665 m/sÂ² and *R*<sub>d</sub> = 287.05 J/(kgÂ·K).

This hybrid form is almost identical to the fitted plane across the station range. At 1,300 m, the two methods differ by less than 0.001 kg/mÂ³ for a central-Japan latitude. At much higher elevations, the nonlinear form avoids the increasingly unrealistic behaviour of unlimited linear extrapolation.

The hybrid extension is an engineering choice, not a newly validated statistical result. Above approximately 1,300 m, the tool flags the estimate as extrapolated.

## The estimator

The core function accepts latitude, ground elevation and an optional measurement height above ground. For a turbine hub, the target elevation is:

> **target elevation = ground elevation ASL + hub height AGL**

```python
def estimate_air_density_japan(
    latitude_deg,
    elevation_asl_m,
    *,
    height_agl_m=0.0,
):
    if not 20.0 <= latitude_deg <= 46.0:
        raise ValueError("Latitude must be between 20Â°N and 46Â°N")
    if height_agl_m < 0:
        raise ValueError("Height above ground cannot be negative")

    target_elevation_m = elevation_asl_m + height_agl_m
    if not -10.0 <= target_elevation_m <= 4000.0:
        raise ValueError("Target elevation must be between -10 and 4,000 m")

    rho_sea_level = 1.07738 + 0.003922610 * latitude_deg

    temperature_ratio = 1.0 - 0.0065 * target_elevation_m / 288.15
    exponent = 9.80665 / (287.05 * 0.0065) - 1.0
    density = rho_sea_level * temperature_ratio**exponent

    return density
```

An illustrative Choshi-area calculation uses a latitude of 35.6817Â°N, 20 m ground elevation and 130 m measurement height:

```python
rho = estimate_air_density_japan(
    latitude_deg=35.6817,
    elevation_asl_m=20,
    height_agl_m=130,
)

print(f"{rho:.3f} kg/mÂ³")
# 1.200 kg/mÂ³
```

The accompanying Python module also retains the original empirical method for reproducibility and returns a flag showing whether the target altitude lies inside the approximate station range.

## What the estimates look like across Japan

The following examples use the hybrid method. They are long-term screening estimates, not values for a specific day.

| Example | Latitude | Target elevation | Estimated density |
| --- | ---: | ---: | ---: |
| Naha | 26.21Â°N | 5 m | 1.180 kg/mÂ³ |
| Tokyo | 35.68Â°N | 40 m | 1.213 kg/mÂ³ |
| Choshi-area hub example | 35.6817Â°N | 150 m | 1.200 kg/mÂ³ |
| Sapporo | 43.06Â°N | 20 m | 1.244 kg/mÂ³ |
| Mount Fuji summit illustration | 35.36Â°N | 3,776 m | 0.833 kg/mÂ³* |

\*The summit result is an extrapolated standard-atmosphere screening value, not a value validated by the station fit.

The northâ€“south difference is large enough to matter. Using one generic standard density everywhere in Japan can obscure a meaningful part of the regional climatology, particularly when comparing otherwise similar low-elevation sites.

## What the tool can and cannot do

This estimator is useful for:

- preliminary wind-resource and turbine-site screening;
- checking whether a reported density is climatologically plausible;
- selecting an initial reference density before site measurements exist;
- comparing the broad density environment of candidate regions; and
- illustrating the combined influence of climate and elevation.

It is not a substitute for:

- pressure, temperature and humidity measured at the site;
- a density time series aligned with wind-speed and power observations;
- measurement-height and sensor-specific corrections;
- turbine power-performance procedures under IEC 61400-12-1; or
- bankable energy-yield and uncertainty analysis.

The model also omits longitude, distance from the coast, terrain exposure and local climate regimes. Latitude absorbs much of the national gradient in this dataset, but it does not explain every local effect. Hokkaido coasts, inland basins, subtropical islands and mountain sites can depart from a two-variable surface.

Finally, the monthly workflow gives each monthly density equal weight in its annual mean. A refined climatology should weight by valid observation time or days in the month. Where complete data coexist, calculating density at hourly resolution and then aggregating valid intervals would be better.

## Where I would take it next

The compact model is valuable because it is transparent. Every coefficient has an interpretable role, and a user needs only two coordinates. The next development steps should preserve that clarity while testing how far the model can be trusted.

My priorities would be:

1. spatially blocked cross-validation, so nearby stations do not leak information between training and testing;
2. uncertainty bands rather than a single point estimate;
3. comparison with held-out JMA stations and independent project measurements;
4. an optional longitude or coastal-distance term where it materially improves out-of-area performance; and
5. seasonal outputs, because winter and summer density can differ far more than the long-term mean suggests.

The present tool is deliberately a screening model. Its value is not that it replaces measurements, but that it gives wind analysts a Japan-specific starting point that is more informative than a universal constant and more transparent than a black box.

## References

- Japan Meteorological Agency, [Surface Observation](https://www.jma.go.jp/jma/en/Activities/surf/surf.html). Official description of observed pressure, temperature, humidity, wind and related elements.
- Murray, F. W. (1967), [*On the Computation of Saturation Vapor Pressure*](https://doi.org/10.1175/1520-0450(1967)006%3C0203:OTCOSV%3E2.0.CO;2), *Journal of Applied Meteorology*, 6, 203â€“204.
- Picard, A., Davis, R. S., GlÃ¤ser, M. and Fujii, K. (2008), [*Revised formula for the density of moist air (CIPM-2007)*](https://doi.org/10.1088/0026-1394/45/2/004), *Metrologia*, 45, 149â€“155.
- U.S. Committee on Extension to the Standard Atmosphere (1976), [*U.S. Standard Atmosphere, 1976*](https://ntrs.nasa.gov/citations/19770009539), NOAA/NASA/USAF.
- International Electrotechnical Commission, [IEC 61400-12-1:2022](https://webstore.iec.ch/en/publication/68499), power-performance measurements of electricity-producing wind turbines.

*Method note: the station counts, monthly period and fitted coefficients are results from the accompanying notebook. JMA observations may be revised. The processed figure and derived model are the author's work based on Japan Meteorological Agency data.*
