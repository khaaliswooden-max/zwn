#!/bin/bash
# ZWM Daily 10x Brief — shell wrapper for cron
# Usage: bash run-daily.sh
# Cron:  0 6 * * * cd /home/user/zwn/zwm-daily && bash run-daily.sh

set -euo pipefail
cd "$(dirname "$0")"

# Load env if present
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo ""
echo "=========================================="
echo "[$(date -Iseconds)] Starting ZWM Daily Brief"
echo "=========================================="

node zwm-daily.mjs 2>&1

echo "[$(date -Iseconds)] Brief generation complete"
