from __future__ import annotations

import html
import json
import math
import re
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import Point
from shapely.ops import unary_union
from shapely.prepared import prep

try:
    import wkp
except ModuleNotFoundError:
    wkp = None

OUTPUT_CRS = "EPSG:4326"
ANALYSIS_CRS = "EPSG:2193"
EARTH_RADIUS_KM = 6371.0088
HAMILTON_TLA_NAME = "Hamilton City"
HAMILTON_SA2_MIN_TLA_COVERAGE_RATIO = 0.9
HAMILTON_ROAD_CONTEXT_BUFFER_M = 250

NZTA_TRAFFIC_COUNT_SITES_ITEM_ID = "b90f8908910f44a493c6501c3565ed2d"
NZTA_TRAFFIC_COUNT_SITES_FEATURESERVER_URL = (
    "https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/Assets_SHTrafficMonitoringSites/FeatureServer"
)
STATSNZ_TERRITORIAL_AUTHORITY_2023_FEATURESERVER_URL = (
    "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services/Territorial_Authority_2023/FeatureServer"
)
STATSNZ_TERRITORIAL_AUTHORITY_2023_SOURCE_URL = (
    "https://datafinder.stats.govt.nz/layer/111194-territorial-authority-2023-generalised/"
)
STATSNZ_SA2_2023_FEATURESERVER_URL = (
    "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/ArcGIS/rest/services/SA2_2023/FeatureServer"
)
STATSNZ_SA2_2023_SOURCE_URL = "https://datafinder.stats.govt.nz/layer/111227-statistical-area-2-2023-generalised/"
AT_GTFS_URL = "https://gtfs.at.govt.nz/gtfs.zip"
METLINK_GTFS_URL = "https://static.opendata.metlink.org.nz/v1/gtfs/full.zip"

# Waka Kotahi / NZTA Crash Analysis System (CAS) open ArcGIS FeatureServer; no key required.
NZTA_CAS_CRASH_FEATURESERVER_URL = (
    "https://services.arcgis.com/CXBb7LAjgIIdcsPt/arcgis/rest/services/CAS_Data_Public/FeatureServer"
)
NZTA_CAS_CRASH_SOURCE_URL = "https://opendata-nzta.opendata.arcgis.com/datasets/NZTA::crash-analysis-system-cas-data-1"

# Stats NZ Territorial Authority 2023 generalised boundary via Datafinder WFS (requires DATAFINDER_API_KEY).
DATAFINDER_WFS_URL_TEMPLATE = "https://datafinder.stats.govt.nz/services;key={api_key}/wfs"
DATAFINDER_TERRITORIAL_AUTHORITY_2023_LAYER_ID = 111194
DATAFINDER_TERRITORIAL_AUTHORITY_2023_SOURCE_URL = (
    "https://datafinder.stats.govt.nz/layer/111194-territorial-authority-2023-generalised/"
)

# Real Stats NZ building consents by TA x type. Preferred path is the no-key open CSV export that backs the
# "Building consents by territorial authority" dataset; the Aria OpenData API (STATSNZ_API_KEY) is the fallback.
STATSNZ_BUILDING_CONSENTS_CSV_URL = (
    "https://www.stats.govt.nz/assets/Uploads/Building-consents-issued/"
    "Building-consents-issued-by-territorial-authority/Download-data/building-consents-by-ta-by-type.csv"
)
STATSNZ_OPENDATA_API_BASE = "https://api.stats.govt.nz/opendata/v1"
STATSNZ_BUILDING_CONSENTS_OPENDATA_RESOURCE = "BuildingConsentsByTerritorialAuthority"
STATSNZ_BUILDING_CONSENTS_SOURCE_URL = (
    "https://www.stats.govt.nz/information-releases/building-consents-issued/"
)

# Map the published Stats NZ residential/non-residential breakdown onto the five visual categories.
CONSENT_CATEGORY_COLOR = {
    "Houses": "#2c7fb8cc",
    "Townhouses": "#7fbc41cc",
    "Apartments": "#d7301fcc",
    "Retirement units": "#fdae61cc",
    "Non-residential": "#7a7a7acc",
}
# Recognised Stats NZ building-type labels -> visual category. Anything residential-but-unmatched is carried as
# published; we never apportion across types we cannot distinguish.
STATSNZ_BUILDING_TYPE_TO_CATEGORY = {
    "houses": "Houses",
    "stand-alone houses": "Houses",
    "town houses, flats, units and other dwellings": "Townhouses",
    "townhouses, flats, units, and other dwellings": "Townhouses",
    "apartments": "Apartments",
    "retirement village units": "Retirement units",
    "non-residential": "Non-residential",
    "total non-residential": "Non-residential",
}

CONSENT_FLOOR_HEIGHT_M = 120.0   # metres per year-floor (equal height per year)
CONSENT_BOX_HALF_M = 70.0        # half-width of the thin prism footprint, metres

# GeoNet FDSN event web service (open, no key). Earthquakes for the time-slider animation.
GEONET_FDSN_EVENT_URL = "https://service.geonet.org.nz/fdsnws/event/1/query"
# NZ-wide bounding box (parameters): widened from the reference script's central North Island box to all of NZ.
GEONET_BBOX = {
    "minlatitude": -48.0,
    "maxlatitude": -34.0,
    "minlongitude": 166.0,
    "maxlongitude": 179.0,
}
GEONET_MIN_MAGNITUDE = 2.0       # noise floor; raise (e.g. 3.0) to cut row count for the visual window
GEONET_START_YEAR = 2020
GEONET_END_YEAR = 2026           # inclusive upper paging bound
GEONET_FDSN_MAX_ROWS = 10_000    # service hard cap per request; we time-window to stay under it

PUBLIC_ARTIFACT_FILES = {
    "traffic_count_sites": "nzta_traffic_count_sites_wgs84.csv",
    "at_gtfs": "at_gtfs.zip",
    "metlink_gtfs": "metlink_gtfs.zip",
    "cas_crashes": "nzta_cas_crashes_wgs84.csv",
    "ta_boundaries": "statsnz_territorial_authority_2023_generalised.geojson",
    "ta_building_consents": "statsnz_building_consents_by_ta_by_type.csv",
    "geonet_earthquakes": "geonet_earthquakes_nz_wgs84.csv",
}

OPTIONAL_PUBLIC_ARTIFACT_FILES = {
    "hamilton_tla_boundary": "statsnz_hamilton_territorial_authority_2023_generalised.geojson",
    "hamilton_sa2_boundaries": "statsnz_hamilton_sa2_2023_generalised.geojson",
}

PUBLIC_SOURCE_LAYERS = {
    "nzta_state_highway_traffic_monitoring_sites": {
        "arcgis_item_id": NZTA_TRAFFIC_COUNT_SITES_ITEM_ID,
        "url": NZTA_TRAFFIC_COUNT_SITES_FEATURESERVER_URL,
        "description": "NZTA state highway traffic monitoring sites FeatureServer; site summary only.",
    },
    "auckland_transport_gtfs": {
        "url": AT_GTFS_URL,
        "description": "Official Auckland Transport GTFS feed; ferry routes use route_type 4.",
    },
    "metlink_gtfs": {
        "url": METLINK_GTFS_URL,
        "description": "Official Metlink GTFS feed; ferry routes use route_type 4.",
    },
    "statsnz_territorial_authority_2023_generalised": {
        "url": STATSNZ_TERRITORIAL_AUTHORITY_2023_SOURCE_URL,
        "feature_server": STATSNZ_TERRITORIAL_AUTHORITY_2023_FEATURESERVER_URL,
        "description": "Stats NZ Territorial Authority 2023 generalised boundary; Hamilton City row only is cached for the public demo.",
    },
    "statsnz_sa2_2023_generalised": {
        "url": STATSNZ_SA2_2023_SOURCE_URL,
        "feature_server": STATSNZ_SA2_2023_FEATURESERVER_URL,
        "description": "Stats NZ Statistical Area 2 2023 generalised boundaries; rows with more than 90% of their area inside the Hamilton TLA are cached for the public demo.",
    },
    "nzta_cas_crashes": {
        "url": NZTA_CAS_CRASH_SOURCE_URL,
        "feature_server": NZTA_CAS_CRASH_FEATURESERVER_URL,
        "description": "Waka Kotahi / NZTA Crash Analysis System (CAS) open crash points; no API key. NZ-wide, capped by a crash-year / injury filter to fit the visual row window.",
    },
    "statsnz_territorial_authority_2023_generalised_datafinder": {
        "url": DATAFINDER_TERRITORIAL_AUTHORITY_2023_SOURCE_URL,
        "wfs": DATAFINDER_WFS_URL_TEMPLATE,
        "layer_id": DATAFINDER_TERRITORIAL_AUTHORITY_2023_LAYER_ID,
        "description": "Stats NZ Territorial Authority 2023 generalised boundaries via Datafinder WFS (requires DATAFINDER_API_KEY); used as the TA spatial unit for the building-consents stacked-prism towers.",
    },
    "statsnz_building_consents_by_ta": {
        "url": STATSNZ_BUILDING_CONSENTS_SOURCE_URL,
        "csv": STATSNZ_BUILDING_CONSENTS_CSV_URL,
        "opendata_api": STATSNZ_OPENDATA_API_BASE,
        "description": "Stats NZ real building consents by territorial authority x year x building type. No-key open CSV export is preferred; the Aria OpenData API (STATSNZ_API_KEY) is the fallback. Counts are never fabricated or apportioned.",
    },
    "geonet_fdsn_earthquakes": {
        "url": GEONET_FDSN_EVENT_URL,
        "docs": "https://www.geonet.org.nz/data/access/FDSN",
        "description": "GeoNet FDSN event web service (open, no key). NZ-wide earthquake epicentres for the time-slider animation; paged by time window to avoid the 10,000-row per-request cap.",
    },
}

ROAD_SURFACE_COLORS = {
    "sealed": "#1464a5cc",
    "metalled": "#bb7f22cc",
    "unmetalled": "#734a12cc",
    "unsealed": "#bb7f22cc",
    "4wd": "#734a12cc",
    "Unknown": "#8b8f94cc",
}

MAGMA_COLOR_STOPS = [
    "#000004",
    "#140e36",
    "#3b0f70",
    "#641a80",
    "#8c2981",
    "#b73779",
    "#de4968",
    "#f7705c",
    "#fe9f6d",
    "#fecf92",
    "#fcfdbf",
]

RED_COLOR_STOPS = [
    "#fee5e5",
    "#fca5a5",
    "#f87171",
    "#dc2626",
    "#7f1d1d",
]


def require_columns(df: pd.DataFrame, columns: list[str], table_name: str) -> None:
    missing = [column for column in columns if column not in df.columns]
    if missing:
        raise ValueError(f"{table_name} is missing required columns: {missing}")


def coalesce_columns(df: pd.DataFrame, candidates: tuple[str, ...], default: object = pd.NA) -> pd.Series:
    existing = [candidate for candidate in candidates if candidate in df.columns]
    if not existing:
        return pd.Series(default, index=df.index)
    result = df[existing[0]]
    for column in existing[1:]:
        result = result.fillna(df[column])
    return result


def clean_string(series: pd.Series, *, default: str | None = None) -> pd.Series:
    result = series.astype("string").str.strip()
    result = result.mask(result.eq(""), pd.NA)
    if default is not None:
        result = result.fillna(default)
    return result


def rank_desc_nullable(series: pd.Series, mask: pd.Series | None = None) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    valid = values.notna()
    if mask is not None:
        valid = valid & mask.fillna(False)
    result = pd.Series(pd.NA, index=series.index, dtype="Int64")
    if valid.any():
        result.loc[valid] = values.loc[valid].rank(method="first", ascending=False).astype("Int64")
    return result


def log_scaled_width(series: pd.Series, *, min_width: int, max_width: int) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    positive = values[values > 0]
    if positive.empty:
        return pd.Series(0, index=series.index, dtype="Int64")

    log_min = math.log1p(float(positive.min()))
    log_max = math.log1p(float(positive.max()))
    log_range = max(log_max - log_min, 1e-9)

    def width(value) -> int:
        if pd.isna(value) or value <= 0:
            return 0
        normalized = (math.log1p(float(value)) - log_min) / log_range
        normalized = max(0.0, min(1.0, normalized))
        return int(round(min_width + (max_width - min_width) * normalized, 0))

    return values.apply(width).astype("Int64")


def power_bi_field_name(value: object) -> str:
    return re.sub(r"[^0-9a-zA-Z]+", "_", str(value)).strip("_").lower()


def rgb_from_hex(value: str) -> tuple[int, int, int]:
    text = value.strip().lstrip("#")
    return tuple(int(text[index : index + 2], 16) for index in (0, 2, 4))


def interpolate_hex_color(color_stops: list[str], normalized: float, *, alpha: str = "cc") -> str:
    normalized = max(0.0, min(1.0, normalized))
    scaled = normalized * (len(color_stops) - 1)
    lower_index = int(math.floor(scaled))
    upper_index = min(lower_index + 1, len(color_stops) - 1)
    fraction = scaled - lower_index
    lower_rgb = rgb_from_hex(color_stops[lower_index])
    upper_rgb = rgb_from_hex(color_stops[upper_index])
    channels = [
        round(lower_rgb[index] + (upper_rgb[index] - lower_rgb[index]) * fraction)
        for index in range(3)
    ]
    return "#" + "".join(f"{channel:02x}" for channel in channels) + alpha


def scaled_color_series(
    series: pd.Series,
    color_stops: list[str],
    *,
    alpha: str = "cc",
    log_scale: bool = False,
) -> pd.Series:
    values = pd.to_numeric(series, errors="coerce")
    positive = values[values > 0]
    if positive.empty:
        return pd.Series(interpolate_hex_color(color_stops, 0.0, alpha=alpha), index=series.index)

    if log_scale:
        scaled_values = values.apply(lambda value: math.log1p(float(value)) if pd.notna(value) and value > 0 else pd.NA)
        scaled_positive = scaled_values[values > 0]
    else:
        scaled_values = values
        scaled_positive = positive

    scaled_min = float(scaled_positive.min())
    scaled_max = float(scaled_positive.max())
    scaled_range = max(scaled_max - scaled_min, 1e-9)

    def color(value) -> str:
        if pd.isna(value) or value <= 0:
            return interpolate_hex_color(color_stops, 0.0, alpha=alpha)
        scaled_value = math.log1p(float(value)) if log_scale else float(value)
        normalized = (scaled_value - scaled_min) / scaled_range
        return interpolate_hex_color(color_stops, normalized, alpha=alpha)

    return values.apply(color)


