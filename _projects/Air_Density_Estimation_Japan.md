---
layout: project
title: "Air Density Estimation Tool for Japan"
date: 2026-08-01
category: "Meteorology · Wind Energy"
description: "A tool for estimating air density at any location in Japan using latitude, elevation and meteorological conditions."
tools:
  - Python
  - JMA Data
  - Meteorology
  - Wind Energy
status: "Personal Project"
---

## Overview

Air density is an important parameter in wind-energy analysis because
the energy available in the wind is directly proportional to air density.

This project explores a practical method for estimating air density at
locations across Japan using geographical and meteorological information.

## Why I built it

Wind-energy calculations often assume a standard air density of
approximately 1.225 kg/m³.

However, actual air density varies with:

- elevation,
- atmospheric pressure,
- temperature,
- humidity, and
- local meteorological conditions.

For wind-resource assessment, these differences can influence estimates
of turbine power production.

## Approach

The tool accepts a location defined by latitude, longitude and elevation.

Meteorological information can then be used to estimate atmospheric
conditions at the selected location.

The calculation follows the physical relationship between pressure,
temperature, humidity and air density.

## Applications

Possible applications include:

- preliminary wind-resource assessment,
- adjustment of wind-turbine power curves,
- comparison of sites at different elevations,
- meteorological analysis, and
- educational use.

## Future development

Future improvements could include automatic retrieval of meteorological
data, interactive mapping and visualization of seasonal air-density
variations across Japan.
