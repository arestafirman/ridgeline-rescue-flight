// main.js — Ridgeline Rescue: game loop, input, camera, state machine and
// the render pipeline (sky, ridges, ground, missions, plane, cockpit).
// Play it: ?seed=N fixes the valley; ?shot=chase|drop|landing|cockpit&seed=N
// freezes one deterministic frame for screenshots.

import { buildTerrain, drawSky, drawRidges, drawGround, mulberry32 } from './terrain.js';
import { createPlane, updatePlane, drawPlane } from './aircraft.js';
import { createMissions, updateMissions, drawMissions, dropCrate } from './missions.js';
import { bindHud, updateHud, drawAttitude, drawCompass } from './hud.js';
import { createAudio } from './audio.js';
import { applyShot } from './shots.js';

const W = 1280;
const H = 800;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayBody = document.getElementById('overlay-body');
const overlayHint = document.getElementById('overlay-hint');

const terrain = buildTerrain(seed);
const plane = createPlane();
plane.alt = terrain.heightAt(plane.x) + 70;
const missions = createMissions(terrain);
const hud = bindHud(document);
const audio = createAudio();

// Snow specks drifting through the valley air.
const snowRnd = mulberry32(seed + 101);
const snow = [];
for (let i = 0; i < 90; i++) {
  snow.push({
    x: snowRnd() * W,
    y: snowRnd() * H,
    s: 1 + snowRnd() * 2.2,
    drift: 8 + snowRnd() * 22,
  });
}

const game = {
  terrain,
  plane,
  missions,
  cam: { x: plane.x + 130, y: plane.alt - 30, scale: 1.9 },
  frozen: false,
  shotMode: null,
  view: 'chase', // chase | cockpit
  state: 'title', // title | playing | paused | crashed | won
  time: 0,
};

// Debug handle for automated play-testing (read-only state, no gameplay effect).
window.__rr = game;

const input = {
  throttleUp: false,
  throttleDown: false,
  pitchUp: false,
  pitchDown: false,
};

const KEYMAP = {
  ArrowUp: 'throttleUp',
  KeyW: 'throttleUp',
  ArrowDown: 'throttleDown',
  KeyS: 'throttleDown',
  ArrowRight: 'pitchUp',
  KeyD: 'pitchUp',
  ArrowLeft: 'pitchDown',
  KeyA: 'pitchDown',
};

let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem('ridgeline-rescue-best') ?? '0', 10) || 0;
} catch {
  best = 0;
}

function saveBest(value) {
  try {
    window.localStorage.setItem('ridgeline-rescue-best', String(value));
  } catch {
    // Storage off: best score lasts this visit only.
  }
}

function announce(message) {
  status.textContent = message;
}