def magma_color_series(series: pd.Series, *, alpha: str = "cc") -> pd.Series:
    return scaled_color_series(series, MAGMA_COLOR_STOPS, alpha=alpha, log_scale=True)


def red_color_series(series: pd.Series, *, alpha: str = "cc") -> pd.Series:
    return scaled_color_series(series, RED_COLOR_STOPS, alpha=alpha)


def format_count(value) -> str:
    if pd.isna(value):
        return "Not available"
    return f"{int(round(float(value))):,}"


def format_decimal(value, *, decimals: int = 1, suffix: str = "") -> str:
    if pd.isna(value):
        return "Not available"
    return f"{float(value):,.{decimals}f}{suffix}"


def tooltip_html(title: object, rows: list[tuple[str, object]]) -> str:
    title_text = "" if pd.isna(title) else str(title).strip()
    if not title_text:
        title_text = "Map feature"
    parts = [f"<strong>{html.escape(title_text)}</strong>"]
    for label, value in rows:
        if pd.isna(value):
            continue
        value_text = str(value).strip()
        if not value_text:
            continue
        parts.append(f"<br><span>{html.escape(label)}: {html.escape(value_text)}</span>")
    return "<div>" + "".join(parts) + "</div>"


def tooltip_rows_html(rows: list[tuple[str, object]]) -> str:
    parts = []
    for label, value in rows:
        if pd.isna(value):
            continue
        value_text = str(value).strip()
        if not value_text:
            continue
        line_break = "<br>" if parts else ""
        parts.append(f"{line_break}<span>{html.escape(label)}: {html.escape(value_text)}</span>")
    return "<div>" + "".join(parts) + "</div>"


def sa2_tooltip_value(row: pd.Series, prefix: str) -> object:
    code = row.get(f"{prefix}_sa2_code")
    name = row.get(f"{prefix}_sa2_name")
    if pd.isna(name) or not str(name).strip():
        name = row.get(f"{prefix}_sa2_reference_name")

    code_text = "" if pd.isna(code) else str(code).strip()
    name_text = "" if pd.isna(name) else str(name).strip()
    if name_text and code_text:
        return f"{name_text} ({code_text})"
    return name_text or code_text or pd.NA


def traffic_tooltip_html(description, latest_aadt) -> str:
    description_text = "" if pd.isna(description) else str(description).strip()
    if not description_text:
        description_text = "Traffic count site"
    return tooltip_html(description_text, [("Latest AADT", format_count(latest_aadt))])


def place_tooltip_html(row: pd.Series) -> str:
    return tooltip_html(
        row.get("place_name"),
        [
            ("Type", row.get("place_type")),
            ("Territorial authority", row.get("territorial_authority_name")),
            ("Road length", format_decimal(row.get("road_length_total_km"), decimals=1, suffix=" km")),
            ("Road density", format_decimal(row.get("road_density_km_per_km2"), decimals=2, suffix=" km/km2")),
            ("Area", format_decimal(row.get("place_area_km2"), decimals=1, suffix=" km2")),
        ],
    )


def road_tooltip_html(row: pd.Series) -> str:
    road_name = row.get("road_name")
    if pd.isna(road_name) or not str(road_name).strip():
        road_name = f"Road {row.get('road_feature_id')}"
    return tooltip_html(
        road_name,
        [
            ("Surface", row.get("road_surface")),
            ("Length", format_decimal(row.get("road_length_total_km"), decimals=2, suffix=" km")),
            ("Length rank", format_count(row.get("road_length_rank"))),
        ],
    )


def arc_tooltip_html(row: pd.Series) -> str:
    return tooltip_rows_html(
        [
            ("Origin SA2", sa2_tooltip_value(row, "origin")),
            ("Destination SA2", sa2_tooltip_value(row, "destination")),
            ("People count", format_count(row.get("people_count"))),
        ],
    )


def traffic_site_tooltip_html(row: pd.Series) -> str:
    return tooltip_html(
        row.get("description"),
        [
            ("Site ref", row.get("site_ref")),
            ("Region", row.get("region")),
            ("State highway", row.get("state_highway")),
            ("Site type", row.get("site_type")),
            ("Latest AADT", format_count(row.get("latest_aadt"))),
            ("Heavy vehicles", format_decimal(row.get("percent_heavy"), decimals=1, suffix="%")),
        ],
    )


def ferry_tooltip_html(row: pd.Series) -> str:
    title = row.get("route_long_name")
    if pd.isna(title) or not str(title).strip():
        title = row.get("route_short_name")
    if pd.isna(title) or not str(title).strip():
        title = row.get("route_id")
    return tooltip_html(
        title,
        [
            ("Provider", row.get("provider")),
            ("Route", row.get("route_short_name")),
            ("Route ID", row.get("route_id")),
            ("Direction", row.get("direction_id")),
            ("Trip count", format_count(row.get("trip_count"))),
            ("Route length", format_decimal(row.get("route_length_km"), decimals=1, suffix=" km")),
        ],
    )


