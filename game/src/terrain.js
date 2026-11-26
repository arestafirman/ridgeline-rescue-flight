// terrain.js — the snowy alpine valley: height field, ridge layers, ground,
// river, pines and the rescue strip. Everything is seeded so a given seed
// always builds the same valley (deterministic screenshots included).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Height of the valley floor (metres) at world x. A sum of sines gives rolling
// ridges; the strip area is flattened so a landing is possible there.
export function buildTerrain(seed) {
  const rnd = mulberry32(seed);
  const p1 = rnd() * 6.283;
  const p2 = rnd() * 6.283;
  const p3 = rnd() * 6.283;
  const p4 = rnd() * 6.283;
  const stripX0 = 5200;
  const stripX1 = 5600;
  const stripH = 58;

  function rawHeight(x) {
    return (
      78 +
      96 * Math.sin(x * 0.0011 + p1) +
      54 * Math.sin(x * 0.0023 + p2) +
      26 * Math.sin(x * 0.0049 + p3) +
      13 * Math.sin(x * 0.011 + p4)
    );
  }

  function heightAt(x) {
    const h = rawHeight(x);
    const flat =
      smoothstep(stripX0 - 280, stripX0 + 60, x) *
      (1 - smoothstep(stripX1 - 60, stripX1 + 280, x));
    const blended = h * (1 - flat) + stripH * flat;
    // Keep the valley floor in a sane band so the ground (and the drop pads
    // on it) always stays in frame and rings stay above the hills.
    return Math.max(55, Math.min(235, blended));
  }

  // Pine trees scattered on the valley floor, never on the strip.
  const trees = [];
  for (let x = 140; x < 6050; x += 24 + rnd() * 46) {
    if (x > stripX0 - 320 && x < stripX1 + 320) continue;
    trees.push({ x, h: heightAt(x), s: 0.7 + rnd() * 0.8, tint: rnd() });
  }

  // Distant ridge silhouettes, three parallax layers. The stored y is a
  // crest offset in metres; frequencies are chosen so several peaks fit in
  // one screen width (a slow sine reads as a flat line).
  const ridges = [];
  for (let layer = 0; layer < 3; layer++) {
    const phase = rnd() * 6.283;
    const phase2 = rnd() * 6.283;
    const pts = [];
    for (let x = -400; x <= 6800; x += 90) {
      pts.push({
        x,
        y: 72 * Math.sin(x * 0.008 + phase) + 42 * Math.sin(x * 0.019 + phase2),
      });
    }
    ridges.push(pts);
  }

  return {
    seed,
    heightAt,
    rawHeight,
    trees,
    ridges,
    stripX0,
    stripX1,
    stripH,
    riverX: 2950,
    worldEnd: 6100,
  };
}

