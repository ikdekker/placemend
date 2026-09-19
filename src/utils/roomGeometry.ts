import { db } from '../db/database';
import { RoomDoor, WallSide, Point2D, DoorSwing } from '../types';

export interface DoorSvgGeometry {
  arcD: string;
  leafLine: { x1: number; y1: number; x2: number; y2: number };
  thresholdLine: { x1: number; y1: number; x2: number; y2: number };
  hingePoint: { x: number; y: number };
  jambs: Array<{ x: number; y: number; w: number; h: number }>;
  badgePos: { x: number; y: number; wall: WallSide };
}

/**
 * Computes exact architectural SVG geometry for a room entrance door.
 */
export function getDoorSvgGeometry(
  door: RoomDoor | undefined,
  roomGridW: number,
  roomGridH: number,
  unitSize: number
): DoorSvgGeometry {
  const d: RoomDoor = door || {
    wall: 'bottom',
    offset: 2,
    swing: 'inward_left',
    width: 2,
  };

  const wall = d.wall || 'bottom';
  const swing = d.swing || 'inward_left';
  const widthUnits = d.width || 2;
  const r = widthUnits * unitSize;

  const roomPixelW = roomGridW * unitSize;
  const roomPixelH = roomGridH * unitSize;

  // Clamp offset to ensure door stays on the wall
  const maxOffset = wall === 'top' || wall === 'bottom'
    ? Math.max(0, roomGridW - widthUnits)
    : Math.max(0, roomGridH - widthUnits);
  const clampedOffset = Math.max(0, Math.min(maxOffset, d.offset || 0));
  const off = clampedOffset * unitSize;

  let arcD = '';
  let leafLine = { x1: 0, y1: 0, x2: 0, y2: 0 };
  let thresholdLine = { x1: 0, y1: 0, x2: 0, y2: 0 };
  let hingePoint = { x: 0, y: 0 };
  let jambs: Array<{ x: number; y: number; w: number; h: number }> = [];
  let badgePos = { x: 0, y: 0, wall };

  const jambSize = 6;

  if (wall === 'bottom') {
    const yWall = roomPixelH;
    const x1 = off;
    const x2 = off + r;
    thresholdLine = { x1, y1: yWall, x2, y2: yWall };
    badgePos = { x: (x1 + x2) / 2, y: yWall - 22, wall: 'bottom' };
    jambs = [
      { x: x1 - jambSize / 2, y: yWall - jambSize / 2, w: jambSize, h: jambSize },
      { x: x2 - jambSize / 2, y: yWall - jambSize / 2, w: jambSize, h: jambSize },
    ];

    if (swing === 'inward_left') {
      hingePoint = { x: x1, y: yWall };
      leafLine = { x1, y1: yWall, x2: x1, y2: yWall - r };
      arcD = `M ${x2} ${yWall} A ${r} ${r} 0 0 0 ${x1} ${yWall - r}`;
    } else if (swing === 'inward_right') {
      hingePoint = { x: x2, y: yWall };
      leafLine = { x1: x2, y1: yWall, x2, y2: yWall - r };
      arcD = `M ${x1} ${yWall} A ${r} ${r} 0 0 1 ${x2} ${yWall - r}`;
    } else if (swing === 'outward_left') {
      hingePoint = { x: x1, y: yWall };
      leafLine = { x1, y1: yWall, x2: x1, y2: yWall + r };
      arcD = `M ${x2} ${yWall} A ${r} ${r} 0 0 1 ${x1} ${yWall + r}`;
    } else {
      // outward_right
      hingePoint = { x: x2, y: yWall };
      leafLine = { x1: x2, y1: yWall, x2, y2: yWall + r };
      arcD = `M ${x1} ${yWall} A ${r} ${r} 0 0 0 ${x2} ${yWall + r}`;
    }
  } else if (wall === 'top') {
    const yWall = 0;
    const x1 = off;
    const x2 = off + r;
    thresholdLine = { x1, y1: yWall, x2, y2: yWall };
    badgePos = { x: (x1 + x2) / 2, y: 22, wall: 'top' };
    jambs = [
      { x: x1 - jambSize / 2, y: yWall - jambSize / 2, w: jambSize, h: jambSize },
      { x: x2 - jambSize / 2, y: yWall - jambSize / 2, w: jambSize, h: jambSize },
    ];

    if (swing === 'inward_left') {
      hingePoint = { x: x1, y: yWall };
      leafLine = { x1, y1: yWall, x2: x1, y2: r };
      arcD = `M ${x2} ${yWall} A ${r} ${r} 0 0 1 ${x1} ${r}`;
    } else if (swing === 'inward_right') {
      hingePoint = { x: x2, y: yWall };
      leafLine = { x1: x2, y1: yWall, x2, y2: r };
      arcD = `M ${x1} ${yWall} A ${r} ${r} 0 0 0 ${x2} ${r}`;
    } else if (swing === 'outward_left') {
      hingePoint = { x: x1, y: yWall };
      leafLine = { x1, y1: yWall, x2: x1, y2: -r };
      arcD = `M ${x2} ${yWall} A ${r} ${r} 0 0 0 ${x1} ${-r}`;
    } else {
      // outward_right
      hingePoint = { x: x2, y: yWall };
      leafLine = { x1: x2, y1: yWall, x2, y2: -r };
      arcD = `M ${x1} ${yWall} A ${r} ${r} 0 0 1 ${x2} ${-r}`;
    }
  } else if (wall === 'left') {
    const xWall = 0;
    const y1 = off;
    const y2 = off + r;
    thresholdLine = { x1: xWall, y1, x2: xWall, y2 };
    badgePos = { x: 54, y: (y1 + y2) / 2, wall: 'left' };
    jambs = [
      { x: xWall - jambSize / 2, y: y1 - jambSize / 2, w: jambSize, h: jambSize },
      { x: xWall - jambSize / 2, y: y2 - jambSize / 2, w: jambSize, h: jambSize },
    ];

    if (swing === 'inward_left') {
      hingePoint = { x: xWall, y: y1 };
      leafLine = { x1: xWall, y1, x2: r, y2: y1 };
      arcD = `M ${xWall} ${y2} A ${r} ${r} 0 0 0 ${r} ${y1}`;
    } else if (swing === 'inward_right') {
      hingePoint = { x: xWall, y: y2 };
      leafLine = { x1: xWall, y1: y2, x2: r, y2 };
      arcD = `M ${xWall} ${y1} A ${r} ${r} 0 0 1 ${r} ${y2}`;
    } else if (swing === 'outward_left') {
      hingePoint = { x: xWall, y: y1 };
      leafLine = { x1: xWall, y1, x2: -r, y2: y1 };
      arcD = `M ${xWall} ${y2} A ${r} ${r} 0 0 1 ${-r} ${y1}`;
    } else {
      // outward_right
      hingePoint = { x: xWall, y: y2 };
      leafLine = { x1: xWall, y1: y2, x2: -r, y2 };
      arcD = `M ${xWall} ${y1} A ${r} ${r} 0 0 0 ${-r} ${y2}`;
    }
  } else {
    // wall === 'right'
    const xWall = roomPixelW;
    const y1 = off;
    const y2 = off + r;
    thresholdLine = { x1: xWall, y1, x2: xWall, y2 };
    badgePos = { x: roomPixelW - 54, y: (y1 + y2) / 2, wall: 'right' };
    jambs = [
      { x: xWall - jambSize / 2, y: y1 - jambSize / 2, w: jambSize, h: jambSize },
      { x: xWall - jambSize / 2, y: y2 - jambSize / 2, w: jambSize, h: jambSize },
    ];

    if (swing === 'inward_left') {
      hingePoint = { x: xWall, y: y1 };
      leafLine = { x1: xWall, y1, x2: xWall - r, y2: y1 };
      arcD = `M ${xWall} ${y2} A ${r} ${r} 0 0 1 ${xWall - r} ${y1}`;
    } else if (swing === 'inward_right') {
      hingePoint = { x: xWall, y: y2 };
      leafLine = { x1: xWall, y1: y2, x2: xWall - r, y2 };
      arcD = `M ${xWall} ${y1} A ${r} ${r} 0 0 0 ${xWall - r} ${y2}`;
    } else if (swing === 'outward_left') {
      hingePoint = { x: xWall, y: y1 };
      leafLine = { x1: xWall, y1, x2: xWall + r, y2: y1 };
      arcD = `M ${xWall} ${y2} A ${r} ${r} 0 0 0 ${xWall + r} ${y1}`;
    } else {
      // outward_right
      hingePoint = { x: xWall, y: y2 };
      leafLine = { x1: xWall, y1: y2, x2: xWall + r, y2 };
      arcD = `M ${xWall} ${y1} A ${r} ${r} 0 0 1 ${xWall + r} ${y2}`;
    }
  }

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

  // 2. Rotate door
  const currentDoor = room.door || { wall: 'bottom', offset: 2, swing: 'inward_left', width: 2 };
  const wallCycle: Record<WallSide, WallSide> = {
    top: 'right',
    right: 'bottom',
    bottom: 'left',
    left: 'top',
  };
  const newWall = wallCycle[currentDoor.wall];
  const maxWallLen = newWall === 'top' || newWall === 'bottom' ? newW : newH;
  const doorWidth = currentDoor.width || 2;
  const newOffset = Math.min(Math.max(0, maxWallLen - doorWidth), currentDoor.offset);
  const newDoor: RoomDoor = {
    ...currentDoor,
    wall: newWall,
    offset: newOffset,
  };

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
      door: newDoor,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Nudges or moves the room door along its current wall.
 */
export async function nudgeDoor(roomId: string, deltaUnits: number): Promise<void> {
  const room = await db.rooms.get(roomId);
  if (!room) return;

  const currentDoor = room.door || { wall: 'bottom', offset: 2, swing: 'inward_left', width: 2 };
  const wall = currentDoor.wall || 'bottom';
  const width = currentDoor.width || 2;
  const maxOffset = wall === 'top' || wall === 'bottom'
    ? Math.max(0, room.gridWidth - width)
    : Math.max(0, room.gridHeight - width);

  const newOffset = Math.max(0, Math.min(maxOffset, currentDoor.offset + deltaUnits));
  await db.rooms.update(roomId, {
    door: {
      ...currentDoor,
      offset: newOffset,
    },
    updatedAt: Date.now(),
  });
}

/**
 * Mirrors (flips) an entire room along either the horizontal or vertical axis:
 * 1. Polygon vertices (flipped coordinates and reversed winding)
 * 2. Entrance door position, wall side, and swing hinge
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

  // 2. Mirror door
  const currentDoor = room.door || { wall: 'bottom', offset: 2, swing: 'inward_left', width: 2 };
  const doorWidth = currentDoor.width || 2;
  let newWall = currentDoor.wall;
  let newOffset = currentDoor.offset;
  let newSwing = currentDoor.swing || 'inward_left';

  const flipSwingMap: Record<DoorSwing, DoorSwing> = {
    'inward_left': 'inward_right',
    'inward_right': 'inward_left',
    'outward_left': 'outward_right',
    'outward_right': 'outward_left',
  };

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

  const newDoor: RoomDoor = {
    ...currentDoor,
    wall: newWall,
    offset: newOffset,
    swing: newSwing,
  };

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
      door: newDoor,
      updatedAt: Date.now(),
    });
  });
}