def fetch_arcgis_feature_layer(
    service_url: str,
    *,
    layer_id: int = 0,
    where: str = "1=1",
    query_params: dict[str, object] | None = None,
    page_size: int = 2000,
    out_crs: str = OUTPUT_CRS,
    timeout_seconds: int = 120,
    max_rows: int | None = None,
) -> gpd.GeoDataFrame:
    features = []
    offset = 0
    query_url = f"{service_url.rstrip('/')}/{layer_id}/query"
    out_sr = out_crs.split(":")[-1]

    while True:
        params = {
            "f": "geojson",
            "where": where,
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": out_sr,
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "orderByFields": "OBJECTID",
        }
        if query_params:
            params.update(query_params)

        response = requests.get(
            query_url,
            params=params,
            headers={"User-Agent": "city-transportation-powerbi-demo/1.0"},
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if "error" in payload:
            raise RuntimeError(f"ArcGIS FeatureServer returned an error: {payload['error']}")
        page_features = payload.get("features", [])
        print(f"ArcGIS layer {layer_id}: fetched {len(page_features):,} features starting at {offset:,}.")
        features.extend(page_features)
        if max_rows is not None and len(features) >= max_rows:
            features = features[:max_rows]
            break
        if len(page_features) < page_size:
            break
        offset += page_size

    return gpd.GeoDataFrame.from_features(features, crs=out_crs)


def load_geojson_artifact(path: Path) -> gpd.GeoDataFrame | None:
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    return gpd.GeoDataFrame.from_features(payload.get("features", []), crs=OUTPUT_CRS)


def load_optional_public_artifacts(artifact_dir: Path) -> dict[str, object]:
    return {
        "territorial_authority_boundary": load_geojson_artifact(
            artifact_dir / OPTIONAL_PUBLIC_ARTIFACT_FILES["hamilton_tla_boundary"]
        ),
        "sa2_boundary": load_geojson_artifact(
            artifact_dir / OPTIONAL_PUBLIC_ARTIFACT_FILES["hamilton_sa2_boundaries"]
        ),
    }


def download_file(url: str, path: Path, *, timeout_seconds: int = 300) -> None:
    response = requests.get(
        url,
        headers={"User-Agent": "city-transportation-powerbi-demo/1.0"},
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    path.write_bytes(response.content)
    print(f"Downloaded {url} to {path.name} ({path.stat().st_size / 1_000_000:.2f} MB).")


def public_artifacts_available(artifact_dir: Path) -> bool:
    return all((artifact_dir / filename).exists() for filename in PUBLIC_ARTIFACT_FILES.values())


def load_public_artifacts(artifact_dir: Path) -> dict[str, object]:
    traffic_count_sites = pd.read_csv(artifact_dir / PUBLIC_ARTIFACT_FILES["traffic_count_sites"], low_memory=False)
    traffic_count_sites = gpd.GeoDataFrame(
        traffic_count_sites,
        geometry=gpd.points_from_xy(traffic_count_sites["longitude"], traffic_count_sites["latitude"]),
    )

    crashes_path = artifact_dir / PUBLIC_ARTIFACT_FILES["cas_crashes"]
    crashes = None
    if crashes_path.exists():
        crashes_csv = pd.read_csv(crashes_path, low_memory=False)
        crashes = gpd.GeoDataFrame(
            crashes_csv,
            geometry=gpd.points_from_xy(crashes_csv["longitude"], crashes_csv["latitude"]),
            crs=OUTPUT_CRS,
        )

    ta_boundaries = load_geojson_artifact(artifact_dir / PUBLIC_ARTIFACT_FILES["ta_boundaries"])
    consents_path = artifact_dir / PUBLIC_ARTIFACT_FILES["ta_building_consents"]
    ta_building_consents = pd.read_csv(consents_path, low_memory=False) if consents_path.exists() else None

    earthquakes_path = artifact_dir / PUBLIC_ARTIFACT_FILES["geonet_earthquakes"]
    geonet_earthquakes = pd.read_csv(earthquakes_path, low_memory=False) if earthquakes_path.exists() else None

    public_inputs = {
        "traffic_count_sites": traffic_count_sites,
        "gtfs_feeds": {
            "Auckland Transport": artifact_dir / PUBLIC_ARTIFACT_FILES["at_gtfs"],
            "Metlink": artifact_dir / PUBLIC_ARTIFACT_FILES["metlink_gtfs"],
        },
        "cas_crashes": crashes,
        "ta_boundaries": ta_boundaries,
        "ta_building_consents": ta_building_consents,
        "geonet_earthquakes": geonet_earthquakes,
        "public_source_mode": "prepared_public_artifacts",
    }
    public_inputs.update(load_optional_public_artifacts(artifact_dir))
    return public_inputs


def refresh_public_source_artifacts(
    artifact_dir: Path,
    *,
    output_crs: str = OUTPUT_CRS,
    crash_min_year: int | None = 2020,
    crash_injury_only: bool = False,
    crash_tla_name: str | None = None,
    crash_max_rows: int | None = None,
    earthquake_min_magnitude: float = GEONET_MIN_MAGNITUDE,
    earthquake_start_year: int = GEONET_START_YEAR,
    earthquake_end_year: int = GEONET_END_YEAR,
) -> dict[str, object]:
    artifact_dir.mkdir(parents=True, exist_ok=True)

    traffic_count_sites = fetch_arcgis_feature_layer(NZTA_TRAFFIC_COUNT_SITES_FEATURESERVER_URL, out_crs=output_crs)
    traffic_export = pd.DataFrame(traffic_count_sites.drop(columns="geometry"))
    traffic_export["longitude"] = traffic_count_sites.geometry.x
    traffic_export["latitude"] = traffic_count_sites.geometry.y
    traffic_export.to_csv(
        artifact_dir / PUBLIC_ARTIFACT_FILES["traffic_count_sites"],
        index=False,
        encoding="utf-8",
        lineterminator="\n",
    )
    download_file(AT_GTFS_URL, artifact_dir / PUBLIC_ARTIFACT_FILES["at_gtfs"])
    download_file(METLINK_GTFS_URL, artifact_dir / PUBLIC_ARTIFACT_FILES["metlink_gtfs"])
    hamilton_tla_boundary = fetch_arcgis_feature_layer(
        STATSNZ_TERRITORIAL_AUTHORITY_2023_FEATURESERVER_URL,
        where=f"TA2023_V1_00_NAME = '{HAMILTON_TLA_NAME}'",
        out_crs=output_crs,
    )
    hamilton_boundary_path = artifact_dir / OPTIONAL_PUBLIC_ARTIFACT_FILES["hamilton_tla_boundary"]
    hamilton_boundary_path.write_text(hamilton_tla_boundary.to_json(), encoding="utf-8")
    print(f"Downloaded Hamilton TLA boundary to {hamilton_boundary_path.name}.")

    hamilton_boundary_geometry = hamilton_tla_boundary.geometry.union_all()
    min_lon, min_lat, max_lon, max_lat = hamilton_boundary_geometry.bounds
    hamilton_sa2_boundaries = fetch_arcgis_feature_layer(
        STATSNZ_SA2_2023_FEATURESERVER_URL,
        out_crs=output_crs,
        query_params={
            "geometry": json.dumps(
                {
                    "xmin": min_lon,
                    "ymin": min_lat,
                    "xmax": max_lon,
                    "ymax": max_lat,
                    "spatialReference": {"wkid": int(output_crs.split(":")[-1])},
                }
            ),
            "geometryType": "esriGeometryEnvelope",
            "inSR": output_crs.split(":")[-1],
            "spatialRel": "esriSpatialRelIntersects",
        },
    )
    sa2_mask = geodataframe_boundary_coverage_mask(hamilton_sa2_boundaries, boundary=hamilton_boundary_geometry)
    hamilton_sa2_boundaries = hamilton_sa2_boundaries[sa2_mask].copy()
    hamilton_sa2_path = artifact_dir / OPTIONAL_PUBLIC_ARTIFACT_FILES["hamilton_sa2_boundaries"]
    hamilton_sa2_boundaries.to_file(hamilton_sa2_path, driver="GeoJSON")
    print(f"Downloaded Hamilton SA2 boundaries with >90% TLA coverage to {hamilton_sa2_path.name}.")

    # NZTA CAS crash points (no key). Row-window knob: crash_min_year / crash_injury_only / crash_tla_name.
    crashes = fetch_cas_crashes(
        where=crash_where_clause(
            min_crash_year=crash_min_year, injury_only=crash_injury_only, tla_name=crash_tla_name
        ),
        out_crs=output_crs,
        max_rows=crash_max_rows,
    )
    crashes = crashes[crashes.geometry.notna() & ~crashes.geometry.is_empty].copy()
    crashes = crashes[crashes.geometry.geom_type.eq("Point")].copy()
    crash_export = pd.DataFrame(crashes.drop(columns="geometry"))
    crash_export["longitude"] = crashes.geometry.x
    crash_export["latitude"] = crashes.geometry.y
    crash_export.to_csv(
        artifact_dir / PUBLIC_ARTIFACT_FILES["cas_crashes"], index=False, encoding="utf-8", lineterminator="\n"
    )
    print(f"Downloaded {len(crash_export):,} NZTA CAS crash points to {PUBLIC_ARTIFACT_FILES['cas_crashes']}.")

    # Stats NZ TA 2023 generalised boundaries (requires DATAFINDER_API_KEY) for the consents tower footprints.
    import os

    datafinder_key = os.environ.get("DATAFINDER_API_KEY")
    if not datafinder_key:
        raise RuntimeError(
            "DATAFINDER_API_KEY is required to fetch Stats NZ Territorial Authority 2023 boundaries for the "
            "building-consents towers. Set it, or supply a prepared "
            f"'{PUBLIC_ARTIFACT_FILES['ta_boundaries']}' artifact and run with REFRESH_PUBLIC_DEMO_SOURCES=false."
        )
    ta_boundaries = fetch_ta_boundaries(api_key=datafinder_key, srs_name=output_crs)
    ta_boundaries_path = artifact_dir / PUBLIC_ARTIFACT_FILES["ta_boundaries"]
    ta_boundaries_path.write_text(ta_boundaries.to_json(), encoding="utf-8")
    print(f"Downloaded {len(ta_boundaries):,} TA boundaries to {ta_boundaries_path.name}.")

    # Real Stats NZ building consents by TA x year x type (no-key CSV preferred; STATSNZ_API_KEY fallback).
    consents = fetch_ta_building_consents()
    consents.to_csv(
        artifact_dir / PUBLIC_ARTIFACT_FILES["ta_building_consents"],
        index=False,
        encoding="utf-8",
        lineterminator="\n",
    )
    print(f"Cached {len(consents):,} TA x year x type consent rows to {PUBLIC_ARTIFACT_FILES['ta_building_consents']}.")

    # GeoNet FDSN earthquakes (no key), NZ-wide, time-windowed paging around the 10k cap. Row-window knobs:
    # earthquake_min_magnitude (raise to M3+ to cut counts) and the start/end year range.
    earthquakes = fetch_geonet_earthquakes(
        min_magnitude=earthquake_min_magnitude,
        start_year=earthquake_start_year,
        end_year=earthquake_end_year,
    )
    earthquakes.to_csv(
        artifact_dir / PUBLIC_ARTIFACT_FILES["geonet_earthquakes"],
        index=False,
        encoding="utf-8",
        lineterminator="\n",
    )
    print(f"Downloaded {len(earthquakes):,} GeoNet earthquakes to {PUBLIC_ARTIFACT_FILES['geonet_earthquakes']}.")

    public_inputs = load_public_artifacts(artifact_dir)
    public_inputs["public_source_mode"] = "refreshed_public_artifacts"
    return public_inputs


def prepare_traffic_count_site_point(
    sites_raw: gpd.GeoDataFrame,
    *,
    output_crs: str = OUTPUT_CRS,
) -> pd.DataFrame:
    required_columns = [
        "region",
        "sh",
        "rs",
        "rp",
        "description",
        "lane",
        "type",
        "equipmentcurrent",
        "accepteddays",
        "siteref",
        "sitetype",
        "percentheavy",
        "aadt5yearsago",
        "aadt4yearsago",
        "aadt3yearsago",
        "aadt2yearsago",
        "aadt1yearago",
    ]
    require_columns(sites_raw, required_columns, "NZTA traffic count sites")

    sites = sites_raw.copy()
    if sites.crs is not None and str(sites.crs).upper() != output_crs.upper():
        sites = sites.to_crs(output_crs)
    sites = sites[sites.geometry.notna() & ~sites.geometry.is_empty].copy()

    result = pd.DataFrame(index=sites.index)
    result["site_ref"] = clean_string(sites["siteref"], default="unknown")
    object_id = coalesce_columns(sites, ("OBJECTID", "objectid", "ObjectId"))
    result["object_id"] = pd.to_numeric(object_id, errors="coerce").round().astype("Int64")
    result["region"] = clean_string(sites["region"], default="Unknown")
    highway = clean_string(sites["sh"])
    highway = highway.str.replace(r"^SH\s*", "", case=False, regex=True)
    result["state_highway"] = ("SH " + highway).where(highway.notna(), pd.NA)
    result["reference_station"] = pd.to_numeric(sites["rs"], errors="coerce")
    result["reference_position_km"] = pd.to_numeric(sites["rp"], errors="coerce").round(3)
    result["description"] = clean_string(sites["description"])
    result["lane"] = clean_string(sites["lane"])
    result["monitoring_type"] = clean_string(sites["type"])
    result["site_type"] = clean_string(sites["sitetype"], default="Unknown")
    result["equipment_current"] = clean_string(sites["equipmentcurrent"], default="Unknown")
    result["accepted_days"] = pd.to_numeric(sites["accepteddays"], errors="coerce").round().astype("Int64")
    result["percent_heavy"] = pd.to_numeric(sites["percentheavy"], errors="coerce").round(2)

    aadt_columns = {
        "aadt5yearsago": "aadt_5_years_ago",
        "aadt4yearsago": "aadt_4_years_ago",
        "aadt3yearsago": "aadt_3_years_ago",
        "aadt2yearsago": "aadt_2_years_ago",
        "aadt1yearago": "aadt_1_year_ago",
    }
    for raw_column, export_column in aadt_columns.items():
        result[export_column] = pd.to_numeric(sites[raw_column], errors="coerce").round().astype("Int64")

    result["latest_aadt"] = result["aadt_1_year_ago"]
    result["latest_aadt_rank"] = rank_desc_nullable(result["latest_aadt"])
    denominator = pd.to_numeric(result["aadt_5_years_ago"], errors="coerce")
    numerator = pd.to_numeric(result["latest_aadt"], errors="coerce") - denominator
    result["aadt_change_5yr_percent"] = (numerator / denominator.where(denominator > 0) * 100).round(1)

    result["latitude"] = sites.geometry.y.round(7)
    result["longitude"] = sites.geometry.x.round(7)
    result["point_radius_m"] = log_scaled_width(result["latest_aadt"], min_width=80, max_width=650)
    result["point_fill_color_value"] = result["latest_aadt"]
    result["point_line_color_value"] = result["latest_aadt"]
    result["point_fill_color_hex"] = magma_color_series(result["latest_aadt"], alpha="cc")
    result["point_line_color_hex"] = magma_color_series(result["latest_aadt"], alpha="ff")
    result["point_line_width_m"] = 20
    result["tooltip_html"] = result.apply(traffic_site_tooltip_html, axis=1)
    result["layer_type"] = "point"

    base_id = "nzta_tms_site_" + result["site_ref"].apply(power_bi_field_name).replace("", "unknown")
    sequence = base_id.groupby(base_id).cumcount()
    result["geometry_id"] = base_id.where(sequence.eq(0), base_id + "__" + (sequence + 1).astype("string"))

    ordered_columns = [
        "geometry_id",
        "layer_type",
        "site_ref",
        "object_id",
        "region",
        "state_highway",
        "reference_station",
        "reference_position_km",
        "description",
        "lane",
        "monitoring_type",
        "site_type",
        "equipment_current",
        "accepted_days",
        "percent_heavy",
        "aadt_5_years_ago",
        "aadt_4_years_ago",
        "aadt_3_years_ago",
        "aadt_2_years_ago",
        "aadt_1_year_ago",
        "latest_aadt",
        "latest_aadt_rank",
        "aadt_change_5yr_percent",
        "latitude",
        "longitude",
        "point_radius_m",
        "point_fill_color_value",
        "point_line_color_value",
        "point_fill_color_hex",
        "point_line_color_hex",
        "point_line_width_m",
        "tooltip_html",
    ]
    return result[ordered_columns].sort_values(
        ["latest_aadt_rank", "region", "state_highway", "site_ref"],
        na_position="last",
    ).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Waka Kotahi / NZTA CAS crash points (scatter). Field mappings, weights, colours,
# severity codes, radius and tooltip replicate download_crashes.py exactly.
# ---------------------------------------------------------------------------

# Severity -> heatmap weight (drives heatmap intensity and any H3 hex aggregate).
CRASH_SEVERITY_WEIGHT = {
    "Fatal Crash": 8.0,
    "Serious Crash": 4.0,
    "Minor Crash": 2.0,
    "Non-Injury Crash": 1.0,
}
# Severity -> point colour (#rrggbbaa), Magma-ish ramp dark->bright.
CRASH_SEVERITY_COLOR = {
    "Fatal Crash": "#fcffa4ee",
    "Serious Crash": "#fb8861ee",
    "Minor Crash": "#b5367aee",
    "Non-Injury Crash": "#51127cee",
}
# Severity -> ordinal code (least->most severe).
CRASH_SEVERITY_CODE = {
    "Non-Injury Crash": 1,
    "Minor Crash": 2,
    "Serious Crash": 3,
    "Fatal Crash": 4,
}
CRASH_OUT_FIELDS = [
    "crashSeverity",
    "crashYear",
    "fatalCount",
    "seriousInjuryCount",
    "minorInjuryCount",
    "pedestrian",
    "bicycle",
    "motorcycle",
    "speedLimit",
    "tlaName",
]


def crash_where_clause(*, min_crash_year: int | None = None, injury_only: bool = False, tla_name: str | None = None) -> str:
    """Row-window filter knob so the NZ-wide export can be capped (CAS is ~800k+ points)."""
    clauses = []
    if min_crash_year is not None:
        clauses.append(f"crashYear >= {int(min_crash_year)}")
    if injury_only:
        clauses.append("crashSeverity <> 'Non-Injury Crash'")
    if tla_name:
        clauses.append(f"tlaName='{tla_name}'")
    return " AND ".join(clauses) if clauses else "1=1"


def fetch_cas_crashes(
    *,
    where: str = "1=1",
    page_size: int = 2000,
    out_crs: str = OUTPUT_CRS,
    max_rows: int | None = None,
) -> gpd.GeoDataFrame:
    """Page CAS crash points (resultOffset/resultRecordCount, outSR=4326, orderByFields=OBJECTID)."""
    crashes = fetch_arcgis_feature_layer(
        NZTA_CAS_CRASH_FEATURESERVER_URL,
        layer_id=0,
        where=where,
        query_params={"outFields": ",".join(CRASH_OUT_FIELDS)},
        page_size=page_size,
        out_crs=out_crs,
        max_rows=max_rows,
    )
    return crashes


def crash_tooltip_html(row: pd.Series) -> str:
    sev = row.get("crash_severity")
    sev_text = "Non-Injury Crash" if pd.isna(sev) or not str(sev).strip() else str(sev).strip()
    return (
        f"<div><strong>{html.escape(sev_text)}</strong>"
        f"<br><span>Year: {_crash_field(row.get('crash_year'))}</span>"
        f"<br><span>Speed limit: {_crash_field(row.get('speed_limit'))} km/h</span>"
        f"<br><span>Fatal: {_crash_field(row.get('fatal_count'))} | "
        f"Serious: {_crash_field(row.get('serious_injury_count'))} | "
        f"Minor: {_crash_field(row.get('minor_injury_count'))}</span></div>"
    )


def _crash_field(value: object) -> str:
    if pd.isna(value):
        return "None"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def prepare_crash_point(crashes_raw: gpd.GeoDataFrame, *, output_crs: str = OUTPUT_CRS) -> pd.DataFrame:
    """One scatter row per CAS crash with the exact download_crashes.py column contract."""
    require_columns(crashes_raw, ["crashSeverity"], "NZTA CAS crashes")
    crashes = crashes_raw.copy()
    if crashes.crs is not None and str(crashes.crs).upper() != output_crs.upper():
        crashes = crashes.to_crs(output_crs)
    crashes = crashes[crashes.geometry.notna() & ~crashes.geometry.is_empty].copy()
    crashes = crashes[crashes.geometry.geom_type.eq("Point")].copy()

    severity = clean_string(crashes["crashSeverity"], default="Non-Injury Crash")

    result = pd.DataFrame(index=crashes.index)
    result["layer_type"] = "scatter"
    result["point1_latitude"] = crashes.geometry.y.round(6)
    result["point1_longitude"] = crashes.geometry.x.round(6)
    result["scatter_radius"] = 25
    result["heatmap_weight"] = severity.map(CRASH_SEVERITY_WEIGHT).fillna(1.0).astype(float)
    result["scatter_fill_color_hex"] = severity.map(CRASH_SEVERITY_COLOR).fillna("#51127cee")
    result["crash_severity"] = severity
    result["crash_severity_code"] = severity.map(CRASH_SEVERITY_CODE).fillna(1).astype(int)
    result["crash_year"] = pd.to_numeric(crashes.get("crashYear"), errors="coerce").astype("Int64")
    result["fatal_count"] = pd.to_numeric(crashes.get("fatalCount"), errors="coerce").astype("Int64")
    result["serious_injury_count"] = pd.to_numeric(crashes.get("seriousInjuryCount"), errors="coerce").astype("Int64")
    result["minor_injury_count"] = pd.to_numeric(crashes.get("minorInjuryCount"), errors="coerce").astype("Int64")
    result["pedestrian"] = pd.to_numeric(crashes.get("pedestrian"), errors="coerce").astype("Int64")
    result["bicycle"] = pd.to_numeric(crashes.get("bicycle"), errors="coerce").astype("Int64")
    result["motorcycle"] = pd.to_numeric(crashes.get("motorcycle"), errors="coerce").astype("Int64")
    result["speed_limit"] = pd.to_numeric(crashes.get("speedLimit"), errors="coerce").astype("Int64")
    result["tooltip_html"] = result.apply(crash_tooltip_html, axis=1)

    result = result.reset_index(drop=True)
    result["geometry_id"] = "crash_" + result.index.astype("string")

    ordered_columns = [
        "geometry_id",
        "layer_type",
        "point1_latitude",
        "point1_longitude",
        "scatter_radius",
        "heatmap_weight",
        "scatter_fill_color_hex",
        "crash_severity",
        "crash_severity_code",
        "crash_year",
        "fatal_count",
        "serious_injury_count",
        "minor_injury_count",
        "pedestrian",
        "bicycle",
        "motorcycle",
        "speed_limit",
        "tooltip_html",
    ]
    return result[ordered_columns]


# ---------------------------------------------------------------------------
# Stats NZ building consents by TA, rendered as stacked 3D prism towers. Geometry
# (box ring + baked base-Z, equal-height floors, dominant-category colour) replicates
# generate_consents_stacked.py exactly; only the spatial unit is TA, not SA2, and all
# counts are real Stats NZ TA-level figures (never fabricated or apportioned).
# ---------------------------------------------------------------------------


def fetch_ta_boundaries(*, api_key: str, srs_name: str = OUTPUT_CRS, page_size: int = 10000) -> gpd.GeoDataFrame:
    """Stats NZ Territorial Authority 2023 generalised boundaries via Datafinder WFS (requires DATAFINDER_API_KEY)."""
    features = []
    start_index = 0
    while True:
        response = requests.get(
            DATAFINDER_WFS_URL_TEMPLATE.format(api_key=api_key),
            params={
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeNames": f"layer-{DATAFINDER_TERRITORIAL_AUTHORITY_2023_LAYER_ID}",
                "outputFormat": "json",
                "count": page_size,
                "startIndex": start_index,
                "srsName": srs_name,
            },
            headers={"User-Agent": "city-transportation-powerbi-demo/1.0"},
            timeout=300,
        )
        response.raise_for_status()
        payload = response.json()
        page = payload.get("features", [])
        returned = payload.get("numberReturned", len(page))
        print(f"Datafinder TA layer {DATAFINDER_TERRITORIAL_AUTHORITY_2023_LAYER_ID}: fetched {returned:,} features at {start_index:,}.")
        features.extend(page)
        if returned < page_size:
            break
        start_index += page_size
    return gpd.GeoDataFrame.from_features(features, crs=srs_name)


def ta_code_name(boundary: gpd.GeoDataFrame) -> tuple[pd.Series, pd.Series]:
    code = coalesce_columns(boundary, ("TA2023_V1_00", "TA2023_V1_00_CODE", "TA2023", "ta_code"))
    name = coalesce_columns(
        boundary, ("TA2023_V1_00_NAME", "TA2023_V1_00_NAME_ASCII", "territorial_authority_name", "ta_name", "name")
    )
    return clean_string(code), clean_string(name)


def normalise_building_type(value: object) -> str | None:
    if pd.isna(value):
        return None
    return STATSNZ_BUILDING_TYPE_TO_CATEGORY.get(str(value).strip().lower())


def fetch_ta_building_consents() -> pd.DataFrame:
    """Real Stats NZ building consents by TA x year x building type.

    Preferred: the no-key open CSV export. Fallback: the Aria OpenData API, reading STATSNZ_API_KEY from the
    environment. Returns a long frame with columns: ta_name, year, building_type, consents. Never apportions.
    """
    import os

    last_error: Exception | None = None
    try:
        raw = pd.read_csv(STATSNZ_BUILDING_CONSENTS_CSV_URL, low_memory=False)
        print(f"Loaded Stats NZ building consents from the open CSV export ({len(raw):,} rows).")
        return normalise_consents_frame(raw, source="statsnz_open_csv")
    except Exception as error:  # noqa: BLE001 - CSV path is best-effort; fall through to the API.
        last_error = error
        print(f"Open consents CSV unavailable ({error}); trying the Stats NZ OpenData API.")

    api_key = os.environ.get("STATSNZ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Real Stats NZ building consents are required but the open CSV export was unreachable "
            f"({last_error}). Set STATSNZ_API_KEY to use the Aria OpenData API, or provide a prepared "
            f"'{PUBLIC_ARTIFACT_FILES['ta_building_consents']}' artifact."
        )
    url = f"{STATSNZ_OPENDATA_API_BASE}/data/{STATSNZ_BUILDING_CONSENTS_OPENDATA_RESOURCE}"
    response = requests.get(
        url,
        headers={"Ocp-Apim-Subscription-Key": api_key, "Accept": "text/csv"},
        timeout=300,
    )
    response.raise_for_status()
    from io import StringIO

    raw = pd.read_csv(StringIO(response.text), low_memory=False)
    print(f"Loaded Stats NZ building consents from the OpenData API ({len(raw):,} rows).")
    return normalise_consents_frame(raw, source="statsnz_opendata_api")


def normalise_consents_frame(raw: pd.DataFrame, *, source: str) -> pd.DataFrame:
    """Map a published Stats NZ consents export to a tidy ta_name/year/building_type/consents long frame.

    Column names vary between the Infoshare CSV and the API; resolve them by fuzzy candidates and keep only
    rows whose building type maps to one of the five visual categories. Unmatched residential rows are dropped
    rather than apportioned, and the gap is recorded by the caller in the manifest.
    """
    lowered = {column.lower(): column for column in raw.columns}

    def pick(*candidates: str) -> str:
        for candidate in candidates:
            if candidate in lowered:
                return lowered[candidate]
        raise ValueError(f"Stats NZ consents export ({source}) is missing any of {candidates}; columns={list(raw.columns)}")

    ta_column = pick("territorial_authority", "territorialauthority", "ta_name", "area", "tla", "label1")
    type_column = pick("building_type", "buildingtype", "type", "category", "label2")
    value_column = pick("value", "consents", "count", "number", "obs_value")
    period_column = pick("year", "period", "time", "date", "yearended", "label0")

    frame = pd.DataFrame(
        {
            "ta_name": clean_string(raw[ta_column]),
            "raw_type": raw[type_column],
            "year": pd.to_datetime(raw[period_column].astype("string"), errors="coerce").dt.year.fillna(
                pd.to_numeric(raw[period_column].astype("string").str[:4], errors="coerce")
            ),
            "consents": pd.to_numeric(raw[value_column], errors="coerce"),
        }
    )
    frame["building_type"] = frame["raw_type"].map(normalise_building_type)
    frame = frame.dropna(subset=["ta_name", "year", "consents", "building_type"]).copy()
    frame["year"] = frame["year"].astype(int)
    frame["consents"] = frame["consents"].round().astype(int)
    frame = frame[frame["consents"] >= 0]
    consents = (
        frame.groupby(["ta_name", "year", "building_type"], as_index=False)["consents"].sum()
    )
    consents.attrs["consents_source"] = source
    return consents


def consent_box_ring_wkt(lon: float, lat: float, base_z: float) -> str:
    """Closed CCW square ring (5 pts) around (lon,lat) at constant Z=base_z. Matches generate_consents_stacked.py."""
    dlat = CONSENT_BOX_HALF_M / 111_320.0
    dlon = CONSENT_BOX_HALF_M / (111_320.0 * math.cos(math.radians(lat)))
    pts = [
        (lon - dlon, lat - dlat),
        (lon + dlon, lat - dlat),
        (lon + dlon, lat + dlat),
        (lon - dlon, lat + dlat),
        (lon - dlon, lat - dlat),
    ]
    coords = ", ".join(f"{x:.6f} {y:.6f} {base_z:.1f}" for x, y in pts)
    return f"POLYGON Z (({coords}))"


def consent_dominant_category(mix: dict[str, int]) -> str:
    return max(mix.items(), key=lambda kv: (kv[1], kv[0]))[0]


def ta_label_points(boundary: gpd.GeoDataFrame) -> tuple[pd.Series, pd.Series]:
    output = boundary if boundary.crs is not None and str(boundary.crs).upper() == OUTPUT_CRS.upper() else boundary.to_crs(OUTPUT_CRS)
    points = output.geometry.representative_point()
    return points.x, points.y


def build_ta_consents_stacked(
    *,
    ta_boundary: gpd.GeoDataFrame,
    consents: pd.DataFrame,
    floor_height_m: float = CONSENT_FLOOR_HEIGHT_M,
) -> tuple[pd.DataFrame, dict[str, object]]:
    """One POLYGON Z row per TA per year. All years of a TA share the box footprint at the TA label point;
    floor k bakes Z = k * floor_height into every ring vertex and extrudes floor_height on top, so floors float
    into a real tower. Colour is that year's dominant real category. TA code/name go in the sa2_* columns.
    """
    boundary = ta_boundary.copy()
    boundary = boundary[boundary.geometry.notna() & ~boundary.geometry.is_empty].copy()
    ta_code, ta_name = ta_code_name(boundary)
    boundary["ta_code"] = ta_code
    boundary["ta_name"] = ta_name
    boundary = boundary.dropna(subset=["ta_name"]).drop_duplicates(subset="ta_name").reset_index(drop=True)
    label_lon, label_lat = ta_label_points(boundary)
    boundary["label_lon"] = label_lon.values
    boundary["label_lat"] = label_lat.values

    label_by_name = boundary.set_index("ta_name")[["ta_code", "label_lon", "label_lat"]].to_dict("index")

    consents = consents.copy()
    consents["ta_name"] = clean_string(consents["ta_name"])
    matched = consents[consents["ta_name"].isin(label_by_name)].copy()
    unmatched_tas = sorted(set(consents["ta_name"].dropna()) - set(label_by_name))

    out_rows: list[dict[str, object]] = []
    documented_gaps: list[str] = []
    for ta_name_value, ta_rows in matched.groupby("ta_name", sort=True):
        info = label_by_name[ta_name_value]
        lon = float(info["label_lon"])
        lat = float(info["label_lat"])
        ta_code_value = info["ta_code"] if pd.notna(info["ta_code"]) else ta_name_value
        years = sorted(int(year) for year in ta_rows["year"].unique())
        for floor_index, year in enumerate(years):
            year_rows = ta_rows[ta_rows["year"].eq(year)]
            mix = {
                category: int(value)
                for category, value in year_rows.groupby("building_type")["consents"].sum().items()
                if value > 0
            }
            if not mix:
                continue
            published_categories = set(year_rows["building_type"].unique())
            if published_categories != set(CONSENT_CATEGORY_COLOR):
                missing = sorted(set(CONSENT_CATEGORY_COLOR) - published_categories)
                documented_gaps.append(f"{ta_name_value} {year}: categories not published -> {', '.join(missing)}")
            total = sum(mix.values())
            dominant = consent_dominant_category(mix)
            base_z = floor_index * floor_height_m
            start = pd.Timestamp(year=year, month=1, day=1, tz="UTC")
            end = pd.Timestamp(year=year, month=12, day=31, tz="UTC")
            tooltip = (
                f"<div><strong>{html.escape(str(ta_name_value))}</strong>"
                f"<br><span>Year: {year}</span>"
                f"<br><span>Consents issued: {total}</span>"
                f"<br><span>Dominant type: {html.escape(dominant)}</span></div>"
            )
            out_rows.append(
                {
                    "geometry_id": f"tower_{ta_code_value}_{year}",
                    "layer_type": "polygon",
                    "wkt": consent_box_ring_wkt(lon, lat, base_z),
                    "sa2_code": ta_code_value,
                    "sa2_name": ta_name_value,
                    "year": year,
                    "floor_index": floor_index,
                    "building_category": dominant,
                    "consents_total": total,
                    "polygon_fill_color_hex": CONSENT_CATEGORY_COLOR[dominant],
                    "polygon_line_color_hex": "#1a1a1aff",
                    "polygon_line_width_m": 10,
                    "polygon_extrude_elevation_m": floor_height_m,
                    "base_elevation_m": base_z,
                    "valid_from": start.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "valid_to": end.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "timestamp": int(start.timestamp()),
                    "tooltip_html": tooltip,
                }
            )

    columns = [
        "geometry_id",
        "layer_type",
        "wkt",
        "sa2_code",
        "sa2_name",
        "year",
        "floor_index",
        "building_category",
        "consents_total",
        "polygon_fill_color_hex",
        "polygon_line_color_hex",
        "polygon_line_width_m",
        "polygon_extrude_elevation_m",
        "base_elevation_m",
        "valid_from",
        "valid_to",
        "timestamp",
        "tooltip_html",
    ]
    result = pd.DataFrame(out_rows, columns=columns).sort_values(["sa2_name", "year"]).reset_index(drop=True)
    diagnostics = {
        "spatial_unit": "Territorial Authority 2023 (carried in the sa2_code / sa2_name columns)",
        "spatial_unit_note": (
            "The visual binds verbatim to sa2_code / sa2_name; for this table they hold the Stats NZ TA 2023 "
            "code and name, not SA2. All consents_total values are real Stats NZ TA-level figures."
        ),
        "consents_source": consents.attrs.get("consents_source", "unknown"),
        "floor_height_m": floor_height_m,
        "box_half_width_m": CONSENT_BOX_HALF_M,
        "ta_count": int(result["sa2_name"].nunique()),
        "years": sorted({int(year) for year in result["year"].unique()}) if not result.empty else [],
        "tas_without_boundary_dropped": unmatched_tas,
        "category_gaps": documented_gaps,
    }
    return result, diagnostics


# ---------------------------------------------------------------------------
# GeoNet FDSN earthquakes (scatter, time-slider animation). mag_color, mag_radius,
# tooltip and the column contract replicate download_earthquakes.py exactly; the only
# change is the NZ-wide bounding box and time-windowed paging around the 10k cap.
# ---------------------------------------------------------------------------


def earthquake_mag_color(mag: float) -> str:
    """Viridis-ish magnitude band -> #rrggbbaa. Replicates download_earthquakes.py mag_color."""
    if mag >= 5.0:
        return "#fde725ee"   # yellow
    if mag >= 4.0:
        return "#5ec962ee"   # green
    if mag >= 3.0:
        return "#21918cee"   # teal
    return "#3b528bee"       # blue


def earthquake_mag_radius(mag: float) -> int:
    """Exponential-ish radius, clamped. Replicates download_earthquakes.py mag_radius."""
    return int(min(2000, max(60, 40 * (mag ** 2))))


def _fetch_geonet_window(
    *,
    starttime: str,
    endtime: str,
    min_magnitude: float,
    bbox: dict[str, float],
    timeout_seconds: int = 120,
) -> list[list[str]]:
    """Fetch one FDSN time window as parsed pipe-delimited rows; raise if it hits the 10k cap (caller narrows)."""
    params = {
        "starttime": starttime,
        "endtime": endtime,
        "minmagnitude": min_magnitude,
        "format": "text",
        "orderby": "time",
        **bbox,
    }
    response = requests.get(
        GEONET_FDSN_EVENT_URL,
        params=params,
        headers={"User-Agent": "city-transportation-powerbi-demo/1.0"},
        timeout=timeout_seconds,
    )
    if response.status_code == 204:  # FDSN: no content for this window
        return []
    response.raise_for_status()
    lines = [line for line in response.text.splitlines() if line and not line.startswith("#")]
    if len(lines) >= GEONET_FDSN_MAX_ROWS:
        raise _GeoNetWindowFull(starttime, endtime, len(lines))
    return [line.split("|") for line in lines]


class _GeoNetWindowFull(Exception):
    """Raised when an FDSN window returns >= the 10k cap, so it must be sub-split to avoid silent truncation."""

    def __init__(self, starttime: str, endtime: str, count: int) -> None:
        super().__init__(f"GeoNet window {starttime}..{endtime} returned {count} rows (>= {GEONET_FDSN_MAX_ROWS} cap)")
        self.starttime = starttime
        self.endtime = endtime
        self.count = count


def fetch_geonet_earthquakes(
    *,
    min_magnitude: float = GEONET_MIN_MAGNITUDE,
    start_year: int = GEONET_START_YEAR,
    end_year: int = GEONET_END_YEAR,
    bbox: dict[str, float] | None = None,
) -> pd.DataFrame:
    """Page GeoNet FDSN events NZ-wide by year, sub-splitting any year that hits the 10k cap into months.

    Returns the raw parsed FDSN columns we need as a frame; prepare_earthquake_point applies the visual contract.
    """
    bbox = dict(bbox or GEONET_BBOX)
    rows: list[list[str]] = []
    for year in range(start_year, end_year + 1):
        year_start = f"{year}-01-01T00:00:00"
        year_end = f"{year + 1}-01-01T00:00:00"
        try:
            year_rows = _fetch_geonet_window(
                starttime=year_start, endtime=year_end, min_magnitude=min_magnitude, bbox=bbox
            )
            print(f"  GeoNet {year}: {len(year_rows):,} events (total {len(rows) + len(year_rows):,}).")
            rows.extend(year_rows)
        except _GeoNetWindowFull:
            print(f"  GeoNet {year}: hit the {GEONET_FDSN_MAX_ROWS:,} cap; sub-splitting into months.")
            for month in range(1, 13):
                month_start = f"{year}-{month:02d}-01T00:00:00"
                month_end = f"{year + 1}-01-01T00:00:00" if month == 12 else f"{year}-{month + 1:02d}-01T00:00:00"
                month_rows = _fetch_geonet_window(
                    starttime=month_start, endtime=month_end, min_magnitude=min_magnitude, bbox=bbox
                )
                rows.extend(month_rows)
            print(f"  GeoNet {year}: {sum(1 for _ in rows):,} cumulative after monthly sub-split.")

    records = []
    for fields in rows:
        if len(fields) < 14:
            continue
        event_id, tstr, lat, lon, depth = fields[0], fields[1], fields[2], fields[3], fields[4]
        magtype, mag, location, etype = fields[9], fields[10], fields[12], fields[13]
        if etype != "earthquake":
            continue
        records.append(
            {
                "event_id": event_id,
                "origin_time": tstr,
                "latitude": lat,
                "longitude": lon,
                "depth_km": depth,
                "mag_type": magtype,
                "magnitude": mag,
                "location": location,
            }
        )
    return pd.DataFrame.from_records(records)


def prepare_earthquake_point(earthquakes_raw: pd.DataFrame) -> pd.DataFrame:
    """One scatter row per GeoNet earthquake with the exact download_earthquakes.py column contract."""
    require_columns(
        earthquakes_raw,
        ["event_id", "origin_time", "latitude", "longitude", "magnitude"],
        "GeoNet earthquakes",
    )
    raw = earthquakes_raw.copy()
    latf = pd.to_numeric(raw["latitude"], errors="coerce")
    lonf = pd.to_numeric(raw["longitude"], errors="coerce")
    magf = pd.to_numeric(raw["magnitude"], errors="coerce")
    depthf = pd.to_numeric(raw.get("depth_km"), errors="coerce").fillna(0.0)
    # GeoNet times are UTC ISO without a zone suffix.
    times = pd.to_datetime(raw["origin_time"], errors="coerce", utc=True)

    valid = latf.notna() & lonf.notna() & magf.notna() & times.notna()
    raw, latf, lonf, magf, depthf, times = (
        raw[valid].reset_index(drop=True),
        latf[valid].reset_index(drop=True),
        lonf[valid].reset_index(drop=True),
        magf[valid].reset_index(drop=True),
        depthf[valid].reset_index(drop=True),
        times[valid].reset_index(drop=True),
    )

    location = clean_string(raw["location"]) if "location" in raw.columns else pd.Series(pd.NA, index=raw.index)
    mag_type = clean_string(raw["mag_type"]) if "mag_type" in raw.columns else pd.Series(pd.NA, index=raw.index)

    result = pd.DataFrame(index=raw.index)
    result["geometry_id"] = clean_string(raw["event_id"])
    result["layer_type"] = "scatter"
    result["point1_latitude"] = latf.round(5)
    result["point1_longitude"] = lonf.round(5)
    result["scatter_radius"] = magf.apply(earthquake_mag_radius).astype(int)
    result["heatmap_weight"] = magf.round(1)
    result["scatter_fill_color_hex"] = magf.apply(earthquake_mag_color)
    result["magnitude"] = magf.round(1)
    result["mag_type"] = mag_type
    result["depth_km"] = depthf.round(1)
    result["location"] = location
    result["origin_time_utc"] = times.dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    result["timestamp"] = (times.astype("int64") // 1_000_000_000).astype(int)

    def tooltip(row: pd.Series) -> str:
        location_text = "" if pd.isna(row["location"]) else str(row["location"])
        magtype_text = "" if pd.isna(row["mag_type"]) else str(row["mag_type"])
        time_text = pd.to_datetime(row["origin_time_utc"]).strftime("%Y-%m-%d %H:%M")
        return (
            f"<div><strong>M{row['magnitude']:.1f} earthquake</strong>"
            f"<br><span>{html.escape(location_text)}</span>"
            f"<br><span>{time_text} UTC</span>"
            f"<br><span>Depth: {row['depth_km']:.0f} km ({html.escape(magtype_text)})</span></div>"
        )

    result["tooltip_html"] = result.apply(tooltip, axis=1)

    ordered_columns = [
        "geometry_id",
        "layer_type",
        "point1_latitude",
        "point1_longitude",
        "scatter_radius",
        "heatmap_weight",
        "scatter_fill_color_hex",
        "magnitude",
        "mag_type",
        "depth_km",
        "location",
        "origin_time_utc",
        "timestamp",
        "tooltip_html",
    ]
    return result[ordered_columns].sort_values("timestamp").reset_index(drop=True)


def add_visual_tooltips(
    *,
    place_polygon: pd.DataFrame,
    road_path: pd.DataFrame,
    od_arc: pd.DataFrame,
    traffic_count_site_point: pd.DataFrame,
    ferry_route_line: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    place_polygon = place_polygon.copy()
    road_path = road_path.copy()
    od_arc = od_arc.copy()
    traffic_count_site_point = traffic_count_site_point.copy()
    ferry_route_line = ferry_route_line.copy()

    place_polygon["tooltip_html"] = place_polygon.apply(place_tooltip_html, axis=1)
    road_path["tooltip_html"] = road_path.apply(road_tooltip_html, axis=1)
    od_arc["tooltip_html"] = od_arc.apply(arc_tooltip_html, axis=1)
    traffic_count_site_point["tooltip_html"] = traffic_count_site_point.apply(traffic_site_tooltip_html, axis=1)
    ferry_route_line["tooltip_html"] = ferry_route_line.apply(ferry_tooltip_html, axis=1)
    return place_polygon, road_path, od_arc, traffic_count_site_point, ferry_route_line


def gtfs_zip_member(zip_file: zipfile.ZipFile, table_name: str) -> str:
    normalized = table_name.lower()
    matches = [
        member
        for member in zip_file.namelist()
        if member.replace("\\", "/").lower() == normalized
        or member.replace("\\", "/").lower().endswith(f"/{normalized}")
    ]
    if not matches:
        raise FileNotFoundError(f"GTFS feed is missing {table_name}")
    return sorted(matches, key=len)[0]


def load_gtfs_table(zip_path: Path, table_name: str) -> pd.DataFrame:
    with zipfile.ZipFile(zip_path) as feed:
        member = gtfs_zip_member(feed, table_name)
        with feed.open(member) as table:
            return pd.read_csv(table, dtype="string", low_memory=False)


def polyline_length_km(coordinates: list[tuple[float, float]]) -> float:
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(coordinates, coordinates[1:]):
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = lat2_rad - lat1_rad
        delta_lon = math.radians(lon2 - lon1)
        a = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
        )
        total += EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return total


def prepare_ferry_route_line(
    gtfs_feeds: dict[str, Path],
    *,
    output_crs: str = OUTPUT_CRS,
    analysis_crs: str = ANALYSIS_CRS,
) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for provider, zip_path in gtfs_feeds.items():
        routes = load_gtfs_table(zip_path, "routes.txt")
        trips = load_gtfs_table(zip_path, "trips.txt")
        shapes = load_gtfs_table(zip_path, "shapes.txt")
        require_columns(routes, ["route_id", "route_type"], f"{provider} routes.txt")
        require_columns(trips, ["route_id", "trip_id", "shape_id"], f"{provider} trips.txt")
        require_columns(shapes, ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"], f"{provider} shapes.txt")

        for optional_column in ["route_short_name", "route_long_name"]:
            if optional_column not in routes.columns:
                routes[optional_column] = pd.NA
        if "direction_id" not in trips.columns:
            trips["direction_id"] = pd.NA

        routes = routes.copy()
        routes["route_type_numeric"] = pd.to_numeric(routes["route_type"], errors="coerce")
        ferry_routes = routes[routes["route_type_numeric"].eq(4)].copy()
        if ferry_routes.empty:
            print(f"{provider}: no GTFS route_type 4 ferry routes found.")
            continue

        ferry_trips = trips.merge(
            ferry_routes[["route_id", "route_short_name", "route_long_name"]],
            on="route_id",
            how="inner",
        )
        ferry_trips = ferry_trips[ferry_trips["shape_id"].notna()].copy()
        if ferry_trips.empty:
            print(f"{provider}: ferry routes have no shape-backed trips.")
            continue

        shapes = shapes.copy()
        shapes["shape_pt_lat"] = pd.to_numeric(shapes["shape_pt_lat"], errors="coerce")
        shapes["shape_pt_lon"] = pd.to_numeric(shapes["shape_pt_lon"], errors="coerce")
        shapes["shape_pt_sequence"] = pd.to_numeric(shapes["shape_pt_sequence"], errors="coerce")
        shape_ids = set(ferry_trips["shape_id"].dropna().astype(str))
        shapes = shapes[shapes["shape_id"].astype(str).isin(shape_ids)].dropna(
            subset=["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"]
        )
        shapes = shapes[
            shapes["shape_pt_lat"].between(-90, 90) & shapes["shape_pt_lon"].between(-180, 180)
        ].copy()
        shape_lookup = {
            str(shape_id): shape_points.sort_values("shape_pt_sequence")
            for shape_id, shape_points in shapes.groupby("shape_id", sort=False)
        }

        group_columns = [
            "route_id",
            "route_short_name",
            "route_long_name",
            "direction_id",
            "shape_id",
        ]
        grouped = ferry_trips.groupby(group_columns, dropna=False).agg(trip_count=("trip_id", "nunique")).reset_index()
        for _, group in grouped.iterrows():
            shape_id = group["shape_id"]
            shape_points = shape_lookup.get(str(shape_id))
            if shape_points is None or len(shape_points) < 2:
                continue

            coordinates = list(zip(shape_points["shape_pt_lon"].astype(float), shape_points["shape_pt_lat"].astype(float)))
            if len(set(coordinates)) < 2:
                continue
            start_lon, start_lat = coordinates[0]
            end_lon, end_lat = coordinates[-1]
            if start_lon == end_lon and start_lat == end_lat:
                continue

            route_length_km = polyline_length_km(coordinates)
            route_id = str(group["route_id"])
            direction_id = "" if pd.isna(group["direction_id"]) else str(group["direction_id"])
            route_short_name = pd.NA if pd.isna(group["route_short_name"]) else str(group["route_short_name"]).strip()
            route_long_name = pd.NA if pd.isna(group["route_long_name"]) else str(group["route_long_name"]).strip()
            rows.append(
                {
                    "provider": provider,
                    "route_id": route_id,
                    "route_short_name": route_short_name,
                    "route_long_name": route_long_name,
                    "shape_id": str(shape_id),
                    "direction_id": direction_id,
                    "trip_count": int(group["trip_count"]),
                    "route_length_km": round(route_length_km, 3),
                    "point1_latitude": round(start_lat, 7),
                    "point1_longitude": round(start_lon, 7),
                    "point2_latitude": round(end_lat, 7),
                    "point2_longitude": round(end_lon, 7),
                    "line_is_valid": True,
                }
            )

    if not rows:
        raise ValueError("No official GTFS ferry shapes were available to build nz_ferry_route_line.")

    result = pd.DataFrame(rows)
    result["line_width_m"] = log_scaled_width(result["trip_count"], min_width=80, max_width=360)
    result["route_length_rank"] = rank_desc_nullable(result["route_length_km"])
    result["line_color_value"] = result["route_length_km"]
    result["line_color_hex"] = red_color_series(result["route_length_km"], alpha="cc")
    result["layer_type"] = "line"
    base_id = (
        "ferry_"
        + result["provider"].apply(power_bi_field_name)
        + "_"
        + result["route_id"].apply(power_bi_field_name)
        + "_dir_"
        + result["direction_id"].replace("", "unknown").apply(power_bi_field_name)
        + "_shape_"
        + result["shape_id"].apply(power_bi_field_name)
    )
    sequence = base_id.groupby(base_id).cumcount()
    result["geometry_id"] = base_id.where(sequence.eq(0), base_id + "__" + (sequence + 1).astype("string"))

    ordered_columns = [
        "geometry_id",
        "layer_type",
        "provider",
        "route_id",
        "route_short_name",
        "route_long_name",
        "shape_id",
        "direction_id",
        "trip_count",
        "route_length_km",
        "route_length_rank",
        "point1_latitude",
        "point1_longitude",
        "point2_latitude",
        "point2_longitude",
        "line_width_m",
        "line_color_value",
        "line_color_hex",
        "line_is_valid",
    ]
    return result[ordered_columns].sort_values(
        ["provider", "route_short_name", "route_long_name", "direction_id", "trip_count"],
        ascending=[True, True, True, True, False],
        na_position="last",
    ).reset_index(drop=True)


def validate_coordinate_columns(
    df: pd.DataFrame,
    *,
    table_name: str,
    coordinate_bounds: dict[str, tuple[float, float]],
    valid_rows: pd.Series | None = None,
) -> list[str]:
    issues = []
    mask = pd.Series(True, index=df.index) if valid_rows is None else valid_rows.fillna(False).astype(bool)
    if not mask.any():
        issues.append(f"{table_name}: no rows available for coordinate validation")
        return issues

    for column, (lower, upper) in coordinate_bounds.items():
        if column not in df.columns:
            issues.append(f"{table_name}: missing coordinate column {column}")
            continue
        values = pd.to_numeric(df.loc[mask, column], errors="coerce")
        if values.isna().any() or ~values.between(lower, upper).all():
            issues.append(f"{table_name}: {column} has values outside [{lower}, {upper}] for validated rows")
    return issues


def validate_traffic_point_coordinates(df: pd.DataFrame) -> list[str]:
    return validate_coordinate_columns(
        df,
        table_name="nzta_traffic_count_site_point",
        coordinate_bounds={"latitude": (-90, 90), "longitude": (-180, 180)},
    )


def validate_ferry_line_coordinates(df: pd.DataFrame) -> list[str]:
    issues = validate_coordinate_columns(
        df,
        table_name="nz_ferry_route_line",
        coordinate_bounds={
            "point1_latitude": (-90, 90),
            "point1_longitude": (-180, 180),
            "point2_latitude": (-90, 90),
            "point2_longitude": (-180, 180),
        },
        valid_rows=df["line_is_valid"].fillna(False),
    )
    valid_rows = df["line_is_valid"].fillna(False)
    same_endpoint = (
        pd.to_numeric(df.loc[valid_rows, "point1_latitude"], errors="coerce").eq(
            pd.to_numeric(df.loc[valid_rows, "point2_latitude"], errors="coerce")
        )
        & pd.to_numeric(df.loc[valid_rows, "point1_longitude"], errors="coerce").eq(
            pd.to_numeric(df.loc[valid_rows, "point2_longitude"], errors="coerce")
        )
    )
    if same_endpoint.any():
        issues.append("nz_ferry_route_line: one or more valid rows have identical A and B endpoints")
    return issues


def validate_crash_point_coordinates(df: pd.DataFrame) -> list[str]:
    return validate_coordinate_columns(
        df,
        table_name="nzta_cas_crash_point",
        coordinate_bounds={"point1_latitude": (-90, 90), "point1_longitude": (-180, 180)},
    )


def validate_earthquake_point(df: pd.DataFrame, table_name: str = "geonet_earthquake_point") -> list[str]:
    issues = validate_coordinate_columns(
        df,
        table_name=table_name,
        coordinate_bounds={"point1_latitude": (-90, 90), "point1_longitude": (-180, 180)},
    )
    if "timestamp" in df.columns:
        ordered = pd.to_numeric(df["timestamp"], errors="coerce")
        if ordered.isna().any():
            issues.append(f"{table_name}: timestamp contains non-numeric or null values")
        elif not ordered.is_monotonic_increasing:
            issues.append(f"{table_name}: rows are not sorted by timestamp ascending")
    else:
        issues.append(f"{table_name}: missing timestamp (the animation Timestamp role)")
    return issues


def validate_consent_tower_wkt(df: pd.DataFrame, table_name: str = "nz_ta_building_consents_stacked") -> list[str]:
    issues = []
    if "wkt" not in df.columns:
        return [f"{table_name}: missing wkt"]
    wkt_values = df["wkt"].dropna().astype(str)
    if df["wkt"].isna().any() or wkt_values.eq("").any():
        issues.append(f"{table_name}: wkt contains blank values")
    if not wkt_values.str.startswith("POLYGON Z").all():
        issues.append(f"{table_name}: wkt rows must be 'POLYGON Z' with a baked base Z ordinate")
    return issues


MULTIGEOMETRY_ROAD_DENSITY_COLUMNS = [
    "geometry_id",
    "layer_type",
    "multi_layer",
    "source_table",
    "feature_label",
    "territorial_authority_name",
    "road_density_km_per_km2",
    "latest_aadt",
    "road_surface",
    "road_length_total_km",
    "road_length_rank",
    "wkp",
    "point1_latitude",
    "point1_longitude",
    "polygon_fill_color_value",
    "polygon_line_color_hex",
    "polygon_line_width_m",
    "polygon_extrude_elevation_m",
    "path_width_m",
    "path_color_hex",
    "point_radius_m",
    "point_fill_color_value",
    "point_line_color_value",
    "point_fill_color_hex",
    "point_line_color_hex",
    "point_line_width_m",
    "tooltip_html",
]


def align_multigeometry_columns(df: pd.DataFrame) -> pd.DataFrame:
    output = df.copy()
    for column in MULTIGEOMETRY_ROAD_DENSITY_COLUMNS:
        if column not in output.columns:
            output[column] = pd.NA
    return output[MULTIGEOMETRY_ROAD_DENSITY_COLUMNS]


def build_multigeometry_road_density_map(
    *,
    place_polygon: pd.DataFrame,
    road_path: pd.DataFrame,
    traffic_count_site_point: pd.DataFrame,
    scope_label: str,
    road_limit: int | None = None,
) -> pd.DataFrame:
    require_columns(
        place_polygon,
        [
            "geometry_id",
            "layer_type",
            "wkp",
            "place_name",
            "territorial_authority_name",
            "road_density_km_per_km2",
            "polygon_fill_color_value",
            "polygon_line_color_hex",
            "polygon_line_width_m",
            "tooltip_html",
        ],
        f"{scope_label} place polygon",
    )
    require_columns(
        road_path,
        [
            "geometry_id",
            "layer_type",
            "wkp",
            "road_feature_id",
            "road_length_total_km",
            "road_length_rank",
            "path_width_m",
            "path_color_hex",
            "tooltip_html",
        ],
        f"{scope_label} road path",
    )
    require_columns(
        traffic_count_site_point,
        [
            "geometry_id",
            "layer_type",
            "latitude",
            "longitude",
            "latest_aadt",
            "point_radius_m",
            "point_fill_color_value",
            "point_line_color_value",
            "point_fill_color_hex",
            "point_line_color_hex",
            "point_line_width_m",
            "tooltip_html",
        ],
        f"{scope_label} traffic count site point",
    )

    polygons = place_polygon.copy()
    polygons["multi_layer"] = "Road density area"
    polygons["source_table"] = f"{scope_label}_place_polygon"
    polygons["feature_label"] = polygons["place_name"]
    polygons["polygon_fill_color_value"] = polygons["road_density_km_per_km2"]

    roads = road_path.copy()
    roads["road_length_rank"] = rank_desc_nullable(roads["road_length_total_km"])
    roads = roads.sort_values(["road_length_rank", "road_feature_id"], na_position="last")
    if road_limit is not None:
        roads = roads.head(max(0, int(road_limit)))
    roads["multi_layer"] = "Road centreline"
    roads["source_table"] = f"{scope_label}_road_path"
    roads["feature_label"] = clean_string(
        roads.get("road_name", pd.Series(pd.NA, index=roads.index)),
        default="Road centreline",
    )
    roads["road_surface"] = clean_string(roads["road_surface"], default="Unknown")
    surface_color = roads["road_surface"].map(ROAD_SURFACE_COLORS).fillna(ROAD_SURFACE_COLORS["Unknown"])
    roads["path_color_hex"] = surface_color

    points = traffic_count_site_point.copy()
    points["multi_layer"] = "Traffic count site"
    points["source_table"] = f"{scope_label}_nzta_traffic_count_site_point"
    points["feature_label"] = clean_string(
        points.get("description", pd.Series(pd.NA, index=points.index)),
        default="Traffic count site",
    )
    points["point1_latitude"] = pd.to_numeric(points["latitude"], errors="coerce")
    points["point1_longitude"] = pd.to_numeric(points["longitude"], errors="coerce")

    frames = [
        align_multigeometry_columns(polygons),
        align_multigeometry_columns(roads),
        align_multigeometry_columns(points),
    ]
    combined = pd.concat(
        [frame.dropna(axis=1, how="all") for frame in frames],
        ignore_index=True,
        sort=False,
    ).reindex(columns=MULTIGEOMETRY_ROAD_DENSITY_COLUMNS)
    combined["geometry_id"] = combined["geometry_id"].astype("string")
    combined["layer_type"] = combined["layer_type"].astype("string")
    return combined


def visual_field_mapping_records(power_bi_row_window: int) -> list[dict[str, object]]:
    return [
        {
            "table": "nz_place_polygon",
            "visual_layer": "polygon",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "wkp": "wkp",
            "polygonFillColor": "polygon_fill_color_value or road_density_km_per_km2",
            "polygonLineColor": "polygon_line_color_hex",
            "polygonLineWidth": "polygon_line_width_m",
            "polygonExtrudeElevation": "polygon_extrude_elevation_m",
            "tooltipHtml": "tooltip_html",
            "recommended_filter": "none; current full-NZ place rows fit under the visual window",
        },
        {
            "table": "nz_road_path",
            "visual_layer": "path",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "wkp": "wkp",
            "pathColor": "path_color_hex for direct road-surface styling, or a numeric field such as road_length_total_km for gradients",
            "pathWidth": "path_width_m",
            "tooltipHtml": "tooltip_html",
            "recommended_filter": f"road_length_rank <= {power_bi_row_window}",
        },
        {
            "table": "nz_sa2_travel_to_work_od_2023_arc",
            "visual_layer": "arc",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "point1Latitude": "point1_latitude",
            "point1Longitude": "point1_longitude",
            "point2Latitude": "point2_latitude",
            "point2Longitude": "point2_longitude",
            "arcLineWidth": "arc_line_width_m",
            "arcSourceColor": "arc_source_color_value for numeric gradient, or arc_source_color_rgba for direct color/opacity",
            "arcTargetColor": "arc_target_color_value for numeric gradient, or arc_target_color_rgba for direct color/opacity",
            "tooltipHtml": "tooltip_html",
            "recommended_filter": f"arc_is_valid = TRUE and people_count_rank <= {power_bi_row_window}",
        },
        {
            "table": "nzta_traffic_count_site_point",
            "visual_layer": "point",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "pointLatitude": "latitude",
            "pointLongitude": "longitude",
            "pointRadius": "point_radius_m",
            "pointFillColor": "point_fill_color_hex for Magma by latest AADT, or point_fill_color_value for numeric gradient",
            "pointLineColor": "point_line_color_hex for Magma by latest AADT, or point_line_color_value for numeric gradient",
            "pointLineWidth": "point_line_width_m",
            "tooltipHtml": "tooltip_html",
            "recommended_filter": "none; current NZTA site rows fit under the visual window",
        },
        {
            "table": "nz_ferry_route_line",
            "visual_layer": "line",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "point1Latitude": "point1_latitude",
            "point1Longitude": "point1_longitude",
            "point2Latitude": "point2_latitude",
            "point2Longitude": "point2_longitude",
            "lineWidth": "line_width_m",
            "lineColor": "line_color_value for numeric route-length gradient, or line_color_hex for precomputed light-to-dark red by route length",
            "tooltipHtml": "tooltip_html",
            "recommended_filter": "line_is_valid = TRUE",
        },
        {
            "table": "nzta_cas_crash_point",
            "visual_layer": "scatter / heatmap / H3 hexagon",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "pointLatitude": "point1_latitude",
            "pointLongitude": "point1_longitude",
            "scatterRadius": "scatter_radius",
            "scatterFillColor": "scatter_fill_color_hex (Magma by severity), or crash_severity_code for Manual interval breaks 1,2,3,4",
            "heatmapWeight": "heatmap_weight (severity-weighted: Fatal 8, Serious 4, Minor 2, Non-Injury 1); doubles as the H3 per-point aggregate value",
            "tooltipHtml": "tooltip_html",
            "recommended_filter": (
                "NZ-wide CAS is ~800k+ points; cap with crash_year >= N or crash_severity <> 'Non-Injury Crash' "
                f"to stay under {power_bi_row_window} rows"
            ),
        },
        {
            "table": "geonet_earthquake_point",
            "visual_layer": "scatter (time-slider animation)",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "timestamp": "timestamp (THE animation Timestamp role: Unix seconds of the origin time)",
            "pointLatitude": "point1_latitude",
            "pointLongitude": "point1_longitude",
            "scatterRadius": "scatter_radius (scales with magnitude)",
            "scatterFillColor": "scatter_fill_color_hex (Viridis band by magnitude)",
            "heatmapWeight": "heatmap_weight (magnitude)",
            "tooltipHtml": "tooltip_html",
            "recommended_filter": (
                "NZ-wide M2+ over many years far exceeds the row window; raise minmagnitude (M3+) or shorten the "
                f"year range to stay under {power_bi_row_window} rows"
            ),
        },
        {
            "table": "nz_ta_building_consents_stacked",
            "visual_layer": "polygon (extruded 3D stacked towers)",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "wkt": "wkt (POLYGON Z; ring Z is the prism base, extrusion is added on top)",
            "polygonFillColor": "polygon_fill_color_hex (dominant real category that TA-year)",
            "polygonLineColor": "polygon_line_color_hex",
            "polygonLineWidth": "polygon_line_width_m",
            "polygonExtrudeElevation": "polygon_extrude_elevation_m (equal height per year-floor)",
            "tooltipHtml": "tooltip_html",
            "spatial_unit": "Territorial Authority 2023, carried verbatim in sa2_code / sa2_name (not SA2); all consents_total are real Stats NZ TA-level figures",
            "recommended_filter": f"TA x year rows are well under {power_bi_row_window}; no filter needed",
        },
        {
            "table": "nz_multigeometry_road_density_map",
            "visual_layer": "polygon + path + point",
            "geometry_id": "geometry_id",
            "layer_type": "layer_type",
            "wkp": "wkp for polygon and path rows",
            "pointLatitude": "point1_latitude for point rows",
            "pointLongitude": "point1_longitude for point rows",
            "polygonFillColor": "road_density_km_per_km2 or polygon_fill_color_value",
            "polygonLineColor": "polygon_line_color_hex",
            "pathColor": "path_color_hex for direct road-surface styling, or road_length_total_km for a path gradient",
            "pathWidth": "path_width_m",
            "pointRadius": "point_radius_m",
            "pointFillColor": "point_fill_color_hex or point_fill_color_value",
            "pointLineColor": "point_line_color_hex or point_line_color_value",
            "tooltipHtml": "tooltip_html",
            "recommended_filter": (
                "already limited to fit the visual row window by keeping all areas and points, "
                f"then the longest roads up to {power_bi_row_window} total rows"
            ),
        },
    ]


def normalize_boolean_series(series: pd.Series, default: bool = False) -> pd.Series:
    if pd.api.types.is_bool_dtype(series):
        return series.fillna(default).astype(bool)
    lowered = series.astype("string").str.strip().str.lower()
    mapped = lowered.map({"true": True, "false": False, "1": True, "0": False, "yes": True, "no": False})
    return mapped.fillna(default).astype(bool)


def decode_wkp_geometry(value: object, context: wkp.Context):
    if wkp is None:
        raise ModuleNotFoundError("wkp is required to decode WKP geometry.")
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    return wkp.decode(context, text.encode("ascii")).geometry


def encode_wkp_geometry(geometry, *, precision: int = 6) -> object:
    if wkp is None:
        raise ModuleNotFoundError("wkp is required to encode WKP geometry.")
    if geometry is None or geometry.is_empty:
        return pd.NA
    return wkp.encode(wkp.Context(), geometry, precision=precision).decode("ascii")


def wkp_union(series: pd.Series):
    if wkp is None:
        raise ModuleNotFoundError("wkp is required to decode WKP geometry.")
    context = wkp.Context()
    geometries = [decode_wkp_geometry(value, context) for value in series.dropna()]
    geometries = [geometry for geometry in geometries if geometry is not None and not geometry.is_empty]
    if not geometries:
        raise ValueError("No WKP geometries were available to build the demo boundary.")
    return unary_union(geometries)


def hamilton_tla_boundary_geometry(
    territorial_authority_boundary: gpd.GeoDataFrame | None,
) -> tuple[object | None, str | None]:
    if territorial_authority_boundary is None or len(territorial_authority_boundary) == 0:
        return None, None

    boundary = territorial_authority_boundary.copy()
    if boundary.crs is not None and str(boundary.crs).upper() != OUTPUT_CRS.upper():
        boundary = boundary.to_crs(OUTPUT_CRS)

    name_columns = [
        column
        for column in (
            "TA2023_V1_00_NAME_ASCII",
            "TA2023_V1_00_NAME",
            "territorial_authority_name",
            "name",
            "Name",
        )
        if column in boundary.columns
    ]
    if name_columns:
        name = coalesce_columns(boundary, tuple(name_columns))
        boundary = boundary[clean_string(name).eq(HAMILTON_TLA_NAME)].copy()

    boundary = boundary[boundary.geometry.notna() & ~boundary.geometry.is_empty].copy()
    if boundary.empty:
        return None, None
    return unary_union(boundary.geometry), "statsnz_territorial_authority_2023_generalised"


def buffer_boundary_meters(boundary, *, buffer_m: float):
    if buffer_m <= 0:
        return boundary
    return (
        gpd.GeoSeries([boundary], crs=OUTPUT_CRS)
        .to_crs(ANALYSIS_CRS)
        .buffer(buffer_m)
        .to_crs(OUTPUT_CRS)
        .iloc[0]
    )


def wkp_intersects_boundary_mask(df: pd.DataFrame, *, wkp_column: str, boundary) -> pd.Series:
    require_columns(df, [wkp_column], "WKP geometry table")
    context = wkp.Context()
    prepared_boundary = prep(boundary)
    min_lon, min_lat, max_lon, max_lat = boundary.bounds
    mask = pd.Series(False, index=df.index)

    for index, value in df[wkp_column].items():
        geometry = decode_wkp_geometry(value, context)
        if geometry is None or geometry.is_empty:
            continue
        geom_min_lon, geom_min_lat, geom_max_lon, geom_max_lat = geometry.bounds
        if geom_max_lon < min_lon or geom_min_lon > max_lon or geom_max_lat < min_lat or geom_min_lat > max_lat:
            continue
        mask.at[index] = prepared_boundary.intersects(geometry)

    return mask


def geodataframe_intersects_boundary_mask(gdf: gpd.GeoDataFrame, *, boundary) -> pd.Series:
    if gdf.crs is not None and str(gdf.crs).upper() != OUTPUT_CRS.upper():
        gdf = gdf.to_crs(OUTPUT_CRS)

    prepared_boundary = prep(boundary)
    min_lon, min_lat, max_lon, max_lat = boundary.bounds
    mask = pd.Series(False, index=gdf.index)
    for index, geometry in gdf.geometry.items():
        if geometry is None or geometry.is_empty:
            continue
        geom_min_lon, geom_min_lat, geom_max_lon, geom_max_lat = geometry.bounds
        if geom_max_lon < min_lon or geom_min_lon > max_lon or geom_max_lat < min_lat or geom_min_lat > max_lat:
            continue
        mask.at[index] = prepared_boundary.intersects(geometry)
    return mask


def geodataframe_boundary_coverage_ratio(gdf: gpd.GeoDataFrame, *, boundary) -> pd.Series:
    if gdf.empty:
        return pd.Series(dtype="float64", index=gdf.index)

    source = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    ratios = pd.Series(0.0, index=gdf.index, dtype="float64")
    if source.empty:
        return ratios

    source_metric = source.to_crs(ANALYSIS_CRS) if source.crs is not None else source.set_crs(OUTPUT_CRS).to_crs(ANALYSIS_CRS)
    boundary_metric = gpd.GeoSeries([boundary], crs=OUTPUT_CRS).to_crs(ANALYSIS_CRS).iloc[0]
    area = source_metric.geometry.area
    intersection_area = source_metric.geometry.intersection(boundary_metric).area
    ratios.loc[source_metric.index] = intersection_area.div(area.where(area > 0)).fillna(0)
    return ratios


def geodataframe_boundary_coverage_mask(
    gdf: gpd.GeoDataFrame,
    *,
    boundary,
    min_coverage_ratio: float = HAMILTON_SA2_MIN_TLA_COVERAGE_RATIO,
) -> pd.Series:
    return geodataframe_boundary_coverage_ratio(gdf, boundary=boundary).gt(min_coverage_ratio)


def coordinate_mask_within_boundary(
    df: pd.DataFrame,
    *,
    longitude_column: str,
    latitude_column: str,
    boundary,
) -> pd.Series:
    longitudes = pd.to_numeric(df[longitude_column], errors="coerce")
    latitudes = pd.to_numeric(df[latitude_column], errors="coerce")
    mask = pd.Series(False, index=df.index)
    valid = longitudes.notna() & latitudes.notna()
    mask.loc[valid] = [
        boundary.covers(Point(longitude, latitude))
        for longitude, latitude in zip(longitudes.loc[valid], latitudes.loc[valid])
    ]
    return mask


def sa2_code_values(df: pd.DataFrame) -> pd.Series:
    code_columns = [
        column
        for column in (
            "sa2_code",
            "SA22023_V1_00",
            "SA22023_V1_00_CODE",
            "SA22023",
        )
        if column in df.columns
    ]
    if not code_columns:
        raise ValueError("SA2 boundary data is missing an SA2 code column.")
    return clean_string(coalesce_columns(df, tuple(code_columns)))


def hamilton_sa2_reference_by_boundary(
    sa2_reference: pd.DataFrame,
    *,
    boundary,
    sa2_boundary: gpd.GeoDataFrame | None = None,
) -> tuple[pd.DataFrame, str]:
    if sa2_boundary is not None and not sa2_boundary.empty:
        boundary_gdf = sa2_boundary.copy()
        boundary_gdf["sa2_code"] = sa2_code_values(boundary_gdf)
        sa2_mask = geodataframe_boundary_coverage_mask(boundary_gdf, boundary=boundary)
        hamilton_sa2_codes = set(boundary_gdf.loc[sa2_mask, "sa2_code"].dropna().astype("string"))
        if hamilton_sa2_codes:
            selected = sa2_reference[sa2_reference["sa2_code"].astype("string").isin(hamilton_sa2_codes)].copy()
            if not selected.empty:
                return selected.reset_index(drop=True), "statsnz_sa2_2023_generalised polygon is >90% inside Hamilton TLA"

    if "wkp" in sa2_reference.columns:
        sa2_mask = wkp_intersects_boundary_mask(sa2_reference, wkp_column="wkp", boundary=boundary)
        selected = sa2_reference[sa2_mask].copy()
        if not selected.empty:
            return selected.reset_index(drop=True), "sa2_reference.wkp intersects Hamilton TLA"

    sa2_mask = coordinate_mask_within_boundary(
        sa2_reference,
        longitude_column="center_lon",
        latitude_column="center_lat",
        boundary=boundary,
    )
    return sa2_reference[sa2_mask].copy().reset_index(drop=True), "sa2_reference center point covered by Hamilton TLA"


def hamilton_sa2_boundary_for_codes(
    sa2_boundary: gpd.GeoDataFrame | None,
    hamilton_sa2_codes: set[str],
) -> gpd.GeoDataFrame | None:
    if sa2_boundary is None or sa2_boundary.empty:
        return None

    boundary_gdf = sa2_boundary.copy()
    if boundary_gdf.crs is not None and str(boundary_gdf.crs).upper() != OUTPUT_CRS.upper():
        boundary_gdf = boundary_gdf.to_crs(OUTPUT_CRS)
    boundary_gdf["sa2_code"] = sa2_code_values(boundary_gdf)
    boundary_gdf = boundary_gdf[boundary_gdf["sa2_code"].astype("string").isin(hamilton_sa2_codes)].copy()
    boundary_gdf = boundary_gdf[boundary_gdf.geometry.notna() & ~boundary_gdf.geometry.is_empty].copy()
    if boundary_gdf.empty:
        return None
    return boundary_gdf.drop_duplicates(subset="sa2_code").reset_index(drop=True)


def road_path_geodataframe(road_path: pd.DataFrame) -> gpd.GeoDataFrame:
    require_columns(road_path, ["road_feature_id", "road_surface", "road_length_total_km", "wkp"], "road path")
    context = wkp.Context()
    rows = []
    geometries = []
    for _, row in road_path.iterrows():
        geometry = decode_wkp_geometry(row["wkp"], context)
        if geometry is None or geometry.is_empty:
            continue
        rows.append(row.drop(labels=["wkp"]).to_dict())
        geometries.append(geometry)
    return gpd.GeoDataFrame(rows, geometry=geometries, crs=OUTPUT_CRS)


def representative_points_lonlat(gdf: gpd.GeoDataFrame) -> tuple[pd.Series, pd.Series]:
    output = gdf if gdf.crs is not None and str(gdf.crs).upper() == OUTPUT_CRS.upper() else gdf.to_crs(OUTPUT_CRS)
    points = output.geometry.representative_point()
    return points.x, points.y


def build_sa2_road_density_tables(
    *,
    hamilton_sa2_boundary: gpd.GeoDataFrame,
    hamilton_sa2_reference: pd.DataFrame,
    hamilton_roads: pd.DataFrame,
    road_surface_dimension: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    sa2_polygons = hamilton_sa2_boundary.copy()
    sa2_polygons["place_feature_id"] = sa2_polygons["sa2_code"].astype("string")
    hamilton_sa2_reference = hamilton_sa2_reference.copy()
    hamilton_sa2_reference["sa2_code"] = hamilton_sa2_reference["sa2_code"].astype("string")
    sa2_polygons = sa2_polygons.merge(
        hamilton_sa2_reference[
            [
                column
                for column in ("sa2_code", "sa2_name", "land_area_sq_km", "area_sq_km")
                if column in hamilton_sa2_reference.columns
            ]
        ],
        on="sa2_code",
        how="left",
    )
    sa2_polygons["place_name"] = clean_string(
        coalesce_columns(sa2_polygons, ("sa2_name", "SA22023_V1_00_NAME_ASCII", "SA22023_V1_00_NAME")),
        default="Hamilton SA2",
    )
    sa2_polygons["place_type"] = "SA2"
    sa2_polygons["territorial_authority_name"] = HAMILTON_TLA_NAME

    metric_polygons = sa2_polygons.to_crs(ANALYSIS_CRS)
    metric_area_km2 = metric_polygons.geometry.area / 1_000_000
    sa2_polygons["place_area_km2"] = (
        pd.to_numeric(sa2_polygons.get("area_sq_km", pd.Series(pd.NA, index=sa2_polygons.index)), errors="coerce")
        .fillna(metric_area_km2)
    )
    sa2_polygons["place_area_m2"] = (sa2_polygons["place_area_km2"] * 1_000_000).round(2)

    roads_gdf = road_path_geodataframe(hamilton_roads)
    if roads_gdf.empty:
        place_road_bridge = pd.DataFrame(
            columns=[
                "place_feature_id",
                "road_feature_id",
                "road_surface",
                "road_length_in_place_km",
                "road_length_total_km",
                "road_length_share_of_road",
            ]
        )
    else:
        roads_metric = roads_gdf.to_crs(ANALYSIS_CRS)
        polygons_metric = metric_polygons[["place_feature_id", "geometry"]]
        road_place_pairs = gpd.sjoin(
            roads_metric,
            polygons_metric,
            how="inner",
            predicate="intersects",
        )
        place_geometries = polygons_metric.geometry.rename("place_geometry")
        road_place_pairs = road_place_pairs.join(place_geometries, on="index_right")
        road_place_pairs["road_length_m"] = road_place_pairs.geometry.intersection(
            gpd.GeoSeries(road_place_pairs["place_geometry"], crs=ANALYSIS_CRS)
        ).length
        road_place_pairs = road_place_pairs[road_place_pairs["road_length_m"] > 0].copy()
        road_place_pairs["road_length_km"] = road_place_pairs["road_length_m"] / 1000
        place_road_bridge = road_place_pairs.groupby(
            ["place_feature_id", "road_feature_id", "road_surface"],
            as_index=False,
        )["road_length_km"].sum()
        place_road_bridge = place_road_bridge.rename(columns={"road_length_km": "road_length_in_place_km"})
        place_road_bridge = place_road_bridge.merge(
            hamilton_roads[["road_feature_id", "road_length_total_km"]],
            on="road_feature_id",
            how="left",
        )
        place_road_bridge["road_length_share_of_road"] = (
            place_road_bridge["road_length_in_place_km"]
            .div(place_road_bridge["road_length_total_km"].where(place_road_bridge["road_length_total_km"] > 0))
            .fillna(0)
        )

    road_stats_by_place_surface = (
        place_road_bridge.groupby(["place_feature_id", "road_surface"], as_index=False)["road_length_in_place_km"]
        .sum()
        .rename(columns={"road_length_in_place_km": "road_length_km"})
    )
    hamilton_surface_values = set(hamilton_roads.get("road_surface", pd.Series(dtype="string")).dropna().astype(str))
    hamilton_surface_values.update(road_stats_by_place_surface.get("road_surface", pd.Series(dtype="string")).dropna().astype(str))
    hamilton_road_surface_dimension = road_surface_dimension[
        road_surface_dimension.get("road_surface", pd.Series(dtype="string")).astype(str).isin(hamilton_surface_values)
    ].copy()
    if hamilton_road_surface_dimension.empty and hamilton_surface_values:
        hamilton_road_surface_dimension = pd.DataFrame({"road_surface": sorted(hamilton_surface_values)})
        hamilton_road_surface_dimension["road_surface_sort_order"] = range(1, len(hamilton_road_surface_dimension) + 1)

    surface_values = hamilton_road_surface_dimension.get("road_surface", pd.Series(dtype="string")).dropna().astype(str)
    place_surface_scaffold = (
        sa2_polygons[["place_feature_id"]]
        .assign(_join_key=1)
        .merge(pd.DataFrame({"road_surface": sorted(surface_values.unique())}).assign(_join_key=1), on="_join_key", how="inner")
        .drop(columns="_join_key")
    )
    place_surface_density_fact = place_surface_scaffold.merge(
        road_stats_by_place_surface,
        on=["place_feature_id", "road_surface"],
        how="left",
    ).fillna({"road_length_km": 0})
    place_surface_density_fact = place_surface_density_fact.merge(
        sa2_polygons[["place_feature_id", "place_area_km2"]],
        on="place_feature_id",
        how="left",
    )
    place_surface_density_fact["road_density_km_per_km2"] = (
        place_surface_density_fact["road_length_km"]
        .div(place_surface_density_fact["place_area_km2"].where(place_surface_density_fact["place_area_km2"] > 0))
        .fillna(0)
    )

    road_stats_by_place = (
        place_road_bridge.groupby("place_feature_id", as_index=False)["road_length_in_place_km"]
        .sum()
        .rename(columns={"road_length_in_place_km": "road_length_total_km"})
    )
    sa2_polygons = sa2_polygons.merge(road_stats_by_place, on="place_feature_id", how="left").fillna({"road_length_total_km": 0})
    sa2_polygons["road_density_km_per_km2"] = (
        sa2_polygons["road_length_total_km"]
        .div(sa2_polygons["place_area_km2"].where(sa2_polygons["place_area_km2"] > 0))
        .fillna(0)
    )
    sa2_polygons["place_road_density_rank"] = rank_desc_nullable(sa2_polygons["road_density_km_per_km2"])
    label_lon, label_lat = representative_points_lonlat(sa2_polygons)
    sa2_polygons["label_lon"] = label_lon.values
    sa2_polygons["label_lat"] = label_lat.values
    sa2_polygons["geometry_id"] = "sa2_" + sa2_polygons["place_feature_id"].astype("string")
    sa2_polygons["layer_type"] = "polygon"
    sa2_polygons["polygon_line_width_m"] = 50
    sa2_polygons["polygon_line_color_hex"] = "#2f3437cc"
    sa2_polygons["polygon_fill_color_value"] = sa2_polygons["road_density_km_per_km2"]
    sa2_polygons["polygon_extrude_elevation_m"] = (
        (pd.to_numeric(sa2_polygons["road_density_km_per_km2"], errors="coerce").fillna(0).clip(upper=20) * 75)
        .round(0)
        .astype("Int64")
    )
    sa2_polygons["wkp"] = sa2_polygons.geometry.apply(encode_wkp_geometry)
    sa2_polygons["tooltip_html"] = sa2_polygons.apply(place_tooltip_html, axis=1)

    ordered_columns = [
        "geometry_id",
        "layer_type",
        "place_feature_id",
        "place_name",
        "place_type",
        "territorial_authority_name",
        "place_area_m2",
        "place_area_km2",
        "road_length_total_km",
        "road_density_km_per_km2",
        "place_road_density_rank",
        "label_lon",
        "label_lat",
        "polygon_line_width_m",
        "polygon_line_color_hex",
        "polygon_fill_color_value",
        "polygon_extrude_elevation_m",
        "wkp",
        "tooltip_html",
    ]
    return (
        pd.DataFrame(sa2_polygons[ordered_columns])
        .sort_values(["place_road_density_rank", "place_name"], na_position="last")
        .reset_index(drop=True),
        place_surface_density_fact.reset_index(drop=True),
        place_road_bridge.reset_index(drop=True),
        hamilton_road_surface_dimension.reset_index(drop=True),
    )


def build_hamilton_tla_demo_tables(
    *,
    place_polygon: pd.DataFrame,
    road_path: pd.DataFrame,
    od_arc: pd.DataFrame,
    traffic_count_site_point: pd.DataFrame,
    ferry_route_line: pd.DataFrame,
    place_surface_density_fact: pd.DataFrame,
    place_road_bridge: pd.DataFrame,
    road_surface_dimension: pd.DataFrame,
    sa2_reference: pd.DataFrame,
    territorial_authority_boundary: gpd.GeoDataFrame | None = None,
    sa2_boundary: gpd.GeoDataFrame | None = None,
) -> tuple[dict[str, pd.DataFrame], dict[str, object]]:
    require_columns(
        place_polygon,
        ["place_feature_id", "territorial_authority_name", "wkp"],
        "nz_place_polygon",
    )
    require_columns(road_path, ["road_feature_id", "road_length_total_km"], "nz_road_path")
    require_columns(place_road_bridge, ["place_feature_id", "road_feature_id"], "nz_place_road_bridge")
    require_columns(sa2_reference, ["sa2_code", "center_lat", "center_lon"], "nz_sa2_reference")

    ta_name = clean_string(place_polygon["territorial_authority_name"])
    hamilton_places = place_polygon[ta_name.eq(HAMILTON_TLA_NAME)].copy().reset_index(drop=True)
    if hamilton_places.empty:
        raise ValueError(f"No place polygons matched territorial_authority_name = {HAMILTON_TLA_NAME!r}.")

    boundary, boundary_source = hamilton_tla_boundary_geometry(territorial_authority_boundary)
    if boundary is None:
        boundary = wkp_union(hamilton_places["wkp"])
        boundary_source = "hamilton_place_polygon_union"
    road_selection_boundary = buffer_boundary_meters(boundary, buffer_m=HAMILTON_ROAD_CONTEXT_BUFFER_M)
    min_lon, min_lat, max_lon, max_lat = boundary.bounds
    hamilton_place_ids = set(hamilton_places["place_feature_id"].astype("string"))

    hamilton_bridge = place_road_bridge[
        place_road_bridge["place_feature_id"].astype("string").isin(hamilton_place_ids)
    ].copy()
    bridge_road_ids = set(hamilton_bridge["road_feature_id"].astype("string"))
    if "wkp" in road_path.columns:
        hamilton_road_mask = wkp_intersects_boundary_mask(road_path, wkp_column="wkp", boundary=road_selection_boundary)
        hamilton_roads = road_path[hamilton_road_mask].copy()
        road_selection_method = (
            f"road_path.wkp intersects {boundary_source} buffered by {HAMILTON_ROAD_CONTEXT_BUFFER_M:g} m"
        )
        if hamilton_roads.empty:
            hamilton_roads = road_path[road_path["road_feature_id"].astype("string").isin(bridge_road_ids)].copy()
            road_selection_method = "fallback nz_place_road_bridge membership"
    else:
        hamilton_roads = road_path[road_path["road_feature_id"].astype("string").isin(bridge_road_ids)].copy()
        road_selection_method = "fallback nz_place_road_bridge membership; road_path.wkp was unavailable"

    hamilton_road_ids = set(hamilton_roads["road_feature_id"].astype("string"))
    hamilton_bridge = hamilton_bridge[
        hamilton_bridge["road_feature_id"].astype("string").isin(hamilton_road_ids)
    ].copy()
    hamilton_roads["road_length_rank"] = rank_desc_nullable(hamilton_roads["road_length_total_km"])
    hamilton_roads["tooltip_html"] = hamilton_roads.apply(road_tooltip_html, axis=1)
    hamilton_roads = hamilton_roads.sort_values(["road_length_rank", "road_feature_id"], na_position="last").reset_index(drop=True)

    hamilton_sa2_reference, sa2_selection_method = hamilton_sa2_reference_by_boundary(
        sa2_reference,
        boundary=boundary,
        sa2_boundary=sa2_boundary,
    )
    hamilton_sa2_codes = set(hamilton_sa2_reference["sa2_code"].astype("string"))
    hamilton_sa2_boundary = hamilton_sa2_boundary_for_codes(sa2_boundary, hamilton_sa2_codes)
    polygon_selection_method = "nz_place_polygon territorial_authority_name = Hamilton City"
    if hamilton_sa2_boundary is not None:
        (
            hamilton_places,
            hamilton_place_surface_fact,
            hamilton_bridge,
            hamilton_road_surface_dimension,
        ) = build_sa2_road_density_tables(
            hamilton_sa2_boundary=hamilton_sa2_boundary,
            hamilton_sa2_reference=hamilton_sa2_reference,
            hamilton_roads=hamilton_roads,
            road_surface_dimension=road_surface_dimension,
        )
        polygon_selection_method = "statsnz_sa2_2023_generalised polygon is >90% inside Hamilton TLA"
    else:
        hamilton_place_surface_fact = place_surface_density_fact[
            place_surface_density_fact["place_feature_id"].astype("string").isin(hamilton_place_ids)
        ].copy()
        hamilton_surface_values = set(
            hamilton_place_surface_fact.get("road_surface", pd.Series(dtype="string")).dropna().astype(str)
        )
        hamilton_surface_values.update(hamilton_roads.get("road_surface", pd.Series(dtype="string")).dropna().astype(str))
        hamilton_road_surface_dimension = road_surface_dimension[
            road_surface_dimension.get("road_surface", pd.Series(dtype="string")).astype(str).isin(hamilton_surface_values)
        ].copy()

    origin_in_hamilton = od_arc["origin_sa2_code"].astype("string").isin(hamilton_sa2_codes)
    destination_in_hamilton = od_arc["destination_sa2_code"].astype("string").isin(hamilton_sa2_codes)
    valid_arc = normalize_boolean_series(od_arc["arc_is_valid"])
    hamilton_od_arc = od_arc[(origin_in_hamilton | destination_in_hamilton) & valid_arc].copy()
    hamilton_od_arc["people_count_rank"] = rank_desc_nullable(hamilton_od_arc["people_count"], hamilton_od_arc["arc_is_valid"])
    hamilton_od_arc["tooltip_html"] = hamilton_od_arc.apply(arc_tooltip_html, axis=1)
    hamilton_od_arc = hamilton_od_arc.sort_values(
        ["people_count_rank", "origin_sa2_code", "destination_sa2_code"],
        na_position="last",
    ).reset_index(drop=True)

    hamilton_traffic_mask = coordinate_mask_within_boundary(
        traffic_count_site_point,
        longitude_column="longitude",
        latitude_column="latitude",
        boundary=boundary,
    )
    hamilton_traffic_sites = traffic_count_site_point[hamilton_traffic_mask].copy()
    hamilton_traffic_sites["latest_aadt_rank"] = rank_desc_nullable(hamilton_traffic_sites["latest_aadt"])
    hamilton_traffic_sites["tooltip_html"] = hamilton_traffic_sites.apply(traffic_site_tooltip_html, axis=1)
    hamilton_traffic_sites = hamilton_traffic_sites.sort_values(
        ["latest_aadt_rank", "site_ref"],
        na_position="last",
    ).reset_index(drop=True)

    hamilton_ferry_lines = ferry_route_line[normalize_boolean_series(ferry_route_line["line_is_valid"])].copy()
    hamilton_ferry_lines["tooltip_html"] = hamilton_ferry_lines.apply(ferry_tooltip_html, axis=1)
    hamilton_ferry_lines = hamilton_ferry_lines.reset_index(drop=True)

    tables = {
        "place_polygon": hamilton_places,
        "road_path": hamilton_roads,
        "od_arc": hamilton_od_arc,
        "traffic_count_site_point": hamilton_traffic_sites,
        "ferry_route_line": hamilton_ferry_lines,
        "place_surface_density_fact": hamilton_place_surface_fact.reset_index(drop=True),
        "place_road_bridge": hamilton_bridge.reset_index(drop=True),
        "road_surface_dimension": hamilton_road_surface_dimension.reset_index(drop=True),
        "sa2_reference": hamilton_sa2_reference,
    }
    diagnostics = {
        "demo_area": HAMILTON_TLA_NAME,
        "demo_area_filter": "nz_place_polygon[territorial_authority_name] = 'Hamilton City'",
        "demo_boundary_note": (
            "Hamilton demo boundary uses the Stats NZ Territorial Authority 2023 generalised Hamilton City polygon "
            "when the optional public boundary artifact is available; otherwise it falls back to the union of exported "
            "Hamilton place polygons. Road paths are selected with a small metric buffer around that boundary so "
            "boundary-hugging state highway segments remain visible."
        ),
        "demo_boundary_source": boundary_source,
        "road_context_buffer_m": HAMILTON_ROAD_CONTEXT_BUFFER_M,
        "road_selection_method": road_selection_method,
        "sa2_selection_method": sa2_selection_method,
        "polygon_selection_method": polygon_selection_method,
        "ferry_line_note": "Ferry lines remain the official AT and Metlink A-to-B line sample so the Hamilton demo still covers the line geometry type.",
        "map_bounds": {
            "south": float(min_lat),
            "west": float(min_lon),
            "north": float(max_lat),
            "east": float(max_lon),
        },
        "hamilton_polygon_count": int(len(hamilton_places)),
        "hamilton_sa2_count": int(len(hamilton_sa2_reference)),
        "hamilton_road_count": int(len(hamilton_roads)),
        "hamilton_road_count_from_place_bridge": int(len(bridge_road_ids)),
        "hamilton_road_count_selected_by_boundary": int(len(hamilton_road_ids)),
        "hamilton_traffic_site_count": int(len(hamilton_traffic_sites)),
    }
    return tables, diagnostics
