import { db } from '../db/database';
import { Room, RoomDoor, WallSide, Point2D, DoorSwing } from '../types';

export interface DoorSvgGeometry {
  arcD: string;
  leafLine: { x1: number; y1: number; x2: number; y2: number };
  thresholdLine: { x1: number; y1: number; x2: number; y2: number };
  hingePoint: { x: number; y: number };
  jambs: Array<{ x: number; y: number; w: number; h: number }>;
  badgePos: { x: number; y: number; wall: WallSide | string };
}

export interface WallSegment {
  index: number;
  id: string;
  label: string;
  p1: Point2D;
  p2: Point2D;
  length: number; // in grid units
  isSlanted: boolean;
  angleDeg: number;
  wallSide?: WallSide;
}

/**
 * Normalizes all doors for a room, providing backwards-compatibility with single door.
 */
export function getRoomDoors(room: Room | undefined | null): RoomDoor[] {
  if (!room) return [];
  if (room.doors && room.doors.length > 0) {
    return room.doors.map((d, idx) => ({
      ...d,
      id: d.id || `door-${idx + 1}`,
      label: d.label || (idx === 0 ? 'Main Entrance' : `Door ${idx + 1}`),
      swing: d.swing || 'inward_left',
      width: d.width || 2,
    }));
  }
  if (room.door) {
    return [{
      ...room.door,
      id: room.door.id || 'door-1',
      label: room.door.label || 'Main Entrance',
      swing: room.door.swing || 'inward_left',
      width: room.door.width || 2,
    }];
  }
  return [{
    id: 'door-1',
    label: 'Main Entrance',
    wall: 'bottom',
    offset: 2,
    swing: 'inward_left',
    width: 2,
  }];
}

/**
 * Decomposes any room (rectangular or polygon) into ordered wall segments with geometry & orientation.
 */
export function getRoomWallSegments(room: {
  gridWidth: number;
  gridHeight: number;
  polygonPoints?: Point2D[];
}): WallSegment[] {
  const W = room.gridWidth;
  const H = room.gridHeight;
  const pts: Point2D[] = (room.polygonPoints && room.polygonPoints.length >= 3)
    ? room.polygonPoints
    : [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: H },
        { x: 0, y: H },
      ];

  const n = pts.length;
  const segments: WallSegment[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy);
    const angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const isSlanted = Math.abs(dx) > 0.05 && Math.abs(dy) > 0.05;

    let wallSide: WallSide | undefined = undefined;
    let label = '';

    if (!isSlanted) {
      if (Math.abs(dy) <= 0.05) {
        if (dx > 0) {
          wallSide = 'top';
          label = `Top Wall (${length.toFixed(1)}m)`;
        } else {
          wallSide = 'bottom';
          label = `Bottom Wall (${length.toFixed(1)}m)`;
        }
      } else {
        if (dy > 0) {
          wallSide = 'right';
          label = `Right Wall (${length.toFixed(1)}m)`;
        } else {
          wallSide = 'left';
          label = `Left Wall (${length.toFixed(1)}m)`;
        }
      }
    } else {
      label = `Slanted Wall (${length.toFixed(1)}m)`;
    }

    segments.push({
      index: i,
      id: wallSide || `seg-${i}`,
      label,
      p1,
      p2,
      length,
      isSlanted,
      angleDeg,
      wallSide,
    });
  }

  return segments;
}

/**
 * Computes exact architectural SVG geometry for a room entrance door,
 * fully supporting slanted/angled walls, custom polygons, and standard rectangular rooms.
 */
