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
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

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

// Surface physics: an underdamped spring pulls the slope towards the tilt.
const TILT_STIFFNESS = 70;
const TILT_DAMPING = 3.2;
const MAX_SLOPE = 0.55;
const BASE_AMPLITUDE = 2.2;
const SPLASH_AMPLITUDE = 7;

function wavePath(level: number, slope: number, amplitude: number, phase: number) {
  'worklet';
  let d = '';
  for (let x = 0; x <= BOTTLE_W; x += 6) {
    const y =
      level +
      slope * (x - BOTTLE_W / 2) +
      amplitude * Math.sin((x / BOTTLE_W) * Math.PI * 2.4 + phase);
    d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)} `;
  }
  return `${d}L${BOTTLE_W} ${VIEW_H} L0 ${VIEW_H} Z`;
}

/**
 * A bottle filled to `progress` (0–1, clamped) with a living water surface:
 * it waves gently, splashes when `progress` grows and sloshes as the phone tilts.
 */
export function WaterBottle({ progress, height }: { progress: number; height: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const target = Math.min(Math.max(progress, 0), 1);
  const level = useSharedValue(target);
  const phase = useSharedValue(0);
  const slope = useSharedValue(0);
  const slopeVelocity = useSharedValue(0);
  const splash = useSharedValue(0);
  const gravity = useAnimatedSensor(SensorType.GRAVITY);
  const previous = useRef(target);

  useEffect(() => {
    level.set(withSpring(target, { damping: 16, stiffness: 70 }));
    if (target > previous.current) {
      splash.set(SPLASH_AMPLITUDE);
      slopeVelocity.set(slopeVelocity.get() + 0.9);
    }
    previous.current = target;
  }, [target, level, splash, slopeVelocity]);

  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    const dt = Math.min((timeSincePreviousFrame ?? 16) / 1000, 0.05);
    // Normalise the gravity reading so "down" has negative y whichever sign
    // convention the platform uses; the surface stays level with the world, so
    // in screen terms it tilts against the phone. Lying flat gives ~0.
    const g = gravity.sensor.get();
    const magnitude = Math.hypot(g.x, g.y, g.z) || 1;
    const downX = g.y > 0 ? -g.x : g.x;
    const goal = Math.min(Math.max(-downX / magnitude, -MAX_SLOPE), MAX_SLOPE);

    const accel = (goal - slope.get()) * TILT_STIFFNESS - slopeVelocity.get() * TILT_DAMPING;
    const velocity = slopeVelocity.get() + accel * dt;
    slopeVelocity.set(velocity);
    slope.set(slope.get() + velocity * dt);
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
    // Empty sits just below the bottom so the wave crests stay hidden.
    return BOTTOM + 8 - level.get() * (BOTTOM + 8 - TOP);
  };

  const frontProps = useAnimatedProps(() => ({
    d: wavePath(waterY(), slope.get(), BASE_AMPLITUDE + splash.get(), phase.get()),
  }));
  const backProps = useAnimatedProps(() => ({
    d: wavePath(
      waterY() - 3,
      slope.get() * 1.1,
      BASE_AMPLITUDE + splash.get() * 0.8,
      phase.get() * 0.8 + Math.PI,
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
        </G>
        <Path d={BODY} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={2.5} />
      </G>
    </Svg>
  );
}
