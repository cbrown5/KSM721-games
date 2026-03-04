# Fish Biomass Monitoring Game — Design Plan

## Overview

**Title**: *Protected or Not? Designing a Fish Survey*

**Learning Objective**: Understand how confounding variables bias estimates of
marine protected area (MPA) effectiveness. To measure a true MPA effect, survey
sites inside and outside the MPA must be paired so they are similar in all
confounders — habitat type, fishing pressure, and wave exposure.

**Core Mechanic**: The player places survey sites (protected & unprotected pairs)
on a map. The app then calculates what *their* survey would estimate as the MPA
effect versus the *true* MPA effect (known to the game engine). The goal is to
design a survey that gets close to the truth.

**Tech Stack**: Phaser.js 3.x via CDN, Web Audio API, single `index.html` +
`game.js`, deployable on GitHub Pages.

---

## Pedagogical Background

### Why Pairing Matters

Marine protected areas protect fish by limiting fishing. But evaluating their
effectiveness requires comparing fish biomass inside vs. outside the MPA. The
naive estimate — mean(inside) − mean(outside) — is biased whenever inside and
outside sites differ in:

| Confounder | Effect if unbalanced |
|---|---|
| **Habitat complexity** | High-complexity reef has more fish regardless of protection |
| **Distance from fishing village** | Sites near the village have lower biomass from poaching / edge effects |
| **Wave exposure** | Exposed sites have different species assemblages and surveying difficulty |

Good BACI (Before-After-Control-Impact) and paired-site designs control for
these by ensuring each protected site is matched to a nearby unprotected site
with similar habitat, exposure, and distance from the village.

### The "True" Effect

The game engine generates biomass values from a known model:

```
log(biomass_i) = β_MPA × MPA_i
               + β_habitat × habitat_complexity_i
               + β_village × distance_village_i
               + β_exposure × exposure_i
               + ε_i,   ε ~ N(0, σ)
```

`β_MPA` is the true MPA effect (e.g. +0.8 log-units ≈ 2.2× more biomass inside
the MPA). The player's estimated effect is calculated by a simple
inside−outside comparison of their chosen sites, ignoring covariates. If their
sites are well-matched, the estimate converges to the truth. If poorly matched,
the estimate is biased.

---

## Game Structure

### Scenes

1. **StartScene** — Title, brief story context, "Play" button
2. **DiffScene** — Choose Level 1 / 2 / 3 (habitat icons, brief description)
3. **GameScene** — Main map + site selection + live score panel
4. **ResultScene** — Reveal true vs estimated effect, accuracy score, replay or
   next level
5. **CelebrationScene** — Confetti + achievement badge on high accuracy

---

## Levels

### Level 1 — Coral Reef (Easy)

**Setting**: Shallow tropical lagoon with fringing reef.

**Map layout** (800 × 600 px Phaser canvas):

```
┌────────────────────────────────────────────────────────────────┐
│  [OCEAN — deep blue]                  ╔═══════════╗           │
│                                        ║  FISHING  ║ ←village  │
│  ░░░░░░░░░░░ [REEF PATCHES] ░░░░░░░░░  ║  VILLAGE  ║           │
│  ░  (high complexity, warm colours) ░  ╚═══════════╝           │
│       ▓▓▓▓ [MPA BOUNDARY — dashed] ▓▓▓▓▓▓▓                    │
│       ▓  Inside MPA: reef + sandy   ▓                           │
│       ▓  patches                    ▓                           │
│       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                           │
│  [SANDY LAGOON — pale yellow-green]                             │
│  ←── exposure gradient: sheltered (left) to exposed (right) ──►│
└────────────────────────────────────────────────────────────────┘
```

**Confounders**: 1 active (fishing village distance). Exposure gradient is mild
and not displayed explicitly — the student only needs to match habitat type.

**Survey design requirement**: Place 3 inside-MPA sites and 3 outside-MPA sites.

**Scoring tolerance**: ±30% of true effect = win.

**True β_MPA**: +0.7 (log biomass units)

**Palette**: Coral orange (`#FF7043`), turquoise (`#00BCD4`), sand
(`#FFF176`), reef green (`#26A69A`).

---

### Level 2 — Kelp Forest (Medium)

**Setting**: Temperate rocky coastline with kelp canopy, urchin barrens, and
rocky reefs. A fishing village sits at one end. Wave exposure increases from
north to south.

**Map layout**:

```
┌────────────────────────────────────────────────────────────────┐
│ N ↑  [SHELTERED BAY — calm blue]                               │
│        🌿🌿 [KELP FOREST — dark green patches]                  │
│        ○○   [URCHIN BARRENS — grey spots]                      │
│        ▓▓▓▓▓ [MPA] ▓▓▓▓▓▓                                     │
│   🏘 VILLAGE →                                                  │
│        ░░░░ [ROCKY REEF — brown-orange]                         │
│ S ↓  [EXPOSED COAST — wave icon ~~~]                           │
└────────────────────────────────────────────────────────────────┘
```

