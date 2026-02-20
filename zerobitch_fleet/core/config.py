from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Any, Dict

import yaml


@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    debug: bool
    adapter: str
    db_path: str
    poll_interval_sec: int


DEFAULT_CONFIG = {
    "host": "0.0.0.0",
    "port": 8080,
    "debug": False,
    "adapter": "docker",
    "db_path": "./data/zerobitch.db",
    "poll_interval_sec": 15,
}


def _load_yaml(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    return data


def load_config() -> AppConfig:
    config_path = Path(os.environ.get("ZEROBITCH_CONFIG", "./config.yaml"))
    file_config = _load_yaml(config_path)

    merged = {**DEFAULT_CONFIG, **file_config}

    host = os.environ.get("ZEROBITCH_HOST", merged["host"])
    port = int(os.environ.get("ZEROBITCH_PORT", merged["port"]))
    debug_env = os.environ.get("ZEROBITCH_DEBUG")
    debug = merged["debug"] if debug_env is None else debug_env.lower() == "true"
    adapter = os.environ.get("ZEROBITCH_ADAPTER", merged["adapter"])
    db_path = os.environ.get("ZEROBITCH_DB_PATH", merged["db_path"])
    poll_interval_sec = int(os.environ.get("ZEROBITCH_POLL_INTERVAL", merged["poll_interval_sec"]))

    return AppConfig(
        host=host,
        port=port,
        debug=debug,
        adapter=adapter,
        db_path=db_path,
        poll_interval_sec=poll_interval_sec,
    )
