#!/usr/bin/env bash
# Capture HID++ writes from lghub_agent via Frida.
#
# BLOCKED on current Mac (2026-07-13): lghub_agent is Hardened Runtime; even
# `sudo frida -p …` fails with "unable to access process". Agent also uses
# DriverKit com.logi.ghub.hidfilter. See NOTES.md — use Wireshark USB after
# SIP disable, or Linux usbmon, instead.
#
# Requires: sudo, project venv with frida-tools (.venv-frida).
#
# Usage (from repo root):
#   ./ref/hid-captures/capture-ghub-hid.sh
# Then flip presets in G HUB. Ctrl-C to stop.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRIDA="$ROOT/.venv-frida/bin/frida"
HOOK="$ROOT/ref/hid-captures/hook-lghub-hid.js"
OUT="$ROOT/ref/hid-captures/ghub-frida-$(date -u +%Y-%m-%dT%H-%M-%SZ).jsonl"

if [[ ! -x "$FRIDA" ]]; then
  echo "Frida venv missing. From repo root:"
  echo "  python3 -m venv .venv-frida && .venv-frida/bin/pip install frida-tools"
  exit 1
fi

PID="$(pgrep -n -f 'lghub_agent.app/Contents/MacOS/lghub_agent' || true)"
if [[ -z "${PID}" ]]; then
  echo "lghub_agent not running — open G HUB first"
  exit 1
fi

echo "Attaching to lghub_agent pid=$PID"
echo "Logging to $OUT"
echo "Flip presets now. Ctrl-C to stop."
# shellcheck disable=SC2024
sudo "$FRIDA" -p "$PID" -l "$HOOK" --runtime=v8 2>"$OUT.err" | tee "$OUT"
