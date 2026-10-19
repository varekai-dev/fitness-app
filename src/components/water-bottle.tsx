import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useId, useRef } from 'react';
import Animated, {
  SensorType,
  useAnimatedProps,
  useAnimatedSensor,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Drawing coordinates. The bottle sits right of a ruler.
const VIEW_W = 150;
const VIEW_H = 244;
const BOTTLE_X = 30;
const BOTTLE_W = 120;
const BOTTOM = 240;
// Water line at 100% — the top of the bottle's shoulders.
const TOP = 70;
const BODY =
  'M48 26 H72 V38 C72 46 108 50 108 70 V222 C108 233 100 240 89 240 H31 ' +
  'C20 240 12 233 12 222 V70 C12 50 48 46 48 38 Z';
const TICKS = 24;

// Surface physics: an underdamped spring turns the surface towards the tilt.
const TILT_STIFFNESS = 70;
const TILT_DAMPING = 3.2;
const BASE_AMPLITUDE = 2.2;
const SPLASH_AMPLITUDE = 7;
// Below this share of gravity in the screen plane the phone counts as lying
// flat, and the water eases back to level.
const FLAT_THRESHOLD = 0.3;

/** The bottle's inside as a polygon, sampling BODY's curves. */
const OUTLINE = (() => {
  const pts: [number, number][] = [
    [48, 26],
    [72, 26],
    [72, 38],
  ];
  const curve = (...c: [number, number][]) => {
    const [p0, p1, p2, p3] = [pts[pts.length - 1], ...c];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const u = 1 - t;
      const at = (k: 0 | 1) =>
        u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k];
      pts.push([at(0), at(1)]);
    }
  };
  curve([72, 46], [108, 50], [108, 70]);
  pts.push([108, 222]);
  curve([108, 233], [100, 240], [89, 240]);
  pts.push([31, 240]);
  curve([20, 240], [12, 233], [12, 222]);
  pts.push([12, 70]);
  curve([12, 50], [48, 46], [48, 38]);
  return { xs: pts.map((p) => p[0]), ys: pts.map((p) => p[1]) };
})();
const OUT_XS = OUTLINE.xs;
const OUT_YS = OUTLINE.ys;
const CENTER_X = BOTTLE_W / 2;
const CENTER_Y = (TOP + BOTTOM) / 2;

