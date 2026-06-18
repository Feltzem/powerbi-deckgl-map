"""Generate hamilton_sa2_consents_stacked.csv: a TRUE stacked-tower demo of
building-consent category change over time, in the style of the parking-prisms
sample (floating 3D prisms whose base Z is baked into the geometry).

How the stack works (no visual code change needed):
  The polygon layer reads a Z ordinate on each ring vertex as the prism BASE,
  then adds polygonExtrudeElevation on top (deck.gl: pos.z += elevation). So a
  tower is N rows sharing one X/Y footprint, where floor k sits at
  base_z = k * FLOOR_HEIGHT and each row extrudes FLOOR_HEIGHT. Floors float one
  above the next -> a real stacked tower, no coincident faces, no z-fighting.

Design choices (per request):
  * Equal height per year  -> every floor is FLOOR_HEIGHT tall; a 5-floor tower
    reads cleanly as 5 years, category change visible up the stack.
  * Thin prism per suburb  -> footprint is a small fixed rectangle centred on the
    SA2 label point (not the full suburb polygon), so the city-wide view stays
    legible like the prisms sample.

Geometry is emitted as WKT 'POLYGON Z' which the visual accepts via the WKT role.
The polygon footprint is a small box; extrusion gives it depth, so each prism is
a little tower segment. Colour = that year's dominant consent category.

Provenance: SA2 identity + label point are REAL (from hamilton_place_polygon.csv).
Consent counts/categories are the same documented synthetic model as
generate_building_consents.py (Stats NZ publishes consents only at TA level).
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "hamilton_place_polygon.csv")
OUT = os.path.join(HERE, "hamilton_sa2_consents_stacked.csv")

YEARS = [2019, 2020, 2021, 2022, 2023]
FLOOR_HEIGHT = 120.0          # metres per year-floor (equal height per year)
BOX_HALF_M = 70.0             # half-width of the thin prism footprint, metres

CATEGORY_COLOR = {
    "Houses": "#2c7fb8cc",
    "Townhouses": "#7fbc41cc",
    "Apartments": "#d7301fcc",
    "Retirement units": "#fdae61cc",
    "Non-residential": "#7a7a7acc",
}


def seed_int(*parts: str) -> int:
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return int(h[:8], 16)


def category_mix(sa2_code: str, year: int) -> dict[str, int]:
    """Same story-shaped model as generate_building_consents.py."""
    t = (year - YEARS[0]) / (YEARS[-1] - YEARS[0])
    base = 8 + seed_int(sa2_code, "vol") % 40
    growth = 1.0 + 2.2 * t * ((seed_int(sa2_code, "g") % 100) / 100.0)
    total = int(round(base * growth))
    appetite = (seed_int(sa2_code, "appetite") % 100) / 100.0
    dens = min(0.85, t * (0.35 + 0.6 * appetite))
    houses = max(0, int(round(total * (1 - dens))))
    multi = total - houses
    apt_bias = (seed_int(sa2_code, "apt") % 100) / 100.0
    apartments = int(round(multi * (0.10 + 0.35 * apt_bias) * t))
    retirement = int(round(multi * 0.08 * ((seed_int(sa2_code, "ret") % 100) / 100.0)))
    townhouses = max(0, multi - apartments - retirement)
    nonres = seed_int(sa2_code, "nonres", str(year)) % 6
    mix = {
        "Houses": houses, "Townhouses": townhouses, "Apartments": apartments,
        "Retirement units": retirement, "Non-residential": nonres,
    }
    return {k: v for k, v in mix.items() if v > 0}


def dominant(mix: dict[str, int]) -> str:
    return max(mix.items(), key=lambda kv: (kv[1], kv[0]))[0]


def box_ring_wkt(lon: float, lat: float, base_z: float) -> str:
    """Closed CCW square ring (5 pts) around (lon,lat) at constant Z=base_z."""
    dlat = BOX_HALF_M / 111_320.0
    dlon = BOX_HALF_M / (111_320.0 * math.cos(math.radians(lat)))
    pts = [
        (lon - dlon, lat - dlat),
        (lon + dlon, lat - dlat),
        (lon + dlon, lat + dlat),
        (lon - dlon, lat + dlat),
        (lon - dlon, lat - dlat),
    ]
    coords = ", ".join(f"{x:.6f} {y:.6f} {base_z:.1f}" for x, y in pts)
    return f"POLYGON Z (({coords}))"


def main() -> None:
    with open(SRC, newline="", encoding="utf-8") as f:
        src_rows = list(csv.DictReader(f))

    cols = [
        "geometry_id", "layer_type", "wkt", "sa2_code", "sa2_name", "year",
        "floor_index", "building_category", "consents_total",
        "polygon_fill_color_hex", "polygon_line_color_hex", "polygon_line_width_m",
        "polygon_extrude_elevation_m", "base_elevation_m",
        "valid_from", "valid_to", "timestamp", "tooltip_html",
    ]

    out = []
    for src in src_rows:
        sa2_code = src["place_feature_id"]
        name = src["place_name"]
        lon = float(src["label_lon"])
        lat = float(src["label_lat"])
        for k, year in enumerate(YEARS):
            mix = category_mix(sa2_code, year)
            if not mix:
                continue
            total = sum(mix.values())
            dom = dominant(mix)
            base_z = k * FLOOR_HEIGHT
            start = dt.datetime(year, 1, 1, tzinfo=dt.timezone.utc)
            end = dt.datetime(year, 12, 31, tzinfo=dt.timezone.utc)
            tip = (
                f"<div><strong>{name}</strong>"
                f"<br><span>Year: {year}</span>"
                f"<br><span>Consents issued: {total}</span>"
                f"<br><span>Dominant type: {dom}</span></div>"
            )
            out.append({
                "geometry_id": f"tower_{sa2_code}_{year}",
                "layer_type": "polygon",
                "wkt": box_ring_wkt(lon, lat, base_z),
                "sa2_code": sa2_code,
                "sa2_name": name,
                "year": year,
                "floor_index": k,
                "building_category": dom,
                "consents_total": total,
                "polygon_fill_color_hex": CATEGORY_COLOR[dom],
                "polygon_line_color_hex": "#1a1a1aff",
                "polygon_line_width_m": 10,
                "polygon_extrude_elevation_m": FLOOR_HEIGHT,
                "base_elevation_m": base_z,
                "valid_from": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "valid_to": end.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "timestamp": int(start.timestamp()),
                "tooltip_html": tip,
            })

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(out)
    print(f"Wrote {len(out)} stacked-floor rows ({len(src_rows)} SA2 x up to {len(YEARS)} years) to {OUT}")


if __name__ == "__main__":
    main()
