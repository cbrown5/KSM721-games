"""
cut-spritesheet.py
Cuts a generated tile sheet or sprite sheet into individual cell PNGs.

Supports any grid layout — common cases:
  2×2  tile sheets   (4 tiles)
  2×4  sprite sheets (8 animation frames)

Usage:
    python scripts/cut-spritesheet.py <input_path> [options]

Options:
    --layout  COLSxROWS   Grid spec shorthand, e.g. 2x2 or 2x4 (cols × rows)
    -c, --cols  N         Number of columns (default: 2)
    -r, --rows  N         Number of rows    (default: 2)
    --tile-size N         Resize each cell to N×N px after cutting (uses
                          nearest-neighbour — correct for pixel art).
                          Skip to keep cells at their natural cut size.
    --trim                Trim transparent border from each cell before resizing.
                          Use for TILES so cells sit flush edge-to-edge in the
                          tilemap with no transparent gap. Do NOT use for sprites
                          (trimming breaks frame-to-frame position alignment).
    --out-dir   DIR       Directory to write cell PNGs (default: same dir as input)
    --prefix    STR       Filename prefix for outputs (default: input stem)

Output filenames: <prefix>-<row>-<col>.png
Frame order:      row-major, top-left first (frame 0 = row 0 col 0, etc.)

Examples:
    # Cut a 2×2 tile sheet — trim edges so tiles sit flush, resize to 16×16 px
    python scripts/cut-spritesheet.py assets/tiles/swamp-sheet_transparent.png \\
        --layout 2x2 --tile-size 16 --trim

    # Cut a 2×4 sprite sheet — no --trim so frame positions stay consistent
    python scripts/cut-spritesheet.py assets/sprites/player-walk-sheet_transparent.png \\
        --layout 2x4 --tile-size 32

    # Custom output directory and prefix
    python scripts/cut-spritesheet.py assets/tiles/plains-sheet_transparent.png \\
        --layout 2x2 --tile-size 16 --trim --out-dir assets/tiles/plains --prefix plains
"""

import argparse
from pathlib import Path

from PIL import Image


def trim_transparent(cell: Image.Image) -> Image.Image:
    """Crop a cell to the bounding box of its non-transparent pixels.

    Uses only the alpha channel for the bounding box so that semitransparent
    edge pixels (from dithering or anti-aliasing) are also included.
    Returns the original image unchanged if it is fully transparent.
    """
    alpha = cell.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return cell  # fully transparent — nothing to trim
    return cell.crop(bbox)


def cut_sheet(
    input_path: str,
    cols: int = 2,
    rows: int = 2,
    tile_size: int | None = None,
    trim: bool = False,
    out_dir: str | None = None,
    prefix: str | None = None,
) -> list[str]:
    """Cut a sheet into a cols×rows grid of cells and save each as a PNG.

    Returns a list of saved output paths.
    """
    src = Path(input_path)
    if not src.exists():
        raise FileNotFoundError(f"Input file not found: {src}")

    img = Image.open(src).convert("RGBA")
    w, h = img.size
    cell_w = w // cols
    cell_h = h // rows

    dest = Path(out_dir) if out_dir else src.parent
    dest.mkdir(parents=True, exist_ok=True)
    stem = prefix if prefix else src.stem

    saved = []
    for row in range(rows):
        for col in range(cols):
            x = col * cell_w
            y = row * cell_h
            cell = img.crop((x, y, x + cell_w, y + cell_h))
            if trim:
                cell = trim_transparent(cell)
            if tile_size is not None:
                cell = cell.resize((tile_size, tile_size), Image.NEAREST)
            out_path = dest / f"{stem}-{row}-{col}.png"
            cell.save(out_path, "PNG")
            frame_idx = row * cols + col
            saved.append(str(out_path))
            print(f"  [{row},{col}] frame {frame_idx:2d} → {out_path}")

    return saved


def main():
    parser = argparse.ArgumentParser(
        description="Cut a tile sheet or sprite sheet into individual cell PNGs.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input", help="Path to the source sheet image (PNG with alpha)")
    parser.add_argument(
        "--layout",
        metavar="COLSxROWS",
        help="Grid layout shorthand, e.g. 2x2 or 2x4",
    )
    parser.add_argument(
        "-c", "--cols", type=int, default=2, help="Number of columns (default: 2)"
    )
    parser.add_argument(
        "-r", "--rows", type=int, default=2, help="Number of rows (default: 2)"
    )
    parser.add_argument(
        "--tile-size",
        type=int,
        default=None,
        metavar="N",
        help="Resize each cell to N×N px (nearest-neighbour, correct for pixel art)",
    )
    parser.add_argument(
        "--trim",
        action="store_true",
        help=(
            "Trim transparent borders from each cell before resizing. "
            "Use for tiles (ensures flush edge-to-edge placement in tilemap). "
            "Omit for sprites (preserves frame-to-frame position alignment)."
        ),
    )
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Output directory (default: same directory as input)",
    )
    parser.add_argument(
        "--prefix",
        default=None,
        help="Filename prefix for output cells (default: input stem)",
    )
    args = parser.parse_args()

    cols, rows = args.cols, args.rows
    if args.layout:
        parts = args.layout.lower().split("x")
        if len(parts) != 2:
            parser.error("--layout must be COLSxROWS, e.g. 2x2 or 2x4")
        cols, rows = int(parts[0]), int(parts[1])

    print(f"Cutting {args.input}")
    print(f"  Grid:      {cols} cols × {rows} rows ({cols * rows} cells)")
    if args.tile_size:
        print(f"  Tile size: {args.tile_size}×{args.tile_size} px")
    if args.trim:
        print("  Trim:      enabled (transparent borders removed per cell)")

    saved = cut_sheet(
        args.input,
        cols=cols,
        rows=rows,
        tile_size=args.tile_size,
        trim=args.trim,
        out_dir=args.out_dir,
        prefix=args.prefix,
    )
    print(f"\nDone — {len(saved)} cells saved.")


if __name__ == "__main__":
    main()
