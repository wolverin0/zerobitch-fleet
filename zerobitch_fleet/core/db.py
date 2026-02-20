from __future__ import annotations

import sqlite3
import time
from pathlib import Path
from typing import Dict, List, Optional


SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    restart_count INTEGER NOT NULL,
    ram_used_mb REAL NOT NULL,
    ram_limit_mb REAL NOT NULL,
    uptime_sec INTEGER NOT NULL,
    last_activity_ts INTEGER NOT NULL,
    observability_backend TEXT NOT NULL,
    observability_details TEXT NOT NULL,
    cron_native TEXT NOT NULL,
    cron_registry TEXT NOT NULL,
    template TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    line TEXT NOT NULL,
    FOREIGN KEY(agent_id) REFERENCES agents(id)
);
"""


SEED_AGENTS = [
    {
        "id": "zb-alpha",
        "name": "ZB Alpha",
        "status": "running",
        "restart_count": 2,
        "ram_used_mb": 256,
        "ram_limit_mb": 512,
        "uptime_sec": 86400,
        "last_activity_ts": int(time.time()) - 120,
        "observability_backend": "prometheus",
        "observability_details": "prometheus://metrics/zb-alpha",
        "cron_native": "0 */6 * * *",
        "cron_registry": "sync-registry@hourly",
        "template": "# Default template for zb-alpha\nmode: proactive\n",
    },
    {
        "id": "zb-bravo",
        "name": "ZB Bravo",
        "status": "stopped",
        "restart_count": 0,
        "ram_used_mb": 0,
        "ram_limit_mb": 512,
        "uptime_sec": 0,
        "last_activity_ts": int(time.time()) - 7200,
        "observability_backend": "none",
        "observability_details": "offline",
        "cron_native": "30 2 * * *",
        "cron_registry": "registry-refresh@daily",
        "template": "# Default template for zb-bravo\nmode: standby\n",
    },
    {
        "id": "zb-charlie",
        "name": "ZB Charlie",
        "status": "error",
        "restart_count": 7,
        "ram_used_mb": 384,
        "ram_limit_mb": 512,
        "uptime_sec": 3600,
        "last_activity_ts": int(time.time()) - 30,
        "observability_backend": "grafana",
        "observability_details": "grafana://dashboards/zb-charlie",
        "cron_native": "*/15 * * * *",
        "cron_registry": "registry-sync@15m",
        "template": "# Default template for zb-charlie\nmode: auto-heal\n",
    },
]

SEED_LOGS = [
    ("zb-alpha", "Scheduler tick - health OK"),
    ("zb-alpha", "Metrics push 0.26 GB RAM"),
    ("zb-bravo", "Agent stopped by operator"),
    ("zb-charlie", "Restarted after panic"),
    ("zb-charlie", "Crash loop detected"),
]


def connect(db_path: str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def seed_db(conn: sqlite3.Connection) -> None:
    cur = conn.execute("SELECT COUNT(*) AS count FROM agents")
    count = cur.fetchone()["count"]
    if count:
        return
    for agent in SEED_AGENTS:
        conn.execute(
            """
            INSERT INTO agents (
                id, name, status, restart_count, ram_used_mb, ram_limit_mb,
                uptime_sec, last_activity_ts, observability_backend, observability_details,
                cron_native, cron_registry, template
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agent["id"],
                agent["name"],
                agent["status"],
                agent["restart_count"],
                agent["ram_used_mb"],
                agent["ram_limit_mb"],
                agent["uptime_sec"],
                agent["last_activity_ts"],
                agent["observability_backend"],
                agent["observability_details"],
                agent["cron_native"],
                agent["cron_registry"],
                agent["template"],
            ),
        )
    now = int(time.time())
    for agent_id, line in SEED_LOGS:
        conn.execute(
            "INSERT INTO logs (agent_id, ts, line) VALUES (?, ?, ?)",
            (agent_id, now, line),
        )
    conn.commit()


def list_agents(conn: sqlite3.Connection) -> List[Dict]:
    rows = conn.execute("SELECT * FROM agents ORDER BY id ASC").fetchall()
    return [dict(row) for row in rows]


def get_agent(conn: sqlite3.Connection, agent_id: str) -> Optional[Dict]:
    row = conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    return dict(row) if row else None


def update_agent(conn: sqlite3.Connection, agent_id: str, updates: Dict) -> Optional[Dict]:
    if not updates:
        return get_agent(conn, agent_id)
    keys = list(updates.keys())
    assignments = ", ".join([f"{key} = ?" for key in keys])
    values = [updates[key] for key in keys]
    values.append(agent_id)
    conn.execute(f"UPDATE agents SET {assignments} WHERE id = ?", values)
    conn.commit()
    return get_agent(conn, agent_id)


def delete_agent(conn: sqlite3.Connection, agent_id: str) -> None:
    conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
    conn.execute("DELETE FROM logs WHERE agent_id = ?", (agent_id,))
    conn.commit()


def insert_log(conn: sqlite3.Connection, agent_id: str, line: str) -> None:
    conn.execute(
        "INSERT INTO logs (agent_id, ts, line) VALUES (?, ?, ?)",
        (agent_id, int(time.time()), line),
    )
    conn.commit()


def get_logs(conn: sqlite3.Connection, agent_id: str, tail: int) -> List[Dict]:
    rows = conn.execute(
        "SELECT ts, line FROM logs WHERE agent_id = ? ORDER BY id DESC LIMIT ?",
        (agent_id, tail),
    ).fetchall()
    logs = [dict(row) for row in rows]
    logs.reverse()
    return logs


def upsert_agent(conn: sqlite3.Connection, agent: Dict) -> Optional[Dict]:
    existing = get_agent(conn, agent["id"])
    if existing:
        updates = dict(agent)
        updates.pop("id", None)
        return update_agent(conn, agent["id"], updates)

    conn.execute(
        """
        INSERT INTO agents (
            id, name, status, restart_count, ram_used_mb, ram_limit_mb,
            uptime_sec, last_activity_ts, observability_backend, observability_details,
            cron_native, cron_registry, template
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            agent["id"],
            agent["name"],
            agent["status"],
            agent["restart_count"],
            agent["ram_used_mb"],
            agent["ram_limit_mb"],
            agent["uptime_sec"],
            agent["last_activity_ts"],
            agent["observability_backend"],
            agent["observability_details"],
            agent["cron_native"],
            agent["cron_registry"],
            agent["template"],
        ),
    )
    conn.commit()
    return get_agent(conn, agent["id"])


def delete_agents_with_prefix_not_in(conn: sqlite3.Connection, prefix: str, keep_ids: List[str]) -> None:
    rows = conn.execute("SELECT id FROM agents WHERE id LIKE ?", (f"{prefix}%",)).fetchall()
    valid = set(keep_ids)
    for row in rows:
        agent_id = row["id"]
        if agent_id in valid:
            continue
        delete_agent(conn, agent_id)