// Golden-hour sky: deep dusk purple at the top melting into amber at the sun,
// then back to dusky mauve haze at the bottom so the gap between the far
// ridges and the valley floor reads as atmosphere, not a hard band.
export function drawSky(ctx, w, h, sunX) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2b2350');
  sky.addColorStop(0.42, '#6d4a7d');
  sky.addColorStop(0.62, '#c96f4a');
  sky.addColorStop(0.74, '#dd8a58');
  sky.addColorStop(0.88, '#7a5f8e');
  sky.addColorStop(1, '#6b5688');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Low sun with a warm halo.
  const halo = ctx.createRadialGradient(sunX, h * 0.52, 6, sunX, h * 0.52, 190);
  halo.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
  halo.addColorStop(0.25, 'rgba(255, 196, 110, 0.55)');
  halo.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - 200, h * 0.52 - 200, 400, 400);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(sunX, h * 0.52, 34, 0, Math.PI * 2);
  ctx.fill();

  // A few high clouds catching the light.
  ctx.fillStyle = 'rgba(255, 214, 170, 0.28)';
  for (const [cx, cy, cw] of [
    [w * 0.16, h * 0.14, 190],
    [w * 0.55, h * 0.09, 240],
    [w * 0.84, h * 0.2, 160],
  ]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Parallax ridge silhouettes behind the playable ground. Each layer is a
// narrow band hugging the horizon — never a wall filling the screen — with
// its own crest height so the layers read as separate ranges.
export function drawRidges(ctx, cam, terrain, w, h) {
  const colors = ['#4a3a6e', '#5d4678', '#715a86'];
  const crestBase = [470, 395, 320];
  terrain.ridges.forEach((pts, layer) => {
    const parallax = 0.25 + layer * 0.22;
    const crest = crestBase[layer];
    const floorY = crest + 78;
    ctx.fillStyle = colors[layer];
    ctx.beginPath();
    ctx.moveTo(-4, floorY);
    for (const pt of pts) {
      const sx = (pt.x - cam.x * parallax) * cam.scale * 0.9 + w * 0.5;
      const sy = crest - pt.y * 0.8;
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(w + 4, floorY);
    ctx.closePath();
    ctx.fill();
    // Snow along the crest: a light stroke following the ridge line.
    ctx.strokeStyle = 'rgba(240, 236, 255, 0.8)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    let started = false;
    for (const pt of pts) {
      const sx = (pt.x - cam.x * parallax) * cam.scale * 0.9 + w * 0.5;
      const sy = crest - pt.y * 0.8;
      if (!started) {
        ctx.moveTo(sx, sy);
        started = true;
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
  });
}

// The playable ground: snow polygon, river, pines, rescue strip with lights.
export function drawGround(ctx, cam, terrain, w, h, time) {
  const S = cam.scale;
  const toX = (wx) => (wx - cam.x) * S + w / 2;
  const toY = (wy) => h * 0.8 - (wy - cam.y) * S;

  // Snow slope.
  const snow = ctx.createLinearGradient(0, h * 0.3, 0, h);
  snow.addColorStop(0, '#f4eefb');
  snow.addColorStop(0.55, '#ddd3ef');
  snow.addColorStop(1, '#8d7fb0');
  ctx.fillStyle = snow;
  ctx.beginPath();
  ctx.moveTo(-4, h + 4);
  const x0 = cam.x - w / 2 / S - 20;
  const x1 = cam.x + w / 2 / S + 20;
  for (let wx = x0; wx <= x1; wx += 8) {
    ctx.lineTo(toX(wx), toY(terrain.heightAt(wx)));
  }
  ctx.lineTo(w + 4, h + 4);
  ctx.closePath();
  ctx.fill();

  // Rock outcrops on the steep parts.
  ctx.fillStyle = 'rgba(94, 78, 122, 0.5)';
  for (let wx = Math.floor(x0 / 130) * 130; wx <= x1; wx += 130) {
    const gy = terrain.heightAt(wx);
    const gy2 = terrain.heightAt(wx + 60);
    if (Math.abs(gy - gy2) > 22) {
      ctx.beginPath();
      ctx.moveTo(toX(wx), toY(gy));
      ctx.lineTo(toX(wx + 34), toY(gy) - 14);
      ctx.lineTo(toX(wx + 70), toY(gy2));
      ctx.closePath();
      ctx.fill();
    }
  }

  // The river winding through the valley floor.
  const riverY = terrain.heightAt(terrain.riverX);
  ctx.strokeStyle = '#7fb6d9';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let wx = x0; wx <= x1; wx += 10) {
    const bend = Math.sin(wx * 0.004) * 14;
    const y = toY(terrain.heightAt(wx) + bend * 0.12 - 6);
    if (wx === x0) ctx.moveTo(toX(wx), y);
    else ctx.lineTo(toX(wx), y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let wx = x0; wx <= x1; wx += 10) {
    const bend = Math.sin(wx * 0.004) * 14;
    const y = toY(terrain.heightAt(wx) + bend * 0.12 - 10);
    if (wx === x0) ctx.moveTo(toX(wx), y);
    else ctx.lineTo(toX(wx), y);
  }
  ctx.stroke();
  void riverY;

  // Pine trees.
  for (const tree of terrain.trees) {
    if (tree.x < x0 || tree.x > x1) continue;
    const tx = toX(tree.x);
    const ty = toY(tree.h);
    const s = tree.s;
    ctx.fillStyle = tree.tint > 0.5 ? '#1d3a2a' : '#274d33';
    ctx.beginPath();
    ctx.moveTo(tx, ty - 34 * s);
    ctx.lineTo(tx - 11 * s, ty - 8 * s);
    ctx.lineTo(tx - 5 * s, ty - 8 * s);
    ctx.lineTo(tx - 14 * s, ty + 4 * s);
    ctx.lineTo(tx + 14 * s, ty + 4 * s);
    ctx.lineTo(tx + 5 * s, ty - 8 * s);
    ctx.lineTo(tx + 11 * s, ty - 8 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(244, 238, 251, 0.85)';
    ctx.beginPath();
    ctx.moveTo(tx, ty - 34 * s);
    ctx.lineTo(tx - 7 * s, ty - 16 * s);
    ctx.lineTo(tx + 7 * s, ty - 16 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4a3423';
    ctx.fillRect(tx - 2 * s, ty - 2 * s, 4 * s, 5 * s);
  }

  // Rescue strip: dark tarmac, centre dashes, edge lights, windsock.
  const stripY = toY(terrain.stripH);
  ctx.fillStyle = '#3a3547';
  ctx.fillRect(toX(terrain.stripX0), stripY - 4, (terrain.stripX1 - terrain.stripX0) * S, 7);
  ctx.fillStyle = '#f7f3e8';
  for (let wx = terrain.stripX0 + 20; wx < terrain.stripX1 - 10; wx += 46) {
    ctx.fillRect(toX(wx), stripY - 2, 22 * S * 0.55, 3);
  }
  // Edge lights, warm amber, pulsing gently.
  const pulse = 0.65 + 0.35 * Math.sin(time * 2.4);
  for (let wx = terrain.stripX0; wx <= terrain.stripX1; wx += 50) {
    for (const edge of [-6, 4]) {
      ctx.fillStyle = `rgba(255, 176, 66, ${pulse})`;
      ctx.beginPath();
      ctx.arc(toX(wx), stripY + edge, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Threshold markers + windsock pole.
  ctx.fillStyle = '#ff5a3c';
  ctx.fillRect(toX(terrain.stripX0) - 2, stripY - 12, 5, 12);
  ctx.fillRect(toX(terrain.stripX1) - 3, stripY - 12, 5, 12);
  ctx.strokeStyle = '#e8e2d4';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(toX(terrain.stripX1 + 40), stripY);
  ctx.lineTo(toX(terrain.stripX1 + 40), stripY - 42);
  ctx.stroke();
  ctx.fillStyle = '#ff8c42';
  ctx.beginPath();
  ctx.moveTo(toX(terrain.stripX1 + 40), stripY - 42);
  ctx.lineTo(toX(terrain.stripX1 + 40) + 26, stripY - 36);
  ctx.lineTo(toX(terrain.stripX1 + 40), stripY - 30);
  ctx.closePath();
  ctx.fill();
}
