"""Download earthquakes from GeoNet's FDSN event web service and write a
visual-ready CSV that drives the TIME-SLIDER ANIMATION demo.

Source (no API key required):
  https://service.geonet.org.nz/fdsnws/event/1/query  (format=text, pipe-delimited)
  Docs: https://www.geonet.org.nz/data/access/FDSN

Why a regional bounding box, not Hamilton-city: Hamilton sits on low-seismicity
crust, so a tight city box animates almost nothing. We centre on Hamilton but
capture the active central North Island (Taupo Volcanic Zone, Bay of Plenty) so
the slider has a steady stream of events to play. To go NZ-wide later, widen the
bbox to all of NZ in the external notebook and reuse the same column contract.

Animation contract for the visual:
  * Timestamp role  -> timestamp (Unix seconds of each quake's origin time).
  * point1_latitude/longitude -> epicentre.
  * scatter_radius  -> scales with magnitude (bigger quake = bigger dot).
  * heatmap_weight  -> magnitude (optional, if also shown as heatmap).
  * scatter_fill_color_hex -> magnitude band (Viridis-ish), so big quakes pop as
    the slider sweeps.
"""
from __future__ import annotations

import csv
import datetime as dt
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "hamilton_geonet_earthquake_point.csv")

SERVICE = "https://service.geonet.org.nz/fdsnws/event/1/query"

# Hamilton-centred bbox widened to the active central North Island.
BBOX = {
    "minlatitude": -39.5, "maxlatitude": -36.5,
    "minlongitude": 174.0, "maxlongitude": 177.5,
}
MIN_MAG = 2.0          # drop the noise floor; keeps the animation legible
START_YEAR = 2020
END_YEAR = 2026        # inclusive upper paging bound (current year)

# Magnitude band -> (#rrggbbaa) Viridis-ish dark->bright, and radius metres.
def mag_color(mag: float) -> str:
    if mag >= 5.0:
        return "#fde725ee"   # yellow
    if mag >= 4.0:
        return "#5ec962ee"   # green
    if mag >= 3.0:
        return "#21918cee"   # teal
    return "#3b528bee"       # blue


def mag_radius(mag: float) -> int:
    # Exponential-ish so big quakes read clearly; clamped for sanity.
    return int(min(2000, max(60, 40 * (mag ** 2))))


def fetch_year(year: int) -> str:
    params = {
        "starttime": f"{year}-01-01T00:00:00",
        "endtime": f"{year + 1}-01-01T00:00:00",
        "minmagnitude": MIN_MAG,
        "format": "text",
        "orderby": "time",
        **BBOX,
    }
    url = SERVICE + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001 - simple retry for a one-off pull
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1} ({year}) after error: {e}")
            time.sleep(2 * (attempt + 1))
    return ""


def main() -> None:
    rows = []
    for year in range(START_YEAR, END_YEAR + 1):
        text = fetch_year(year)
        lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
        kept = 0
        for ln in lines:
            f = ln.split("|")
            if len(f) < 14:
                continue
            event_id, tstr, lat, lon, depth = f[0], f[1], f[2], f[3], f[4]
            magtype, mag, loc, etype = f[9], f[10], f[12], f[13]
            if etype != "earthquake":
                continue
            try:
                latf, lonf, magf = float(lat), float(lon), float(mag)
                depthf = float(depth) if depth else 0.0
            except ValueError:
                continue
            # GeoNet times are UTC ISO without zone suffix.
            t = dt.datetime.fromisoformat(tstr).replace(tzinfo=dt.timezone.utc)
            tip = (
                f"<div><strong>M{magf:.1f} earthquake</strong>"
                f"<br><span>{loc}</span>"
                f"<br><span>{t:%Y-%m-%d %H:%M} UTC</span>"
                f"<br><span>Depth: {depthf:.0f} km ({magtype})</span></div>"
            )
            rows.append({
                "geometry_id": event_id,
                "layer_type": "scatter",
                "point1_latitude": round(latf, 5),
                "point1_longitude": round(lonf, 5),
                "scatter_radius": mag_radius(magf),
                "heatmap_weight": round(magf, 1),
                "scatter_fill_color_hex": mag_color(magf),
                "magnitude": round(magf, 1),
                "mag_type": magtype,
                "depth_km": round(depthf, 1),
                "location": loc,
                "origin_time_utc": t.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "timestamp": int(t.timestamp()),
                "tooltip_html": tip,
            })
            kept += 1
        print(f"  {year}: {kept} earthquakes (total {len(rows)})")

    rows.sort(key=lambda r: r["timestamp"])
    cols = list(rows[0].keys())
    with open(OUT, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} earthquake points to {OUT}")


if __name__ == "__main__":
    main()
