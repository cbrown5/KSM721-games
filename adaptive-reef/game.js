'use strict';
/* ============================================================
   Adaptive Reef — a spearfishing game where the fish population
   evolves in response to player hunting pressure.
   Built with Phaser 3 (canvas) + a DOM HUD/shop/journal layer.
   ============================================================ */

// ── Constants ────────────────────────────────────────────────
const GAME_W = 860, GAME_H = 560;
const PLAY_TOP = 86, PLAY_BOTTOM = GAME_H - 46;
const POP_INIT = 16, POP_MIN = 8, POP_MAX = 26;
const GEN_BASE_DURATION = 52; // seconds
const DAY_CYCLE_SEC = 70;
const SPEAR_RANGE = 250, SPEAR_COOLDOWN = 0.85, HIT_RADIUS = 16;
const PLAYER_SPEED = 95;
const SAVE_KEY = 'adaptiveReef.save.v1';

// ── Math / misc utilities ───────────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function randRange(a, b) { return a + Math.random() * (b - a); }
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function wrap01(v) { v = v % 1; return v < 0 ? v + 1 : v; }
function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = x1 + dx * t, cy = y1 + dy * t;
  return Math.hypot(px - cx, py - cy);
}

// ── Genetics config ─────────────────────────────────────────
// Every gene is stored as a float in [0,1] (hue included, mapped to 0-360deg on render).
const GENES = ['hue', 'sat', 'light', 'pattern', 'size', 'speed', 'alertness', 'schooling', 'depthPref', 'activity'];

const BIOMES = {
  reef: {
    id: 'reef', name: 'Coral Reef', color: '#39c5c0',
    bgTop: '#116477', bgBottom: '#052733', patternStyle: 'spots',
    targets: { pattern: 0.72, sat: 0.75, schooling: 0.78, depthPref: 0.3 },
    camoRule: g => clamp(g.pattern * 0.55 + (1 - Math.abs(g.light - 0.55)) * 0.45, 0, 1),
  },
  kelp: {
    id: 'kelp', name: 'Kelp Forest', color: '#5fd06a',
    bgTop: '#123a24', bgBottom: '#06170f', patternStyle: 'stripes',
    targets: { pattern: 0.65, hue: 0.30, light: 0.35, speed: 0.28, depthPref: 0.55, schooling: 0.3 },
    camoRule: g => clamp(g.pattern * 0.4 + (1 - Math.min(1, Math.abs(g.hue - 0.30) * 3)) * 0.35 + (1 - Math.min(1, Math.abs(g.light - 0.35) * 2)) * 0.25, 0, 1),
  },
  sand: {
    id: 'sand', name: 'Sandy Flats', color: '#e0c477',
    bgTop: '#7a6a3f', bgBottom: '#2c2515', patternStyle: 'spots',
    targets: { light: 0.82, sat: 0.2, pattern: 0.15, depthPref: 0.8, size: 0.35 },
    camoRule: g => clamp(g.light * 0.5 + (1 - g.sat) * 0.3 + (1 - g.pattern) * 0.2, 0, 1),
  },
  deep: {
    id: 'deep', name: 'Deep Water', color: '#7c8cff',
    bgTop: '#111a3a', bgBottom: '#02030c', patternStyle: 'spots',
    targets: { light: 0.15, sat: 0.35, depthPref: 0.9, speed: 0.25, size: 0.6 },
    camoRule: g => clamp((1 - g.light) * 0.7 + (1 - g.sat) * 0.3, 0, 1),
  },
};

const SPECIES = {
  reef: ['Reef Snapper', 'Clown Damsel', 'Parrot Wrasse', 'Coral Goby'],
  kelp: ['Kelp Perch', 'Forest Grunt', 'Weed Blenny', 'Striped Garibaldi'],
  sand: ['Sand Sole', 'Flat Ray', 'Pale Goby', 'Burrow Dab'],
  deep: ['Abyss Grouper', 'Ghost Eel', 'Deep Lantern', 'Void Cod'],
};

const TRAIT_LABELS = {
  hue: 'Hue', sat: 'Vividness', light: 'Brightness', pattern: 'Patterning',
  size: 'Body Size', speed: 'Swim Speed', alertness: 'Alertness',
  schooling: 'Schooling', depthPref: 'Depth Preference', activity: 'Diurnality',
};

const VARIANT_LABELS = { ghost: 'Ghost Fish', boltfin: 'Boltfin', cave: 'Cave Stalker', mimic: 'Mimic Species' };

// ── Upgrades ─────────────────────────────────────────────────
const EQUIPMENT = [
  { key: 'carbonSpear', name: 'Carbon Spear Gun', icon: '🔱', price: 140, desc: 'Cuts reload time by ~38% and extends range by 25%.' },
  { key: 'propulsion', name: 'Propulsion Device', icon: '🌀', price: 150, desc: '+60% swim speed and a little extra spear range.' },
  { key: 'fishTracker', name: 'Fish Tracker', icon: '📡', price: 110, desc: 'Reveals species and traits on hover; cuts camouflage effectiveness.' },
  { key: 'polarizedMask', name: 'Polarized Vision Mask', icon: '🥽', price: 130, desc: 'Cuts through glare — makes camouflaged fish easier to spot.' },
  { key: 'camoSuit', name: 'Camouflage Suit', icon: '🥋', price: 120, desc: 'Reduces how easily fish notice your approach by ~35%.' },
];
const SKILLS = [
  { key: 'breathHold', name: 'Breath-Hold Mastery', icon: '🫧', price: 90, desc: 'Dive 40% longer before each generation ends.' },
  { key: 'silentMovement', name: 'Silent Movement', icon: '🤫', price: 95, desc: 'Halves how fast panic spreads through a school.' },
  { key: 'improvedAim', name: 'Improved Aim', icon: '🎯', price: 75, desc: '+50% spear hit radius — more forgiving shots.' },
  { key: 'speciesId', name: 'Species Identification', icon: '🔬', price: 55, desc: 'Hover any fish to see its species and traits.' },
  { key: 'evolutionTracking', name: 'Evolution Tracking', icon: '📈', price: 50, desc: 'Unlocks trait charts and deep analytics in your Journal.' },
];

// ── Global state ─────────────────────────────────────────────
let sceneRef = null;
let EVENT_FEED = [];
let _fishId = 1;

const STATE = {
  money: 60,
  currentBiome: 'reef',
  totalCaught: 0,
  totalGenerations: 0,
  upgrades: {
    carbonSpear: false, propulsion: false, fishTracker: false, polarizedMask: false, camoSuit: false,
    breathHold: false, silentMovement: false, improvedAim: false, speciesId: false, evolutionTracking: false,
  },
  biomes: {},
};

