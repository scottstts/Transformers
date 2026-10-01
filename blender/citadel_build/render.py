"""Render the saved Blender asset, without touching the live UI or game."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from ctd.blender_io import render_review

names = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["hero", "barbican", "spire_close"]
render_review(ROOT / "out" / "renders", names)
