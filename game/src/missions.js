// missions.js — the three rescue objectives: five orange rings, three supply
// drops onto marked pads, then a short-strip landing with a casualty aboard.
// Scoring: rings 100 each, on-target crates 150 each, landing bonus from
// time left and airframe condition.

export function createMissions(terrain) {
  // Rings hang a fixed height above the valley floor so every ring is
  // always flyable, whatever the hills below it do.
  const ringXs = [900, 1450, 1950, 2450, 2920];
  const ringClearance = [62, 78, 58, 82, 66];
  const rings = ringXs.map((x, i) => ({
    x,
    alt: terrain.heightAt(x) + ringClearance[i],
    r: 26,
    passed: false,
  }));

  const pads = [3400, 3800, 4200].map((x) => ({
    x,
    alt: terrain.heightAt(x),
    hit: false,
    missed: false,
  }));

  return {
    phase: 'rings', // rings -> drop -> landing -> done
    rings,
    pads,
    crates: 3, // crates still aboard
    falling: [], // crates in the air: {x, alt, vy}
    landedCrates: [], // crates on the ground: {x, alt, hit}
    score: 0,
    ringsPassed: 0,
    cratesHit: 0,
    elapsed: 0,
    timeBonus: 0,
    message: 'MISSION 1 — Fly through all 5 orange rings',
    messageUntil: 0,
  };
}

function setMessage(m, text, seconds, now) {
  m.message = text;
  m.messageUntil = now + seconds;
}

// Drop one crate from the plane. It keeps the plane's forward speed, so the
// pilot must release early — the crate travels on while it falls.
export function dropCrate(m, plane) {
  if (m.phase !== 'drop' || m.crates <= 0) return false;
  m.crates -= 1;
  m.falling.push({ x: plane.x + 10, alt: plane.alt - 6, vy: 0, vx: plane.vx });
  return true;
}

// One step of mission logic. events: {beep, thud} callbacks for sound.
export function updateMissions(m, plane, dt, terrain, events) {
  m.elapsed += dt;

  if (m.phase === 'rings') {
    for (const ring of m.rings) {
      if (ring.passed) continue;
      const dx = plane.x - ring.x;
      const dy = plane.alt - ring.alt;
      if (Math.abs(dx) < 26 && Math.abs(dy) < ring.r) {
        ring.passed = true;
        m.ringsPassed += 1;
        m.score += 100;
        if (events.beep) events.beep(880, 0.12);
        if (m.ringsPassed === m.rings.length) {
          m.phase = 'drop';
          setMessage(
            m,
            'MISSION 2 — Drop 3 crates on the marked pads (SPACE / click)',
            6,
            m.elapsed,
          );
          if (events.beep) events.beep(1320, 0.2);
        } else {
          setMessage(m, `Ring ${m.ringsPassed}/5 — nice flying`, 2.5, m.elapsed);
        }
      } else if (dx > 40 && !ring.passed) {
        // Flew past a ring without threading it: it stays open behind you.
        setMessage(m, 'Missed a ring — turn back or press on', 2.5, m.elapsed);
      }
    }
  }

  if (m.phase === 'drop') {
    for (const crate of m.falling) {
      crate.vy += 40 * dt;
      crate.vx *= Math.max(0, 1 - 0.9 * dt); // the chute bites the air
      crate.x += crate.vx * dt;
      crate.alt -= crate.vy * dt;
      const ground = terrain.heightAt(crate.x) + 2;
      if (crate.alt <= ground) {
        crate.alt = ground;
        let hit = false;
        for (const pad of m.pads) {
          if (!pad.hit && Math.abs(crate.x - pad.x) <= 34) {
            pad.hit = true;
            hit = true;
          }
        }
        if (hit) {
          m.cratesHit += 1;
          m.score += 150;
          setMessage(m, `Crate on target! ${m.cratesHit}/3 pads supplied`, 3, m.elapsed);
          if (events.beep) events.beep(1040, 0.15);
        } else {
          setMessage(m, 'Crate missed the pad — it is lost in the snow', 3, m.elapsed);
          if (events.thud) events.thud();
        }
        m.landedCrates.push({ x: crate.x, alt: crate.alt, hit });
        m.falling.splice(m.falling.indexOf(crate), 1);
      }
    }
    // Every pad left is behind the plane: the sortie is not stuck — say so,
    // so the pilot knows dropping the rest advances the mission.
    if (m.crates > 0 && m.falling.length === 0) {
      const anyAhead = m.pads.some((p) => !p.hit && p.x > plane.x - 40);
      if (!anyAhead && m.elapsed > m.messageUntil) {
        setMessage(m, 'No pads ahead — drop your remaining crates to press on', 4, m.elapsed);
      }
    }
    const resolved = m.cratesHit + m.landedCrates.filter((c) => !c.hit).length;
    if (m.crates === 0 && m.falling.length === 0 && resolved >= 3) {
      m.phase = 'landing';
      setMessage(
        m,
        'MISSION 3 — Land on the lit strip. Gentle touchdown, under 45 m/s',
        7,
        m.elapsed,
      );
      if (events.beep) events.beep(1320, 0.25);
    }
  }

  if (m.phase === 'landing' && plane.landed) {
    m.phase = 'done';
    const timeBonus = Math.max(0, Math.round(600 - m.elapsed * 2));
    const conditionBonus = Math.round((100 - plane.damage) * 2);
    m.timeBonus = timeBonus;
    m.score += timeBonus + conditionBonus;
    setMessage(
      m,
      `RESCUE COMPLETE — casualty aboard, score ${m.score}`,
      999,
      m.elapsed,
    );
    if (events.beep) events.beep(1560, 0.4);
  }
}