function gearMods() {
  const u = STATE.upgrades;
  return {
    cooldownMult: u.carbonSpear ? 0.62 : 1,
    rangeMult: (u.carbonSpear ? 1.25 : 1) * (u.propulsion ? 1.1 : 1),
    hitRadiusMult: u.improvedAim ? 1.5 : 1,
    playerSpeedMult: u.propulsion ? 1.6 : 1,
    alertnessMult: u.camoSuit ? 0.65 : 1,
    camoReduction: (u.fishTracker ? 0.22 : 0) + (u.polarizedMask ? 0.25 : 0),
    panicSpreadMult: u.silentMovement ? 0.5 : 1,
    genDurationMult: u.breathHold ? 1.4 : 1,
  };
}
function genDuration() { return GEN_BASE_DURATION * gearMods().genDurationMult; }

// ── Fish factory & genetics ─────────────────────────────────
function randomGenes(targets = {}) {
  const g = {};
  GENES.forEach(k => {
    g[k] = targets[k] !== undefined ? clamp(targets[k] + randn() * 0.2, 0, 1) : Math.random();
  });
  g.hue = wrap01(g.hue);
  return g;
}
function depthToY(depthPref) { return lerp(PLAY_TOP + 20, PLAY_BOTTOM - 10, clamp(depthPref, 0, 1)); }

function spawnFish(biomeId, genes) {
  const b = BIOMES[biomeId];
  return {
    id: _fishId++,
    biome: biomeId,
    species: choice(SPECIES[biomeId]),
    biomeStyle: b.patternStyle,
    genes,
    variant: null,
    x: randRange(70, GAME_W - 70),
    y: clamp(depthToY(genes.depthPref) + randRange(-20, 20), PLAY_TOP, PLAY_BOTTOM),
    vx: 0, vy: 0,
    caught: false,
    fleeT: 0,
    wanderSeed: Math.random() * 1000,
  };
}
function initBiomeState(biomeId) {
  const fish = [];
  for (let i = 0; i < POP_INIT; i++) fish.push(spawnFish(biomeId, randomGenes(BIOMES[biomeId].targets)));
  return { generation: 1, fish, history: [], timeLeft: genDuration(), caughtThisGen: 0 };
}

function averageGenes(fishArr) {
  const out = {};
  GENES.forEach(k => { out[k] = fishArr.length ? fishArr.reduce((s, f) => s + f.genes[k], 0) / fishArr.length : 0; });
  return out;
}
function biomeCamoScore(genes, biomeId) { return clamp(BIOMES[biomeId].camoRule(genes), 0, 1); }
function renderCamoScore(fish, biomeId, gm) {
  let score = biomeCamoScore(fish.genes, biomeId) - gm.camoReduction;
  if (fish.variant === 'ghost') score += 0.3;
  return clamp(score, 0, 0.95);
}
function fishValue(f) {
  const base = 8 + f.genes.size * 22;
  let rarityMult = 1;
  if (f.variant === 'ghost') rarityMult = 4;
  else if (f.variant === 'boltfin') rarityMult = 3;
  else if (f.variant === 'mimic') rarityMult = 2.4;
  else if (f.variant === 'cave') rarityMult = 2;
  return Math.round(base * rarityMult);
}

function crossoverGenes(a, b) {
  const g = {};
  GENES.forEach(k => { g[k] = Math.random() < 0.5 ? a[k] : b[k]; });
  return g;
}
function mutateGenes(g, mutRate) {
  const out = { ...g };
  GENES.forEach(k => {
    if (Math.random() < mutRate) {
      let v = out[k] + randn() * 0.09;
      out[k] = k === 'hue' ? wrap01(v) : clamp(v, 0, 1);
    }
  });
  return out;
}
function envPull(g, biomeId, strength) {
  const targets = BIOMES[biomeId].targets;
  const out = { ...g };
  Object.keys(targets).forEach(k => { out[k] = clamp(out[k] + (targets[k] - out[k]) * strength, 0, 1); });
  return out;
}

// ── Evolution engine ─────────────────────────────────────────
function checkRareEvents(biomeId, histEntry, priorHistory, newFish, overhunted) {
  const events = [];
  const avg = histEntry.avgGenes;
  const camoNow = biomeCamoScore(avg, biomeId);
  const recent = priorHistory.slice(-2);
  // Each variant is announced (toast + journal entry) only the first time it's discovered in
  // this biome, even though the underlying trait condition — and the variant fish themselves —
  // may keep recurring generation after generation.
  const alreadyAnnounced = marker => priorHistory.some(h => h.events.some(e => e.includes(marker)));

  // Ghost Fish: sustained, near-total camouflage
  if (camoNow > 0.8 && recent.length >= 2 && recent.every(h => biomeCamoScore(h.avgGenes, biomeId) > 0.68)) {
    const n = Math.min(2, newFish.length);
    for (let i = 0; i < n; i++) {
      const f = newFish[newFish.length - 1 - i];
      f.variant = 'ghost';
      f.genes = mutateGenes(envPull(f.genes, biomeId, 0.4), 0.05);
    }
    if (!alreadyAnnounced('Ghost Fish')) events.push({ text: 'Ghost Fish emerged — this population has evolved near-perfect camouflage.', rare: true });
  }
  // Boltfin: sustained extreme speed
  if (avg.speed > 0.86 && recent.length >= 1 && recent[recent.length - 1].avgGenes.speed > 0.74) {
    const f = newFish[newFish.length - 1];
    if (f) { f.variant = 'boltfin'; f.genes.speed = clamp(f.genes.speed + 0.25, 0, 1); }
    if (!alreadyAnnounced('Boltfin')) events.push({ text: 'Boltfin sighted — extreme speed has evolved in this population.', rare: true });
  }
  // Cave Stalker: overhunted + deep-habitat preference maxed out
  if (overhunted && avg.depthPref > 0.82) {
    newFish.forEach(f => { if (Math.random() < 0.3) f.variant = 'cave'; });
    if (!alreadyAnnounced('Cave Stalker')) events.push({ text: 'Cave Stalker migration — survivors are retreating into cave systems to escape hunting pressure.', rare: true });
  }
  // Mimic Species: heavy patterning drifting toward a warning (orange/black) hue
  if (avg.pattern > 0.6 && avg.hue < 0.12 && avg.sat > 0.6) {
    const f = newFish[newFish.length - 1];
    if (f) f.variant = 'mimic';
    if (!alreadyAnnounced('Mimic Species')) events.push({ text: 'Mimic Species detected — fish are evolving warning patterns resembling venomous species.', rare: true });
  }
  return events;
}

