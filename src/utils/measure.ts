// Rooms, walls, doors and furniture are stored in meters with centimeter precision.

/** Round to whole centimeters (0.01 m), avoiding float noise like 3.4699999 */
export function roundCm(meters: number): number {
  return Math.round(meters * 100) / 100;
}

/** Snap to a step in meters (e.g. 0.1 for 10 cm while dragging), result rounded to cm */
export function snapTo(meters: number, step: number): number {
  return roundCm(Math.round(meters / step) * step);
}

/** "3.47 m", "4 m", "0.8 m": no trailing zeros */
export function formatMeters(meters: number, withUnit = true): string {
  const text = String(roundCm(meters));
  return withUnit ? `${text} m` : text;
}

/** Parse user input like "3.47", "3,47" (Dutch keyboards) or "347cm"; NaN if not a number */
export function parseMeters(raw: string): number {
  const s = raw.trim().toLowerCase().replace(',', '.');
  if (s === '') return NaN;
  const cm = s.match(/^(-?\d+(?:\.\d+)?)\s*cm$/);
  if (cm) return roundCm(parseFloat(cm[1]) / 100);
  const m = s.match(/^-?\d*\.?\d+\s*m?$/) || s.match(/^-?\d+\.$/);
  return m ? roundCm(parseFloat(s)) : NaN;
}
