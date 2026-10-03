import { db } from '../db/database';
import { Container, ContainerType, Furniture, FurnitureType } from '../types';
import { roundCm } from './measure';

// Shapes returned by api/vision.php
export type FrontType = 'door' | 'pair' | 'drawer' | 'shelf' | 'basket' | 'open' | Appliance | 'sink';
type Appliance = 'oven' | 'dishwasher' | 'fridge' | 'microwave' | 'hood';
export type PartType = 'shelf' | 'rail' | 'drawer' | 'basket' | 'open';
export interface IdentifiedFurniture {
  name: string;
  type: FurnitureType;
  width: number;
  depth: number;
  height: number;
  color: string;
  hasDoors: boolean;
  sections: { width: 1 | 2; fronts: FrontType[] }[];
  /** Kitchens: wall cabinets above the countertop */
  upperSections?: { width: 1 | 2; fronts: FrontType[] }[];
  topOfCabinets?: boolean;
}
export interface LayoutSection {
  width: 1 | 2;
  door: 'none' | 'single' | 'pair';
  parts: { type: PartType; name: string }[];
}

const FRONT_TYPE: Record<FrontType, ContainerType> = {
  door: 'cabinet_door',
  pair: 'cabinet_door',
  drawer: 'drawer',
  shelf: 'shelf',
  basket: 'box',
  open: 'shelf',
  oven: 'appliance',
  dishwasher: 'appliance',
  fridge: 'appliance',
  microwave: 'appliance',
  hood: 'appliance',
  sink: 'cabinet_door',
};
export const PART_TYPE: Record<PartType, ContainerType> = {
  shelf: 'shelf',
  rail: 'hanging_rod',
  drawer: 'drawer',
  basket: 'box',
  open: 'shelf',
};

/** "Left door" / "Middle doors" / "Right door" for 2-3 sections, numbered otherwise */
export function doorName(index: number, count: number, pair: boolean): string {
  const s = pair ? 'doors' : 'door';
  if (count === 1) return pair ? 'Doors' : 'Door';
  if (count === 2) return `${index === 0 ? 'Left' : 'Right'} ${s}`;
  if (count === 3) return `${['Left', 'Middle', 'Right'][index]} ${s}`;
  return `${pair ? 'Doors' : 'Door'} ${index + 1}`;
}

const FRONT_LABEL: Record<Exclude<FrontType, 'door' | 'pair'>, string> = {
  drawer: 'Drawer',
  shelf: 'Shelf',
  basket: 'Basket',
  open: 'Open space',
  oven: 'Oven',
  dishwasher: 'Dishwasher',
  fridge: 'Fridge',
  microwave: 'Microwave',
  hood: 'Extractor hood',
  sink: 'Under-sink cabinet',
};