function endGeneration(biomeId) {
  const bs = STATE.biomes[biomeId];
  const endedGen = bs.generation;
  const totalPop = bs.fish.length;
  const survivors = bs.fish.filter(f => !f.caught);
  const caughtCount = totalPop - survivors.length;
  const catchRate = totalPop ? caughtCount / totalPop : 0;
  const avgGenes = averageGenes(bs.fish);

  let rescued = false;
  let pool = survivors;
  if (pool.length < 2) {
    rescued = true;
    pool = [];
    for (let i = 0; i < 6; i++) pool.push({ genes: randomGenes(BIOMES[biomeId].targets) });
  }

  const recentRates = bs.history.slice(-2);
  const overhunted = recentRates.length === 2 && recentRates.every(h => h.catchRate > 0.55) && catchRate > 0.55;
  const mutRate = 0.22 + (overhunted ? 0.18 : 0);
  const targetPop = clamp(Math.round(pool.length * 1.15), POP_MIN, POP_MAX);

  const newFish = pool.map(f => spawnFish(biomeId, { ...f.genes }));
  let guard = 0;
  while (newFish.length < targetPop && guard < 200) {
    guard++;
    const pa = choice(pool), pb = choice(pool);
    let genes = crossoverGenes(pa.genes, pb.genes);
    genes = mutateGenes(genes, mutRate);
    genes = envPull(genes, biomeId, 0.05);
    newFish.push(spawnFish(biomeId, genes));
  }

  const histEntry = {
    gen: endedGen, population: totalPop, caught: caughtCount, catchRate,
    survivors: survivors.length, avgGenes, rescued, overhunted, events: [],
  };
  const rareEvents = checkRareEvents(biomeId, histEntry, bs.history, newFish, overhunted);
  histEntry.events = rareEvents.map(e => e.text);

  bs.history.push(histEntry);
  bs.generation = endedGen + 1;
  bs.fish = newFish;
  bs.timeLeft = genDuration();
  bs.caughtThisGen = 0;

  return { histEntry, rescued, rareEvents, overhunted };
}

// ── Fish steering (called every frame for living fish) ───────
function updateFishMotion(f, dt, ctxt) {
  const g = f.genes;
  const gm = ctxt.gearMods;
  const baseSpeed = lerp(16, 66, g.speed);
  const alertRadius = lerp(46, 165, g.alertness) * gm.alertnessMult;
  const activityMatch = 1 - Math.min(1, Math.abs(g.activity - ctxt.dayPhase) * 2);
  const boldness = clamp(activityMatch, 0.15, 1);

  const dxp = f.x - ctxt.threatX, dyp = f.y - ctxt.threatY;
  const distp = Math.hypot(dxp, dyp);

  if (f.fleeT > 0) f.fleeT -= dt;
  if (distp < alertRadius && f.fleeT <= 0) {
    if (Math.random() < dt * 4) f.fleeT = 1.0 + Math.random() * 0.6;
  }
  if (f.fleeT > 0 && g.schooling > 0.3) {
    for (const nb of ctxt.neighbors) {
      if (nb === f || nb.caught || nb.fleeT > 0) continue;
      const dd = Math.hypot(nb.x - f.x, nb.y - f.y);
      if (dd < 70 && Math.random() < dt * 3 * gm.panicSpreadMult) nb.fleeT = 0.7;
    }
  }

  let ax = 0, ay = 0;
  if (f.fleeT > 0) {
    const away = Math.atan2(dyp, dxp);
    const fleeSpeed = baseSpeed * 2.4 * boldness;
    ax = Math.cos(away) * fleeSpeed;
    ay = Math.sin(away) * fleeSpeed;
  } else {
    const t = ctxt.time * 0.001 + f.wanderSeed;
    ax = Math.sin(t * 0.6) * baseSpeed * (0.35 + 0.35 * boldness);
    ay = Math.cos(t * 0.44) * baseSpeed * 0.2;
    const targetY = depthToY(g.depthPref);
    ay += (targetY - f.y) * 0.9;

    if (g.schooling > 0.12) {
      let cx = 0, cy = 0, alx = 0, aly = 0, sx = 0, sy = 0, n = 0;
      for (const nb of ctxt.neighbors) {
        if (nb === f || nb.caught) continue;
        const dd = Math.hypot(nb.x - f.x, nb.y - f.y);
        if (dd < 95) {
          cx += nb.x; cy += nb.y; alx += nb.vx; aly += nb.vy; n++;
          if (dd < 26) { sx += (f.x - nb.x); sy += (f.y - nb.y); }
        }
      }
      if (n > 0) {
        cx /= n; cy /= n;
        ax += ((cx - f.x) * 0.03 + alx * 0.5 + sx * 0.8) * g.schooling;
        ay += ((cy - f.y) * 0.03 + aly * 0.5 + sy * 0.8) * g.schooling;
      }
    }
  }

  f.vx = lerp(f.vx, ax, 0.09);
  f.vy = lerp(f.vy, ay, 0.09);
  f.x = clamp(f.x + f.vx * dt, 40, GAME_W - 40);
  f.y = clamp(f.y + f.vy * dt, PLAY_TOP, PLAY_BOTTOM);
}

// ── Drawing helpers (Phaser Graphics) ─────────────────────────
function drawBackground(gfx, biomeId) {
  const b = BIOMES[biomeId];
  gfx.clear();
  const c1 = Phaser.Display.Color.HexStringToColor(b.bgTop).color;
  const c2 = Phaser.Display.Color.HexStringToColor(b.bgBottom).color;
  gfx.fillGradientStyle(c1, c1, c2, c2, 1);
  gfx.fillRect(0, 0, GAME_W, GAME_H);
  gfx.fillStyle(0xffffff, 0.05);
  for (let i = 0; i < 4; i++) {
    const x = 60 + i * 210;
    gfx.beginPath();
    gfx.moveTo(x, 0); gfx.lineTo(x + 40, 0); gfx.lineTo(x - 30, GAME_H); gfx.lineTo(x - 90, GAME_H);
    gfx.closePath(); gfx.fillPath();
  }
}
function drawDecor(gfx, biomeId) {
  gfx.clear();
  if (biomeId === 'reef') {
    for (let i = 0; i < 9; i++) {
      const x = 30 + Math.random() * (GAME_W - 60), y = PLAY_BOTTOM + 10 + Math.random() * 20;
      const hue = randRange(0, 1);
      gfx.fillStyle(Phaser.Display.Color.HSLToColor(hue, 0.55, 0.45).color, 0.85);
      for (let j = 0; j < 5; j++) {
        gfx.fillCircle(x + randRange(-14, 14), y - randRange(0, 26), 5 + Math.random() * 6);
      }
    }
  } else if (biomeId === 'kelp') {
    gfx.lineStyle(5, 0x1f6b3a, 0.55);
    for (let i = 0; i < 10; i++) {
      const x = 20 + i * (GAME_W - 40) / 9;
      gfx.beginPath(); gfx.moveTo(x, GAME_H);
      let cx = x, cy = GAME_H;
      for (let s = 0; s < 6; s++) { cx += randRange(-18, 18); cy -= 40; gfx.lineTo(cx, cy); }
      gfx.strokePath();
    }
  } else if (biomeId === 'sand') {
    gfx.lineStyle(2, 0xffffff, 0.08);
    for (let i = 0; i < 10; i++) {
      const y = PLAY_BOTTOM - 4 - i * 3;
      gfx.beginPath(); gfx.moveTo(0, y);
      for (let x = 0; x <= GAME_W; x += 30) gfx.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
      gfx.strokePath();
    }
  } else if (biomeId === 'deep') {
    gfx.fillStyle(0xffffff, 0.35);
    for (let i = 0; i < 40; i++) gfx.fillCircle(Math.random() * GAME_W, Math.random() * GAME_H, Math.random() * 1.2);
  }
  // seabed
  gfx.fillStyle(Phaser.Display.Color.HexStringToColor(BIOMES[biomeId].bgBottom).color, 0.9);
  gfx.fillRect(0, GAME_H - 26, GAME_W, 26);
}

