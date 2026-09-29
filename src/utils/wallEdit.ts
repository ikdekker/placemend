import { Point2D } from '../types';
import { roundCm } from './measure';

const EPS = 1e-6;

export interface WallInfo {
  index: number;
  length: number;
  /** Position of the wall relative to the room centre: top / right / bottom / left, or slanted */
  side: 'top' | 'right' | 'bottom' | 'left' | 'slanted';
}

/** Move the polygon so its top-left bounding corner is at 0,0 and round to whole centimeters */
export function normalizePoints(points: Point2D[]): Point2D[] {
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  return points.map((p) => ({ x: roundCm(p.x - minX), y: roundCm(p.y - minY) }));
}

export function pointsBounds(points: Point2D[]): { width: number; height: number } {
  return {
    width: roundCm(Math.max(...points.map((p) => p.x))),
    height: roundCm(Math.max(...points.map((p) => p.y))),
  };
}

/** Length and position of every wall (wall i runs from corner i to corner i+1) */
export function describeWalls(points: Point2D[]): WallInfo[] {
  if (points.length < 3) return [];
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let side: WallInfo['side'] = 'slanted';
    if (Math.abs(dy) < EPS) side = (a.y + b.y) / 2 < cy ? 'top' : 'bottom';
    else if (Math.abs(dx) < EPS) side = (a.x + b.x) / 2 < cx ? 'left' : 'right';
    return { index: i, length: roundCm(Math.hypot(dx, dy)), side };
  });
}

/**
 * Make wall i exactly `newLength` long. For straight (horizontal/vertical) walls the whole line of
 * corners at the far end moves together, so the neighbouring walls stay straight and simply get
 * longer or shorter. For a slanted wall only its far corner moves along the wall.
 */
export function setWallLength(points: Point2D[], i: number, newLength: number): Point2D[] {
  const n = points.length;
  if (n < 3 || newLength <= 0) return points;
  const a = points[i];
  const b = points[(i + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < EPS) return points;

  let next: Point2D[];
  if (Math.abs(dy) < EPS) {
    const delta = Math.sign(dx) * (newLength - len);
    next = points.map((p) => (Math.abs(p.x - b.x) < EPS ? { x: p.x + delta, y: p.y } : { ...p }));
  } else if (Math.abs(dx) < EPS) {
    const delta = Math.sign(dy) * (newLength - len);
    next = points.map((p) => (Math.abs(p.y - b.y) < EPS ? { x: p.x, y: p.y + delta } : { ...p }));
  } else {
    const k = newLength / len;
    next = points.map((p, idx) => (idx === (i + 1) % n ? { x: a.x + dx * k, y: a.y + dy * k } : { ...p }));
  }
  return normalizePoints(next);
}
