"""数据库连接与初始化。"""

from __future__ import annotations

import os
import sqlite3

from flask import current_app, g

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "foodbox.sqlite3")
SCHEMA_PATH = os.path.join(ROOT, "db", "schema.sql")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(current_app.config["DATABASE"])
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


def close_db(_e=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def ensure_db(app) -> None:
    """数据库不存在时自动建库并写入种子数据。"""
    if not os.path.exists(app.config["DATABASE"]):
        os.makedirs(os.path.dirname(app.config["DATABASE"]), exist_ok=True)
        conn = sqlite3.connect(app.config["DATABASE"])
        conn.executescript(open(SCHEMA_PATH, encoding="utf-8").read())
        conn.commit()
        conn.close()
        import importlib

        seed = importlib.import_module("scripts.seed")
        seed.main(reset=False)


def query(sql: str, args=()) -> list[sqlite3.Row]:
    return get_db().execute(sql, args).fetchall()


def query_one(sql: str, args=()) -> sqlite3.Row | None:
    return get_db().execute(sql, args).fetchone()


def execute(sql: str, args=()) -> sqlite3.Cursor:
    cur = get_db().execute(sql, args)
    get_db().commit()
    return cur