function drawFishShape(gfx, f) {
  gfx.clear();
  const genes = f.genes;
  const isMimic = f.variant === 'mimic';
  const sizeMul = lerp(0.65, 1.85, genes.size) * (f.variant === 'boltfin' ? 0.88 : 1) * (f.variant === 'cave' ? 1.1 : 1);
  const bl = 26 * sizeMul, bh = 12 * sizeMul;

  let h = genes.hue, s = clamp(genes.sat * 0.85 + 0.1, 0, 1), l = clamp(genes.light * 0.7 + 0.16, 0, 1);
  if (isMimic) { h = 0.05; s = 0.85; l = 0.45; }
  const bodyColor = Phaser.Display.Color.HSLToColor(h, s, l).color;
  const finColor = Phaser.Display.Color.HSLToColor(h, s, clamp(l - 0.15, 0, 1)).color;

  gfx.fillStyle(finColor, 1);
  gfx.beginPath();
  gfx.moveTo(-bl * 0.48, 0);
  gfx.lineTo(-bl * 0.48 - bh * 0.9, -bh * 0.7);
  gfx.lineTo(-bl * 0.48 - bh * 0.9, bh * 0.7);
  gfx.closePath(); gfx.fillPath();

  gfx.beginPath();
  gfx.moveTo(-bl * 0.05, -bh * 0.5);
  gfx.lineTo(bl * 0.12, -bh * 1.15);
  gfx.lineTo(bl * 0.32, -bh * 0.5);
  gfx.closePath(); gfx.fillPath();

  gfx.fillStyle(bodyColor, 1);
  gfx.fillEllipse(0, 0, bl, bh);

  const patAmt = isMimic ? 0.95 : genes.pattern;
  if (patAmt > 0.1) {
    const ph = wrap01(h + 0.5);
    const pl = l > 0.5 ? clamp(l - 0.32, 0, 1) : clamp(l + 0.32, 0, 1);
    const patColor = Phaser.Display.Color.HSLToColor(isMimic ? 0.0 : ph, s, isMimic ? 0.08 : pl).color;
    gfx.fillStyle(patColor, clamp(0.35 + patAmt * 0.5, 0, 0.92));
    const stripes = f.biomeStyle === 'stripes' || isMimic;
    if (stripes) {
      const n = isMimic ? 5 : Math.round(2 + patAmt * 4);
      for (let i = 0; i < n; i++) {
        const px = -bl * 0.4 + (bl * 0.8) * (i / (n - 1 || 1));
        gfx.fillRect(px - 1.6, -bh * 0.85, 3.2, bh * 1.7);
      }
    } else {
      const n = Math.round(3 + patAmt * 5);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, rad = Math.random() * bl * 0.32;
        gfx.fillCircle(Math.cos(ang) * rad * 1.3, Math.sin(ang) * rad * 0.7, 1.4 + patAmt * 1.6);
      }
    }
  }

  gfx.fillStyle(0x111111, 1);
  gfx.fillCircle(bl * 0.3, -bh * 0.12, Math.max(1.6, 2 * sizeMul * (f.variant ? 1.25 : 1)));
  if (f.variant === 'ghost') { gfx.fillStyle(0xffffff, 0.5); gfx.fillCircle(bl * 0.3, -bh * 0.12, 1); }
}

// ── Phaser scene ───────────────────────────────────────────────
class AdaptiveReefScene extends Phaser.Scene {
  constructor() { super('AdaptiveReef'); }

