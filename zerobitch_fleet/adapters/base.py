from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class ActionResult:
    ok: bool
    message: str


@dataclass
class RefreshResult:
    ok: bool
    message: str
    updated: int = 0


class FleetAdapter(Protocol):
    name: str

    def invoke_action(self, agent_id: str, action: str) -> ActionResult:
        ...

    def send_task(self, agent_id: str, task: str) -> ActionResult:
        ...

    def refresh_agents(self) -> RefreshResult:
        ...
