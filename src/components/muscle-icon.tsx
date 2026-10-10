import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import type { MuscleGroup } from '@/db/schema';
import { colors } from '@/theme';

type Region =
  | 'deltoids'
  | 'pecs'
  | 'biceps'
  | 'triceps'
  | 'abs'
  | 'quads'
  | 'traps'
  | 'lats'
  | 'lowerBack';

/** Which side of the body shows the group, and the regions lit on it. */
const GROUP_VIEW: Record<MuscleGroup, { view: 'front' | 'back'; regions: Region[] }> = {
  chest: { view: 'front', regions: ['pecs'] },
  shoulders: { view: 'front', regions: ['deltoids'] },
  biceps: { view: 'front', regions: ['biceps'] },
  abs: { view: 'front', regions: ['abs'] },
  legs: { view: 'front', regions: ['quads'] },
  cardio: { view: 'front', regions: [] },
  back: { view: 'back', regions: ['traps', 'lats', 'lowerBack'] },
  triceps: { view: 'back', regions: ['triceps'] },
};

const WIDTH = 40;
const HEIGHT = 72;
const IDLE = 'rgba(255, 255, 255, 0.18)';

/** Mirrors a left-side path (x < 20) onto the right side of the figure. */
const mirror = (d: string) =>
  d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${WIDTH - Number(x)} ${y}`);

const SHAPES = {
  deltoid: 'M13 13.5 C10 13 7.5 14.5 7.5 18 L8 20.5 C9.5 19 11.5 18 13 17.5 Z',
  pec: 'M19.5 14 L14 14 C13.5 16 13.3 19 14 22 C16 23 18.5 22.8 19.5 22 Z',
  upperArm: 'M7.6 21 C8.5 20 10.5 19 12.8 18.5 L12.4 27 C11 28 9 28.2 7.2 27.5 C6.8 25 7 23 7.6 21 Z',
  forearm: 'M7 28.6 C8.8 29.2 10.8 29 12.2 28.2 L10.6 38 L7.4 38 C6.5 35 6.4 31 7 28.6 Z',
  oblique: 'M14.2 23 L15.2 23.5 L15.2 35 L14.5 36 C13.8 31 13.6 27 14.2 23 Z',
  quad: 'M14.2 37.5 C16 39.5 18.5 41 19.6 41.5 L19 55 C17.5 56 15.8 56 14.8 55.5 C13.6 50 13.4 43 14.2 37.5 Z',
  shin: 'M14.8 57 C16.2 57.5 17.8 57.5 19 57 C19.3 61 19 66 18.3 70 L16 70 C15 66 14.4 61 14.8 57 Z',
  trap: 'M20 11.5 C18.5 13 16 13.8 13.8 14.2 L20 22 L26.2 14.2 C24 13.8 21.5 13 20 11.5 Z',
  lat: 'M13.8 15.2 L19.4 22.5 L19.4 31 C17.5 30.5 15.5 29 14.6 27.5 C13.8 23 13.5 18.5 13.8 15.2 Z',
  lowerBack: 'M15.2 29.5 C16.5 31 18 32 20 32.5 C22 32 23.5 31 24.8 29.5 L25 37 L15 37 Z',
  glute: 'M19.6 37.8 L14.6 37.8 C13.8 40 14 43 15 44.5 C17 45.5 19 45 19.6 44 Z',
  hamstring: 'M15 45.5 C16.5 46.2 18.5 46 19.6 45.3 L19 55 C17.5 56 15.8 56 14.8 55.5 C14.3 52 14.4 48 15 45.5 Z',
  heart: 'M20 26 C14 22 14.5 16.5 17.5 16 C19 15.8 19.8 16.8 20 17.8 C20.2 16.8 21 15.8 22.5 16 C25.5 16.5 26 22 20 26 Z',
};

/** Six-pack blocks plus the lower V, as rects [x, y, w, h]. */
const ABS: [number, number, number, number][] = [
  [15.8, 23.5, 3.8, 3.5],
  [20.4, 23.5, 3.8, 3.5],
  [15.8, 27.6, 3.8, 3.4],
  [20.4, 27.6, 3.8, 3.4],
  [15.8, 31.6, 3.8, 3.9],
  [20.4, 31.6, 3.8, 3.9],
];

/** Both-sides pair of a left-side shape. */
function Pair({ d, fill }: { d: string; fill: string }) {
  return (
    <>
      <Path d={d} fill={fill} />
      <Path d={mirror(d)} fill={fill} />
    </>
  );
}

/** Body silhouette with the exercise's muscle group lit in the accent color. */
export function MuscleIcon({ group, size = 40 }: { group: MuscleGroup; size?: number }) {
  const { view, regions } = GROUP_VIEW[group];
  const fill = (r?: Region) => (r && regions.includes(r) ? colors.accent : IDLE);

  return (
    <Svg width={(size * WIDTH) / HEIGHT} height={size} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <Circle cx={20} cy={6} r={4.5} fill={IDLE} />
      <Rect x={18.2} y={10} width={3.6} height={3} fill={IDLE} />
      <Pair d={SHAPES.deltoid} fill={fill('deltoids')} />
      <Pair d={SHAPES.upperArm} fill={fill(view === 'front' ? 'biceps' : 'triceps')} />
      <Pair d={SHAPES.forearm} fill={IDLE} />
      <Ellipse cx={9} cy={40.5} rx={1.6} ry={2.2} fill={IDLE} />
      <Ellipse cx={WIDTH - 9} cy={40.5} rx={1.6} ry={2.2} fill={IDLE} />
      {view === 'front' ? (
        <>
          <Pair d={SHAPES.pec} fill={fill('pecs')} />
          <Pair d={SHAPES.oblique} fill={fill('abs')} />
          {ABS.map(([x, y, width, height]) => (
            <Rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={width}
              height={height}
              rx={0.8}
              fill={fill('abs')}
            />
          ))}
          <Path d="M15.8 36.2 L24.2 36.2 L20 40 Z" fill={fill('abs')} />
          <Pair d={SHAPES.quad} fill={fill('quads')} />
          <Pair d={SHAPES.shin} fill={fill('quads')} />
          {group === 'cardio' && (
            <Path
              d={SHAPES.heart}
              fill={colors.accent}
              stroke={colors.background}
              strokeWidth={0.8}
            />
          )}
        </>
      ) : (
        <>
          <Path d={SHAPES.trap} fill={fill('traps')} />
          <Pair d={SHAPES.lat} fill={fill('lats')} />
          <Path d={SHAPES.lowerBack} fill={fill('lowerBack')} />
          <Pair d={SHAPES.glute} fill={IDLE} />
          <Pair d={SHAPES.hamstring} fill={IDLE} />
          <Pair d={SHAPES.shin} fill={IDLE} />
        </>
      )}
    </Svg>
  );
}