export function getDoorSvgGeometry(
  door: RoomDoor | undefined,
  roomGridW: number,
  roomGridH: number,
  unitSize: number,
  polygonPoints?: Point2D[]
): DoorSvgGeometry {
  const d: RoomDoor = door || {
    wall: 'bottom',
    offset: 2,
    swing: 'inward_left',
    width: 2,
  };

  const segments = getRoomWallSegments({
    gridWidth: roomGridW,
    gridHeight: roomGridH,
    polygonPoints,
  });

  // Find matching segment
  let seg: WallSegment | undefined = undefined;
  if (d.segmentIndex !== undefined && segments[d.segmentIndex]) {
    seg = segments[d.segmentIndex];
  } else if (d.wall) {
    seg = segments.find((s) => s.id === d.wall || s.wallSide === d.wall);
  }
  if (!seg) {
    seg = segments[0] || {
      index: 0,
      id: 'bottom',
      label: 'Bottom Wall',
      p1: { x: 0, y: roomGridH },
      p2: { x: roomGridW, y: roomGridH },
      length: roomGridW,
      isSlanted: false,
      angleDeg: 0,
      wallSide: 'bottom',
    };
  }

  const swing = d.swing || 'inward_left';
  const widthUnits = Math.min(d.width || 2, Math.max(0.5, seg.length));
  const r = widthUnits * unitSize;

  // Segment endpoints in pixels
  const s1x = seg.p1.x * unitSize;
  const s1y = seg.p1.y * unitSize;
  const s2x = seg.p2.x * unitSize;
  const s2y = seg.p2.y * unitSize;

  const dx = s2x - s1x;
  const dy = s2y - s1y;
  const segLenPx = Math.hypot(dx, dy);

  // Unit vector along segment
  const ux = segLenPx > 0 ? dx / segLenPx : 1;
  const uy = segLenPx > 0 ? dy / segLenPx : 0;

  // Inward normal (clockwise polygon winding has inward normal to the right: (-uy, ux))
  const nx = -uy;
  const ny = ux;

  // Clamp offset along this segment
  const maxOffsetUnits = Math.max(0, seg.length - widthUnits);
  const clampedOffsetUnits = Math.max(0, Math.min(maxOffsetUnits, d.offset || 0));
  const offPx = clampedOffsetUnits * unitSize;

  // Threshold start and end points along the wall
  const t1x = s1x + ux * offPx;
  const t1y = s1y + uy * offPx;
  const t2x = t1x + ux * r;
  const t2y = t1y + uy * r;

  const thresholdLine = { x1: t1x, y1: t1y, x2: t2x, y2: t2y };

  // Swing mechanics
  const isLeftHinge = swing.includes('left');
  const isInward = swing.includes('inward');
  const normalMult = isInward ? 1 : -1;

  const hingePoint = isLeftHinge ? { x: t1x, y: t1y } : { x: t2x, y: t2y };
  const unhingedPoint = isLeftHinge ? { x: t2x, y: t2y } : { x: t1x, y: t1y };

  // Leaf line (from hinge, rotated 90° into room along normal)
  const leafTipX = hingePoint.x + nx * r * normalMult;
  const leafTipY = hingePoint.y + ny * r * normalMult;
  const leafLine = {
    x1: hingePoint.x,
    y1: hingePoint.y,
    x2: leafTipX,
    y2: leafTipY,
  };

  // Swing Arc: sweeps from unhinged threshold point to open leaf tip
  // In screen coordinates (y-down), sweep-flag is 1 if (isLeftHinge === isInward), else 0
  const sweepFlag = (isLeftHinge === isInward) ? 1 : 0;
  const arcD = `M ${unhingedPoint.x} ${unhingedPoint.y} A ${r} ${r} 0 0 ${sweepFlag} ${leafTipX} ${leafTipY}`;

  // Jamb blocks (6px squares centered at threshold endpoints)
  const jambSize = 6;
  const jambs = [
    { x: t1x - jambSize / 2, y: t1y - jambSize / 2, w: jambSize, h: jambSize },
    { x: t2x - jambSize / 2, y: t2y - jambSize / 2, w: jambSize, h: jambSize },
  ];

  // Interactive badge position: centered along threshold, offset 26px along inward normal
  const midX = (t1x + t2x) / 2;
  const midY = (t1y + t2y) / 2;
  const badgePos = {
    x: midX + nx * 26,
    y: midY + ny * 26,
    wall: seg.wallSide || (seg.isSlanted ? 'slanted' : 'bottom'),
  };

  return {
    arcD,
    leafLine,
    thresholdLine,
    hingePoint,
    jambs,
    badgePos,
  };
}

