import { Container, ContainerType } from '../types';

/**
 * The catalog used to create every compartment as 'shelf', even "Tabletop Display" or
 * "Left Media Drawer". For those generic types, infer the real kind from the name so the
 * furniture view can draw a tabletop as a tabletop and a drawer as a drawer.
 * An explicitly chosen specific type (drawer, box, ...) always wins.
 */
export function inferContainerType(name: string, fallback: ContainerType = 'shelf'): ContainerType {
  const n = name.toLowerCase();
  if (applianceKind(n)) return 'appliance';
  // Order matters: "Upper Shelf (under top drawer)" is a shelf, not a drawer
  if (/\b(shelf|shelves|tier|rack|plank|ledge)\b/.test(n)) return 'shelf';
  if (/\bdrawers?\b|\blade\b/.test(n)) return 'drawer';
  if (/\b(surface|tabletop|table top|top|countertop|worktop|display|desk surface)\b/.test(n)) return 'top_surface';
  if (/\b(door|doors|cabinet|cupboard|kastje|compartment door)\b/.test(n)) return 'cabinet_door';
  if (/\b(box|bin|basket|bowl|trunk|crate|tray|bag)\b/.test(n)) return 'box';
  if (/\b(rod|rail|hanging)\b/.test(n)) return 'hanging_rod';
  return fallback;
}

export function effectiveContainerType(c: Pick<Container, 'name' | 'type'>): ContainerType {
  if (c.type === 'shelf' || c.type === 'general') return inferContainerType(c.name, c.type);
  return c.type;
}

/** Open kinds have no front: you see straight onto the items */
export function isOpenKind(t: ContainerType): boolean {
  return t === 'shelf' || t === 'top_surface' || t === 'hanging_rod';
}

export type ApplianceKind = 'oven' | 'hood' | 'dishwasher' | 'fridge' | 'microwave' | 'other';

/** Which appliance a compartment name describes (English and Dutch), or null */
export function applianceKind(name: string): ApplianceKind | null {
  const n = name.toLowerCase();
  if (/\b(extractor|cooker hood|range hood|hood|afzuigkap|afzuiger)\b/.test(n)) return 'hood';
  if (/\b(dishwasher|vaatwasser|vaatwasmachine)\b/.test(n)) return 'dishwasher';
  if (/\b(fridge|refrigerator|freezer|koelkast|vriezer|diepvries)\b/.test(n)) return 'fridge';
  if (/\b(microwave|magnetron|combi[- ]?oven)\b/.test(n)) return 'microwave';
  if (/\b(oven|stove)\b/.test(n)) return 'oven';
  return null;
}

/** True for the cabinet under the sink, drawn with a sink in the countertop above it */
export function isUnderSink(name: string): boolean {
  return /\b(sink|spoelbak|gootsteen|aanrecht\s*kast)\b/i.test(name);
}