function showOverlay(title, body, hint) {
  overlayTitle.textContent = title;
  overlayBody.innerHTML = body;
  overlayHint.textContent = hint;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function startGame() {
  const fresh = createPlane();
  Object.assign(plane, fresh);
  // Spawn well clear of the ridge below: the valley floor varies, so the
  // start altitude is measured from the terrain, not fixed.
  plane.alt = terrain.heightAt(plane.x) + 70;
  const freshMissions = createMissions(terrain);
  Object.assign(missions, freshMissions);
  missions.falling = [];
  missions.landedCrates = [];
  game.cam.x = plane.x + 130;
  game.cam.y = plane.alt - 30;
  game.state = 'playing';
  game.time = 0;
  hideOverlay();
  audio.start();
  announce('Flying. Mission 1: thread the five orange rings.');
}

function endCrash(reason) {
  game.state = 'crashed';
  audio.thud();
  if (missions.score > best) {
    best = missions.score;
    saveBest(best);
  }
  showOverlay(
    'WRECKED IN THE RIDGE',
    `${reason}<br>Score <b>${missions.score}</b> · Rings ${missions.ringsPassed}/5 · Crates ${missions.cratesHit}/3<br>Best ${best}`,
    'Press R or click to fly again',
  );
  announce(`Crashed. Score ${missions.score}.`);
}

function endWin() {
  game.state = 'won';
  if (missions.score > best) {
    best = missions.score;
    saveBest(best);
  }
  showOverlay(
    'RESCUE COMPLETE',
    `Casualty aboard, skis on the strip.<br>Score <b>${missions.score}</b> (time bonus ${missions.timeBonus} · airframe ${Math.round((100 - plane.damage) * 2)})<br>Rings ${missions.ringsPassed}/5 · Crates ${missions.cratesHit}/3 · Damage ${Math.round(plane.damage)}% · Best ${best}`,
    'Press R or click to fly another sortie',
  );
  announce(`Rescue complete. Score ${missions.score}.`);
}

function windAt(t) {
  return {
    gust: Math.sin(t * 0.35) * 3.5 + Math.sin(t * 1.31) * 1.6,
    vertical: Math.sin(t * 0.53) * 0.9,
  };
}

function step(dt) {
  game.time += dt;
  const wind = windAt(game.time);
  const phaseBefore = missions.phase;
  const event = updatePlane(plane, input, dt, terrain, wind);
  updateMissions(missions, plane, dt, terrain, {
    beep: (f, s) => audio.beep(f, s),
    thud: () => audio.thud(),
  });
  audio.setFlight(plane.throttle, plane.vx);
  if (event === 'crash') {
    const hitRidge = plane.alt <= terrain.heightAt(plane.x) + 2 && plane.x < terrain.stripX0;
    endCrash(
      hitRidge
        ? 'You clipped the ridge at full speed. The valley does not forgive.'
        : 'Hard impact — the skis are in pieces.',
    );
  } else if (event === 'hard-landing') {
    missions.message = `Hard landing! Damage ${Math.round(plane.damage)}% — keep it gentle`;
    missions.messageUntil = missions.elapsed + 3;
    audio.thud();
  } else if (event === 'landed' && phaseBefore === 'landing') {
    // updateMissions already flipped the phase to done; endWin below.
  } else if (event === 'landed') {
    // Down on the strip before the missions were done: the sortie is over.
    endCrash('You put her down on the strip before the missions were done.');
    return;
  }
  if (missions.phase === 'done' && game.state === 'playing') endWin();
  if (plane.x > 6000 && game.state === 'playing') {
    // Overshot the strip: turn the sortie into a go-around failure.
    endCrash('You flew past the strip and out of the valley.');
  }
}

function render() {
  const wind = windAt(game.time);
  // Camera eases onto the plane.
  const targetX = plane.x + 150;
  const targetY = plane.alt - 30;
  game.cam.x += (targetX - game.cam.x) * 0.08;
  game.cam.y += (targetY - game.cam.y) * 0.08;

  const sunX = W * 0.72 - (game.cam.x - plane.x) * 0.06;
  drawSky(ctx, W, H, sunX);
  drawRidges(ctx, game.cam, terrain, W, H);
  drawGround(ctx, game.cam, terrain, W, H, game.time);
  drawMissions(ctx, game.cam, missions, game.time);

  // Plane screen position.
  const S = game.cam.scale;
  const px = (plane.x - game.cam.x) * S + W / 2;
  const py = H * 0.8 - (plane.alt - game.cam.y) * S;

  // Drifting snow.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (const flake of snow) {
    const fx = (flake.x + game.time * flake.drift * 0.4 + game.cam.x * 0.2) % W;
    const fy = (flake.y + game.time * flake.drift) % H;
    ctx.fillRect(fx < 0 ? fx + W : fx, fy < 0 ? fy + H : fy, flake.s, flake.s);
  }

  if (game.view === 'cockpit') {
    drawCockpitView(px, py, wind);
  } else {
    drawPlane(ctx, px, py, plane, game.time);
    drawAttitude(ctx, 92, H - 148, 40, plane);
  }

  // Speed lines at high throttle.
  if (plane.vx > 52 && game.state === 'playing') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const ly = 120 + ((i * 137 + Math.floor(game.time * 900)) % 520);
      const lx = 60 + i * 40;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + 90, ly);
      ctx.stroke();
    }
  }

  // Compass strip + heading.
  drawCompass(ctx, W, 90 + wind.gust * 1.2 + plane.pitch * 8);

  // Vignette for the golden-hour mood.
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, 'rgba(20, 12, 40, 0)');
  vig.addColorStop(1, 'rgba(20, 12, 40, 0.32)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  updateHud(hud, plane, missions, wind);
}

// Cockpit view: the valley seen past a dashboard full of lit dials.
function drawCockpitView(px, py, wind) {
  // Nose and glareshield: one smooth curve framing the view.
  ctx.fillStyle = '#1c1626';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H - 168);
  ctx.quadraticCurveTo(W * 0.5, H - 216, W, H - 168);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Glareshield line.
  ctx.strokeStyle = '#3a3049';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, H - 168);
  ctx.quadraticCurveTo(W * 0.5, H - 216, W, H - 168);
  ctx.stroke();

  // Instrument panel: six dials + attitude ball, all lit, none overlapping.
  const panelY = H - 138;
  ctx.fillStyle = '#241d33';
  ctx.fillRect(0, panelY, W, 138);
  ctx.strokeStyle = '#4a3f63';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, panelY, W, 138);

  const dials = [
    { x: 120, label: 'AIRSPEED', value: plane.vx * 3.6, max: 260, unit: 'km/h' },
    { x: 280, label: 'ALTITUDE', value: Math.max(0, plane.alt - 40), max: 500, unit: 'm' },
    { x: 440, label: 'HEADING', value: 90 + wind.gust * 1.2, max: 360, unit: '°' },
    { x: 840, label: 'VERT SPEED', value: plane.vy * 3, max: 30, unit: 'm/s' },
    { x: 1000, label: 'THROTTLE', value: plane.throttle * 100, max: 100, unit: '%' },
    { x: 1160, label: 'FUEL', value: plane.fuel, max: 100, unit: '%' },
  ];
  for (const d of dials) {
    drawDial(d.x, panelY + 62, 46, d);
  }

  // Centre attitude ball.
  drawAttitude(ctx, 640, panelY + 62, 34, plane);

  // A ring ahead, seen over the nose.
  ctx.fillStyle = 'rgba(255, 220, 160, 0.9)';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RING AHEAD — KEEP HER LEVEL', W / 2, panelY - 12);
  void px;
  void py;
}