/** Create the furniture in a room with the fronts the AI saw; returns the new furniture id */
export async function createFurnitureFromPhoto(
  roomId: string,
  room: { gridWidth: number; gridHeight: number } | undefined,
  ident: IdentifiedFurniture
): Promise<string> {
  const now = Date.now();
  const id = `furn-${now}`;
  const width = roundCm(ident.width);
  const depth = roundCm(ident.depth);
  // Start in the middle of the room; the setup guide then asks to drag it into place
  const x = room ? roundCm(Math.max(0, (room.gridWidth - width) / 2)) : 0;
  const y = room ? roundCm(Math.max(0, (room.gridHeight - depth) / 2)) : 0;
  const furniture: Furniture = {
    id,
    roomId,
    name: ident.name,
    type: ident.type,
    shape: 'rectangle',
    position: { x, y, rotation: 0 },
    dimension: { width, length: depth, height: Math.round(ident.height * 100) },
    color: ident.color,
    columns: Math.max(1, ident.sections.length),
    columnWidths: ident.sections.map((s) => s.width),
    createdAt: now,
    updatedAt: now,
  };

  let seq = 0;
  const containers: Container[] = [];
  const kitchen = ident.type === 'kitchen_counter';
  const addRow = (sections: { width: 1 | 2; fronts: FrontType[] }[], upper: boolean) => {
    const doorCount = sections.filter((sec) => sec.fronts.some((f) => f === 'door' || f === 'pair')).length;
    let doorIndex = 0;
    sections.forEach((sec, col) => {
      const counters: Record<string, number> = {};
      sec.fronts.forEach((front, row) => {
        let name: string;
        if (front === 'door' || front === 'pair') {
          const door = doorName(doorIndex++, doorCount, front === 'pair');
          // "Left door" on the wall reads better as "Left wall cabinet"
          name = upper ? door.replace(/doors?$/i, 'wall cabinet').replace(/^(Door|Doors)$/, 'Wall cabinet') : door;
        } else {
          counters[front] = (counters[front] || 0) + 1;
          const total = sec.fronts.filter((f) => f === front).length;
          const label = upper && front === 'shelf' ? 'Wall shelf' : FRONT_LABEL[front];
          name = total > 1 ? `${label} ${counters[front]}` : label;
        }
        containers.push({
          id: `cont-${now}-${seq++}`,
          furnitureId: id,
          name,
          type: FRONT_TYPE[front],
          ...(upper ? { zone: 'upper' as const } : {}),
          ...(front === 'pair' ? { doorCount: 2 } : front === 'door' || front === 'sink' ? { doorCount: 1 } : {}),
          columnIndex: col,
          orderIndex: row,
          createdAt: now,
          updatedAt: now,
        });
      });
    });
  };
  addRow(ident.sections, false);
  const upper = ident.upperSections ?? [];
  if (upper.length) {
    addRow(upper, true);
    furniture.upperColumns = upper.length;
    furniture.upperColumnWidths = upper.map((sec) => sec.width);
  }
  const surface = (name: string, zone?: 'upper') =>
    containers.push({ id: `cont-${now}-${seq++}`, furnitureId: id, name, type: 'top_surface', ...(zone ? { zone } : {}), orderIndex: 0, createdAt: now, updatedAt: now });
  if (kitchen) surface('Countertop');
  if (upper.length && ident.topOfCabinets) surface('Top of cabinets', 'upper');

  await db.transaction('rw', [db.furniture, db.containers], async () => {
    await db.furniture.add(furniture);
    await db.containers.bulkAdd(containers);
  });
  return id;
}

/** Replace what's behind a door with the recognised parts (items in removed parts move to the door itself) */
export async function setDoorInterior(furnitureId: string, doorId: string, parts: { type: PartType; name: string }[]): Promise<void> {
  const now = Date.now();
  const old = await db.containers.where('parentContainerId').equals(doorId).toArray();
  const oldIds = old.map((c) => c.id);
  const created: Container[] = parts.map((p, i) => ({
    id: `cont-${now}-${doorId.slice(-4)}-${i}`,
    furnitureId,
    parentContainerId: doorId,
    name: p.type === 'open' ? p.name || 'Open space' : p.name,
    type: PART_TYPE[p.type],
    orderIndex: i,
    createdAt: now,
    updatedAt: now,
  }));
  await db.transaction('rw', [db.containers, db.items], async () => {
    if (oldIds.length) {
      await db.items.where('containerId').anyOf(oldIds).modify({ containerId: doorId, updatedAt: now });
      await db.containers.bulkDelete(oldIds);
    }
    await db.containers.bulkAdd(created);
  });
}

/** The doors of a piece of furniture, left to right */
export async function furnitureDoors(furnitureId: string): Promise<Container[]> {
  const all = await db.containers.where('furnitureId').equals(furnitureId).toArray();
  return all
    .filter((c) => !c.parentContainerId && c.type === 'cabinet_door')
    .sort((a, b) => (a.columnIndex ?? 0) - (b.columnIndex ?? 0) || (a.orderIndex || 0) - (b.orderIndex || 0));
}