  create() {
    this.bgGfx = this.add.graphics();
    this.decorGfx = this.add.graphics();
    this.bubbleGfx = this.add.graphics();
    this.aimGfx = this.add.graphics();
    this.playerGfx = this.add.graphics();
    this.fishGfx = new Map();
    this.hoverFish = null;
    this.dayPhase = 0;

    this.player = { x: GAME_W / 2, y: GAME_H - 90, cooldown: 0 };
    this.mouseX = GAME_W / 2; this.mouseY = GAME_H / 2;
    this.bubbles = Array.from({ length: 16 }, () => ({
      x: Math.random() * GAME_W, y: Math.random() * GAME_H,
      r: 1 + Math.random() * 2.4, sp: 8 + Math.random() * 18, drift: Math.random() * 2 - 1,
    }));

    drawBackground(this.bgGfx, STATE.currentBiome);
    drawDecor(this.decorGfx, STATE.currentBiome);
    this.rebuildFishLayer();

    this.input.on('pointermove', p => { this.mouseX = p.x; this.mouseY = p.y; });
    this.input.on('pointerdown', p => { this.tryFire(p.x, p.y); });
    this.keys = this.input.keyboard.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D', up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT' });
    this.input.keyboard.on('keydown-SPACE', () => this.tryFire(this.mouseX, this.mouseY));

    sceneRef = this;
    onSceneReady();
  }

  addFishGraphics(f) {
    const g = this.add.graphics();
    drawFishShape(g, f);
    g.x = f.x; g.y = f.y;
    this.fishGfx.set(f.id, g);
    return g;
  }
  removeFishGraphics(id) {
    const g = this.fishGfx.get(id);
    if (g) { g.destroy(); this.fishGfx.delete(id); }
  }
  rebuildFishLayer() {
    this.fishGfx.forEach(g => g.destroy());
    this.fishGfx.clear();
    STATE.biomes[STATE.currentBiome].fish.forEach(f => { if (!f.caught) this.addFishGraphics(f); });
  }
  setBiome(id) {
    drawBackground(this.bgGfx, id);
    drawDecor(this.decorGfx, id);
    this.rebuildFishLayer();
    this.player.cooldown = 0;
    this.hoverFish = null;
  }

  updateBubbles(dt) {
    this.bubbleGfx.clear();
    this.bubbleGfx.fillStyle(0xffffff, 0.16);
    for (const b of this.bubbles) {
      b.y -= b.sp * dt;
      b.x += b.drift * dt * 3;
      if (b.y < -4) { b.y = GAME_H + 4; b.x = Math.random() * GAME_W; }
      this.bubbleGfx.fillCircle(b.x, b.y, b.r);
    }
  }

  updatePlayer(dt, gm) {
    let ix = 0, iy = 0;
    const k = this.keys;
    if (k.w.isDown || k.up.isDown) iy -= 1;
    if (k.s.isDown || k.down.isDown) iy += 1;
    if (k.a.isDown || k.left.isDown) ix -= 1;
    if (k.d.isDown || k.right.isDown) ix += 1;
    if (ix || iy) { const len = Math.hypot(ix, iy); ix /= len; iy /= len; }
    const spd = PLAYER_SPEED * gm.playerSpeedMult;
    this.player.x = clamp(this.player.x + ix * spd * dt, 30, GAME_W - 30);
    this.player.y = clamp(this.player.y + iy * spd * dt, PLAY_TOP, PLAY_BOTTOM + 30);
    if (this.player.cooldown > 0) this.player.cooldown -= dt;
  }

  updateFishAndDraw(time, dt, gm) {
    const bs = STATE.biomes[STATE.currentBiome];
    const dayPhase = (Math.sin(time * 0.001 * (2 * Math.PI / DAY_CYCLE_SEC)) + 1) / 2;
    this.dayPhase = dayPhase;
    const alive = bs.fish.filter(f => !f.caught);
    const ctxt = { threatX: this.player.x, threatY: this.player.y, neighbors: alive, dayPhase, time, gearMods: gm };

    let hoverFish = null, hoverDist = 22;
    for (const f of alive) {
      updateFishMotion(f, dt, ctxt);
      let gfx = this.fishGfx.get(f.id);
      if (!gfx) gfx = this.addFishGraphics(f);
      const camo = renderCamoScore(f, STATE.currentBiome, gm);
      let alpha = clamp(1 - camo * 0.72, 0.2, 1);
      const activityMatch = clamp(1 - Math.min(1, Math.abs(f.genes.activity - dayPhase) * 2), 0, 1);
      alpha *= (0.78 + 0.22 * activityMatch);
      if (f.variant === 'ghost') alpha += Math.sin(time * 0.004 + f.wanderSeed) * 0.08;
      gfx.alpha = clamp(alpha, 0.12, 1);
      gfx.x = f.x; gfx.y = f.y;
      if (Math.abs(f.vx) > 3) gfx.scaleX = f.vx < 0 ? -1 : 1;
      gfx.rotation = clamp(f.vy * 0.01, -0.3, 0.3) * (gfx.scaleX < 0 ? -1 : 1);

      const d = Math.hypot(this.mouseX - f.x, this.mouseY - f.y);
      if (d < hoverDist) { hoverDist = d; hoverFish = f; }
    }
    if (hoverFish !== this.hoverFish) {
      this.hoverFish = hoverFish;
      onHoverFish(hoverFish);
    }
  }

  drawAimAndPlayer(gm) {
    const range = SPEAR_RANGE * gm.rangeMult;
    this.aimGfx.clear();
    const ang = Math.atan2(this.mouseY - this.player.y, this.mouseX - this.player.x);
    const dist = Math.min(range, Math.hypot(this.mouseX - this.player.x, this.mouseY - this.player.y));
    const ex = this.player.x + Math.cos(ang) * dist, ey = this.player.y + Math.sin(ang) * dist;
    this.aimGfx.lineStyle(1, 0x39c5c0, this.player.cooldown > 0 ? 0.22 : 0.55);
    this.aimGfx.beginPath(); this.aimGfx.moveTo(this.player.x, this.player.y); this.aimGfx.lineTo(ex, ey); this.aimGfx.strokePath();
    this.aimGfx.lineStyle(1, 0x39c5c0, 0.14);
    this.aimGfx.strokeCircle(this.player.x, this.player.y, range);

    this.playerGfx.clear();
    this.playerGfx.fillStyle(0x0c2534, 1);
    this.playerGfx.fillCircle(this.player.x, this.player.y, 9);
    this.playerGfx.fillStyle(0xf2b134, 1);
    this.playerGfx.fillCircle(this.player.x, this.player.y, 6);
    this.playerGfx.fillStyle(0x0c2534, 1);
    this.playerGfx.fillCircle(this.player.x, this.player.y, 2.4);
  }

  tryFire(px, py) {
    if (this.player.cooldown > 0) return;
    const gm = gearMods();
    const range = SPEAR_RANGE * gm.rangeMult;
    const ang = Math.atan2(py - this.player.y, px - this.player.x);
    const dist = Math.min(range, Math.hypot(px - this.player.x, py - this.player.y));
    const ex = this.player.x + Math.cos(ang) * dist, ey = this.player.y + Math.sin(ang) * dist;
    this.player.cooldown = SPEAR_COOLDOWN * gm.cooldownMult;

    const line = this.add.graphics();
    line.lineStyle(3, 0x39c5c0, 0.9);
    line.beginPath(); line.moveTo(this.player.x, this.player.y); line.lineTo(ex, ey); line.strokePath();
    this.tweens.add({ targets: line, alpha: 0, duration: 160, onComplete: () => line.destroy() });

    const bs = STATE.biomes[STATE.currentBiome];
    const hitR = HIT_RADIUS * gm.hitRadiusMult;
    let best = null, bestD = Infinity;
    for (const f of bs.fish) {
      if (f.caught) continue;
      const d = pointSegDist(f.x, f.y, this.player.x, this.player.y, ex, ey);
      if (d < hitR && d < bestD) { best = f; bestD = d; }
    }
    if (best) {
      best.caught = true;
      bs.caughtThisGen++;
      STATE.totalCaught++;
      const value = fishValue(best);
      STATE.money += value;
      this.removeFishGraphics(best.id);

      const burst = this.add.graphics();
      burst.fillStyle(best.variant ? 0xf2b134 : 0x7ee787, 0.9);
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 4;
        burst.fillCircle(best.x + Math.cos(a) * r, best.y + Math.sin(a) * r, 2 + Math.random() * 2);
      }
      burst.x = 0; burst.y = 0;
      this.tweens.add({ targets: burst, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 420, onComplete: () => burst.destroy() });

      const txt = this.add.text(best.x, best.y - 10, `+$${value}`, { font: 'bold 13px monospace', color: '#f2b134' }).setOrigin(0.5);
      this.tweens.add({ targets: txt, y: best.y - 40, alpha: 0, duration: 850, onComplete: () => txt.destroy() });

      refreshHUD(); refreshSidePanel();
    }
  }

  tickGeneration(dt) {
    const bs = STATE.biomes[STATE.currentBiome];
    bs.timeLeft -= dt;
    refreshTimerBar();
    if (bs.timeLeft <= 0) this.endCurrentGeneration();
  }
  endCurrentGeneration() {
    const biomeId = STATE.currentBiome;
    const result = endGeneration(biomeId);
    this.rebuildFishLayer();
    onGenerationEnded(biomeId, result);
  }

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    const gm = gearMods();
    this.updateBubbles(dt);
    this.updatePlayer(dt, gm);
    this.updateFishAndDraw(time, dt, gm);
    this.drawAimAndPlayer(gm);
    this.tickGeneration(dt);
  }
}

