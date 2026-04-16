from __future__ import annotations

import argparse
import csv
import sqlite3
from pathlib import Path
from typing import Callable


def parse_text(value: str) -> str | None:
    return None if value == "" else value


def parse_int(value: str) -> int | None:
    return None if value == "" else int(value)


def parse_float(value: str) -> float | None:
    return None if value == "" else float(value)


def parse_bool(value: str) -> bool | None:
    if value == "":
        return None
    lowered = value.strip().lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    raise ValueError(f"Unsupported logical value: {value!r}")


Converter = Callable[[str], object]
SchemaEntry = tuple[str, Converter, str]


SCHEMA: list[SchemaEntry] = [
    ("geometry_id", parse_text, "TEXT"),
    ("layer_type", parse_text, "TEXT"),
    ("origin_geometry_id", parse_text, "TEXT"),
    ("origin_sa2_code", parse_int, "INTEGER"),
    ("origin_sa2_name", parse_text, "TEXT"),
    ("origin_sa2_reference_name", parse_text, "TEXT"),
    ("destination_geometry_id", parse_text, "TEXT"),
    ("destination_sa2_code", parse_int, "INTEGER"),
    ("destination_sa2_name", parse_text, "TEXT"),
    ("destination_sa2_reference_name", parse_text, "TEXT"),
    ("point1_latitude", parse_float, "REAL"),
    ("point1_longitude", parse_float, "REAL"),
    ("point2_latitude", parse_float, "REAL"),
    ("point2_longitude", parse_float, "REAL"),
    ("people_count", parse_int, "INTEGER"),
    ("arc_line_width_m", parse_int, "INTEGER"),
    ("arc_opacity", parse_float, "REAL"),
    ("arc_count_band", parse_text, "TEXT"),
    ("arc_count_band_sort_order", parse_int, "INTEGER"),
    ("arc_source_color_value", parse_int, "INTEGER"),
    ("arc_target_color_value", parse_int, "INTEGER"),
    ("arc_base_color_hex", parse_text, "TEXT"),
    ("arc_source_color_rgba", parse_text, "TEXT"),
    ("arc_target_color_rgba", parse_text, "TEXT"),
    ("count_2023_work_at_home", parse_int, "INTEGER"),
    ("count_2023_drive_a_private_car_truck_or_van", parse_int, "INTEGER"),
    ("count_2023_drive_a_company_car_truck_or_van", parse_int, "INTEGER"),
    ("count_2023_passenger_in_a_car_truck_van_or_company_bus", parse_int, "INTEGER"),
    ("count_2023_public_bus", parse_int, "INTEGER"),
    ("count_2023_train", parse_int, "INTEGER"),
    ("count_2023_bicycle", parse_int, "INTEGER"),
    ("count_2023_walk_or_jog", parse_int, "INTEGER"),
    ("count_2023_ferry", parse_text, "TEXT"),
    ("count_2023_other", parse_int, "INTEGER"),
    ("count_2023_total_stated", parse_int, "INTEGER"),
    ("origin_has_geometry", parse_bool, "INTEGER"),
    ("destination_has_geometry", parse_bool, "INTEGER"),
    ("has_origin_point", parse_bool, "INTEGER"),
    ("has_destination_point", parse_bool, "INTEGER"),
    ("has_both_points", parse_bool, "INTEGER"),
    ("is_same_sa2", parse_bool, "INTEGER"),
    ("arc_is_valid", parse_bool, "INTEGER"),
]

TOOLTIP_COLUMN = "tooltip"
DEFAULT_TABLE_NAME = "nz_sa2_travel_to_work_od_2023_powerbi"


def build_tooltip(row: dict[str, object]) -> str:
    return (
        f"arc width: {row['arc_line_width_m']}<br>"
        f"arc source colour value: {row['arc_source_color_value']}<br>"
        f"arc target colour value: {row['arc_target_color_value']}<br>"
        f"arc base colour hex: {row['arc_base_color_hex']}<br>"
        f"arc source colour rgba: {row['arc_source_color_rgba']}<br>"
        f"arc target colour rgba: {row['arc_target_color_rgba']}<br>"
        f"arc opacity: {row['arc_opacity']}<br>"
        f"people count: {row['people_count']}"
    )


def transform_rows(input_path: Path) -> list[dict[str, object]]:
    transformed_rows: list[dict[str, object]] = []

    with input_path.open("r", encoding="cp1252", newline="") as handle:
        reader = csv.DictReader(handle)
        expected_columns = [column_name for column_name, _, _ in SCHEMA]
        if reader.fieldnames != expected_columns:
            raise ValueError(
                "CSV columns do not match the Power Query schema. "
                f"Expected {len(expected_columns)} columns but found {reader.fieldnames!r}."
            )

        for row_index, raw_row in enumerate(reader, start=2):
            transformed_row: dict[str, object] = {}
            try:
                for column_name, converter, _ in SCHEMA:
                    transformed_row[column_name] = converter(raw_row[column_name])
            except Exception as exc:  # pragma: no cover - row/column context is the main value here
                raise ValueError(
                    f"Failed to convert row {row_index}, column {column_name}: {raw_row[column_name]!r}"
                ) from exc

            transformed_row[TOOLTIP_COLUMN] = build_tooltip(transformed_row)
            transformed_rows.append(transformed_row)

    return transformed_rows


def write_sqlite(output_path: Path, table_name: str, rows: list[dict[str, object]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    column_definitions = [f'"{column_name}" {sqlite_type}' for column_name, _, sqlite_type in SCHEMA]
    column_definitions.append(f'"{TOOLTIP_COLUMN}" TEXT')
    all_column_names = [column_name for column_name, _, _ in SCHEMA] + [TOOLTIP_COLUMN]
    insert_placeholders = ", ".join("?" for _ in all_column_names)
    quoted_columns = ", ".join(f'"{name}"' for name in all_column_names)

    with sqlite3.connect(output_path) as connection:
        connection.execute(f'CREATE TABLE "{table_name}" ({", ".join(column_definitions)})')
        connection.executemany(
            f'INSERT INTO "{table_name}" ({quoted_columns}) VALUES ({insert_placeholders})',
            ([row[column_name] for column_name in all_column_names] for row in rows),
        )
        connection.commit()


def parse_args() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parent.parent
    default_input = repo_root / "data_samples" / "nz_sa2_travel_to_work_od_2023.csv"
    default_output = repo_root / "data_samples" / "generated" / "nz_sa2_travel_to_work_od_2023.powerbi.sqlite"

    parser = argparse.ArgumentParser(
        description="Recreate the Power Query transform for the NZ SA2 travel-to-work sample CSV."
    )
    parser.add_argument("--input", type=Path, default=default_input)
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument("--table-name", default=DEFAULT_TABLE_NAME)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows = transform_rows(args.input)
    write_sqlite(args.output, args.table_name, rows)
    print(f"Wrote {len(rows)} rows to table {args.table_name!r} in {args.output}")


if __name__ == "__main__":
    main()
