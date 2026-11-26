// shots.js — deterministic screenshot poses. ?shot=<mode>&seed=<N> freezes the
// game into one composed frame so every screenshot is a real render of the
// running game, repeatable for any seed. Modes: chase, drop, landing, cockpit.

export function applyShot(game, mode, seed) {
  const { plane, missions, terrain } = game;
  game.frozen = true;
  game.shotMode = mode;
  game.view = mode === 'cockpit' ? 'cockpit' : 'chase';

  if (mode === 'chase') {
    // Cover: mid-flight chase view, ring 2 dead ahead, instruments lit.
    plane.x = 1180;
    plane.alt = terrain.heightAt(plane.x) + 78;
    plane.vx = 42;
    plane.vy = 2;
    plane.pitch = 0.06;
    plane.throttle = 0.72;
    plane.fuel = 78;
    missions.rings[0].passed = true;
    missions.ringsPassed = 1;
    missions.score = 100;
    missions.elapsed = 34;
    missions.message = 'MISSION 1 — Fly through all 5 orange rings';
    missions.messageUntil = 9999;
  } else if (mode === 'drop') {
    // Supply drop: crate falling on its chute above a marked pad.
    plane.x = 3320;
    plane.alt = terrain.heightAt(plane.x) + 72;
    plane.vx = 38;
    plane.vy = -1;
    plane.pitch = -0.02;
    plane.throttle = 0.6;
    plane.fuel = 61;
    missions.phase = 'drop';
    missions.rings.forEach((r) => (r.passed = true));
    missions.ringsPassed = 5;
    missions.score = 500;
    missions.crates = 2;
    missions.falling = [{ x: 3405, alt: 150, vy: 14 }];
    missions.elapsed = 96;
    missions.message = 'MISSION 2 — Drop 3 crates on the marked pads (SPACE / click)';
    missions.messageUntil = 9999;
  } else if (mode === 'landing') {
    // Final approach: short strip ahead, edge lights on, low and slow.
    plane.x = 4900;
    plane.alt = terrain.heightAt(plane.x) + 48;
    plane.vx = 34;
    plane.vy = -3.5;
    plane.pitch = -0.08;
    plane.throttle = 0.42;
    plane.fuel = 34;
    missions.phase = 'landing';
    missions.rings.forEach((r) => (r.passed = true));
    missions.ringsPassed = 5;
    missions.score = 950;
    missions.crates = 0;
    missions.cratesHit = 3;
    missions.pads.forEach((p) => (p.hit = true));
    missions.elapsed = 168;
    missions.message = 'MISSION 3 — Land on the lit strip. Gentle touchdown, under 45 m/s';
    missions.messageUntil = 9999;
  } else if (mode === 'cockpit') {
    // Cockpit view: big instrument panel, golden-hour valley ahead, ring ahead.
    plane.x = 2050;
    plane.alt = terrain.heightAt(plane.x) + 82;
    plane.vx = 44;
    plane.vy = 1;
    plane.pitch = 0.05;
    plane.throttle = 0.75;
    plane.fuel = 71;
    missions.rings[0].passed = true;
    missions.rings[1].passed = true;
    missions.ringsPassed = 2;
    missions.score = 200;
    missions.elapsed = 58;
    missions.message = 'MISSION 1 — Fly through all 5 orange rings';
    missions.messageUntil = 9999;
  }

  // Camera sits on the plane for every pose.
  game.cam.x = plane.x + 130;
  game.cam.y = plane.alt - 30;
  void seed;
  void terrain;
}
