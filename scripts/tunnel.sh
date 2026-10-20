#!/usr/bin/env bash
set -euo pipefail
: "${SNAPCHAIN_SSH_HOST:?Set user@hostname for your own server}"
: "${SNAPCHAIN_SSH_KEY:?Set the path to your private SSH key}"
exec ssh -N -L 127.0.0.1:13381:127.0.0.1:3381 -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -i "$SNAPCHAIN_SSH_KEY" "$SNAPCHAIN_SSH_HOST"
