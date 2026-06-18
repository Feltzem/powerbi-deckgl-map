"""Download Hamilton City crash points from the Waka Kotahi / NZTA Crash Analysis
System (CAS) open data and write a visual-ready CSV.

Source (no API key required):
  https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/CAS_Data_Public/FeatureServer/0
  Filter: tlaName = 'Hamilton City'
  Geometry: esriGeometryPoint, requested in EPSG:4326 (lon/lat).

The same CSV drives BOTH demo maps:
  * Heatmap / scatter map -> point1_latitude, point1_longitude, scatter_radius,
    heatmap_weight (severity-weighted so fatal/serious crashes burn hotter).
  * H3 hexagon map -> the visual hexbins the same lon/lat points; heatmap_weight
    doubles as the per-point value to aggregate per hex.

To expand NZ-wide later, drop the tlaName filter (or swap it) in the external
notebook and reuse the same column contract.
"""
from __future__ import annotations

import csv
import json
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "hamilton_cas_crash_point.csv")

SERVICE = (
    "https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/"
    "CAS_Data_Public/FeatureServer/0/query"
)
WHERE = "tlaName='Hamilton City'"
PAGE = 2000  # service maxRecordCount

# Severity -> heatmap weight. Drives heatmap intensity and the H3 hex aggregate.
SEVERITY_WEIGHT = {
    "Fatal Crash": 8.0,
    "Serious Crash": 4.0,
    "Minor Crash": 2.0,
    "Non-Injury Crash": 1.0,
}
# Severity -> point colour (#rrggbbaa), Magma-ish ramp dark->bright.
SEVERITY_COLOR = {
    "Fatal Crash": "#fcffa4ee",
    "Serious Crash": "#fb8861ee",
    "Minor Crash": "#b5367aee",
    "Non-Injury Crash": "#51127cee",
}
# Severity -> ordinal code (least->most severe). Lets the demo drive point colour
# via the visual's Manual interval classification: bind crash_severity_code,
# breaks 1,2,3,4, colours matching SEVERITY_COLOR.
SEVERITY_CODE = {
    "Non-Injury Crash": 1,
    "Minor Crash": 2,
    "Serious Crash": 3,
    "Fatal Crash": 4,
}

OUT_FIELDS = [
    "crashSeverity", "crashYear", "fatalCount", "seriousInjuryCount",
    "minorInjuryCount", "pedestrian", "bicycle", "motorcycle", "speedLimit",
]


def fetch_page(offset: int) -> list[dict]:
    params = {
        "where": WHERE,
        "outFields": ",".join(OUT_FIELDS),
        "outSR": "4326",          # lon/lat
        "returnGeometry": "true",
        "resultOffset": offset,
        "resultRecordCount": PAGE,
        "orderByFields": "OBJECTID",
        "f": "json",
    }
    url = SERVICE + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                return json.load(r).get("features", [])
        except Exception as e:  # noqa: BLE001 - simple retry for a one-off pull
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1} after error: {e}")
            time.sleep(2 * (attempt + 1))
    return []


def main() -> None:
    rows = []
    offset = 0
    while True:
        feats = fetch_page(offset)
        if not feats:
            break
        for ft in feats:
            geom = ft.get("geometry") or {}
            lon, lat = geom.get("x"), geom.get("y")
            if lon is None or lat is None:
                continue
            a = ft.get("attributes", {})
            sev = a.get("crashSeverity") or "Non-Injury Crash"
            weight = SEVERITY_WEIGHT.get(sev, 1.0)
            oid = offset + len(rows)
            tip = (
                f"<div><strong>{sev}</strong>"
                f"<br><span>Year: {a.get('crashYear')}</span>"
                f"<br><span>Speed limit: {a.get('speedLimit')} km/h</span>"
                f"<br><span>Fatal: {a.get('fatalCount')} | "
                f"Serious: {a.get('seriousInjuryCount')} | "
                f"Minor: {a.get('minorInjuryCount')}</span></div>"
            )
            rows.append({
                "geometry_id": f"crash_{oid}",
                "layer_type": "scatter",
                "point1_latitude": round(lat, 6),
                "point1_longitude": round(lon, 6),
                "scatter_radius": 25,
                "heatmap_weight": weight,
                "scatter_fill_color_hex": SEVERITY_COLOR.get(sev, "#51127cee"),
                "crash_severity": sev,
                "crash_severity_code": SEVERITY_CODE.get(sev, 1),
                "crash_year": a.get("crashYear"),
                "fatal_count": a.get("fatalCount"),
                "serious_injury_count": a.get("seriousInjuryCount"),
                "minor_injury_count": a.get("minorInjuryCount"),
                "pedestrian": a.get("pedestrian"),
                "bicycle": a.get("bicycle"),
                "motorcycle": a.get("motorcycle"),
                "speed_limit": a.get("speedLimit"),
                "tooltip_html": tip,
            })
        print(f"  fetched {len(feats)} (total {len(rows)})")
        if len(feats) < PAGE:
            break
        offset += PAGE

    cols = list(rows[0].keys())
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} crash points to {OUT}")


if __name__ == "__main__":
    main()
