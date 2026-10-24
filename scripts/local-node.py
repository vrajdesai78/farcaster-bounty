#!/usr/bin/env python3
"""Compatibility entry point for the all-local CLI."""
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from farcaster_cli.local import entrypoint
if __name__ == '__main__':
    entrypoint()
