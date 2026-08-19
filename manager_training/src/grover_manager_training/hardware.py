from __future__ import annotations

import shutil
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class GpuInfo:
    name: str
    total_vram_mb: int
    free_vram_mb: int
    driver_version: str


def detect_nvidia_gpus() -> list[GpuInfo]:
    executable = shutil.which("nvidia-smi")
    if not executable:
        return []
    command = [
        executable,
        "--query-gpu=name,memory.total,memory.free,driver_version",
        "--format=csv,noheader,nounits",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=15, check=False)
    if completed.returncode != 0:
        return []
    gpus: list[GpuInfo] = []
    for line in completed.stdout.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 4:
            continue
        try:
            gpus.append(GpuInfo(parts[0], int(parts[1]), int(parts[2]), parts[3]))
        except ValueError:
            continue
    return gpus


def choose_profile(config: dict[str, Any], gpus: list[GpuInfo]) -> tuple[str, dict[str, Any], GpuInfo | None]:
    if not gpus:
        return "cpu", config["profiles"]["cpu"], None
    gpu = max(gpus, key=lambda item: (item.total_vram_mb, item.free_vram_mb))
    profiles = config["profiles"]
    eligible = [
        (name, profile)
        for name, profile in profiles.items()
        if name != "cpu" and gpu.total_vram_mb >= int(profile["min_vram_mb"])
    ]
    if not eligible:
        return "cpu", profiles["cpu"], gpu
    name, profile = max(eligible, key=lambda item: int(item[1]["min_vram_mb"]))
    return name, profile, gpu


def free_disk_gb(path: Path) -> float:
    path.mkdir(parents=True, exist_ok=True)
    return shutil.disk_usage(path).free / (1024**3)


def hardware_report(config: dict[str, Any], path: Path) -> dict[str, Any]:
    gpus = detect_nvidia_gpus()
    profile_name, profile, selected_gpu = choose_profile(config, gpus)
    return {
        "profile": profile_name,
        "profile_settings": profile,
        "selected_gpu": asdict(selected_gpu) if selected_gpu else None,
        "detected_gpus": [asdict(gpu) for gpu in gpus],
        "free_disk_gb": round(free_disk_gb(path), 2),
    }
