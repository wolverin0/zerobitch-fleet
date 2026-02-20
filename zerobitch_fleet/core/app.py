from __future__ import annotations

import time
from typing import Dict, List

from flask import Flask, g, jsonify, render_template, request

from zerobitch_fleet.adapters.clawtrol.adapter import create_adapter as create_clawtrol_adapter
from zerobitch_fleet.adapters.docker.adapter import create_adapter as create_docker_adapter
from zerobitch_fleet.adapters.none.adapter import create_adapter as create_none_adapter
from zerobitch_fleet.adapters.openclaw.adapter import create_adapter as create_openclaw_adapter
from zerobitch_fleet.core import db
from zerobitch_fleet.core.config import load_config


ADAPTER_FACTORIES = {
    "none": create_none_adapter,
    "docker": create_docker_adapter,
    "openclaw": create_openclaw_adapter,
    "clawtrol": create_clawtrol_adapter,
}


def create_app() -> Flask:
    config = load_config()
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
        static_url_path="/static",
    )
    app.config.update(
        HOST=config.host,
        PORT=config.port,
        DEBUG=config.debug,
        DB_PATH=config.db_path,
        ADAPTER=config.adapter,
        POLL_INTERVAL_SEC=config.poll_interval_sec,
    )

    conn = db.connect(config.db_path)
    db.init_db(conn)
    db.seed_db(conn)
    conn.close()

    def get_conn():
        if "db_conn" not in g:
            g.db_conn = db.connect(app.config["DB_PATH"])
        return g.db_conn

    @app.teardown_appcontext
    def close_conn(_exc):
        conn = g.pop("db_conn", None)
        if conn is not None:
            conn.close()

    def get_adapter(conn):
        adapter_name = (app.config["ADAPTER"] or "none").lower().strip()
        factory = ADAPTER_FACTORIES.get(adapter_name, create_none_adapter)
        return factory(conn)

    @app.get("/")
    def index():
        return render_template(
            "index.html",
            poll_interval_sec=app.config["POLL_INTERVAL_SEC"],
            adapter_name=app.config["ADAPTER"],
        )

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "ts": int(time.time())})

    @app.get("/api/agents")
    def api_agents():
        conn = get_conn()
        agents = db.list_agents(conn)
        return jsonify({"agents": agents})

    @app.post("/api/agents/refresh")
    def api_refresh_agents():
        conn = get_conn()
        adapter = get_adapter(conn)
        result = adapter.refresh_agents()
        return jsonify(
            {
                "ok": result.ok,
                "message": result.message,
                "updated": result.updated,
                "adapter": adapter.name,
            }
        )

    @app.get("/api/metrics")
    def api_metrics():
        conn = get_conn()
        agents = db.list_agents(conn)
        counts = _compute_counts(agents)
        ram_used = sum(agent["ram_used_mb"] for agent in agents)
        ram_limit = sum(agent["ram_limit_mb"] for agent in agents)
        return jsonify(
            {
                "counts": counts,
                "ram": {"used_mb": ram_used, "limit_mb": ram_limit},
                "poll_interval_sec": app.config["POLL_INTERVAL_SEC"],
                "adapter": app.config["ADAPTER"],
                "ts": int(time.time()),
            }
        )

    @app.post("/api/actions")
    def api_actions():
        payload = request.get_json(silent=True) or {}
        action = payload.get("action", "")
        agent_ids = payload.get("agent_ids") or []
        if action not in {"start", "stop", "restart", "delete"}:
            return jsonify({"error": "unsupported action"}), 400
        if not isinstance(agent_ids, list) or not agent_ids:
            return jsonify({"error": "agent_ids required"}), 400

        conn = get_conn()
        adapter = get_adapter(conn)
        results: List[Dict] = []
        for agent_id in agent_ids:
            result = adapter.invoke_action(agent_id, action)
            _post_process_action(conn, adapter.name, agent_id, action, result.ok, result.message)
            results.append(
                {"agent_id": agent_id, "ok": result.ok, "message": result.message}
            )
        return jsonify({"results": results})

    @app.get("/api/agents/<agent_id>/logs")
    def api_logs(agent_id: str):
        tail = int(request.args.get("tail", "200"))
        conn = get_conn()
        adapter = get_adapter(conn)
        if hasattr(adapter, "tail_logs"):
            logs = adapter.tail_logs(agent_id, tail)
        else:
            logs = db.get_logs(conn, agent_id, tail)
        return jsonify({"agent_id": agent_id, "tail": tail, "logs": logs})

    @app.patch("/api/agents/<agent_id>/template")
    def api_template(agent_id: str):
        payload = request.get_json(silent=True) or {}
        template = payload.get("template")
        if template is None:
            return jsonify({"error": "template required"}), 400
        conn = get_conn()
        agent = db.update_agent(conn, agent_id, {"template": template})
        if not agent:
            return jsonify({"error": "agent not found"}), 404
        db.insert_log(conn, agent_id, "Template updated")
        return jsonify({"agent": agent})

    @app.post("/api/agents/<agent_id>/task")
    def api_task(agent_id: str):
        payload = request.get_json(silent=True) or {}
        task = payload.get("task")
        if not task:
            return jsonify({"error": "task required"}), 400
        conn = get_conn()
        adapter = get_adapter(conn)
        result = adapter.send_task(agent_id, task)
        if result.ok and adapter.name != "none":
            db.insert_log(conn, agent_id, f"Task queued: {task}")
            db.update_agent(conn, agent_id, {"last_activity_ts": int(time.time())})
        return jsonify({"ok": result.ok, "message": result.message})

    return app


def _compute_counts(agents: List[Dict]) -> Dict[str, int]:
    counts = {"total": len(agents), "running": 0, "stopped": 0, "error": 0, "other": 0}
    for agent in agents:
        status = (agent.get("status") or "").lower()
        if status in counts:
            counts[status] += 1
        else:
            counts["other"] += 1
    return counts


def _post_process_action(
    conn,
    adapter_name: str,
    agent_id: str,
    action: str,
    ok: bool,
    message: str,
) -> None:
    if not ok:
        return
    if adapter_name == "none":
        return

    if action == "delete":
        db.delete_agent(conn, agent_id)
        return

    updates = {"last_activity_ts": int(time.time())}
    if action == "start":
        updates["status"] = "running"
    elif action == "stop":
        updates["status"] = "stopped"
    elif action == "restart":
        updates["status"] = "running"
        updates["restart_count"] = (db.get_agent(conn, agent_id) or {}).get("restart_count", 0) + 1

    db.update_agent(conn, agent_id, updates)
    db.insert_log(conn, agent_id, f"{action} requested via adapter: {message}")