/**
 * Rotates an entire room 90° clockwise, safely transforming:
 * 1. Bounding dimensions (width <-> height)
 * 2. Non-rectangular polygon vertices (x' = H - y, y' = x)
 * 3. Wall entrance door position & wall side (top -> right -> bottom -> left)
 * 4. All interior furniture positions & rotations, keeping them bounded
 */
export async function rotateRoom90Clockwise(roomId: string): Promise<void> {
  const room = await db.rooms.get(roomId);
  if (!room) return;

  const oldW = room.gridWidth;
  const oldH = room.gridHeight;
  const newW = oldH;
  const newH = oldW;

  // 1. Rotate polygon points if present
  let newPoints: Point2D[] | undefined = undefined;
  if (room.polygonPoints && room.polygonPoints.length > 0) {
    newPoints = room.polygonPoints.map((p) => ({
      x: oldH - p.y,
      y: p.x,
    }));
  }

  // 2. Rotate all doors
  const currentDoors = getRoomDoors(room);
  const wallCycle: Record<WallSide, WallSide> = {
    top: 'right',
    right: 'bottom',
    bottom: 'left',
    left: 'top',
  };
  const newDoors: RoomDoor[] = currentDoors.map((d) => {
    const wallKey = d.wall as WallSide;
    const newWall = wallCycle[wallKey] || d.wall;
    const maxWallLen = newWall === 'top' || newWall === 'bottom' ? newW : newH;
    const doorWidth = d.width || 2;
    const newOffset = Math.min(Math.max(0, maxWallLen - doorWidth), d.offset);
    return {
      ...d,
      wall: newWall,
      offset: newOffset,
    };
  });

  // 3. Rotate all furniture in the room to remain inside bounds
  const furnitureInRoom = await db.furniture.where('roomId').equals(room.id).toArray();
  await db.transaction('rw', [db.rooms, db.furniture], async () => {
    for (const f of furnitureInRoom) {
      const isRot = (f.position.rotation || 0) % 180 !== 0;
      const fW = isRot ? f.dimension.length : f.dimension.width;
      const fL = isRot ? f.dimension.width : f.dimension.length;
      const newX = Math.max(0, Math.min(newW - fL, oldH - (f.position.y + fL)));
      const newY = Math.max(0, Math.min(newH - fW, f.position.x));
      const newRot = ((f.position.rotation || 0) + 90) % 360;

      await db.furniture.update(f.id, {
        'position.x': newX,
        'position.y': newY,
        'position.rotation': newRot,
        updatedAt: Date.now(),
      });
    }

    await db.rooms.update(room.id, {
      gridWidth: newW,
      gridHeight: newH,
      polygonPoints: newPoints,
      doors: newDoors,
      door: newDoors[0] || undefined,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Nudges or moves a room door along its current wall or segment.
 */
export async function nudgeDoor(roomId: string, deltaUnits: number, doorId?: string): Promise<void> {
  const room = await db.rooms.get(roomId);
  if (!room) return;

  const doors = getRoomDoors(room);
  const targetIdx = doorId ? doors.findIndex((d) => d.id === doorId) : 0;
  if (targetIdx === -1) return;

  const currentDoor = doors[targetIdx];
  const segments = getRoomWallSegments(room);
  let seg = currentDoor.segmentIndex !== undefined ? segments[currentDoor.segmentIndex] : undefined;
  if (!seg) {
    seg = segments.find((s) => s.id === currentDoor.wall || s.wallSide === currentDoor.wall) || segments[0];
  }
  const segLen = seg ? seg.length : (currentDoor.wall === 'top' || currentDoor.wall === 'bottom' ? room.gridWidth : room.gridHeight);
  const width = currentDoor.width || 2;
  const maxOffset = Math.max(0, segLen - width);

  const newOffset = Math.max(0, Math.min(maxOffset, currentDoor.offset + deltaUnits));
  doors[targetIdx] = {
    ...currentDoor,
    offset: newOffset,
  };

  await db.rooms.update(roomId, {
    doors,
    door: doors[0] || undefined,
    updatedAt: Date.now(),
  });
}

/**
 * Mirrors (flips) an entire room along either the horizontal or vertical axis:
 * 1. Polygon vertices (flipped coordinates and reversed winding)
 * 2. All entrance door positions, wall sides, and swing hinges
 * 3. All interior furniture positions and orientations
 */
export async function mirrorRoom(roomId: string, axis: 'horizontal' | 'vertical'): Promise<void> {
  const room = await db.rooms.get(roomId);
  if (!room) return;

  const W = room.gridWidth;
  const H = room.gridHeight;

  // 1. Mirror polygon points if present
  let newPoints: Point2D[] | undefined = undefined;
  if (room.polygonPoints && room.polygonPoints.length > 0) {
    if (axis === 'horizontal') {
      newPoints = room.polygonPoints.map((p) => ({
        x: W - p.x,
        y: p.y,
      })).reverse();
    } else {
      newPoints = room.polygonPoints.map((p) => ({
        x: p.x,
        y: H - p.y,
      })).reverse();
    }
  }

  // 2. Mirror all doors
  const currentDoors = getRoomDoors(room);
  const flipSwingMap: Record<DoorSwing, DoorSwing> = {
    'inward_left': 'inward_right',
    'inward_right': 'inward_left',
    'outward_left': 'outward_right',
    'outward_right': 'outward_left',
  };

  const newDoors: RoomDoor[] = currentDoors.map((currentDoor) => {
    const doorWidth = currentDoor.width || 2;
    let newWall = currentDoor.wall;
    let newOffset = currentDoor.offset;
    let newSwing: DoorSwing = currentDoor.swing || 'inward_left';

    if (axis === 'horizontal') {
      if (currentDoor.wall === 'top' || currentDoor.wall === 'bottom') {
        newOffset = Math.max(0, W - currentDoor.offset - doorWidth);
        newSwing = flipSwingMap[newSwing] || newSwing;
      } else if (currentDoor.wall === 'left') {
        newWall = 'right';
        newSwing = flipSwingMap[newSwing] || newSwing;
      } else if (currentDoor.wall === 'right') {
        newWall = 'left';
        newSwing = flipSwingMap[newSwing] || newSwing;
      }
    } else {
      // vertical flip
      if (currentDoor.wall === 'left' || currentDoor.wall === 'right') {
        newOffset = Math.max(0, H - currentDoor.offset - doorWidth);
        newSwing = flipSwingMap[newSwing] || newSwing;
      } else if (currentDoor.wall === 'top') {
        newWall = 'bottom';
        newSwing = flipSwingMap[newSwing] || newSwing;
      } else if (currentDoor.wall === 'bottom') {
        newWall = 'top';
        newSwing = flipSwingMap[newSwing] || newSwing;
      }
    }

    return {
      ...currentDoor,
      wall: newWall,
      offset: newOffset,
      swing: newSwing,
    };
  });

  // 3. Mirror all interior furniture
  const furnitureInRoom = await db.furniture.where('roomId').equals(room.id).toArray();
  await db.transaction('rw', [db.rooms, db.furniture], async () => {
    for (const f of furnitureInRoom) {
      const isRot = (f.position.rotation || 0) % 180 !== 0;
      const fW = isRot ? f.dimension.length : f.dimension.width;
      const fL = isRot ? f.dimension.width : f.dimension.length;

      let newX = f.position.x;
      let newY = f.position.y;
      let newRot = f.position.rotation || 0;

      if (axis === 'horizontal') {
        newX = Math.max(0, Math.min(W - fW, W - (f.position.x + fW)));
        newRot = (360 - newRot) % 360;
      } else {
        newY = Math.max(0, Math.min(H - fL, H - (f.position.y + fL)));
        newRot = (180 - newRot + 360) % 360;
      }

      await db.furniture.update(f.id, {
        'position.x': newX,
        'position.y': newY,
        'position.rotation': newRot,
        updatedAt: Date.now(),
      });
    }

      await db.rooms.update(room.id, {
        polygonPoints: newPoints,
        doors: newDoors,
        door: newDoors[0] || undefined,
        updatedAt: Date.now(),
      });
    });
  }

/**
 * Checks whether a 2D point is inside a polygon using ray casting.
 */
export function isPointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks whether a rectangular furniture item [x, x+w] x [y, y+l] is fully inside a polygon.
 */
export function isRectInsidePolygon(
  x: number,
  y: number,
  w: number,
  l: number,
  polygon: Point2D[]
): boolean {
  const eps = 0.02;
  const samplePoints: Point2D[] = [
    { x: x + eps, y: y + eps },
    { x: x + w - eps, y: y + eps },
    { x: x + w - eps, y: y + l - eps },
    { x: x + eps, y: y + l - eps },
    { x: x + w / 2, y: y + eps },
    { x: x + w / 2, y: y + l - eps },
    { x: x + eps, y: y + l / 2 },
    { x: x + w - eps, y: y + l / 2 },
    { x: x + w / 2, y: y + l / 2 },
  ];
  return samplePoints.every((pt) => isPointInPolygon(pt, polygon));
}

/**
 * Calculates snapped and boundary-clamped position for a furniture piece:
 * 1. Grid snap (rounding to whole grid cell if enabled)
 * 2. Magnetic wall snap (flushes perfectly to inner wall faces if within snap threshold)
 * 3. Bounding box clamping [0, roomW - w] x [0, roomH - l]
 * 4. Polygon interior containment (ensures furniture never penetrates slanted walls or cutouts)
 */
export function snapFurniturePosition(
  targetX: number,
  targetY: number,
  furnW: number,
  furnL: number,
  roomW: number,
  roomH: number,
  polygonPoints?: Point2D[],
  gridSnapEnabled: boolean = true
): { x: number; y: number } {
  let x = gridSnapEnabled ? Math.round(targetX) : targetX;
  let y = gridSnapEnabled ? Math.round(targetY) : targetY;

  // Magnetic wall snap threshold (0.35 grid units ≈ 11px)
  const snapThreshold = 0.35;

  if (Math.abs(x) < snapThreshold) {
    x = 0; // Flush against left wall
  } else if (Math.abs(x - (roomW - furnW)) < snapThreshold) {
    x = Math.max(0, roomW - furnW); // Flush against right wall
  }

  if (Math.abs(y) < snapThreshold) {
    y = 0; // Flush against top wall
  } else if (Math.abs(y - (roomH - furnL)) < snapThreshold) {
    y = Math.max(0, roomH - furnL); // Flush against bottom wall
  }

  // Clamp to rectangular bounds
  x = Math.max(0, Math.min(roomW - furnW, x));
  y = Math.max(0, Math.min(roomH - furnL, y));

  // If room is a non-rectangular polygon (e.g. chamfered, L-shaped), ensure furniture stays inside
  if (polygonPoints && polygonPoints.length >= 3) {
    if (!isRectInsidePolygon(x, y, furnW, furnL, polygonPoints)) {
      // Find closest valid position inside polygon by testing step-backs towards room center
      const roomCenterX = roomW / 2;
      const roomCenterY = roomH / 2;
      const stepX = (roomCenterX - x) !== 0 ? (roomCenterX > x ? 0.25 : -0.25) : 0;
      const stepY = (roomCenterY - y) !== 0 ? (roomCenterY > y ? 0.25 : -0.25) : 0;

      let validX = x;
      let validY = y;
      let found = false;

      for (let i = 1; i <= 40; i++) {
        const testX = x + stepX * i;
        const testY = y + stepY * i;
        if (isRectInsidePolygon(testX, y, furnW, furnL, polygonPoints)) {
          validX = testX;
          found = true;
          break;
        }
        if (isRectInsidePolygon(x, testY, furnW, furnL, polygonPoints)) {
          validY = testY;
          found = true;
          break;
        }
        if (isRectInsidePolygon(testX, testY, furnW, furnL, polygonPoints)) {
          validX = testX;
          validY = testY;
          found = true;
          break;
        }
      }

      if (found) {
        x = validX;
        y = validY;
      }
    }
  }

  return { x, y };
}
