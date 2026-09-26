import { Container, ContainerType } from '../types';

/**
 * The catalog used to create every compartment as 'shelf', even "Tabletop Display" or
 * "Left Media Drawer". For those generic types, infer the real kind from the name so the
 * furniture view can draw a tabletop as a tabletop and a drawer as a drawer.
 * An explicitly chosen specific type (drawer, box, ...) always wins.
 */
export function inferContainerType(name: string, fallback: ContainerType = 'shelf'): ContainerType {
  const n = name.toLowerCase();
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
