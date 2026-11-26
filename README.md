# Ridgeline Rescue

![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/arestafirman/ridgeline-rescue-flight/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/arestafirman/ridgeline-rescue-flight/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

A STOL mountain-rescue flight game. Fly a ski-equipped bush plane down a snowy
alpine valley at golden hour — no courier, no archipelago, no island hopping.
Three missions, one sortie, one short strip:

1. **Ring run** — thread 5 orange rings down the valley.
2. **Supply drop** — drop 3 crates onto the marked H pads.
3. **Rescue landing** — put her down gently on the short lit strip with a
   casualty aboard. Hard landings cost damage; the ridge costs everything.

Fuel is finite (refills only on the strip), wind gusts push you around, and
your score is time + crates on target + airframe condition at touchdown.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) and fly with keyboard and mouse — no network, no
assets to download, all sound is procedural WebAudio.

- **↑ / W** throttle up · **↓ / S** throttle down
- **← / → or A / D** pitch down / up (mouse steers pitch too)
- **SPACE / click** drop a supply crate
- **C** cockpit view · **M** sound on/off · **P** pause · **R** restart

## Screenshots

Deterministic poses via `?shot=chase|drop|landing|cockpit&seed=7` — every
screenshot is a real render of the running game.

## Tech

Plain 2D canvas, zero libraries, zero external assets. One file per job:

- `game/src/main.js` — game loop, input, camera, state machine
- `game/src/terrain.js` — seeded valley, ridges, river, pines, strip
- `game/src/aircraft.js` — bush plane physics (throttle, lift, drag, wind)
- `game/src/missions.js` — rings, supply drops, landing, scoring
- `game/src/hud.js` — instruments (alt / speed / heading / fuel / damage)
- `game/src/audio.js` — procedural engine, wind and beeps
- `game/src/shots.js` — deterministic screenshot poses
