import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { colors, fontSize } from '@/theme';

export type ChartPoint = { x: number; y: number; highlight?: boolean };

const HEIGHT = 180;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

/**
 * Minimal time-series line chart. X is a timestamp, Y the metric.
 * Highlighted points (PRs) are drawn in the accent colour.
 */
export function LineChart({
  points,
  formatY,
  formatX,
}: {
  points: ChartPoint[];
  formatY: (v: number) => string;
  formatX: (v: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length === 0) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  let [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const sx = (x: number) =>
    PAD.left + (maxX === minX ? innerW / 2 : ((x - minX) / (maxX - minX)) * innerW);
  const sy = (y: number) => PAD.top + innerH - ((y - minY) / (maxY - minY)) * innerH;
  const coords = points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ');

  return (
    <View style={styles.container} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          {[maxY, (maxY + minY) / 2, minY].map((v) => (
            <Line
              key={`g${v}`}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={sy(v)}
              y2={sy(v)}
              stroke={colors.border}
              strokeWidth={1}
            />
          ))}
          {[maxY, minY].map((v) => (
            <SvgText
              key={`l${v}`}
              x={PAD.left - 6}
              y={sy(v) + 4}
              fill={colors.textMuted}
              fontSize={fontSize.sm - 2}
              textAnchor="end">
              {formatY(v)}
            </SvgText>
          ))}
          <SvgText x={PAD.left} y={HEIGHT - 6} fill={colors.textMuted} fontSize={fontSize.sm - 2}>
            {formatX(minX)}
          </SvgText>
          {maxX !== minX && (
            <SvgText
              x={width - PAD.right}
              y={HEIGHT - 6}
              fill={colors.textMuted}
              fontSize={fontSize.sm - 2}
              textAnchor="end">
              {formatX(maxX)}
            </SvgText>
          )}
          {points.length > 1 && (
            <Polyline
              points={coords}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
          )}
          {points.map((p) => (
            <Circle
              key={p.x}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={p.highlight ? 5 : 3.5}
              fill={p.highlight ? colors.text : colors.accent}
              stroke={colors.accent}
              strokeWidth={p.highlight ? 2.5 : 0}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

/** Axis-free trend line with a soft fill, for compact cards. Needs two points or more. */
export function Sparkline({ points, height = 56 }: { points: ChartPoint[]; height?: number }) {
  const [width, setWidth] = useState(0);
  if (points.length < 2) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const pad = 4; // keeps the stroke and end dot inside the box
  const sx = (x: number) =>
    pad + (maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * (width - 2 * pad));
  const sy = (y: number) =>
    maxY === minY ? height / 2 : pad + (1 - (y - minY) / (maxY - minY)) * (height - 2 * pad);
  const line = points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <View style={{ height, width: '100%' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Polygon
            points={`${sx(minX)},${height} ${line} ${sx(maxX)},${height}`}
            fill={colors.accent}
            opacity={0.15}
          />
          <Polyline
            points={line}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Circle cx={sx(last.x)} cy={sy(last.y)} r={4} fill={colors.accent} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: HEIGHT, width: '100%' },
});
