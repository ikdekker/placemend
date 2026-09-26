import { Room, RoomDoor, Point2D, Furniture } from '../types';
import { getRoomDoors, getDoorSvgGeometry, DoorSvgGeometry } from './roomGeometry';

export interface RoomLayoutDoor {
  door: RoomDoor;
  geo: DoorSvgGeometry;
  localMidGrid: Point2D; // In room local grid units
  globalMidGrid: Point2D; // In multi-room canvas grid units
  outwardNormal: Point2D;
}

export interface PlacedRoomNode {
  room: Room;
  x: number; // Grid units
  y: number; // Grid units
  width: number;
  height: number;
  polygonPoints?: Point2D[];
  doors: RoomLayoutDoor[];
  furniture: Furniture[];
  isConnected: boolean;
}

export interface CorridorConnection {
  id: string;
  sourceRoomId: string;
  sourceRoomName: string;
  sourceDoorId: string;
  targetRoomId: string;
  targetRoomName: string;
  targetDoorId: string;
  p1: Point2D; // Global grid units
  p2: Point2D; // Global grid units
  midpoint: Point2D; // Global grid units
  doorWidth: number; // Grid units
}

export interface MultiRoomFloorPlan {
  rooms: PlacedRoomNode[];
  corridors: CorridorConnection[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

/**
 * Calculates a unified 2D architectural master floor plan layout
 * for a set of connected and independent rooms.
 */
export function calculateMultiRoomFloorPlan(
  allRooms: Room[],
  allFurniture: Furniture[],
  activeRoomId?: string
): MultiRoomFloorPlan {
  if (!allRooms || allRooms.length === 0) {
    return {
      rooms: [],
      corridors: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    };
  }

  // Pre-calculate room geometry & local doors
  const roomMeta = new Map<string, {
    room: Room;
    width: number;
    height: number;
    doors: Array<{
      door: RoomDoor;
      geo: DoorSvgGeometry;
      localMidGrid: Point2D;
      outwardNormal: Point2D;
    }>;
  }>();

  for (const r of allRooms) {
    const maxPolyX = r.polygonPoints && r.polygonPoints.length > 0 ? Math.max(...r.polygonPoints.map((p) => p.x)) : 0;
    const maxPolyY = r.polygonPoints && r.polygonPoints.length > 0 ? Math.max(...r.polygonPoints.map((p) => p.y)) : 0;
    const width = Math.max(r.gridWidth || 20, maxPolyX);
    const height = Math.max(r.gridHeight || 15, maxPolyY);
    const unitSize = 32;

    const doors = getRoomDoors(r).map((d) => {
      const geo = getDoorSvgGeometry(d, width, height, unitSize, r.polygonPoints);
      const midPxX = (geo.thresholdLine.x1 + geo.thresholdLine.x2) / 2;
      const midPxY = (geo.thresholdLine.y1 + geo.thresholdLine.y2) / 2;
      return {
        door: d,
        geo,
        localMidGrid: { x: midPxX / unitSize, y: midPxY / unitSize },
        outwardNormal: geo.outwardNormal || { x: 0, y: 1 },
      };
    });

    roomMeta.set(r.id, { room: r, width, height, doors });
  }

  // Track placements
  const placedPositions = new Map<string, { x: number; y: number }>();
  const occupiedBoxes: Array<{ id: string; minX: number; minY: number; maxX: number; maxY: number }> = [];

  const doesOverlap = (box: { minX: number; minY: number; maxX: number; maxY: number }, margin = 1) => {
    return occupiedBoxes.some((b) => {
      return (
        box.minX < b.maxX + margin &&
        box.maxX > b.minX - margin &&
        box.minY < b.maxY + margin &&
        box.maxY > b.minY - margin
      );
    });
  };

  // Find root room
  const rootId = (activeRoomId && roomMeta.has(activeRoomId)) ? activeRoomId : allRooms[0].id;
  placedPositions.set(rootId, { x: 0, y: 0 });
  const rootMeta = roomMeta.get(rootId)!;
  occupiedBoxes.push({
    id: rootId,
    minX: 0,
    minY: 0,
    maxX: rootMeta.width,
    maxY: rootMeta.height,
  });

  const queue: string[] = [rootId];
  const processedRooms = new Set<string>([rootId]);
  const corridorMap = new Map<string, CorridorConnection>();

  // Helper to format unique edge key
  const getEdgeKey = (r1: string, d1: string, r2: string, d2: string) => {
    const pair = [ `${r1}:${d1}`, `${r2}:${d2}` ].sort().join('---');
    return pair;
  };

  // BFS to lay out connected sets of rooms
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentPos = placedPositions.get(currentId)!;
    const currentInfo = roomMeta.get(currentId)!;

    for (const d1 of currentInfo.doors) {
      const targetRoomId = d1.door.targetRoomId;
      if (!targetRoomId || !roomMeta.has(targetRoomId)) continue;

      const targetInfo = roomMeta.get(targetRoomId)!;

      // Find matching door in target room
      let d2 = targetInfo.doors.find(
        (td) => td.door.id === d1.door.targetDoorId || td.door.targetRoomId === currentId
      );
      if (!d2 && targetInfo.doors.length > 0) {
        d2 = targetInfo.doors[0];
      }

      // If target room is not placed yet, position it according to door alignment!
      if (!placedPositions.has(targetRoomId)) {
        // Global position of Door 1
        const d1Global: Point2D = {
          x: currentPos.x + d1.localMidGrid.x,
          y: currentPos.y + d1.localMidGrid.y,
        };

        const normal = d1.outwardNormal;
        const d2Local = d2 ? d2.localMidGrid : { x: targetInfo.width / 2, y: 0 };

        // Try placement with minimal gap (e.g. 2m corridor threshold), expanding if collision occurs
        let placedSuccessfully = false;
        let chosenX = currentPos.x + currentInfo.width + 3;
        let chosenY = currentPos.y;

        for (let gap = 2; gap <= 20; gap += 2) {
          const d2Global = {
            x: d1Global.x + normal.x * gap,
            y: d1Global.y + normal.y * gap,
          };

          const candidateX = Math.round(d2Global.x - d2Local.x);
          const candidateY = Math.round(d2Global.y - d2Local.y);

          const candidateBox = {
            minX: candidateX,
            minY: candidateY,
            maxX: candidateX + targetInfo.width,
            maxY: candidateY + targetInfo.height,
          };

          if (!doesOverlap(candidateBox, 1)) {
            chosenX = candidateX;
            chosenY = candidateY;
            placedSuccessfully = true;
            break;
          }
        }

        if (!placedSuccessfully) {
          // If direct directional gap was obstructed, place nearby without overlap
          const maxOccupiedX = Math.max(...occupiedBoxes.map((b) => b.maxX));
          chosenX = maxOccupiedX + 4;
          chosenY = currentPos.y;
        }

        placedPositions.set(targetRoomId, { x: chosenX, y: chosenY });
        occupiedBoxes.push({
          id: targetRoomId,
          minX: chosenX,
          minY: chosenY,
          maxX: chosenX + targetInfo.width,
          maxY: chosenY + targetInfo.height,
        });

        queue.push(targetRoomId);
        processedRooms.add(targetRoomId);
      }

      // Record corridor connection bridge
      if (d2) {
        const edgeKey = getEdgeKey(currentId, d1.door.id || '', targetRoomId, d2.door.id || '');
        if (!corridorMap.has(edgeKey)) {
          const p1Global: Point2D = {
            x: currentPos.x + d1.localMidGrid.x,
            y: currentPos.y + d1.localMidGrid.y,
          };
          const targetPos = placedPositions.get(targetRoomId)!;
          const p2Global: Point2D = {
            x: targetPos.x + d2.localMidGrid.x,
            y: targetPos.y + d2.localMidGrid.y,
          };

          corridorMap.set(edgeKey, {
            id: edgeKey,
            sourceRoomId: currentId,
            sourceRoomName: currentInfo.room.name,
            sourceDoorId: d1.door.id || '',
            targetRoomId,
            targetRoomName: targetInfo.room.name,
            targetDoorId: d2.door.id || '',
            p1: p1Global,
            p2: p2Global,
            midpoint: {
              x: (p1Global.x + p2Global.x) / 2,
              y: (p1Global.y + p2Global.y) / 2,
            },
            doorWidth: Math.max(d1.door.width || 2, d2.door.width || 2),
          });
        }
      }
    }
  }

  // Position any remaining unconnected rooms in clean adjacent rows
  const remainingRooms = allRooms.filter((r) => !placedPositions.has(r.id));
  if (remainingRooms.length > 0) {
    let nextUnconnectedX = Math.min(...occupiedBoxes.map((b) => b.minX));
    const nextUnconnectedY = Math.max(...occupiedBoxes.map((b) => b.maxY)) + 4;

    for (const r of remainingRooms) {
      const info = roomMeta.get(r.id)!;
      placedPositions.set(r.id, { x: nextUnconnectedX, y: nextUnconnectedY });
      occupiedBoxes.push({
        id: r.id,
        minX: nextUnconnectedX,
        minY: nextUnconnectedY,
        maxX: nextUnconnectedX + info.width,
        maxY: nextUnconnectedY + info.height,
      });
      nextUnconnectedX += info.width + 4;
    }
  }

  // Calculate global bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of occupiedBoxes) {
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  }