**Confounders**: 2 active (village proximity **and** north-south exposure
gradient). Both are shown on the map (village icon, wave-height colour gradient
overlay).

**Survey design requirement**: Place 4 inside and 4 outside sites (8 total).

**Scoring tolerance**: ±20% of true effect = win.

**True β_MPA**: +0.9

**Palette**: Forest green (`#2E7D32`), slate blue (`#37474F`), rocky brown
(`#795548`), urchin grey (`#B0BEC5`).

---

### Level 3 — Offshore Pelagic (Hard)

**Setting**: Open ocean with seamounts and an offshore MPA. No obvious habitat
features visible — confounders are oceanographic (upwelling gradient drives
productivity; distance from a fishing port drives fishing pressure).

**Map layout**:

```
┌────────────────────────────────────────────────────────────────┐
│  [OPEN OCEAN — deep navy]                                       │
│       ⬟ ⬟  [SEAMOUNTS — dark circles with depth contours]      │
│  🏭 PORT → (fishing pressure gradient radiating outward)        │
│                                                                 │
│  ≋ ≋ ≋  [UPWELLING ZONE — cold blue gradient, left side]       │
│  ▓▓▓▓▓▓▓▓▓ [MPA] ▓▓▓▓▓▓▓▓▓▓▓                                  │
│  [WARMER, LESS PRODUCTIVE — right side]                         │
│                                                                 │
│    ←── productivity gradient (upwelling → oligotrophic) ──►    │
└────────────────────────────────────────────────────────────────┘
```

**Confounders**: 3 active (port fishing pressure, upwelling/productivity
gradient, seamount presence — a binary habitat covariate).

**Survey design requirement**: Place 5 inside and 5 outside sites (10 total).

**Scoring tolerance**: ±15% of true effect = win.

**True β_MPA**: +1.1

**Palette**: Deep navy (`#0D1B2A`), cold upwelling blue (`#4DD0E1`), warm
oligotrophic (`#FF8F00`), seamount dark (`#37474F`).

---

## Map Rendering

### Tile-Based Habitat Grid

Each level's map is a 2-D grid of cells. Each cell stores:

```js
{
  habitatType: 'reef' | 'sand' | 'kelp' | 'barren' | 'rocky' | 'open' | 'seamount',
  insideMPA: true | false,
  exposureScore: 0–1,          // 0 = sheltered, 1 = fully exposed
  villageDistance: 0–1,        // 0 = adjacent, 1 = far
  upwellingScore: 0–1,         // Level 3 only
  seamount: true | false,      // Level 3 only
  trueLogBiomass: Number,      // Pre-computed by engine
}
```

Cells are rendered as coloured rectangles with a semi-transparent overlay
tinted by the exposure/upwelling gradient (a `Phaser.GameObjects.Graphics`
rectangle with alpha ~0.25).

The **MPA boundary** is drawn as a dashed rectangle / polygon using
`graphics.strokePath()` with a bright gold (`#FFD600`) dashed line.

The **fishing village / port** is represented by an emoji sprite (`🏘` / `🏭`)
placed at a fixed grid coordinate.

**Exposure gradient**: A horizontal or vertical colour wash rendered as a
semi-transparent gradient image generated at scene creation time.

### Site Markers

Survey sites are placed by clicking on the map. Each click toggles between:

- **Protected site** (solid teal circle, `P` label)
- **Unprotected site** (solid orange circle, `U` label)

Rules enforced by the engine:

- A protected site must be placed inside the MPA boundary.
- An unprotected site must be placed outside the MPA boundary.
- Attempting to place the wrong type in the wrong zone triggers a shake
  animation and an error tone.
- Sites can be removed by right-clicking.

The current placement mode (Protected / Unprotected / Remove) is shown in a
toolbar at the top.

---

## Score Calculation

### True Biomass Model

At scene creation the engine computes `trueLogBiomass` for every cell:

```js
function computeTrueBiomass(cell, params) {
  return params.intercept
    + params.betaMPA        * (cell.insideMPA ? 1 : 0)
    + params.betaHabitat    * cell.habitatComplexity
    + params.betaVillage    * cell.villageDistance
    + params.betaExposure   * cell.exposureScore
    + params.betaUpwelling  * (cell.upwellingScore || 0)
    + params.betaSeamount   * (cell.seamount ? 1 : 0);
  // ε added when sampling (not stored)
}
```

`betaMPA` is the **true MPA effect** the student is trying to recover.

### Estimated MPA Effect

When the student submits their design:

