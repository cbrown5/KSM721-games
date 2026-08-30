# Adaptive Reef

A spearfishing game where the fish population evolves in response to player hunting pressure.
Fish that avoid being caught survive, reproduce, and pass on their traits — coloration,
patterning, body size, swim speed, alertness, schooling behavior, preferred depth, and
day/night activity — via crossover and mutation. Whatever you keep catching becomes rarer;
whatever you leave alone spreads through the population. Every playthrough leaves behind a
different evolved ecosystem, driven entirely by how the player chose to hunt.

How to play
- Explore four biomes (Coral Reef, Kelp Forest, Sandy Flats, Deep Water), each with its own
  gene pool and its own "natural" selection pressure (e.g. sandy flats favor pale, flat,
  burrowing fish; deep water favors dark, low-energy fish).
- Move with WASD/arrows, aim with the mouse, fire the spear gun with click or space.
- Each dive ("generation") runs on a timer, or end it early with **Surface Now**. Fish you
  didn't catch survive to reproduce; the population you meet next generation reflects exactly
  who you spared.
- Spend money earned from catches in the **Shop** on equipment (carbon spear gun, propulsion
  device, fish tracker, polarized vision mask, camouflage suit) and skills (breath-hold
  mastery, silent movement, improved aim, species identification, evolution tracking).
- Track what's happening in the **Journal**: population overview, per-trait charts across
  generations (unlocked by the Evolution Tracking skill), and an event log.
- Sustained, extreme selection pressure can trigger rare evolutionary events: Ghost Fish
  (near-perfect camouflage), Boltfin (extreme speed), Cave Stalker (population retreats from
  overhunting), and Mimic Species (patterns evolve to resemble something dangerous).

Constraints
- Hostable on GitHub Pages as static files — no build step, no server.
- HTML + JS, using Phaser 3 (via CDN) for the game canvas, plus a plain DOM layer for the
  HUD, shop, and journal (including small hand-rolled canvas line charts — no charting
  library).
- Progress (money, upgrades, and each biome's population/generation history) autosaves to
  `localStorage`.
