from __future__ import annotations

import sqlite3
from pathlib import Path

import aiosqlite
from sqlalchemy import event
from sqlalchemy.engine import Engine


SQLITE_BUSY_TIMEOUT_MS = 5000


def _normalize_db_path(db_path: str | Path) -> Path:
    return Path(db_path)


def ensure_sqlite_parent_dir(db_path: str | Path) -> Path:
    normalized = _normalize_db_path(db_path)
    normalized.parent.mkdir(parents=True, exist_ok=True)
    return normalized


def configure_sqlite_pragmas(connection: sqlite3.Connection) -> sqlite3.Connection:
    cursor = connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()
    return connection


def connect_sqlite(db_path: str | Path) -> sqlite3.Connection:
    normalized = ensure_sqlite_parent_dir(db_path)
    connection = sqlite3.connect(str(normalized))
    return configure_sqlite_pragmas(connection)


async def connect_aiosqlite(db_path: str | Path) -> aiosqlite.Connection:
    normalized = ensure_sqlite_parent_dir(db_path)
    connection = await aiosqlite.connect(str(normalized))
    await connection.execute("PRAGMA journal_mode=WAL")
    await connection.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
    await connection.execute("PRAGMA foreign_keys=ON")
    return connection


def configure_sqlalchemy_sqlite_engine(engine: Engine, database_url: str) -> Engine:
    if not database_url.startswith("sqlite:///"):
        return engine

    @event.listens_for(engine, "connect")
    def _configure_sqlite_connection(dbapi_connection, _connection_record):
        configure_sqlite_pragmas(dbapi_connection)

    return engine
