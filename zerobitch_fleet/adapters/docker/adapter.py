from __future__ import annotations

import json
import os
import socket
import time
from typing import Dict, List
from urllib.parse import quote

from zerobitch_fleet.adapters.base import ActionResult, FleetAdapter, RefreshResult
from zerobitch_fleet.core import db

DOCKER_SOCKET = "/var/run/docker.sock"


class DockerAdapter:
    name = "docker"

    def __init__(self, conn) -> None:
        self.conn = conn

    def invoke_action(self, agent_id: str, action: str) -> ActionResult:
        return ActionResult(ok=False, message="docker adapter is read-only (actions disabled for safety)")

    def send_task(self, agent_id: str, task: str) -> ActionResult:
        agent = db.get_agent(self.conn, agent_id)
        if not agent:
            return ActionResult(ok=False, message="agent not found")
        db.insert_log(self.conn, agent_id, f"Mock dispatch queued: {task}")
        db.update_agent(self.conn, agent_id, {"last_activity_ts": int(time.time())})
        return ActionResult(ok=True, message="mock task accepted (no container mutation)")

    def refresh_agents(self) -> RefreshResult:
        try:
            containers = _list_zeroclaw_containers()
        except RuntimeError as exc:
            return RefreshResult(ok=False, message=str(exc), updated=0)

        now = int(time.time())
        seen_ids: List[str] = []
        for c in containers:
            agent_id = c["name"]
            seen_ids.append(agent_id)
            status = _normalize_status(c.get("state", ""))
            db.upsert_agent(
                self.conn,
                {
                    "id": agent_id,
                    "name": agent_id,
                    "status": status,
                    "restart_count": c.get("restart_count", 0),
                    "ram_used_mb": _estimate_ram_used(status),
                    "ram_limit_mb": 1024,
                    "uptime_sec": max(0, now - c.get("started_at", now)),
                    "last_activity_ts": now,
                    "observability_backend": "docker",
                    "observability_details": f"container:{c.get('short_id', '')}",
                    "cron_native": "n/a",
                    "cron_registry": "n/a",
                    "template": "# managed by docker adapter\n",
                },
            )

        db.delete_agents_with_prefix_not_in(self.conn, "zeroclaw-", seen_ids)
        return RefreshResult(ok=True, message="docker inventory refreshed", updated=len(containers))

    def tail_logs(self, agent_id: str, tail: int) -> List[Dict]:
        if not agent_id.startswith("zeroclaw-"):
            return db.get_logs(self.conn, agent_id, tail)
        try:
            body = _docker_get(
                f"/containers/{quote(agent_id, safe='')}/logs?stdout=1&stderr=1&timestamps=1&tail={tail}"
            )
        except RuntimeError as exc:
            return [{"ts": int(time.time()), "line": f"[docker-error] {exc}"}]

        logs: List[Dict] = []
        for line in body.splitlines():
            if not line.strip():
                continue
            # docker logs timestamps are RFC3339 at line prefix when timestamps=1
            parts = line.split(" ", 1)
            msg = parts[1] if len(parts) == 2 else line
            logs.append({"ts": int(time.time()), "line": msg})
        return logs[-tail:]


def _list_zeroclaw_containers() -> List[Dict]:
    body = _docker_get('/containers/json?all=1&filters={"name":["zeroclaw-"]}')
    try:
        rows = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"docker parse error: {exc}") from exc

    items: List[Dict] = []
    for row in rows:
        names = row.get("Names") or []
        if not names:
            continue
        name = names[0].lstrip("/")
        if not name.startswith("zeroclaw-"):
            continue
        state = (row.get("State") or "").lower()
        items.append(
            {
                "name": name,
                "state": state,
                "short_id": (row.get("Id") or "")[:12],
                "started_at": _parse_iso_to_epoch(row.get("State") and row.get("Created")),
                "restart_count": row.get("RestartCount", 0) or 0,
            }
        )
    return items


def _docker_get(path: str) -> str:
    if not socket_exists(DOCKER_SOCKET):
        raise RuntimeError("docker socket not mounted")

    request = f"GET {path} HTTP/1.1\r\nHost: docker\r\nConnection: close\r\n\r\n"
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.connect(DOCKER_SOCKET)
        client.sendall(request.encode("utf-8"))
        chunks = []
        while True:
            chunk = client.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
    raw = b"".join(chunks)
    head, _, body = raw.partition(b"\r\n\r\n")
    status_line = head.splitlines()[0].decode("utf-8", errors="replace") if head else ""
    if " 200 " not in status_line:
        raise RuntimeError(status_line or "docker HTTP error")

    headers_text = head.decode("utf-8", errors="replace").lower()
    if "transfer-encoding: chunked" in headers_text:
        body = _decode_chunked(body)
    return body.decode("utf-8", errors="replace")


def socket_exists(path: str) -> bool:
    return os.path.exists(path)


def _normalize_status(state: str) -> str:
    if state == "running":
        return "running"
    if state in {"exited", "dead", "created"}:
        return "stopped"
    if state in {"restarting", "paused"}:
        return "error"
    return "other"


def _estimate_ram_used(status: str) -> float:
    return 256 if status == "running" else (64 if status == "error" else 0)


def _parse_iso_to_epoch(value) -> int:
    # Fallback: container Created field is epoch seconds in Docker API.
    try:
        return int(value)
    except Exception:
        return int(time.time())


def create_adapter(conn) -> FleetAdapter:
    return DockerAdapter(conn)


def _decode_chunked(body: bytes) -> bytes:
    out = bytearray()
    i = 0
    n = len(body)
    while i < n:
        j = body.find(b"\r\n", i)
        if j == -1:
            break
        size_line = body[i:j].split(b";", 1)[0]
        try:
            size = int(size_line, 16)
        except ValueError:
            break
        i = j + 2
        if size == 0:
            break
        out.extend(body[i:i + size])
        i += size + 2
    return bytes(out)