// Draw rings, pads, falling and landed crates.
export function drawMissions(ctx, cam, m, time) {
  const S = cam.scale;
  const toX = (wx) => (wx - cam.x) * S + 1280 / 2;
  const toY = (wy) => 800 * 0.8 - (wy - cam.y) * S;

  // Rings: glowing orange torus, green once passed.
  for (const ring of m.rings) {
    const rx = toX(ring.x);
    const ry = toY(ring.alt);
    if (rx < -80 || rx > 1360) continue;
    const r = ring.r * S * 0.9;
    const glow = ctx.createRadialGradient(rx, ry, r * 0.4, rx, ry, r * 1.5);
    glow.addColorStop(0, 'rgba(255, 140, 40, 0)');
    glow.addColorStop(0.8, ring.passed ? 'rgba(80, 255, 140, 0.25)' : 'rgba(255, 140, 40, 0.3)');
    glow.addColorStop(1, 'rgba(255, 140, 40, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ring.passed ? '#3dff7a' : '#ff8c28';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rx, ry, r - 5, 0, Math.PI * 2);
    ctx.stroke();
    if (ring.passed) {
      ctx.strokeStyle = '#3dff7a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(rx - 12, ry);
      ctx.lineTo(rx - 3, ry + 10);
      ctx.lineTo(rx + 14, ry - 10);
      ctx.stroke();
    } else {
      // Chevrons pointing the way through.
      const pulse = 0.6 + 0.4 * Math.sin(time * 4);
      ctx.fillStyle = `rgba(255, 200, 120, ${pulse})`;
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('›', rx, ry - r - 8);
    }
  }

  // Drop pads: white H in an orange ring on the snow.
  for (const pad of m.pads) {
    const px = toX(pad.x);
    const py = toY(pad.alt);
    if (px < -120 || px > 1400) continue;
    ctx.strokeStyle = pad.hit ? '#3dff7a' : '#ff8c28';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(px, py - 4, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = pad.hit ? 'rgba(61, 255, 122, 0.25)' : 'rgba(255, 140, 40, 0.22)';
    ctx.beginPath();
    ctx.arc(px, py - 4, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pad.hit ? '#1d7a3a' : '#8a4a12';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('H', px, py + 5);
    if (!pad.hit) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3);
      ctx.strokeStyle = `rgba(255, 140, 40, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py - 4, 44 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Falling crates with a small orange chute.
  for (const crate of m.falling) {
    const cx = toX(crate.x);
    const cy = toY(crate.alt);
    ctx.fillStyle = '#ff8c28';
    ctx.beginPath();
    ctx.arc(cx, cy - 26, 16, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#ff8c28';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy - 24);
    ctx.lineTo(cx - 6, cy - 8);
    ctx.moveTo(cx + 14, cy - 24);
    ctx.lineTo(cx + 6, cy - 8);
    ctx.stroke();
    drawCrate(ctx, cx, cy, 11);
  }

  // Landed crates.
  for (const crate of m.landedCrates) {
    const cx = toX(crate.x);
    const cy = toY(crate.alt);
    drawCrate(ctx, cx, cy, 10);
    if (crate.hit) {
      ctx.fillStyle = '#3dff7a';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓', cx, cy - 14);
    }
  }
}

function drawCrate(ctx, cx, cy, half) {
  ctx.fillStyle = '#8a5a2e';
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
  ctx.strokeStyle = '#5d3a18';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.moveTo(cx + half, cy - half);
  ctx.lineTo(cx - half, cy + half);
  ctx.stroke();
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(cx - 4, cy - 4, 8, 8);
}
