/**
 * The bottle of the app's Water tab (src/components/water-bottle.tsx), upright:
 * a spring-driven water level with a waving surface that splashes when it rises.
 * The page has no gravity sensor, so the water doesn't slosh with tilt.
 */

export const BOTTLE_BODY =
  'M48 26 H72 V38 C72 46 108 50 108 70 V222 C108 233 100 240 89 240 H31 ' +
  'C20 240 12 233 12 222 V70 C12 50 48 46 48 38 Z';

const BOTTLE_W = 120;
const BOTTOM = 240;
// Water line at 100%: the top of the bottle's shoulders.
const TOP = 70;
const BASE_AMPLITUDE = 2.2;
const SPLASH_AMPLITUDE = 7;
// Matches withSpring({ damping: 16, stiffness: 70 }) in the app.
const STIFFNESS = 70;
const DAMPING = 16;

/** Empty sits just below the bottom so the wave crests stay hidden. */
const levelToY = (share: number) => BOTTOM + 8 - share * (BOTTOM + 8 - TOP);

function wavePath(levelY: number, amplitude: number, phase: number, lift: number) {
  let d = '';
  for (let x = -8; x <= BOTTLE_W + 8; x += 4) {
    const y = levelY - lift - amplitude * Math.sin((x / BOTTLE_W) * Math.PI * 2.4 + phase);
    d += `${x === -8 ? 'M' : 'L'}${x} ${y.toFixed(2)} `;
  }
  return `${d}L${BOTTLE_W + 8} ${BOTTOM + 20} L-8 ${BOTTOM + 20} Z`;
}

export function waterBottle(svg: SVGSVGElement) {
  const front = svg.querySelector<SVGPathElement>('[data-wave="front"]')!;
  const back = svg.querySelector<SVGPathElement>('[data-wave="back"]')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let target = 0;
  let level = 0;
  let velocity = 0;
  let splash = 0;
  let phase = 0;
  let frame = 0;
  let last = 0;
  let visible = false;

  const draw = () => {
    const y = levelToY(level);
    front.setAttribute('d', wavePath(y, BASE_AMPLITUDE + splash, phase, 0));
    back.setAttribute('d', wavePath(y, BASE_AMPLITUDE + splash * 0.8, phase * 0.8 + Math.PI, 3));
  };

  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    velocity += ((target - level) * STIFFNESS - velocity * DAMPING) * dt;
    level += velocity * dt;
    splash *= Math.exp(-dt * 1.6);
    phase = (phase + dt * (2.2 + splash * 0.4)) % (Math.PI * 200);
    draw();
    frame = visible ? requestAnimationFrame(tick) : 0;
  };

  const start = () => {
    if (frame || still) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };

  // Animate only while the bottle is on screen (a hidden tab never intersects).
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  }).observe(svg);

  return {
    /** Sets the fill to `share` of the goal (clamped to 0–1). */
    fill(share: number) {
      const next = Math.min(Math.max(share, 0), 1);
      if (next > target) splash = SPLASH_AMPLITUDE;
      target = next;
      if (still) level = target;
      draw();
    },
  };
}
