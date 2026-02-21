from __future__ import annotations

import time
from typing import Dict

from zerobitch_fleet.adapters.base import ActionResult, FleetAdapter, RefreshResult
from zerobitch_fleet.core import db


class NoneAdapter:
    name = "none"

    def __init__(self, conn) -> None:
        self.conn = conn

    def invoke_action(self, agent_id: str, action: str) -> ActionResult:
        agent = db.get_agent(self.conn, agent_id)
        if not agent:
            return ActionResult(ok=False, message="agent not found")

        updates: Dict = {"last_activity_ts": int(time.time()), "last_activity_state": "event"}
        if action == "start":
            updates["status"] = "running"
        elif action == "stop":
            updates["status"] = "stopped"
            updates["ram_used_mb"] = 0
            updates["uptime_sec"] = 0
        elif action == "restart":
            updates["status"] = "running"
            updates["restart_count"] = agent["restart_count"] + 1
        elif action == "delete":
            db.delete_agent(self.conn, agent_id)
            return ActionResult(ok=True, message="agent deleted")
        else:
            return ActionResult(ok=False, message="unsupported action")

        db.update_agent(self.conn, agent_id, updates)
        db.insert_log(self.conn, agent_id, f"Action invoked: {action}")
        return ActionResult(ok=True, message=f"action {action} executed")

    def send_task(self, agent_id: str, task: str) -> ActionResult:
        agent = db.get_agent(self.conn, agent_id)
        if not agent:
            return ActionResult(ok=False, message="agent not found")
        db.insert_log(self.conn, agent_id, f"Task queued: {task}")
        db.update_agent(self.conn, agent_id, {"last_activity_ts": int(time.time()), "last_activity_state": "event"})
        return ActionResult(ok=True, message="task queued")

    def refresh_agents(self) -> RefreshResult:
        agents = db.list_agents(self.conn)
        now = int(time.time())
        updated = 0
        for agent in agents:
            if (agent.get("status") or "").lower() != "running":
                continue
            last_ts = agent.get("last_activity_ts") or now
            delta = max(0, now - last_ts)
            updates: Dict = {"last_activity_ts": now, "last_activity_state": "synthetic"}
            if delta:
                updates["uptime_sec"] = agent.get("uptime_sec", 0) + delta
            ram_used = agent.get("ram_used_mb", 0)
            ram_limit = agent.get("ram_limit_mb", ram_used)
            if ram_used < ram_limit:
                updates["ram_used_mb"] = min(ram_limit, ram_used + 4)
            db.update_agent(self.conn, agent["id"], updates)
            updated += 1
        message = "simulated refresh applied" if updated else "no running agents to refresh"
        return RefreshResult(ok=True, message=message, updated=updated)


def create_adapter(conn) -> FleetAdapter:
    return NoneAdapter(conn)