  // Normalize so bounds start at (margin, margin)
  const margin = 3;
  const shiftX = -minX + margin;
  const shiftY = -minY + margin;

  const placedRooms: PlacedRoomNode[] = allRooms.map((r) => {
    const rawPos = placedPositions.get(r.id) || { x: 0, y: 0 };
    const normX = rawPos.x + shiftX;
    const normY = rawPos.y + shiftY;
    const info = roomMeta.get(r.id)!;

    const doors: RoomLayoutDoor[] = info.doors.map((d) => ({
      door: d.door,
      geo: d.geo,
      localMidGrid: d.localMidGrid,
      globalMidGrid: {
        x: normX + d.localMidGrid.x,
        y: normY + d.localMidGrid.y,
      },
      outwardNormal: d.outwardNormal,
    }));

    const furnInRoom = allFurniture.filter((f) => f.roomId === r.id);
    const hasDoorLinks = doors.some((d) => Boolean(d.door.targetRoomId));

    return {
      room: r,
      x: normX,
      y: normY,
      width: info.width,
      height: info.height,
      polygonPoints: r.polygonPoints,
      doors,
      furniture: furnInRoom,
      isConnected: hasDoorLinks,
    };
  });

  const corridors: CorridorConnection[] = Array.from(corridorMap.values()).map((c) => ({
    ...c,
    p1: { x: c.p1.x + shiftX, y: c.p1.y + shiftY },
    p2: { x: c.p2.x + shiftX, y: c.p2.y + shiftY },
    midpoint: { x: c.midpoint.x + shiftX, y: c.midpoint.y + shiftY },
  }));

  const normMinX = 0;
  const normMinY = 0;
  const normMaxX = maxX + shiftX + margin;
  const normMaxY = maxY + shiftY + margin;

  return {
    rooms: placedRooms,
    corridors,
    bounds: {
      minX: normMinX,
      minY: normMinY,
      maxX: normMaxX,
      maxY: normMaxY,
      width: normMaxX - normMinX,
      height: normMaxY - normMinY,
    },
  };
}
