"""Deterministic database-schema signatures used by bootstrap tests."""

from __future__ import annotations

from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


def _canonical_type(type_value) -> str:
    return str(type_value).upper().replace(" WITHOUT TIME ZONE", "")


def _server_default(column) -> str | None:
    default = column.get("default") if isinstance(column, dict) else column.server_default
    if default is None:
        return None
    value = default if isinstance(column, dict) else default.arg
    return str(value)


def metadata_signature(metadata) -> dict:
    dialect = postgresql.dialect()
    tables = {}
    for table in sorted(metadata.tables.values(), key=lambda item: item.name):
        tables[table.name] = {
            "columns": [
                {
                    "name": column.name,
                    "type": _canonical_type(column.type.compile(dialect=dialect)),
                    "nullable": column.nullable,
                    "primary_key": column.primary_key,
                    "server_default": _server_default(column),
                }
                for column in table.columns
            ],
            "foreign_keys": sorted(
                (
                    tuple(element.parent.name for element in constraint.elements),
                    tuple(element.target_fullname for element in constraint.elements),
                    constraint.ondelete,
                )
                for constraint in table.foreign_key_constraints
            ),
            "unique_constraints": sorted(
                tuple(column.name for column in constraint.columns)
                for constraint in table.constraints
                if constraint.__class__.__name__ == "UniqueConstraint"
            ),
            "indexes": sorted(
                (index.name, tuple(column.name for column in index.columns), index.unique)
                for index in table.indexes
            ),
        }
    return tables


def database_signature(connection, table_names: set[str]) -> dict:
    inspector = inspect(connection)
    tables = {}
    for table_name in sorted(table_names):
        columns = inspector.get_columns(table_name)
        primary_key = set(inspector.get_pk_constraint(table_name).get("constrained_columns") or [])
        unique_constraints = sorted(
            tuple(item["column_names"])
            for item in inspector.get_unique_constraints(table_name)
        )
        indexes = [
            (
                index["name"],
                tuple(index["column_names"]),
                index["unique"],
            )
            for index in inspector.get_indexes(table_name)
        ]
        tables[table_name] = {
            "columns": [
                {
                    "name": column["name"],
                    "type": _canonical_type(column["type"]),
                    "nullable": column["nullable"],
                    "primary_key": column["name"] in primary_key,
                    "server_default": _server_default(column),
                }
                for column in columns
            ],
            "foreign_keys": sorted(
                (
                    tuple(foreign_key["constrained_columns"]),
                    tuple(
                        f"{foreign_key['referred_table']}.{column}"
                        for column in foreign_key["referred_columns"]
                    ),
                    foreign_key.get("options", {}).get("ondelete"),
                )
                for foreign_key in inspector.get_foreign_keys(table_name)
            ),
            "unique_constraints": unique_constraints,
            # PostgreSQL exposes backing unique-constraint indexes through
            # get_indexes as well. They are constraints, not independent
            # indexes, so exclude them from this normalized representation.
            "indexes": sorted(
                index
                for index in indexes
                if not (index[2] and index[1] in unique_constraints)
            ),
        }
    return tables