```js
function estimateEffect(protectedSites, unprotectedSites, rng) {
  const meanP = mean(protectedSites.map(s => sampleBiomass(s, rng)));
  const meanU = mean(unprotectedSites.map(s => sampleBiomass(s, rng)));
  return meanP - meanU;    // simple difference in log-biomass
}
```

`sampleBiomass(site, rng)` = `site.trueLogBiomass + normRand(rng, 0, σ_obs)`

### Accuracy Score

```
accuracy = 1 − |estimated − trueBetaMPA| / trueBetaMPA
score     = max(0, accuracy) × 100
```

Displayed as a 0–100 gauge. Thresholds:

| Score | Outcome |
|---|---|
| ≥ 85 | Gold star + celebration |
| 65–84 | Silver star |
| 40–64 | Bronze star |
| < 40  | "Try again" — hint shown |

---

## UI Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  TOOLBAR: [🔵 Place Protected] [🟠 Place Unprotected] [❌ Remove] │
│           Sites placed: P=2/3  U=1/3        [Submit Design]      │
├──────────────────────┬───────────────────────────────────────────┤
│                      │  SCORE PANEL                              │
│   MAP CANVAS         │  ─────────────────────────────────────    │
│   (Phaser scene)     │  True MPA effect:  ████████ (hidden)      │
│                      │  Your estimate:    ░░░░░░░░               │
│                      │  Accuracy:         —                      │
│                      │  ─────────────────────────────────────    │
│                      │  Confounder check:                        │
│                      │  Habitat match:    🔴 Poor                │
│                      │  Village dist:     🟡 Fair                │
│                      │  Exposure:         🟢 Good                │
│                      │  ─────────────────────────────────────    │
│                      │  [Submit Design]                          │
└──────────────────────┴───────────────────────────────────────────┘
```

The **true MPA effect bar** is hidden (greyed out) until after submission.
The **confounder check** panel updates in real-time as the student places sites,
giving live feedback on how well paired the current design is.

### Confounder Check Metric

For each confounder, compute the mean difference between protected and
unprotected sites:

```
imbalance_habitat  = |mean(habitatComplexity_P) − mean(habitatComplexity_U)|
imbalance_village  = |mean(villageDistance_P)   − mean(villageDistance_U)|
imbalance_exposure = |mean(exposureScore_P)      − mean(exposureScore_U)|
```

Traffic-light colour:
- Green: imbalance < 0.15
- Yellow: 0.15–0.35
- Red: > 0.35

This gives formative feedback *before* submission, nudging the student to
reposition poorly matched sites.

---

## Hints System

If accuracy < 40% after submission, a hint panel appears:

- Highlights the confounder with the largest imbalance in red.
- Shows an arrow pointing from the worst protected site toward a better-matched
  alternative cell on the map.
- Text example: *"Your protected sites are much closer to the village than your
  unprotected sites — this makes the MPA look less effective than it really is.
  Try moving the unprotected sites closer to the village, or the protected sites
  further away."*

Three hint varieties (rotate on retry):
1. Habitat mismatch hint
2. Village distance mismatch hint
3. Exposure gradient mismatch hint

---

## Audio

| Event | Tone |
|---|---|
| Click to place site | Short blip (440 Hz, 0.1 s) |
| Invalid placement | Low buzz (200 Hz, 0.2 s) |
| Confounder check goes green | Rising arpeggio |
| Submit | Mid-pitch confirm (660 Hz, 0.3 s) |
| Gold star | Triumphant fanfare (C-E-G, 0.6 s each) |
| Bronze / retry | Descending tone |

All generated via `AudioContext` oscillator nodes — no external files.

---

## Technical Architecture

### Files

```
fish-biomass-game/
├── index.html          (Phaser canvas, CDN scripts, minimal HTML)
├── game.js             (All scene classes and utilities)
└── plans/
    └── game-plan.md    (This document)