/** Area of the bottle on the deep side of the line `x·nx + y·ny = c`. */
function areaBeyond(nx: number, ny: number, c: number) {
  'worklet';
  const n = OUT_XS.length;
  let area = 0;
  let firstX = 0;
  let firstY = 0;
  let lastX = 0;
  let lastY = 0;
  let count = 0;
  const add = (x: number, y: number) => {
    if (count === 0) {
      firstX = x;
      firstY = y;
    } else area += lastX * y - x * lastY;
    lastX = x;
    lastY = y;
    count++;
  };
  // Sutherland–Hodgman against one half-plane, with the shoelace sum inline.
  for (let i = 0; i < n; i++) {
    const ax = OUT_XS[i];
    const ay = OUT_YS[i];
    const bx = OUT_XS[(i + 1) % n];
    const by = OUT_YS[(i + 1) % n];
    const da = ax * nx + ay * ny - c;
    const db = bx * nx + by * ny - c;
    if (da >= 0) add(ax, ay);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      add(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  if (count < 3) return 0;
  area += lastX * firstY - firstX * lastY;
  return Math.abs(area) / 2;
}

/**
 * Where the surface sits (as `c` in `x·nx + y·ny = c`) when "down" is (nx, ny),
 * so the water keeps the area it has standing upright at `levelY`.
 */
function surfaceOffset(nx: number, ny: number, levelY: number) {
  'worklet';
  const volume = areaBeyond(0, 1, levelY);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < OUT_XS.length; i++) {
    const d = OUT_XS[i] * nx + OUT_YS[i] * ny;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  // Empty: sink the surface below the lowest point so the wave crests stay hidden.
  if (volume <= 0) return hi + 8;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (areaBeyond(nx, ny, mid) > volume) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The water as a wavy surface line perpendicular to "down" at `angle`, filled to beyond the bottle. */
function wavePath(levelY: number, angle: number, amplitude: number, phase: number, lift: number) {
  'worklet';
  const nx = Math.sin(angle);
  const ny = Math.cos(angle);
  const c = surfaceOffset(nx, ny, levelY) - lift;
  // The surface point closest to the bottle's centre, and the direction along the surface.
  const along = c - (CENTER_X * nx + CENTER_Y * ny);
  const ox = CENTER_X + along * nx;
  const oy = CENTER_Y + along * ny;
  const tx = -ny;
  const ty = nx;
  const reach = 200;
  const deep = 400;
  let xs: number[] = [];
  let ys: number[] = [];
  for (let s = -reach; s <= reach; s += 8) {
    const wave = amplitude * Math.sin(((s + reach) / BOTTLE_W) * Math.PI * 2.4 + phase);
    xs.push(ox + s * tx - wave * nx);
    ys.push(oy + s * ty - wave * ny);
  }
  xs.push(ox + reach * tx + deep * nx, ox - reach * tx + deep * nx);
  ys.push(oy + reach * ty + deep * ny, oy - reach * ty + deep * ny);
  // Trim to the bottle's box: the fill gradient spans the shape's bounds, so
  // it then runs from the surface to the bottom as on an upright bottle.
  for (const [ax, ay, k] of [
    [1, 0, 0],
    [-1, 0, -BOTTLE_W],
    [0, -1, -VIEW_H],
  ] as const) {
    const cx: number[] = [];
    const cy: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      const j = (i + 1) % xs.length;
      const da = xs[i] * ax + ys[i] * ay - k;
      const db = xs[j] * ax + ys[j] * ay - k;
      if (da >= 0) {
        cx.push(xs[i]);
        cy.push(ys[i]);
      }
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        cx.push(xs[i] + (xs[j] - xs[i]) * t);
        cy.push(ys[i] + (ys[j] - ys[i]) * t);
      }
    }
    xs = cx;
    ys = cy;
  }
  // An empty bottle trims every point away, and a bare "Z" crashes the native SVG parser.
  if (xs.length === 0) return 'M0 0Z';
  let d = '';
  for (let i = 0; i < xs.length; i++)
    d += `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(2)} ${ys[i].toFixed(2)} `;
  return `${d}Z`;
}

/** The upright water line for a fill of `share` (0–1). Empty sits just below the bottom so the wave crests stay hidden. */
const levelToY = (share: number) => {
  'worklet';
  return BOTTOM + 8 - share * (BOTTOM + 8 - TOP);
};

/**
 * A bottle filled to `progress` (0–1, clamped) with a living water surface:
 * it waves gently, splashes when `progress` grows and sloshes as the phone tilts.
 * `pace` (0–1) marks on the ruler and across the bottle where the level should be by now.
 */
export function WaterBottle({
  progress,
  height,
  pace,
}: {
  progress: number;
  height: number;
  pace?: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const target = Math.min(Math.max(progress, 0), 1);
  const paceY = pace != null && pace > 0 ? levelToY(Math.min(pace, 1)) : null;
  const ahead = paceY != null && target >= Math.min(pace ?? 0, 1);
  const level = useSharedValue(target);
  const phase = useSharedValue(0);
  // Direction of "down" on screen, in radians from straight down.
  const angle = useSharedValue(0);
  const angleVelocity = useSharedValue(0);
  const splash = useSharedValue(0);
  const gravity = useAnimatedSensor(SensorType.GRAVITY);
  const previous = useRef(target);

  useEffect(() => {
    level.set(withSpring(target, { damping: 16, stiffness: 70 }));
    if (target > previous.current) {
      splash.set(SPLASH_AMPLITUDE);
      angleVelocity.set(angleVelocity.get() + 0.9);
    }
    previous.current = target;
  }, [target, level, splash, angleVelocity]);

  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    const dt = Math.min((timeSincePreviousFrame ?? 16) / 1000, 0.05);
    // The gravity vector in device axes (x right, y up) on both platforms;
    // on screen y points down. The surface stays level with the world, so it
    // turns against the phone whatever the tilt, even lying on its side.
    const g = gravity.sensor.get();
    const magnitude = Math.hypot(g.x, g.y, g.z) || 1;
    const planar = Math.hypot(g.x, g.y);
    // Lying flat leaves no clear "down" on screen: ease towards upright.
    const k = Math.min(planar / magnitude / FLAT_THRESHOLD, 1);
    const sx = planar > 0 ? (g.x / planar) * k : 0;
    const sy = planar > 0 ? (-g.y / planar) * k + (1 - k) : 1;
    const goal = Math.atan2(sx, sy);

    // Shortest way round, so turning past upside down doesn't spin the water.
    let diff = goal - angle.get();
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const accel = diff * TILT_STIFFNESS - angleVelocity.get() * TILT_DAMPING;
    const velocity = angleVelocity.get() + accel * dt;
    angleVelocity.set(velocity);
    const next = angle.get() + velocity * dt;
    angle.set(Math.atan2(Math.sin(next), Math.cos(next)));
    // Fast sloshing whips up the waves; they settle back over ~1 s.
    splash.set(Math.min(splash.get() * Math.exp(-dt * 1.6) + Math.abs(velocity) * dt * 6, 12));
    phase.set((phase.get() + dt * (2.2 + splash.get() * 0.4)) % (Math.PI * 200));
  }, false);

  // Only animate while the screen is visible.
  useFocusEffect(
    useCallback(() => {
      frame.setActive(true);
      return () => frame.setActive(false);
    }, [frame]),
  );

  const waterY = () => {
    'worklet';
    return levelToY(level.get());
  };

  const frontProps = useAnimatedProps(() => ({
    d: wavePath(waterY(), angle.get(), BASE_AMPLITUDE + splash.get(), phase.get(), 0),
  }));
  const backProps = useAnimatedProps(() => ({
    d: wavePath(
      waterY(),
      angle.get(),
      BASE_AMPLITUDE + splash.get() * 0.8,
      phase.get() * 0.8 + Math.PI,
      3,
    ),
  }));

  return (
    <Svg width={(height * VIEW_W) / VIEW_H} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
      <Defs>
        <ClipPath id={`body${id}`}>
          <Path d={BODY} />
        </ClipPath>
        <LinearGradient id={`water${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accentGradientEnd} />
          <Stop offset="0.45" stopColor={colors.accent} />
          <Stop offset="1" stopColor="#9DB52E" />
        </LinearGradient>
      </Defs>

      {Array.from({ length: TICKS + 1 }, (_, i) => {
        const y = TOP + ((BOTTOM - TOP) * i) / TICKS;
        const long = i % 4 === 0;
        return (
          <Rect
            key={i}
            x={long ? 0 : 6}
            y={y - 0.75}
            width={long ? 16 : 10}
            height={1.5}
            rx={0.75}
            fill={long ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.16)'}
          />
        );
      })}

      <G x={BOTTLE_X}>
        <Rect x={44} y={0} width={32} height={22} rx={6} fill={colors.accent} />
        {[52, 58, 64, 70].map((x) => (
          <Rect key={x} x={x - 0.75} y={4} width={1.5} height={14} rx={0.75} fill="#9DB52E" />
        ))}
        <Path d={BODY} fill="rgba(255,255,255,0.05)" />
        <G clipPath={`url(#body${id})`}>
          <AnimatedPath animatedProps={backProps} fill={colors.accentGradientEnd} opacity={0.45} />
          <AnimatedPath animatedProps={frontProps} fill={`url(#water${id})`} />
          <Rect x={20} y={76} width={7} height={140} rx={3.5} fill="rgba(255,255,255,0.14)" />
          {paceY != null && (
            <Line
              x1={0}
              y1={paceY}
              x2={BOTTLE_W}
              y2={paceY}
              stroke={ahead ? 'rgba(20,20,20,0.45)' : 'rgba(255,255,255,0.6)'}
              strokeWidth={2.5}
              strokeDasharray="7 6"
            />
          )}
        </G>
        <Path d={BODY} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={2.5} />
      </G>

      {paceY != null && (
        // Points from the ruler at the level that should be drunk by now.
        <Path
          d={`M${BOTTLE_X - 2} ${paceY} L${BOTTLE_X - 16} ${paceY - 8} V${paceY + 8} Z`}
          fill={colors.text}
        />
      )}
    </Svg>
  );
}