// ── DOM UI ─────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'rare' ? ' rare' : type === 'warn' ? ' warn' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 4200);
}
function pushEventFeed(text, rare) {
  EVENT_FEED.unshift({ text, rare });
  EVENT_FEED = EVENT_FEED.slice(0, 8);
  renderEventFeed();
}
function renderEventFeed() {
  const el = document.getElementById('eventFeed');
  el.innerHTML = EVENT_FEED.length
    ? EVENT_FEED.map(e => `<div class="ev ${e.rare ? 'rare' : ''}">${escapeHtml(e.text)}</div>`).join('')
    : '<div class="ev">No events yet.</div>';
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function onSceneReady() { refreshHUD(); refreshSidePanel(); saveGame(); }

function onHoverFish(fish) {
  const tip = document.getElementById('tooltip');
  if (!fish) { tip.classList.add('hidden'); return; }
  const canSee = STATE.upgrades.speciesId || STATE.upgrades.fishTracker;
  if (!canSee) {
    tip.innerHTML = '<b>???</b><br>A wary fish — hover reveals more once you own Species ID or a Fish Tracker.';
  } else {
    const g = fish.genes;
    const tier = (v, labels) => labels[Math.min(labels.length - 1, Math.floor(v * labels.length))];
    tip.innerHTML =
      `<b>${escapeHtml(fish.species)}${fish.variant ? ` <span style="color:#f2b134">(${VARIANT_LABELS[fish.variant]})</span>` : ''}</b><br>` +
      `Size: ${tier(g.size, ['Small', 'Medium', 'Large'])} · Speed: ${tier(g.speed, ['Slow', 'Moderate', 'Fast'])}<br>` +
      `Alertness: ${tier(g.alertness, ['Calm', 'Wary', 'Skittish'])} · Schooling: ${tier(g.schooling, ['Solitary', 'Loose', 'Tight'])}<br>` +
      `Value: ~$${fishValue(fish)}`;
  }
  tip.classList.remove('hidden');
  positionTooltip(window.__mouseClientX || 0, window.__mouseClientY || 0);
}
function positionTooltip(x, y) {
  const tip = document.getElementById('tooltip');
  tip.style.left = (x + 16) + 'px';
  tip.style.top = (y + 12) + 'px';
}

function refreshHUD() {
  document.getElementById('statMoney').textContent = `$${STATE.money}`;
  const bs = STATE.biomes[STATE.currentBiome];
  document.getElementById('statGen').textContent = `Gen ${bs.generation}`;
  document.getElementById('statPop').textContent = `Pop ${bs.fish.filter(f => !f.caught).length}`;
  const phase = sceneRef ? sceneRef.dayPhase : 0;
  document.getElementById('statPhase').textContent = phase < 0.5 ? '☀ Day' : '🌙 Night';
  refreshTimerBar();
}
function refreshTimerBar() {
  const bs = STATE.biomes[STATE.currentBiome];
  const pct = clamp(bs.timeLeft / genDuration(), 0, 1) * 100;
  document.getElementById('timerBar').style.width = pct + '%';
}

const SIDE_TRAITS = [
  { key: 'size', label: 'Body Size' },
  { key: 'speed', label: 'Swim Speed' },
  { key: 'alertness', label: 'Alertness' },
  { key: 'schooling', label: 'Schooling' },
  { key: 'camo', label: 'Camouflage' },
];
function refreshSidePanel() {
  const bs = STATE.biomes[STATE.currentBiome];
  const alive = bs.fish.filter(f => !f.caught);
  const avg = averageGenes(alive.length ? alive : bs.fish);
  const camo = biomeCamoScore(avg, STATE.currentBiome);
  const el = document.getElementById('traitReadout');
  el.innerHTML = SIDE_TRAITS.map(t => {
    const v = t.key === 'camo' ? camo : avg[t.key];
    const pct = Math.round(v * 100);
    return `<div class="trait-row"><span>${t.label}</span><b>${pct}%</b></div><div class="bar"><i style="width:${pct}%"></i></div>`;
  }).join('');
  document.getElementById('biomeCardTitle').textContent = `${BIOMES[STATE.currentBiome].name} — Population Traits`;
}

function buildBiomeTabs() {
  const nav = document.getElementById('biomeTabs');
  nav.innerHTML = '';
  Object.values(BIOMES).forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'biome-tab' + (b.id === STATE.currentBiome ? ' active' : '');
    btn.dataset.biome = b.id;
    btn.innerHTML = `<span class="dot" style="background:${b.color}"></span>${b.name}`;
    btn.onclick = () => switchBiome(b.id);
    nav.appendChild(btn);
  });
}
function switchBiome(id) {
  if (id === STATE.currentBiome) return;
  STATE.currentBiome = id;
  document.querySelectorAll('.biome-tab').forEach(b => b.classList.toggle('active', b.dataset.biome === id));
  if (sceneRef) sceneRef.setBiome(id);
  refreshHUD(); refreshSidePanel(); refreshJournalIfOpen();
  saveGame();
}

