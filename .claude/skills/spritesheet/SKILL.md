---
name: spritesheet
description: "Generate pixel art assets for Dino Escape — tiles, sprites, and sprite sheets — in Stardew Valley style. Use when asked to create game art, tiles, backgrounds, or character sprites for this project."
---

You are generating pixel art assets for games built with Phaser 3 in this project.
All art must be consistent in style and optimised for API cost efficiency.

---

## Art Style Rules (apply to every prompt)

Always prepend this style block to every image prompt — it is the consistency anchor across all calls:

> **Pixel art, Stardew Valley style, top-down perspective, warm earthy palette, clean black outlines, limited color count (16–32 colors per tile), no anti-aliasing, flat shading with subtle dithering for depth, solid bright green background (#00FF00).**

Additional style notes:
- Tile resolution: **16×16 px** for standard tiles, **32×32 px** for larger props/objects.
- Sprite resolution: **32×32 px** per frame.
- Sprites and tiles should look hand-drawn, chunky, and readable at small sizes.
- Color temperature: warm yellows/greens for plains, cool blues/greys for swamps, burnt oranges for mountains.

---

## Character Sprite Sheets — the `gemini-spritesheet.py` workflow

For any single character sprite, use **`scripts/gemini-spritesheet.py`**. This script handles the full pipeline automatically:

1. Generates a **2×2 grid** spritesheet via Gemini (or modifies an existing sheet)
2. Removes the green chroma-key background
3. Cuts the sheet into 4 individual frame PNGs
4. Saves each frame with a meaningful name: `<character>-<stance>.png`

### Step 1 — Gather information from the user

Ask for (or infer from context):
- **character**: short slug name, no spaces (e.g. `fish`, `dino`, `crab`)
- **stances**: exactly 4 stances for this sheet, in row-major order matching the 2×2 grid:
  - Position 0 = top-left
  - Position 1 = top-right
  - Position 2 = bottom-left
  - Position 3 = bottom-right
- **out_dir**: where to save frames (default `assets/sprites`)
- **reference_image**: path to an existing sheet image if we want to modify for consistency (optional — use when making a second batch of stances for the same character)

**Example stances for a fish:** `["swim-L", "swim-R", "idle", "jump"]`
**Example stances for a dino:** `["walk-L-1", "walk-L-2", "walk-R-1", "walk-R-2"]`

If more than 4 stances are needed, plan multiple 2×2 sheets. Do the first sheet fresh, then use the saved raw sheet as `reference_image` for the next batch — this keeps the character's look consistent.

### Step 2 — Write the Gemini prompt

The prompt must:
- Specify a **2×2 grid** of exactly 4 cells
- Name each cell's **position** (top-left, top-right, bottom-left, bottom-right) and its **stance**
- Request a **solid bright green (#00FF00) background** for chroma-keying
- Match the project art style (pixel art, Stardew Valley, bold outlines, limited palette)
- Emphasise **identical proportions, palette, and outline style** across all four cells

**Prompt template:**

```
Generate a 2×2 pixel-art sprite sheet for a [CHARACTER DESCRIPTION] in Stardew Valley style.
The sheet is a single image divided into a 2-column, 2-row grid of 4 equal cells:
  - Top-left:     [stance 0 description]
  - Top-right:    [stance 1 description]
  - Bottom-left:  [stance 2 description]
  - Bottom-right: [stance 3 description]

Art style: chunky pixel art, bold outlines, saturated colours, Stardew Valley aesthetic.
Background: solid bright green (#00FF00) chroma-key colour behind every cell.
Keep the character's proportions, palette, and outline style identical across all four cells.
Each cell should be the same size; do NOT add borders or gaps between cells.
```

### Step 3 — Edit and run `scripts/gemini-spritesheet.py`

Edit the **CONFIGURATION block** at the top of the script:

```python
character = "fish"                              # slug name for output filenames
stances   = ["swim-L", "swim-R", "idle", "jump"]  # row-major, 4 entries
prompt    = """..."""                           # your detailed Gemini prompt
reference_image = None                         # or path to existing sheet for consistency
out_dir   = "assets/sprites"
```

Show the user the key parameters (character, stances, prompt, out_dir) before running.

Run from the project root:

```bash
python scripts/gemini-spritesheet.py
```

The script will:
- Generate the raw 2×2 sheet → `assets/sprites/<character>-sheet-raw.png`
- Strip the green background → `assets/sprites/<character>-sheet-transparent.png`
- Cut and rename frames → `assets/sprites/<character>-<stance>.png` (4 files)

### Step 4 — Report results

Tell the user the final frame paths, e.g.:
```
assets/sprites/fish-swim-L.png
assets/sprites/fish-swim-R.png
assets/sprites/fish-idle.png
assets/sprites/fish-jump.png
```

If the result looks wrong (character inconsistent, stances unclear), re-run from scratch with an adjusted prompt. For minor tweaks, set `reference_image` to the raw sheet and use a modify prompt.

### Making a second batch (more than 4 stances)

```python
# Second run — reference the first sheet for consistency
reference_image = "assets/sprites/fish-sheet-raw.png"
stances = ["hurt", "die", "attack-L", "attack-R"]
prompt = """
Modify the character from the reference image to show 4 new stances in a 2×2 grid:
  - Top-left:     fish hurt — recoiling, eyes squinting, small impact stars
  - Top-right:    fish dying — floating belly-up, X eyes
  - Bottom-left:  fish attacking left — lunging forward, mouth open, teeth visible
  - Bottom-right: fish attacking right — mirrored version of attack-left
Keep the exact same art style, palette, proportions and outline weight as the reference.
Background: solid bright green (#00FF00).
"""
```

---

## Landscape Tiles (2×2 Tile Sheets)

For ground tiles, terrain, or biome sets, generate a **2×2 tile sheet** using `scripts/gemini-create-image.py` (NOT the spritesheet script — tiles don't need stance naming).

- Sheet pixel size: **1K square**
- Each cell extracted and optionally resized to target game resolution
- All 4 tiles should be thematically related (same biome or material family)
- Name cell positions in the prompt: **top-left, top-right, bottom-left, bottom-right**

### Tile pipeline

```
[ ] 1. BUILD PROMPT   — Style block + 4 named tile descriptions
[ ] 2. CONFIGURE      — Edit gemini-create-image.py: prompt, aspect_ratio="1:1",
                         resolution="1K", output → assets/tiles/<name>-sheet.png
[ ] 3. GENERATE       — python scripts/gemini-create-image.py
[ ] 4. TRANSPARENCY   — python scripts/remove-green-bg.py assets/tiles/<name>-sheet.png
[ ] 5. CUT            — python scripts/cut-spritesheet.py assets/tiles/<name>-sheet_transparent.png \
                             --layout 2x2 --tile-size 128 --trim \
                             --out-dir assets/tiles/<name> --prefix <name>
[ ] 6. VERIFY         — Open each tile; check no green fringing, correct size, clean outlines
```

Use `--trim` for tiles (removes transparent padding so tiles sit flush in the tilemap).
Do NOT use `--trim` for sprites (preserves frame-to-frame position alignment).

---

## Manual pipeline (if not using gemini-spritesheet.py)

If you need to run the steps individually:

### Remove background

```bash
python scripts/remove-green-bg.py assets/sprites/my-sheet.png
# → assets/sprites/my-sheet_transparent.png

# Adjust tolerance if needed
python scripts/remove-green-bg.py assets/sprites/my-sheet.png --tolerance 50
```

### Cut sheet

```bash
# 2×2 sprite sheet — no trim
python scripts/cut-spritesheet.py assets/sprites/my-sheet_transparent.png \
    --layout 2x2 --out-dir assets/sprites --prefix fish

# 2×2 tile sheet — with trim
python scripts/cut-spritesheet.py assets/tiles/swamp-sheet_transparent.png \
    --layout 2x2 --tile-size 128 --trim --out-dir assets/tiles/swamp --prefix swamp
```

Output naming: `<prefix>-<row>-<col>.png` (row-major, top-left = `0-0`)

---

## Asset Output Conventions

- Tiles: `assets/tiles/`
- Character sprites: `assets/sprites/`
- Backgrounds/maps: `assets/backgrounds/`
- Use descriptive filenames: `fish-swim-L.png`, `swamp-mud.png`
- Always use `image_size: "2K"` in the spritesheet script, `resolution: "1K"` in create script

---

## Common Issues

| Problem | Fix |
|---|---|
| Green fringe around sprite | Increase `bg_tolerance` in spritesheet script (try 60–80) |
| Asset colours eaten by BG removal | Decrease tolerance (try 20) |
| Character looks different across cells | Stress consistency in prompt; use `reference_image` for follow-up sheets |
| Stances in wrong order | Re-check `stances` list matches grid positions: [top-left, top-right, bottom-left, bottom-right] |
| `GEMINI_API_KEY` error | Add key to `.env` file in project root |
| `assets/` dir missing | Script creates it automatically; if not, run `mkdir -p assets/sprites` |
