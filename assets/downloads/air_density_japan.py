"""Screening estimator for long-term mean humid-air density in Japan.

The latitude baseline and empirical elevation coefficient were fitted to the
monthly-derived 2006-2025 JMA station dataset used in the accompanying article.
The hybrid method extends the latitude baseline with a standard-atmosphere
density ratio so that high-elevation estimates do not rely on an unlimited
linear extrapolation.

This is a climatological screening tool, not an instantaneous density
calculator or a substitute for site measurements.
"""

from __future__ import annotations

import argparse
import json
import warnings
from dataclasses import asdict, dataclass


# Monthly 2006-2025 descriptive model fitted in the source notebook.
INTERCEPT_KG_M3 = 1.07738
LATITUDE_COEFFICIENT_KG_M3_PER_DEG = 3.922610e-3
ELEVATION_COEFFICIENT_KG_M3_PER_M = -1.109270e-4

# Approximate domain represented by the fitted Japanese station dataset.
LATITUDE_RANGE_DEG = (20.0, 46.0)
EMPIRICAL_ELEVATION_RANGE_M = (-5.0, 1_300.0)
SUPPORTED_TARGET_ELEVATION_RANGE_M = (-10.0, 4_000.0)

# Tropospheric standard-atmosphere constants for the hybrid extension.
STANDARD_TEMPERATURE_K = 288.15
LAPSE_RATE_K_PER_M = 0.0065
GRAVITY_M_S2 = 9.80665
DRY_AIR_GAS_CONSTANT_J_KG_K = 287.05


@dataclass(frozen=True)
class AirDensityEstimate:
    density_kg_m3: float
    latitude_deg: float
    target_elevation_m: float
    method: str
    within_empirical_domain: bool
    interpretation: str = "long-term mean climatological screening estimate"


def _validate_inputs(
    latitude_deg: float,
    elevation_asl_m: float,
    height_agl_m: float,
) -> float:
    if not LATITUDE_RANGE_DEG[0] <= latitude_deg <= LATITUDE_RANGE_DEG[1]:
        raise ValueError(
            f"latitude_deg must be within {LATITUDE_RANGE_DEG[0]}-"
            f"{LATITUDE_RANGE_DEG[1]} degrees north"
        )
    if height_agl_m < 0:
        raise ValueError("height_agl_m cannot be negative")

    target_elevation_m = elevation_asl_m + height_agl_m
    low, high = SUPPORTED_TARGET_ELEVATION_RANGE_M
    if not low <= target_elevation_m <= high:
        raise ValueError(
            f"target elevation must be within {low}-{high} m above mean sea level"
        )
    return target_elevation_m


def _sea_level_density(latitude_deg: float) -> float:
    """Latitude-dependent long-term mean baseline at sea level."""
    return (
        INTERCEPT_KG_M3
        + LATITUDE_COEFFICIENT_KG_M3_PER_DEG * latitude_deg
    )


def _standard_atmosphere_density_ratio(elevation_m: float) -> float:
    temperature_ratio = (
        1.0 - LAPSE_RATE_K_PER_M * elevation_m / STANDARD_TEMPERATURE_K
    )
    exponent = (
        GRAVITY_M_S2
        / (DRY_AIR_GAS_CONSTANT_J_KG_K * LAPSE_RATE_K_PER_M)
        - 1.0
    )
    return temperature_ratio**exponent


def estimate_air_density_japan(
    latitude_deg: float,
    elevation_asl_m: float,
    *,
    height_agl_m: float = 0.0,
    method: str = "hybrid",
) -> AirDensityEstimate:
    """Estimate long-term mean humid-air density for a point in Japan.

    Args:
        latitude_deg: Latitude in decimal degrees north.
        elevation_asl_m: Ground or reference elevation above mean sea level.
        height_agl_m: Optional measurement or hub height above ground level.
        method: ``"hybrid"`` (recommended) or ``"empirical"``.

    Returns:
        AirDensityEstimate with density in kg/m3 and a domain flag.

    The empirical method reproduces the notebook's fitted latitude-elevation
    plane. The hybrid method applies a standard-atmosphere vertical density
    ratio to the fitted sea-level latitude baseline. Above about 1,300 m, both
    methods are extrapolations relative to the station dataset; the hybrid form
    is preferred because its altitude response remains nonlinear and physical.
    """
    latitude_deg = float(latitude_deg)
    elevation_asl_m = float(elevation_asl_m)
    height_agl_m = float(height_agl_m)
    target_elevation_m = _validate_inputs(
        latitude_deg,
        elevation_asl_m,
        height_agl_m,
    )

    within_empirical_domain = (
        EMPIRICAL_ELEVATION_RANGE_M[0]
        <= target_elevation_m
        <= EMPIRICAL_ELEVATION_RANGE_M[1]
    )
    if not within_empirical_domain:
        warnings.warn(
            "Target elevation is outside the station model's approximate "
            "elevation range; treat the result as an extrapolated screening value.",
            RuntimeWarning,
            stacklevel=2,
        )

    method = method.lower()
    if method == "empirical":
        density = (
            _sea_level_density(latitude_deg)
            + ELEVATION_COEFFICIENT_KG_M3_PER_M * target_elevation_m
        )
    elif method == "hybrid":
        density = _sea_level_density(latitude_deg) * (
            _standard_atmosphere_density_ratio(target_elevation_m)
        )
    else:
        raise ValueError("method must be 'hybrid' or 'empirical'")

    return AirDensityEstimate(
        density_kg_m3=round(density, 6),
        latitude_deg=latitude_deg,
        target_elevation_m=target_elevation_m,
        method=method,
        within_empirical_domain=within_empirical_domain,
    )


def _main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Estimate long-term mean humid-air density for a location in Japan"
        )
    )
    parser.add_argument("latitude", type=float, help="decimal degrees north")
    parser.add_argument("elevation", type=float, help="ground elevation, m ASL")
    parser.add_argument(
        "--height-agl",
        type=float,
        default=0.0,
        help="measurement or hub height above ground, m",
    )
    parser.add_argument(
        "--method",
        choices=("hybrid", "empirical"),
        default="hybrid",
    )
    args = parser.parse_args()
    result = estimate_air_density_japan(
        args.latitude,
        args.elevation,
        height_agl_m=args.height_agl,
        method=args.method,
    )
    print(json.dumps(asdict(result), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    _main()
