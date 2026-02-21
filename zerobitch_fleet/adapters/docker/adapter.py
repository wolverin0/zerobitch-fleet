from __future__ import annotations

import json
import os
import socket
import time
from datetime import datetime
from typing import Dict, List, Optional
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
        db.update_agent(self.conn, agent_id, {"last_activity_ts": int(time.time()), "last_activity_state": "event"})
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
            mem_limit_mb, mem_limit_state = _memory_limit_mb(c.get("inspect"))
            mem_used_mb, mem_used_state = _memory_used_mb(c.get("stats"))
            last_ts, last_state = _resolve_last_activity(c)
            template = _detect_template(c.get("inspect"))
            model = _detect_model(c.get("inspect"))

            db.upsert_agent(
                self.conn,
                {
                    "id": agent_id,
                    "name": agent_id,
                    "status": status,
                    "restart_count": c.get("restart_count", 0),
                    "ram_used_mb": mem_used_mb if mem_used_mb is not None else 0,
                    "ram_limit_mb": mem_limit_mb if mem_limit_mb is not None else 0,
                    "ram_used_state": mem_used_state,
                    "ram_limit_state": mem_limit_state,
                    "uptime_sec": max(0, now - c.get("started_at", now)),
                    "last_activity_ts": last_ts or now,
                    "last_activity_state": last_state,
                    "observability_backend": "docker",
                    "observability_details": f"container:{c.get('short_id', '')}",
                    "cron_native": "n/a",
                    "cron_registry": "n/a",
                    "model": model,
                    "template": template,
                    "template_state": "configured" if template else "unknown",
                },
            )

        db.delete_agents_not_in(self.conn, seen_ids)
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
            parts = line.split(" ", 1)
            ts = _parse_rfc3339_to_epoch(parts[0]) if parts else None
            if ts is None:
                ts = int(time.time())
            msg = parts[1] if len(parts) == 2 else line
            logs.append({"ts": ts, "line": msg})
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

        inspect = _docker_get_json(f"/containers/{quote(name, safe='')}/json")
        stats = _docker_get_json(f"/containers/{quote(name, safe='')}/stats?stream=false")
        state = (row.get("State") or "").lower()

        items.append(
            {
                "name": name,
                "state": state,
                "short_id": (row.get("Id") or "")[:12],
                "started_at": _parse_rfc3339_to_epoch(((inspect or {}).get("State") or {}).get("StartedAt")),
                "restart_count": ((inspect or {}).get("RestartCount") or 0),
                "inspect": inspect,
                "stats": stats,
                "last_log_ts": _latest_log_ts(name),
            }
        )
    return items


def _latest_log_ts(container_name: str) -> Optional[int]:
    try:
        body = _docker_get(
            f"/containers/{quote(container_name, safe='')}/logs?stdout=1&stderr=1&timestamps=1&tail=1"
        )
    except RuntimeError:
        return None
    lines = [line for line in body.splitlines() if line.strip()]
    if not lines:
        return None
    ts = lines[-1].split(" ", 1)[0]
    return _parse_rfc3339_to_epoch(ts)


def _docker_get_json(path: str) -> Optional[Dict]:
    try:
        body = _docker_get(path)
        return json.loads(body)
    except Exception:
        return None


def _memory_limit_mb(inspect: Optional[Dict]) -> tuple[Optional[float], str]:
    memory = (((inspect or {}).get("HostConfig") or {}).get("Memory"))
    if memory in (None, ""):
        return None, "unavailable"
    try:
        memory = int(memory)
    except Exception:
        return None, "unavailable"
    if memory == 0:
        return None, "unlimited"
    return round(memory / (1024 * 1024), 2), "real"


def _memory_used_mb(stats: Optional[Dict]) -> tuple[Optional[float], str]:
    usage = (((stats or {}).get("memory_stats") or {}).get("usage"))
    if usage in (None, ""):
        return None, "unavailable"
    try:
        return round(float(usage) / (1024 * 1024), 2), "real"
    except Exception:
        return None, "unavailable"


def _resolve_last_activity(container: Dict) -> tuple[Optional[int], str]:
    log_ts = container.get("last_log_ts")
    if log_ts:
        return log_ts, "log"
    state = ((container.get("inspect") or {}).get("State") or {})
    candidates = [
        _parse_rfc3339_to_epoch(state.get("FinishedAt")),
        _parse_rfc3339_to_epoch(state.get("StartedAt")),
    ]
    candidates = [x for x in candidates if x]
    if candidates:
        return max(candidates), "event"
    return None, "unavailable"


def _detect_model(inspect: Optional[Dict]) -> Optional[str]:
    envs = ((inspect or {}).get("Config") or {}).get("Env") or []
    for env in envs:
        if env.startswith("MODEL="):
            return env.split("=", 1)[1] or None
    labels = ((inspect or {}).get("Config") or {}).get("Labels") or {}
    for key in ("model", "ai.model", "zeroclaw.model"):
        if labels.get(key):
            return labels.get(key)
    return "unknown"


def _detect_template(inspect: Optional[Dict]) -> str:
    labels = ((inspect or {}).get("Config") or {}).get("Labels") or {}
    value = labels.get("zeroclaw.template") or labels.get("template")
    return value or ""


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


def _parse_rfc3339_to_epoch(value) -> Optional[int]:
    if not value or str(value).startswith("0001-01-01"):
        return None
    try:
        text = str(value).strip().replace("Z", "+00:00")
        if "." in text:
            head, tail = text.split(".", 1)
            zone = ""
            frac = tail
            for marker in ("+", "-"):
                idx = frac.find(marker)
                if idx > 0:
                    zone = frac[idx:]
                    frac = frac[:idx]
                    break
            frac = frac[:6]
            text = f"{head}.{frac}{zone}" if frac else f"{head}{zone}"
        return int(datetime.fromisoformat(text).timestamp())
    except Exception:
        return None


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