```

### Phaser Scene Classes

| Class | Responsibility |
|---|---|
| `StartScene` | Title screen, level story context |
| `DiffScene` | Level / habitat selector |
| `GameScene` | Map rendering, site placement, live feedback |
| `ResultScene` | True vs estimated effect reveal, score, replay |
| `CelebrationScene` | Confetti overlay, badge (inline within ResultScene) |

### Key `GameScene` Methods

```js
_buildGrid(levelConfig)       // Generate cell array with habitat + confounder values
_renderMap()                  // Draw all tiles, MPA boundary, village icon
_renderExposureOverlay()      // Semi-transparent gradient wash
_placeSite(cell, type)        // Add marker, enforce rules
_removeSite(cell)             // Remove marker
_updateConfounderPanel()      // Recompute imbalances, update traffic lights
_computeEstimate()            // Mean difference on submit
_showResult()                 // Transition to ResultScene with data
```

### State Object

```js
gameState = {
  level: 1 | 2 | 3,
  grid: Cell[][],
  protectedSites: Cell[],
  unprotectedSites: Cell[],
  requiredP: 3 | 4 | 5,
  requiredU: 3 | 4 | 5,
  rngSeed: Number,
  trueEffect: Number,
  estimatedEffect: null | Number,
  accuracy: null | Number,
  submitted: false,
}
```

### Seeded RNG

Mulberry32 (same as other games in this repo), seeded from `Date.now()` or
`?seed=` URL parameter for reproducible testing.

### Coordinate System

The Phaser canvas is 900 × 640 px. The map occupies a 580 × 520 px region
(left side). The score panel occupies 280 × 520 px (right side). The toolbar
spans the full width at the top (900 × 60 px).

Grid resolution: 20 × 16 cells → each cell is 29 × 32.5 px.

---

## Level Configuration Objects

```js
const LEVELS = {
  1: {
    name: 'Coral Reef',
    habitat: 'coral',
    requiredSites: 3,
    trueEffect: 0.7,
    sigma: 0.3,
    betaHabitat: 0.5,
    betaVillage: 0.6,
    betaExposure: 0.2,
    betaUpwelling: 0,
    betaSeamount: 0,
    tolerance: 0.30,
    activeConfounders: ['habitat', 'village'],
    palette: { water: '#00BCD4', reef: '#26A69A', sand: '#FFF176', mpa: '#FFD600' },
    villagePos: { col: 17, row: 3 },
    exposureAxis: 'horizontal',   // gradient runs left→right
  },
  2: {
    name: 'Kelp Forest',
    habitat: 'kelp',
    requiredSites: 4,
    trueEffect: 0.9,
    sigma: 0.35,
    betaHabitat: 0.6,
    betaVillage: 0.7,
    betaExposure: 0.4,
    betaUpwelling: 0,
    betaSeamount: 0,
    tolerance: 0.20,
    activeConfounders: ['habitat', 'village', 'exposure'],
    palette: { water: '#37474F', kelp: '#2E7D32', barren: '#B0BEC5', rocky: '#795548', mpa: '#FFD600' },
    villagePos: { col: 1, row: 8 },
    exposureAxis: 'vertical',     // gradient runs north→south
  },
  3: {
    name: 'Offshore Pelagic',
    habitat: 'pelagic',
    requiredSites: 5,
    trueEffect: 1.1,
    sigma: 0.4,
    betaHabitat: 0,
    betaVillage: 0.5,
    betaExposure: 0,
    betaUpwelling: 0.8,
    betaSeamount: 0.7,
    tolerance: 0.15,
    activeConfounders: ['village', 'upwelling', 'seamount'],
    palette: { water: '#0D1B2A', upwelling: '#4DD0E1', warm: '#FF8F00', seamount: '#37474F', mpa: '#FFD600' },
    villagePos: { col: 1, row: 1 },
    exposureAxis: 'horizontal',   // upwelling gradient left→right
  },
};
```

---

## Result Screen Layout

```
┌──────────────────────────────────────────────────────┐
│          📊 Your Survey Results                      │
│                                                      │
│  True MPA effect:      +0.70 log-units              │
│  ████████████████████  (full bar)                    │
│                                                      │
│  Your estimate:        +0.45 log-units              │
│  ████████████          (partial bar)                 │
│                                                      │
│  Accuracy score:  64 / 100   🥉 Bronze               │
│                                                      │
│  What went wrong?                                    │
│  Your unprotected sites were much closer to the      │
│  village than your protected sites, making the MPA   │
│  appear less effective than it really is.            │
│                                                      │
│  [Try Again]    [Next Level →]    [Menu]             │
└──────────────────────────────────────────────────────┘
```

The two bars animate in (grow from left) on scene entry.

---

## Difficulty Calibration Summary

| Level | Habitat | Sites (P+U) | Active Confounders | Tolerance | True Effect |
|---|---|---|---|---|---|
| 1 | Coral Reef | 3+3 | Habitat, Village | ±30% | +0.70 |
| 2 | Kelp Forest | 4+4 | Habitat, Village, Exposure | ±20% | +0.90 |
| 3 | Pelagic | 5+5 | Village, Upwelling, Seamount | ±15% | +1.10 |

---

## Stretch Goals (post-MVP)

- **Before-After extension**: Add a "before MPA" biomass layer to simulate a
  BACI design, letting students compare pre/post as well as in/out.
- **Sample size slider**: Let students trade off between number of sites and
  variance of their estimate.
- **Animated fish**: Small sprite fish whose density visually reflects true
  biomass in each cell (a richer visual reward for well-designed surveys).
- **Export**: Generate a simple survey map PNG the student can annotate and
  submit as a lab exercise.
