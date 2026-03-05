"""
remove-green-bg.py
Removes the chroma-key background from a generated pixel art image,
replacing it with full transparency. Saves the result as a PNG with an alpha channel.

Usage:
    python scripts/remove-green-bg.py <input_path> [output_path]

If output_path is omitted, the result is saved alongside the input with
'_transparent' appended before the extension (e.g. player-walk-sheet_transparent.png).

Options:
    --tolerance  0-255  How close a pixel must be to the background colour to be removed.
                        Default: 40. Increase if fringing remains; decrease if asset
                        colours are being eaten.
    --color-match       Use the original colour-match mode (matches against #00FF00).
                        By default, flood-fill from corners is used, which works even
                        when the API doesn't render a pure #00FF00 background.

Flood-fill mode (default):
    Samples the background colour from the top-left corner pixel, then flood-fills
    outward from all four corners, making any connected pixel within tolerance
    fully transparent. Robust against AI models that render a slightly off-green.

Colour-match mode (--color-match):
    Matches every pixel in the image against #00FF00 within tolerance. Use this
    when the background is not contiguous (e.g. green pixels inside the asset
    that should also be removed).
"""

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

CHROMA_KEY = (0, 255, 0)  # #00FF00


def remove_by_flood_fill(data: np.ndarray, tolerance: int) -> np.ndarray:
    """Flood-fill from all four corners, making background pixels transparent."""
    h, w = data.shape[:2]
    bg = data[0, 0, :3].astype(np.int32)

    visited = np.zeros((h, w), dtype=bool)
    mask = np.zeros((h, w), dtype=bool)

    corners = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    queue = deque(corners)
    for r, c in corners:
        visited[r, c] = True

    while queue:
        r, c = queue.popleft()
        pixel = data[r, c, :3].astype(np.int32)
        if np.max(np.abs(pixel - bg)) <= tolerance:
            mask[r, c] = True
            for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr, nc = r + dr, c + dc
                if 0 <= nr < h and 0 <= nc < w and not visited[nr, nc]:
                    visited[nr, nc] = True
                    queue.append((nr, nc))

    data = data.copy()
    data[mask, 3] = 0
    return data


def remove_by_color_match(data: np.ndarray, tolerance: int) -> np.ndarray:
    """Match every pixel against #00FF00 within tolerance."""
    r, g, b = data[..., 0], data[..., 1], data[..., 2]
    mask = (
        (np.abs(r.astype(np.int32) - CHROMA_KEY[0]) <= tolerance)
        & (np.abs(g.astype(np.int32) - CHROMA_KEY[1]) <= tolerance)
        & (np.abs(b.astype(np.int32) - CHROMA_KEY[2]) <= tolerance)
    )
    data = data.copy()
    data[mask, 3] = 0
    return data


def remove_green_bg(
    input_path: str,
    output_path: str | None = None,
    tolerance: int = 40,
    flood_fill: bool = True,
) -> str:
    src = Path(input_path)
    if not src.exists():
        raise FileNotFoundError(f"Input file not found: {src}")

    img = Image.open(src).convert("RGBA")
    data = np.array(img, dtype=np.uint8)

    if flood_fill:
        data = remove_by_flood_fill(data, tolerance)
    else:
        data = remove_by_color_match(data, tolerance)

    result = Image.fromarray(data, "RGBA")

    if output_path is None:
        output_path = str(src.parent / (src.stem + "_transparent.png"))

    result.save(output_path, "PNG")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Remove chroma-key background from a pixel art PNG."
    )
    parser.add_argument(
        "input",
        help="Path to the source image (e.g. assets/sprites/player-walk-sheet.png)",
    )
    parser.add_argument(
        "output", nargs="?", default=None, help="Path for the output PNG (optional)"
    )
    parser.add_argument(
        "--tolerance",
        type=int,
        default=40,
        help="Colour distance tolerance 0–255 (default: 40)",
    )
    parser.add_argument(
        "--color-match",
        action="store_true",
        help="Use colour-match mode instead of flood-fill",
    )
    args = parser.parse_args()

    out = remove_green_bg(args.input, args.output, args.tolerance, flood_fill=not args.color_match)
    print(f"Saved transparent image to: {out}")


if __name__ == "__main__":
    main()
