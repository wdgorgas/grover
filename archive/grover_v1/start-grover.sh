#!/usr/bin/env bash
# GROVER launcher for the Ubuntu server.
# For 24/7 operation, install as a systemd service instead — see SECURITY.md §5.
cd "$(dirname "$0")"
exec node grover.mjs "$@"
