from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from .runtime import load_config, runtime_root, update_status


def checked_child(root: Path, candidate: Path) -> Path:
    resolved_root = root.resolve()
    resolved = candidate.resolve()
    if resolved == resolved_root or resolved_root not in resolved.parents:
        raise RuntimeError(f"Refusing cleanup outside manager runtime: {resolved}")
    return resolved


def remove_tree(root: Path, candidate: Path, removed: list[str]) -> None:
    target = checked_child(root, candidate)
    if target.exists():
        shutil.rmtree(target)
        removed.append(str(target))


def prune_checkpoints(run_dir: Path, keep: int, removed: list[str], root: Path) -> None:
    checkpoints: list[tuple[int, Path]] = []
    for path in run_dir.glob("checkpoint-*"):
        try:
            checkpoints.append((int(path.name.rsplit("-", 1)[1]), path))
        except ValueError:
            continue
    for _, path in sorted(checkpoints, reverse=True)[keep:]:
        remove_tree(root, path, removed)


def main() -> None:
    parser = argparse.ArgumentParser(description="Prune disposable manager training artifacts without touching retained assets.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--run-name")
    parser.add_argument("--rejected-datasets", nargs="*", default=[])
    parser.add_argument("--discard-runs", nargs="*", default=[])
    args = parser.parse_args()
    config = load_config(args.config)
    root = runtime_root()
    removed: list[str] = []
    if args.run_name:
        run_dir = checked_child(root, root / "outputs" / args.run_name)
        if run_dir.exists():
            prune_checkpoints(run_dir, int(config["storage"]["keep_checkpoints"]), removed, root)
    remove_tree(root, root / "scratch", removed)
    # Direct base-model files are authoritative; this legacy cache is disposable and may contain broken Windows symlinks.
    remove_tree(root, root / "hf-cache", removed)
    for name in args.rejected_datasets:
        if name == config["dataset"]["release"]:
            raise RuntimeError("Refusing to remove the configured current dataset.")
        if Path(name).name != name:
            raise RuntimeError(f"Rejected dataset must be a directory name, not a path: {name}")
        remove_tree(root, root / "datasets" / name, removed)
    for name in args.discard_runs:
        if Path(name).name != name:
            raise RuntimeError(f"Discarded run must be a directory name, not a path: {name}")
        remove_tree(root, root / "outputs" / name, removed)
    update_status("cleanup", "complete", removed=removed)
    print(json.dumps({"removed": removed}, indent=2))


if __name__ == "__main__":
    main()
