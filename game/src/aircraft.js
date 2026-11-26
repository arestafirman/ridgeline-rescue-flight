// aircraft.js — the STOL bush plane on skis: arcade flight physics
// (throttle, lift, drag, wind gusts, stall sink) and its drawn shape.

export function createPlane() {
  return {
    x: 180, // metres along the valley
    alt: 175, // metres above sea level (terrain sits ~40-200)
    vx: 36, // forward speed m/s
    vy: 0, // vertical speed m/s
    pitch: 0, // radians, positive = nose up
    throttle: 0.62, // 0..1
    fuel: 100, // percent, refills only on the strip
    damage: 0, // percent, 100 = wrecked
    prop: 0, // propeller animation angle
    crashed: false,
    landed: false,
    onGround: false, // rolling on the valley floor after a rough touchdown
    touchdownVy: 0,
  };
}

// One physics step. input: {throttleUp, throttleDown, pitchUp, pitchDown}.
// Returns an event string ('crash' | 'hard-landing' | 'landed' | null).
export function updatePlane(p, input, dt, terrain, wind) {
  if (p.crashed || p.landed) return null;

  if (input.throttleUp) p.throttle = Math.min(1, p.throttle + dt * 0.55);
  if (input.throttleDown) p.throttle = Math.max(0, p.throttle - dt * 0.55);
  if (input.pitchUp) p.pitch = Math.min(0.5, p.pitch + dt * 0.85);
  if (input.pitchDown) p.pitch = Math.max(-0.42, p.pitch - dt * 0.85);
  // Hands off the stick: the nose settles back toward level.
  p.pitch += (0 - p.pitch) * Math.min(1, dt * 0.7);

  // Speed chases the throttle, climbing bleeds speed, drag caps it.
  const targetSpeed = 16 + p.throttle * 48;
  p.vx += (targetSpeed - p.vx) * Math.min(1, dt * 0.45);
  p.vx -= Math.max(0, Math.sin(p.pitch)) * p.vx * 0.22 * dt;
  p.vx += wind.gust * dt * 0.6;
  p.vx = Math.max(8, Math.min(68, p.vx));

  // Lift follows pitch and speed; below ~20 m/s the wing stops flying.
  const climbRate = Math.sin(p.pitch) * p.vx * 0.85 + (p.throttle - 0.34) * 9;
  p.vy += (climbRate - p.vy) * Math.min(1, dt * 1.4);
  if (p.vx < 20) p.vy -= (20 - p.vx) * 0.5 * dt;
  p.vy += wind.vertical * dt;

  p.x += p.vx * dt;
  p.alt += p.vy * dt;
  p.prop += dt * (6 + p.throttle * 26);

  // Fuel: full throttle drinks it, idling sips it. Empty tank = glider.
  p.fuel -= (0.1 + p.throttle * 0.26) * dt;
  if (p.fuel <= 0) {
    p.fuel = 0;
    p.throttle = 0;
  }

  // Valley walls: the far ridge is a hard stop, not a wrap.
  if (p.x > 6050) {
    p.x = 6050;
    p.vx = Math.min(p.vx, 12);
  }

  // Ground contact.
  const ground = terrain.heightAt(p.x) + 2;
  if (p.alt <= ground) {
    const onStrip = p.x >= terrain.stripX0 && p.x <= terrain.stripX1;
    p.touchdownVy = p.vy;
    if (onStrip && p.vy > -8 && p.vx <= 44) {
      p.alt = ground;
      p.landed = true;
      p.onGround = true;
      p.vy = 0;
      p.vx = Math.max(0, p.vx - 30 * dt);
      return 'landed';
    }
    if (p.onGround) {
      // Already rolling: just roll out along the ground, no fresh damage.
      p.alt = ground;
      p.vy = 0;
      p.vx = Math.max(0, p.vx - 8 * dt);
      if (p.vx < 3) {
        if (onStrip) {
          p.landed = true;
          return 'landed';
        }
        p.crashed = true;
        p.damage = 100;
        return 'crash';
      }
      return 'rollout';
    }
    if (p.vy > -11 && p.vx <= 46 && !onStrip) {
      // Rough field landing: survivable, but the skis take damage. No bounce:
      // a slow touchdown stays down and rolls out instead of hopping back
      // into the air over rising ground.
      p.alt = ground;
      p.onGround = true;
      p.damage = Math.min(100, p.damage + Math.abs(p.vy) * 5 + 8);
      p.vy = 0;
      p.vx *= 0.65;
      return 'hard-landing';
    }
    p.alt = ground;
    p.crashed = true;
    p.damage = 100;
    return 'crash';
  }
  p.onGround = false;
  return null;
}

// Draw the plane side-on at screen (sx, sy), nose to the right.
export function drawPlane(ctx, sx, sy, plane, time) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-plane.pitch * 0.8);

  // Skis.
  ctx.fillStyle = '#2c2a33';
  ctx.fillRect(-26, 12, 34, 4);
  ctx.fillRect(4, 12, 30, 4);
  ctx.strokeStyle = '#2c2a33';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, 12);
  ctx.lineTo(-8, 2);
  ctx.moveTo(18, 12);
  ctx.lineTo(12, 2);
  ctx.stroke();

  // Fuselage: rescue orange belly, white top, red stripe.
  ctx.fillStyle = '#e8542f';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7f2e7';
  ctx.beginPath();
  ctx.ellipse(-2, -3, 30, 7, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#c22e1f';
  ctx.fillRect(-30, -2, 60, 3);

  // Cabin window.
  ctx.fillStyle = '#9fd8ef';
  ctx.beginPath();
  ctx.ellipse(10, -5, 9, 5, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.ellipse(8, -7, 4, 2, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // High wing + strut, tail.
  ctx.fillStyle = '#f7f2e7';
  ctx.fillRect(-12, -22, 26, 5);
  ctx.fillStyle = '#e8542f';
  ctx.fillRect(-12, -22, 26, 2);
  ctx.strokeStyle = '#8a8a92';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-2, -17);
  ctx.lineTo(2, 0);
  ctx.stroke();
  ctx.fillStyle = '#c22e1f';
  ctx.beginPath();
  ctx.moveTo(-32, -2);
  ctx.lineTo(-40, -20);
  ctx.lineTo(-32, -20);
  ctx.lineTo(-26, -2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f7f2e7';
  ctx.fillRect(-40, -4, 16, 4);

  // Spinning prop.
  ctx.strokeStyle = 'rgba(40, 36, 48, 0.85)';
  ctx.lineWidth = 3;
  const a = plane.prop;
  ctx.beginPath();
  ctx.moveTo(34 + Math.cos(a) * 13, Math.sin(a) * 13);
  ctx.lineTo(34 - Math.cos(a) * 13, -Math.sin(a) * 13);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(34 + Math.cos(a + 1.57) * 13, Math.sin(a + 1.57) * 13);
  ctx.lineTo(34 - Math.cos(a + 1.57) * 13, -Math.sin(a + 1.57) * 13);
  ctx.stroke();
  ctx.fillStyle = '#2c2a33';
  ctx.beginPath();
  ctx.arc(34, 0, 4, 0, Math.PI * 2);
  ctx.fill();

  // Navigation lights: red port, green starboard, blinking white strobe.
  const blink = Math.sin(time * 6) > 0;
  ctx.fillStyle = '#ff2e2e';
  ctx.beginPath();
  ctx.arc(-34, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2eff5e';
  ctx.beginPath();
  ctx.arc(30, 8, 3, 0, Math.PI * 2);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-40, -20, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
