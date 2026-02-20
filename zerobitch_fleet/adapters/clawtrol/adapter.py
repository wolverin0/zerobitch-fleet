from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from zerobitch_fleet.adapters.base import ActionResult, FleetAdapter, RefreshResult


class ClawTrolAdapter:
    name = "clawtrol"

    def invoke_action(self, agent_id: str, action: str) -> ActionResult:
        return self._post(
            f"/agents/{agent_id}/actions",
            {"action": action, "source": "zerobitch-fleet"},
            "action sent to clawtrol",
        )

    def send_task(self, agent_id: str, task: str) -> ActionResult:
        return self._post(
            f"/agents/{agent_id}/tasks",
            {"task": task, "source": "zerobitch-fleet"},
            "task queued in clawtrol",
        )

    def refresh_agents(self) -> RefreshResult:
        return RefreshResult(ok=False, message="clawtrol adapter does not support refresh")

    def _post(self, path: str, payload: dict, success_message: str) -> ActionResult:
        base_url = os.environ.get("ZEROBITCH_CLAWTROL_API_URL") or os.environ.get("CLAWTROL_API_URL")
        token = os.environ.get("ZEROBITCH_CLAWTROL_API_TOKEN") or os.environ.get("CLAWTROL_API_TOKEN")
        if not base_url:
            return ActionResult(ok=False, message="missing CLAWTROL API URL env")
        if not token:
            return ActionResult(ok=False, message="missing CLAWTROL API token env")
        url = base_url.rstrip("/") + path
        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=10) as resp:
                status = resp.getcode()
                response_body = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            return ActionResult(ok=False, message=f"clawtrol HTTP {exc.code}: {response_body}".strip())
        except urllib.error.URLError as exc:
            return ActionResult(ok=False, message=f"clawtrol API unreachable: {exc.reason}")
        if 200 <= status < 300:
            return ActionResult(ok=True, message=success_message)
        snippet = response_body[:200].strip() if response_body else "no response body"
        return ActionResult(ok=False, message=f"clawtrol API returned {status}: {snippet}")


def create_adapter(_conn) -> FleetAdapter:
    return ClawTrolAdapter()
