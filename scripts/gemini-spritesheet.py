"""
gemini-spritesheet.py
Generates a pixel-art sprite sheet for a single character using the Gemini image API,
then removes the green chroma-key background and cuts the sheet into named individual frames.

Workflow
--------
1. Generate a 2×2 grid spritesheet via Gemini (or modify an existing sheet for consistency).
2. Remove the green chroma-key background.
3. Cut the sheet into individual cells.
4. Save each cell with a meaningful name derived from the stance list.

Usage
-----
Edit the CONFIGURATION block below, then run:

    python scripts/gemini-spritesheet.py

Output
------
Individual frame PNGs are saved to `out_dir`, named:

    <character>-<stance>.png

e.g.  fish-swim-L.png, fish-swim-R.png, fish-idle.png, fish-jump.png

If you need more than 4 stances, generate a second 2×2 sheet (modify the first
image so the character stays consistent), then run this script again with the
new sheet and remaining stance names.
"""

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION — edit these values before running
# ──────────────────────────────────────────────────────────────────────────────

# Short name for the character (used in output filenames, no spaces)
character = "fish"

# Stances in row-major order matching the 2×2 grid layout:
#   [top-left, top-right, bottom-left, bottom-right]
# These become the filename suffixes, so be explicit and ordered.
stances = ["swim-L", "swim-R", "idle", "jump"]

# Gemini prompt describing the spritesheet.
# Always:
#   - Specify a 2×2 grid of 4 distinct stances
#   - Name each cell's position explicitly (top-left, top-right, bottom-left, bottom-right)
#   - Request a bright solid green (#00FF00) background for chroma-keying
#   - Specify pixel-art / Stardew Valley style
prompt = """
Generate a 2×2 pixel-art sprite sheet for a cute cartoon fish character in Stardew Valley style.
The sheet is a single image divided into a 2-column, 2-row grid of 4 equal cells:
  - Top-left:     fish swimming left (swim-L)  — body angled left, fins spread
  - Top-right:    fish swimming right (swim-R) — mirrored version of swim-L
  - Bottom-left:  fish idle / floating still   — body level, small bubble above
  - Bottom-right: fish jumping upward          — body arced upward, splash droplets below

Art style: chunky pixel art, bold outlines, saturated colours, Stardew Valley aesthetic.
Background: solid bright green (#00FF00) chroma-key colour behind every cell.
Keep the character's proportions, palette, and outline style identical across all four cells.
Each cell should be the same size; do NOT add borders or gaps between cells.
"""

# Path to an existing sheet image to use as a reference for modification.
# Set to None to generate a fresh image from scratch.
reference_image = None   # e.g. "assets/sprites/fish-sheet-v1.png"

# Where to save the individual frame PNGs
out_dir = "assets/sprites"

# Intermediate file paths (raw sheet, transparent sheet)
raw_sheet_path = f"assets/sprites/{character}-sheet-raw.png"
transparent_sheet_path = f"assets/sprites/{character}-sheet-transparent.png"

# Gemini model and image quality
model = "gemini-2.5-flash-image"
image_size = "2K"

# Background removal tolerance (increase if green fringing remains)
bg_tolerance = 40

# ──────────────────────────────────────────────────────────────────────────────
# SCRIPT — no edits needed below this line
# ──────────────────────────────────────────────────────────────────────────────

import sys
from pathlib import Path

# Make scripts/ importable even when run from the project root
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv()

import os
from PIL import Image
from gemimg import GemImg, Grid
import importlib.util as _ilu

def _load(script_name, func_name):
    spec = _ilu.spec_from_file_location(
        script_name,
        Path(__file__).parent / f"{script_name}.py",
    )
    mod = _ilu.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return getattr(mod, func_name)

remove_green_bg = _load("remove-green-bg", "remove_green_bg")
cut_sheet       = _load("cut-spritesheet", "cut_sheet")


def main():
    # ── Validate stances ──────────────────────────────────────────────────────
    if len(stances) != 4:
        sys.exit(
            f"ERROR: stances must have exactly 4 entries for a 2×2 grid "
            f"(got {len(stances)}). "
            "For more stances, generate a second sheet and run the script again."
        )

    # ── Ensure output directory exists ────────────────────────────────────────
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    Path(raw_sheet_path).parent.mkdir(parents=True, exist_ok=True)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        sys.exit("ERROR: GEMINI_API_KEY not found. Add it to your .env file.")

    g = GemImg(api_key=api_key, model=model)

    # ── Step 1: Generate or modify the spritesheet ────────────────────────────
    print("=" * 60)
    print(f"Step 1: Generating 2×2 sprite sheet for '{character}'")
    print("=" * 60)
    print(f"Stances (row-major): {stances}")
    print()

    grid = Grid(rows=2, cols=2, image_size=image_size, save_original_image=True)

    if reference_image:
        ref_path = Path(reference_image)
        if not ref_path.exists():
            sys.exit(f"ERROR: reference_image not found: {ref_path}")
        print(f"Using reference image for consistency: {ref_path}")
        ref_img = Image.open(ref_path)
        gen = g.generate(prompt, imgs=ref_img, grid=grid)
    else:
        gen = g.generate(prompt, grid=grid)

    gen.image.save(raw_sheet_path)
    print(f"Raw sheet saved to: {raw_sheet_path}")

    # ── Step 2: Remove chroma-key background ─────────────────────────────────
    print()
    print("=" * 60)
    print("Step 2: Removing green chroma-key background")
    print("=" * 60)

    transparent_path = remove_green_bg(
        raw_sheet_path,
        transparent_sheet_path,
        tolerance=bg_tolerance,
        flood_fill=True,
    )
    print(f"Transparent sheet saved to: {transparent_path}")

    # ── Step 3: Cut into individual cells ─────────────────────────────────────
    print()
    print("=" * 60)
    print("Step 3: Cutting sheet into individual frames")
    print("=" * 60)

    # Use a temporary prefix; we'll rename cells to stance names next
    tmp_prefix = f"__{character}_tmp"
    saved = cut_sheet(
        transparent_sheet_path,
        cols=2,
        rows=2,
        tile_size=None,
        trim=False,          # do NOT trim sprites — preserves position alignment
        out_dir=out_dir,
        prefix=tmp_prefix,
    )

    # ── Step 4: Rename cells to meaningful stance-based names ─────────────────
    print()
    print("=" * 60)
    print("Step 4: Renaming cells to stance-based filenames")
    print("=" * 60)

    # cut_sheet saves files as <prefix>-<row>-<col>.png in row-major order
    # row=0,col=0 → stances[0]; row=0,col=1 → stances[1]; etc.
    order = [(0, 0), (0, 1), (1, 0), (1, 1)]
    final_paths = []
    for i, (row, col) in enumerate(order):
        tmp_path = Path(out_dir) / f"{tmp_prefix}-{row}-{col}.png"
        stance = stances[i]
        final_name = f"{character}-{stance}.png"
        final_path = Path(out_dir) / final_name
        tmp_path.rename(final_path)
        print(f"  [{row},{col}] {stance:20s} → {final_path}")
        final_paths.append(str(final_path))

    # ── Done ──────────────────────────────────────────────────────────────────
    print()
    print("=" * 60)
    print(f"Done — {len(final_paths)} frames saved to '{out_dir}/':")
    for p in final_paths:
        print(f"  {p}")
    print("=" * 60)


if __name__ == "__main__":
    main()