function drawDial(cx, cy, r, d) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#12101c';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8f86ad';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  // Ticks.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  // Needle.
  const frac = Math.max(0, Math.min(1, d.value / d.max));
  const na = Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.strokeStyle = '#ffcc33';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(na) * (r - 10), Math.sin(na) * (r - 10));
  ctx.stroke();
  ctx.fillStyle = '#ffcc33';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  // Label above the dial (the page's bottom bar covers the panel's lower edge).
  ctx.fillStyle = '#cfc8e8';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(d.label, 0, -r - 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`${Math.round(d.value)}${d.unit}`, 0, 6);
  ctx.restore();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  if (!game.frozen && game.state === 'playing') {
    step(dt);
  } else if (!game.frozen && game.state === 'title') {
    // Attract mode: the valley drifts behind the title screen.
    game.time += dt;
    game.cam.x += 12 * dt;
    if (game.cam.x > 2400) game.cam.x = 300;
  }
  render();
}

let last = performance.now();

function onKeyDown(e) {
  if (e.code === 'Space') {
    e.preventDefault();
    if (game.state === 'title' || game.state === 'crashed' || game.state === 'won') {
      startGame();
    } else if (game.state === 'playing') {
      if (dropCrate(missions, plane)) audio.beep(660, 0.08);
    }
    return;
  }
  if (e.code === 'KeyR') {
    if (game.state !== 'title') startGame();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.state === 'playing') {
      game.state = 'paused';
      showOverlay('PAUSED', 'The valley waits. Fuel is not burning while you think.', 'Press P or click to resume');
    } else if (game.state === 'paused') {
      game.state = 'playing';
      hideOverlay();
    }
    return;
  }
  if (e.code === 'KeyC') {
    game.view = game.view === 'chase' ? 'cockpit' : 'chase';
    return;
  }
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    announce(muted ? 'Sound off.' : 'Sound on.');
    return;
  }
  const action = KEYMAP[e.code];
  if (action) {
    input[action] = true;
    e.preventDefault();
  }
}

function onKeyUp(e) {
  const action = KEYMAP[e.code];
  if (action) input[action] = false;
}

function onPointer(e) {
  audio.start();
  if (game.state === 'title' || game.state === 'crashed' || game.state === 'won') {
    startGame();
    return;
  }
  if (game.state === 'paused') {
    game.state = 'playing';
    hideOverlay();
    return;
  }
  if (game.state === 'playing') {
    // Click (or tap) drops a crate; hold-drag steers pitch by pointer height.
    if (dropCrate(missions, plane)) audio.beep(660, 0.08);
  }
}

function onPointerMove(e) {
  if (game.state !== 'playing') return;
  const rect = canvas.getBoundingClientRect();
  const y = (e.clientY - rect.top) / rect.height;
  // Pointer above the plane = climb, below = descend. Gentle authority.
  const target = (0.5 - y) * 0.9;
  plane.pitch += (target - plane.pitch) * 0.06;
}

if (shot) {
  // Screenshot pose: stage it, paint twice, signal readiness.
  applyShot(game, shot, seed);
  game.state = 'playing';
  overlay.classList.add('hidden');
  let painted = 0;
  function paintShot() {
    render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paintShot);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paintShot);
} else {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointer);
  canvas.addEventListener('pointermove', onPointerMove);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') {
      game.state = 'paused';
      showOverlay('PAUSED', 'The valley waits. Fuel is not burning while you think.', 'Press P or click to resume');
    }
  });
  showOverlay(
    'RIDGELINE RESCUE',
    'STOL mountain rescue in a snowy valley at golden hour.<br><b>3 missions:</b> thread 5 orange rings · drop 3 crates on the H pads · land on the short lit strip.<br>Fuel is finite. Hard landings hurt. The ridge does not forgive.<br><br><b>↑/W</b> throttle up · <b>↓/S</b> throttle down · <b>←/→ or A/D</b> pitch · <b>SPACE / click</b> drop crate<br><b>C</b> cockpit view · <b>M</b> sound · <b>P</b> pause · mouse steers pitch',
    'Press SPACE or click to fly',
  );
  announce('Ridgeline Rescue. Press Space or click to fly.');
  requestAnimationFrame(frame);
}