// ── Shop ─────────────────────────────────────────────────────
function renderShop() {
  renderShopGrid('shopEquipment', EQUIPMENT);
  renderShopGrid('shopSkills', SKILLS);
}
function renderShopGrid(elId, list) {
  const el = document.getElementById(elId);
  el.innerHTML = list.map(u => {
    const owned = STATE.upgrades[u.key];
    const disabled = owned || STATE.money < u.price;
    return `<div class="upgrade-card ${owned ? 'owned' : ''}">
      <h4>${u.icon} ${u.name}</h4>
      <p>${u.desc}</p>
      <div class="row">
        <span class="price">${owned ? 'Owned' : '$' + u.price}</span>
        <button data-buy="${u.key}" ${disabled ? 'disabled' : ''}>${owned ? '✓' : 'Buy'}</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('button[data-buy]').forEach(btn => { btn.onclick = () => buyUpgrade(btn.dataset.buy); });
}
function buyUpgrade(key) {
  const u = [...EQUIPMENT, ...SKILLS].find(x => x.key === key);
  if (!u || STATE.upgrades[key] || STATE.money < u.price) return;
  STATE.money -= u.price;
  STATE.upgrades[key] = true;
  toast(`Purchased ${u.name}.`, 'info');
  renderShop(); refreshHUD(); refreshSidePanel(); refreshJournalIfOpen();
  saveGame();
}

// ── Journal ──────────────────────────────────────────────────
const CHART_TRAITS = [
  { key: 'size', label: 'Body Size', color: '#39c5c0' },
  { key: 'speed', label: 'Swim Speed', color: '#7ee787' },
  { key: 'alertness', label: 'Alertness', color: '#f2b134' },
  { key: 'schooling', label: 'Schooling', color: '#c792ea' },
  { key: 'pattern', label: 'Patterning', color: '#ff9d6b' },
  { key: 'light', label: 'Brightness', color: '#8fd3ff' },
  { key: 'depthPref', label: 'Depth Preference', color: '#6bd0a0' },
  { key: 'activity', label: 'Diurnality (Night 0 ↔ Day 1)', color: '#ffd166' },
];
function refreshJournalIfOpen() {
  if (!document.getElementById('journalOverlay').classList.contains('hidden')) renderJournal();
}
function renderJournal() {
  const id = STATE.currentBiome;
  document.getElementById('journalBiomeName').textContent = BIOMES[id].name;
  renderJournalOverview(id);
  renderJournalCharts(id);
  renderJournalEvents(id);
}
function renderJournalOverview(id) {
  const bs = STATE.biomes[id];
  const alive = bs.fish.filter(f => !f.caught);
  const first = bs.history[0];
  const last = bs.history[bs.history.length - 1];
  let trend = 'Not enough data yet — dive a few generations to see evolutionary trends.';
  if (first && last) {
    const camoFirst = biomeCamoScore(first.avgGenes, id), camoLast = biomeCamoScore(last.avgGenes, id);
    const diff = Math.round((camoLast - camoFirst) * 100);
    if (Math.abs(diff) >= 5) {
      trend = diff > 0
        ? `Camouflage has increased ${diff}% since Generation ${first.gen} — your hunting is selecting for concealment.`
        : `Camouflage has decreased ${Math.abs(diff)}% since Generation ${first.gen} — this population is becoming easier to spot.`;
    } else {
      trend = `Trait averages have stayed roughly stable since Generation ${first.gen}.`;
    }
  }
  const tiles = [
    ['Generation', bs.generation],
    ['Live Population', alive.length],
    ['Caught (this zone)', bs.history.reduce((s, h) => s + h.caught, 0) + bs.caughtThisGen],
    ['Generations Logged', bs.history.length],
    ['Money', '$' + STATE.money],
    ['Rare Variants Seen', bs.history.reduce((s, h) => s + h.events.length, 0)],
  ];
  document.getElementById('jOverview').innerHTML =
    `<div class="stat-grid">${tiles.map(([l, v]) => `<div class="stat-tile"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
     <p style="color:var(--muted);font-size:12.5px;line-height:1.6">${trend}</p>`;
}
function renderJournalCharts(id) {
  const el = document.getElementById('jCharts');
  const bs = STATE.biomes[id];
  if (!STATE.upgrades.evolutionTracking) {
    el.innerHTML = '<div class="locked-note">🔒 Purchase the <b>Evolution Tracking</b> skill in the Shop to unlock trait charts and long-term analytics.</div>';
    return;
  }
  if (bs.history.length < 2) {
    el.innerHTML = '<div class="locked-note">Not enough generations logged yet. Keep diving — charts appear after Generation 2.</div>';
    return;
  }
  el.innerHTML = CHART_TRAITS.map(t => `
    <div class="chart-block">
      <h4>${t.label}</h4>
      <canvas id="chart_${t.key}" width="700" height="110"></canvas>
    </div>`).join('') +
    `<div class="chart-block"><h4>Population (solid) &amp; Catch Rate (dashed)</h4><canvas id="chart_pop" width="700" height="110"></canvas></div>`;
  CHART_TRAITS.forEach(t => {
    drawLineChart(document.getElementById('chart_' + t.key), bs.history.map(h => ({ x: h.gen, y: h.avgGenes[t.key] })), t.color, 0, 1);
  });
  drawDualLineChart(document.getElementById('chart_pop'),
    bs.history.map(h => ({ x: h.gen, y: h.population })),
    bs.history.map(h => ({ x: h.gen, y: h.catchRate })), '#39c5c0', '#ff6b6b');
}
function renderJournalEvents(id) {
  const bs = STATE.biomes[id];
  const rows = [];
  bs.history.slice().reverse().forEach(h => {
    if (h.rescued) rows.push({ gen: h.gen, text: 'Population crashed — immigrants repopulated the zone.', rare: true });
    if (h.overhunted) rows.push({ gen: h.gen, text: 'Overhunting pressure increased the mutation rate.', rare: false });
    h.events.forEach(e => rows.push({ gen: h.gen, text: e, rare: true }));
    rows.push({ gen: h.gen, text: `Generation ended — ${h.caught} caught, ${h.survivors} survived (${Math.round(h.catchRate * 100)}% catch rate).`, rare: false });
  });
  const el = document.getElementById('eventLog');
  el.innerHTML = rows.length
    ? rows.map(r => `<div class="row ${r.rare ? 'rare' : ''}"><b>Gen ${r.gen}:</b> ${escapeHtml(r.text)}</div>`).join('')
    : '<div class="row">No events logged yet.</div>';
}

// ── Tiny canvas line-chart renderer (no external deps) ────────
function drawLineChart(canvas, points, color, minY, maxY) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 8;
  ctx.clearRect(0, 0, W, H);
  if (points.length < 2) return;
  const xs = points.map(p => p.x);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = minY !== undefined ? minY : Math.min(...points.map(p => p.y));
  const yMax = maxY !== undefined ? maxY : Math.max(...points.map(p => p.y));
  const xTo = x => pad + (xMax === xMin ? 0 : (x - xMin) / (xMax - xMin)) * (W - 2 * pad);
  const yTo = y => H - pad - ((y - yMin) / ((yMax - yMin) || 1)) * (H - 2 * pad);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, H / 2); ctx.lineTo(W - pad, H / 2); ctx.stroke();

  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
  points.forEach((p, i) => { const x = xTo(p.x), y = yTo(p.y); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  ctx.fillStyle = color;
  points.forEach(p => { ctx.beginPath(); ctx.arc(xTo(p.x), yTo(p.y), 2.4, 0, Math.PI * 2); ctx.fill(); });
}
function drawDualLineChart(canvas, popPoints, ratePoints, colorA, colorB) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 8;
  ctx.clearRect(0, 0, W, H);
  if (popPoints.length < 2) return;
  const xs = popPoints.map(p => p.x);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const popMax = Math.max(...popPoints.map(p => p.y), 1);
  const xTo = x => pad + (xMax === xMin ? 0 : (x - xMin) / (xMax - xMin)) * (W - 2 * pad);
  const yToPop = y => H - pad - (y / popMax) * (H - 2 * pad);
  const yToRate = y => H - pad - y * (H - 2 * pad);

  ctx.strokeStyle = colorA; ctx.lineWidth = 2; ctx.beginPath();
  popPoints.forEach((p, i) => { const x = xTo(p.x), y = yToPop(p.y); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  ctx.strokeStyle = colorB; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath();
  ratePoints.forEach((p, i) => { const x = xTo(p.x), y = yToRate(p.y); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Generation report ────────────────────────────────────────
function showGenReport(result, biomeId) {
  const { histEntry, rescued, rareEvents, overhunted } = result;
  document.getElementById('genReportTitle').textContent = `${BIOMES[biomeId].name} — Generation ${histEntry.gen} Report`;
  const rows = [
    ['Population at start', histEntry.population],
    ['Caught this generation', histEntry.caught],
    ['Survivors', histEntry.survivors],
    ['Catch rate', Math.round(histEntry.catchRate * 100) + '%'],
    ['Avg. camouflage', Math.round(biomeCamoScore(histEntry.avgGenes, biomeId) * 100) + '%'],
    ['Avg. body size', Math.round(histEntry.avgGenes.size * 100) + '%'],
    ['Avg. swim speed', Math.round(histEntry.avgGenes.speed * 100) + '%'],
  ];
  let html = rows.map(([l, v]) => `<div class="row"><span>${l}</span><span>${v}</span></div>`).join('');
  if (rescued) html += `<div class="row" style="color:var(--danger)"><span>⚠ Population crashed — immigrants repopulated the zone.</span></div>`;
  if (overhunted) html += `<div class="row" style="color:var(--accent2)"><span>⚠ Overhunting detected — mutation rate increased.</span></div>`;
  rareEvents.forEach(ev => { html += `<div class="row" style="color:var(--accent2)"><span>★ ${escapeHtml(ev.text)}</span></div>`; });
  document.getElementById('genReportBody').innerHTML = html;
  openModal('genReportOverlay');
}

function onGenerationEnded(biomeId, result) {
  STATE.totalGenerations++;
  const name = BIOMES[biomeId].name;
  pushEventFeed(`${name} Gen ${result.histEntry.gen}: ${result.histEntry.caught} caught, ${result.histEntry.survivors} survived.`, false);
  toast(`${name}: Generation ${result.histEntry.gen} complete.`, 'info');
  if (result.rescued) { toast(`${name}: Population crashed — immigrants repopulated the zone.`, 'warn'); pushEventFeed(`${name}: population crash — rescued by immigrants.`, true); }
  if (result.overhunted) { toast(`${name}: Overhunting is accelerating mutation.`, 'warn'); }
  result.rareEvents.forEach(ev => { toast(`${name}: ${ev.text}`, 'rare'); pushEventFeed(`${name}: ${ev.text}`, true); });
  showGenReport(result, biomeId);
  refreshHUD(); refreshSidePanel(); refreshJournalIfOpen();
  saveGame();
}

// ── Save / load ──────────────────────────────────────────────
function saveGame() {
  try {
    const data = {
      money: STATE.money, currentBiome: STATE.currentBiome, upgrades: STATE.upgrades,
      totalCaught: STATE.totalCaught, totalGenerations: STATE.totalGenerations, biomes: {},
    };
    for (const id in STATE.biomes) {
      const bs = STATE.biomes[id];
      data.biomes[id] = {
        generation: bs.generation, timeLeft: bs.timeLeft, caughtThisGen: bs.caughtThisGen, history: bs.history,
        fish: bs.fish.map(f => ({ id: f.id, biome: f.biome, species: f.species, biomeStyle: f.biomeStyle, genes: f.genes, variant: f.variant, x: f.x, y: f.y, caught: f.caught })),
      };
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { console.warn('Adaptive Reef: save failed', e); }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    STATE.money = typeof data.money === 'number' ? data.money : 60;
    STATE.currentBiome = BIOMES[data.currentBiome] ? data.currentBiome : 'reef';
    Object.assign(STATE.upgrades, data.upgrades || {});
    STATE.totalCaught = data.totalCaught || 0;
    STATE.totalGenerations = data.totalGenerations || 0;
    let maxId = 1;
    for (const id in BIOMES) {
      const saved = data.biomes && data.biomes[id];
      if (saved && Array.isArray(saved.fish) && saved.fish.length) {
        STATE.biomes[id] = {
          generation: saved.generation || 1,
          timeLeft: typeof saved.timeLeft === 'number' ? saved.timeLeft : genDuration(),
          caughtThisGen: saved.caughtThisGen || 0,
          history: Array.isArray(saved.history) ? saved.history : [],
          fish: saved.fish.map(f => ({ ...f, vx: 0, vy: 0, fleeT: 0, wanderSeed: Math.random() * 1000 })),
        };
        saved.fish.forEach(f => { if (f.id >= maxId) maxId = f.id + 1; });
      } else {
        STATE.biomes[id] = initBiomeState(id);
      }
    }
    _fishId = maxId;
    return true;
  } catch (e) {
    console.warn('Adaptive Reef: load failed', e);
    return false;
  }
}

// ── Static UI wiring ────────────────────────────────────────
function wireStaticUI() {
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => closeModal(b.dataset.close); });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
  });

  document.getElementById('btnJournal').onclick = () => { renderJournal(); openModal('journalOverlay'); };
  document.getElementById('btnShop').onclick = () => { renderShop(); openModal('shopOverlay'); };
  document.getElementById('btnSurface').onclick = () => { if (sceneRef) sceneRef.endCurrentGeneration(); };
  document.getElementById('btnReset').onclick = () => {
    if (confirm('Reset all progress? This cannot be undone.')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
  };
  document.getElementById('btnDiveAgain').onclick = () => closeModal('genReportOverlay');

  document.querySelectorAll('.shop-tab').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.shop-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('shopEquipment').classList.toggle('active', b.dataset.shoptab === 'equipment');
      document.getElementById('shopSkills').classList.toggle('active', b.dataset.shoptab === 'skills');
    };
  });
  document.querySelectorAll('.journal-tab').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.journal-tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('jOverview').classList.toggle('active', b.dataset.jtab === 'overview');
      document.getElementById('jCharts').classList.toggle('active', b.dataset.jtab === 'charts');
      document.getElementById('jEvents').classList.toggle('active', b.dataset.jtab === 'events');
    };
  });

  document.getElementById('gc').addEventListener('mousemove', e => {
    window.__mouseClientX = e.clientX; window.__mouseClientY = e.clientY;
    if (!document.getElementById('tooltip').classList.contains('hidden')) positionTooltip(e.clientX, e.clientY);
  });
}

// ── Boot ─────────────────────────────────────────────────────
function startGame() {
  const loaded = loadGame();
  if (!loaded) { for (const id in BIOMES) STATE.biomes[id] = initBiomeState(id); }

  buildBiomeTabs();
  refreshSidePanel();
  renderShop();
  pushEventFeed('Welcome to the reef. Good hunting — and watch what you select for.', false);
  wireStaticUI();

  new Phaser.Game({
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#04141d',
    parent: 'gc',
    scene: AdaptiveReefScene,
  });

  setInterval(() => { refreshHUD(); refreshSidePanel(); }, 500);
  setInterval(saveGame, 20000);
}

startGame();
