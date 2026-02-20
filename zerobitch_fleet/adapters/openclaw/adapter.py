from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from zerobitch_fleet.adapters.base import ActionResult, FleetAdapter, RefreshResult


class OpenClawAdapter:
    name = "openclaw"

    def invoke_action(self, agent_id: str, action: str) -> ActionResult:
        return ActionResult(ok=False, message=f"openclaw adapter does not support action '{action}'")

    def send_task(self, agent_id: str, task: str) -> ActionResult:
        gateway_url = (
            os.environ.get("ZEROBITCH_OPENCLAW_GATEWAY_URL")
            or os.environ.get("OPENCLAW_GATEWAY_URL")
            or os.environ.get("ZEROBITCH_OPENCLAW_WEBHOOK_URL")
        )
        if not gateway_url:
            return ActionResult(ok=False, message="missing OPENCLAW gateway URL env")
        payload = {"agent_id": agent_id, "task": task, "source": "zerobitch-fleet"}
        try:
            req = urllib.request.Request(
                gateway_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.getcode()
                body = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return ActionResult(ok=False, message=f"openclaw gateway HTTP {exc.code}: {body}".strip())
        except urllib.error.URLError as exc:
            return ActionResult(ok=False, message=f"openclaw gateway unreachable: {exc.reason}")
        if 200 <= status < 300:
            return ActionResult(ok=True, message="task forwarded to openclaw gateway")
        snippet = body[:200].strip() if body else "no response body"
        return ActionResult(ok=False, message=f"openclaw gateway returned {status}: {snippet}")

    def refresh_agents(self) -> RefreshResult:
        return RefreshResult(ok=False, message="openclaw adapter does not support refresh")


def create_adapter(_conn) -> FleetAdapter:
    return OpenClawAdapter()
