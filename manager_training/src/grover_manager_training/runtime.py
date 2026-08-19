from __future__ import annotations

import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def runtime_root() -> Path:
    override = os.environ.get("GROVER_MANAGER_HOME")
    if override:
        return Path(override).expanduser().resolve()
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        raise RuntimeError("LOCALAPPDATA is unavailable; set GROVER_MANAGER_HOME explicitly.")
    return Path(local_app_data) / "GROVER" / "manager-training"


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def load_config(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def dataset_path(config: dict[str, Any], root: Path | None = None) -> Path:
    base = root or runtime_root()
    return base / "datasets" / str(config["dataset"]["release"])


def model_path(root: Path | None = None) -> Path:
    return (root or runtime_root()) / "base-model"


def validate_run_name(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", value):
        raise ValueError("Run name must be 1-64 letters, digits, periods, underscores, or hyphens.")
    return value


def status_path(root: Path | None = None) -> Path:
    return (root or runtime_root()) / "status.json"


def update_status(stage: str, state: str, **details: Any) -> dict[str, Any]:
    root = runtime_root()
    path = status_path(root)
    current = {"stage": stage, "state": state, "updated_at": utc_now(), **details}
    atomic_write_json(path, current)
    return current
