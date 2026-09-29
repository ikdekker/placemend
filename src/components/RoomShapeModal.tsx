import React, { useState, useRef, useEffect } from 'react';
import { MeterInput } from './MeterInput';
import { describeWalls, setWallLength, pointsBounds } from '../utils/wallEdit';
import { roundCm, snapTo, formatMeters } from '../utils/measure';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { RoomShapeType, Point2D, WallSide, DoorSwing, RoomDoor } from '../types';
import { rotateRoom90Clockwise, mirrorRoom, getRoomDoors, getRoomWallSegments, WallSegment } from '../utils/roomGeometry';
import { 
  X, 
  Check, 
  Pentagon, 
  Square, 
  RotateCw, 
  DoorOpen, 
  Sliders, 
  Plus,
  Minus, 
  Trash2, 
  Layers,
  Sparkles,
  ArrowRight as ArrowRightIcon,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
  FlipHorizontal,
  FlipVertical,
  Edit3
} from 'lucide-react';
import { isAutoSyncEnabled, pushLocalToRemote } from '../services/apiSync';

interface ShapePreset {
  id: RoomShapeType;
  name: string;
  description: string;
  generatePoints: (w: number, h: number, variation?: string) => Point2D[];
  variations?: { id: string; label: string }[];
}


export const SHAPE_PRESETS: ShapePreset[] = [
  {
    id: 'rectangle',
    name: 'Rectangular Room',
    description: 'Standard four-wall classic layout',
    generatePoints: (w, h) => [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  },
  {
    id: 'l_shaped',
    name: 'L-Shaped Room',
    description: 'Room with an alcove or corner cutout in 4 orientations',
    variations: [
      { id: 'br', label: 'Corner: Bottom-Right' },
      { id: 'bl', label: 'Corner: Bottom-Left' },
      { id: 'tr', label: 'Corner: Top-Right' },
      { id: 'tl', label: 'Corner: Top-Left' },
    ],
    generatePoints: (w, h, variation = 'br') => {
      const cutW = snapTo(w * 0.4, 0.1);
      const cutH = snapTo(h * 0.4, 0.1);
      if (variation === 'bl') {
        return [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: cutW, y: h },
          { x: cutW, y: h - cutH },
          { x: 0, y: h - cutH },
        ];
      }
      if (variation === 'tr') {
        return [
          { x: 0, y: 0 },
          { x: w - cutW, y: 0 },
          { x: w - cutW, y: cutH },
          { x: w, y: cutH },
          { x: w, y: h },
          { x: 0, y: h },
        ];
      }
      if (variation === 'tl') {
        return [
          { x: cutW, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
          { x: 0, y: cutH },
          { x: cutW, y: cutH },
        ];
      }
      // default: 'br'
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h - cutH },
        { x: w - cutW, y: h - cutH },
        { x: w - cutW, y: h },
        { x: 0, y: h },
      ];
    },
  },
  {
    id: 't_shaped',
    name: 'T-Shaped Space',
    description: 'Central main corridor with wider wing in 4 directions',
    variations: [
      { id: 'south', label: 'Wing: South' },
      { id: 'north', label: 'Wing: North' },
      { id: 'east', label: 'Wing: East' },
      { id: 'west', label: 'Wing: West' },
    ],
    generatePoints: (w, h, variation = 'south') => {
      const side = snapTo(w * 0.25, 0.1);
      const topH = snapTo(h * 0.45, 0.1);
      if (variation === 'north') {
        return [
          { x: side, y: 0 },
          { x: w - side, y: 0 },
          { x: w - side, y: h - topH },
          { x: w, y: h - topH },
          { x: w, y: h },
          { x: 0, y: h },
          { x: 0, y: h - topH },
          { x: side, y: h - topH },
        ];
      }
      if (variation === 'east') {
        const sideH = snapTo(h * 0.25, 0.1);
        const leftW = snapTo(w * 0.45, 0.1);
        return [
          { x: 0, y: 0 },
          { x: leftW, y: 0 },
          { x: leftW, y: sideH },
          { x: w, y: sideH },
          { x: w, y: h - sideH },
          { x: leftW, y: h - sideH },
          { x: leftW, y: h },
          { x: 0, y: h },
        ];
      }
      if (variation === 'west') {
        const sideH = snapTo(h * 0.25, 0.1);
        const rightW = snapTo(w * 0.45, 0.1);
        return [
          { x: w - rightW, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: w - rightW, y: h },
          { x: w - rightW, y: h - sideH },
          { x: 0, y: h - sideH },
          { x: 0, y: sideH },
          { x: w - rightW, y: sideH },
        ];
      }
      // default: 'south'
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: topH },
        { x: w - side, y: topH },
        { x: w - side, y: h },
        { x: side, y: h },
        { x: side, y: topH },
        { x: 0, y: topH },
      ];
    },
  },
  {
    id: 'u_shaped',
    name: 'U-Shaped Courtyard Layout',
    description: 'Three-sided open wing layout with central cutout',
    generatePoints: (w, h) => {
      const side = snapTo(w * 0.28, 0.1);
      const cutH = snapTo(h * 0.5, 0.1);
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: w - side, y: h },
        { x: w - side, y: h - cutH },
        { x: side, y: h - cutH },
        { x: side, y: h },
        { x: 0, y: h },
      ];
    },
  },
  {
    id: 'alcove',
    name: 'Studio with Bed/Desk Alcove',
    description: 'Main open living room with a dedicated inset nook',
    generatePoints: (w, h) => {
      const nookW = snapTo(w * 0.35, 0.1);
      const nookH = snapTo(h * 0.3, 0.1);
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: nookW, y: h },
        { x: nookW, y: h - nookH },
        { x: 0, y: h - nookH },
      ];
    },
  },
  {
    id: 'chamfered',
    name: 'Chamfered Corner / Bay Angle',
    description: 'Room with a 45-degree angled architectural wall',
    generatePoints: (w, h) => {
      const cut = snapTo(Math.min(w, h) * 0.35, 0.1);
      return [
        { x: 0, y: 0 },
        { x: w - cut, y: 0 },
        { x: w, y: cut },
        { x: w, y: h },
        { x: 0, y: h },
      ];
    },
  },
];


const scalePointsProportionally = (
  points: Point2D[],
  fromW: number,
  fromH: number,
  toW: number,
  toH: number
): Point2D[] => {
  if (points.length < 3 || fromW <= 0 || fromH <= 0 || toW <= 0 || toH <= 0) return points;
  const ratioX = toW / fromW;
  const ratioY = toH / fromH;
  return points.map((p) => ({
    x: roundCm(p.x * ratioX),
    y: roundCm(p.y * ratioY),
  }));
};

const scalePointsToFitBox = (points: Point2D[], targetW: number, targetH: number): Point2D[] => {
  if (points.length < 3) return points;
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (spanX <= 0 || spanY <= 0) return points;

  return points.map((p) => ({
    x: roundCm(((p.x - minX) / spanX) * targetW),
    y: roundCm(((p.y - minY) / spanY) * targetH),
  }));
};

export const RoomShapeModal: React.FC = () => {
  const {
    selectedRoomId,
    setSelectedRoomId,
    isRoomShapeModalOpen,
    setRoomShapeModalOpen,
    setRoomManagerOpen,
    roomShapeModalTab,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'architecture' | 'door'>('architecture');
  const [selectedPresetId, setSelectedPresetId] = useState<RoomShapeType>('rectangle');
  const [selectedPresetVariation, setSelectedPresetVariation] = useState<string>('br');

  React.useEffect(() => {
    if (isRoomShapeModalOpen && roomShapeModalTab) {
      if (roomShapeModalTab === 'door') {
        setActiveTab('door');
      } else {
        setActiveTab('architecture');
      }
    }
  }, [isRoomShapeModalOpen, roomShapeModalTab]);

  const allRooms = useLiveQuery(() => db.rooms.toArray()) || [];

  // Robust Room Query with auto-fallback to first available room if selectedRoomId is invalid or null
  const room = useLiveQuery(async () => {
    if (selectedRoomId) {
      const r = await db.rooms.get(selectedRoomId);
      if (r) return r;
    }
    const all = await db.rooms.toArray();
    return all[0] || undefined;
  }, [selectedRoomId]);

  // Keep store synchronized with active room if ID is null or missing from DB
  useEffect(() => {
    if (!selectedRoomId && room) {
      setSelectedRoomId(room.id);
      return;
    }
    if (selectedRoomId) {
      let isMounted = true;
      db.rooms.get(selectedRoomId).then((r) => {
        if (!r && isMounted && room) {
          setSelectedRoomId(room.id);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [selectedRoomId, room, setSelectedRoomId]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState('');

  const handleSaveRoomName = async () => {
    if (!room) return;
    const trimmed = roomNameInput.trim();
    if (trimmed && trimmed !== room.name) {
      await db.rooms.update(room.id, {
        name: trimmed,
        updatedAt: Date.now(),
      });
    }
    setIsEditingName(false);
  };

  const handleDeleteCurrentRoom = async () => {
    if (!room) return;
    if (allRooms.length <= 1) {
      alert('You must keep at least one room.');
      return;
    }
    if (window.confirm(`Delete "${room.name}" and all furniture & items inside it? This cannot be undone.`)) {
      await db.transaction('rw', [db.rooms, db.furniture, db.containers, db.items], async () => {
        const furnitures = await db.furniture.where('roomId').equals(room.id).toArray();
        const furnIds = furnitures.map((f) => f.id);
        const containers = await db.containers.where('furnitureId').anyOf(furnIds).toArray();
        const contIds = containers.map((c) => c.id);

        await db.items.where('containerId').anyOf(contIds).delete();
        await db.containers.where('furnitureId').anyOf(furnIds).delete();
        await db.furniture.where('roomId').equals(room.id).delete();
        await db.rooms.delete(room.id);
      });

      const remaining = allRooms.filter((r) => r.id !== room.id);
      setSelectedRoomId(remaining[0]?.id || null);
      setRoomShapeModalOpen(false);
    }
  };

  // Fullscreen studio mode toggle (persisted in localStorage, defaults to true per user request)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('placemend_shape_modal_fullscreen');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleFullscreen = async () => {
    setIsFullscreen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('placemend_shape_modal_fullscreen', String(next));
      } catch {
        // ignore
      }
      return next;
    });
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      // ignore
    }
  };

  // Fullscreen Stage mode toggle (allows the dragging blueprint canvas to take over the entire screen for maximum dragging space)
  const [isStageFullscreen, setIsStageFullscreen] = useState<boolean>(false);
  const [showFullscreenHud, setShowFullscreenHud] = useState<boolean>(false);

  const enterStageFullscreen = async () => {
    setIsStageFullscreen(true);
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      }
    } catch {
      // ignore
    }
  };

  const exitStageFullscreen = async () => {
    setIsStageFullscreen(false);
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {
      // ignore
    }
  };

  // Synchronize fullscreen state if user presses Escape or exits native browser fullscreen
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isStageFullscreen) {
        setIsStageFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [isStageFullscreen]);

  // Local state for custom polygon editing
  const [customPoints, setCustomPoints] = useState<Point2D[]>([]);
  const [hasInitializedCustom, setHasInitializedCustom] = useState(false);
  const [draggingPointIdx, setDraggingPointIdx] = useState<number | null>(null);
  const [selectedCornerIdx, setSelectedCornerIdx] = useState<number | null>(null);
  const [targetEdgeIdx, setTargetEdgeIdx] = useState<number>(0);
  const customSvgRef = useRef<SVGSVGElement | null>(null);

  // Editable room boundary dimensions (local state, saved on "Save Room Shape")
  const [boundaryWidth, setBoundaryWidth] = useState<number>(24);
  const [boundaryHeight, setBoundaryHeight] = useState<number>(18);
  const [scaleShapeWithBoundary, setScaleShapeWithBoundary] = useState<boolean>(true);
  const [wallStepCm, setWallStepCm] = useState<number>(5);
  const [showCornerEditor, setShowCornerEditor] = useState<boolean>(false);

  // Move the selected corner by the chosen step (centimeter-exact), growing the boundary if needed
  const nudgeCorner = (dx: number, dy: number) => {
    if (selectedCornerIdx === null) return;
    const step = wallStepCm / 100;
    const next = customPoints.map((p, i) =>
      i === selectedCornerIdx ? { x: Math.max(0, roundCm(p.x + dx * step)), y: Math.max(0, roundCm(p.y + dy * step)) } : p
    );
    setCustomPoints(next);
    const bounds = pointsBounds(next);
    if (bounds.width > boundaryWidth) setBoundaryWidth(bounds.width);
    if (bounds.height > boundaryHeight) setBoundaryHeight(bounds.height);
  };

  // Change one wall to an exact length; the room boundary follows the new shape
  const applyWallLength = (wallIndex: number, meters: number) => {
    if (!(meters > 0)) return;
    const next = setWallLength(customPoints, wallIndex, meters);
    const bounds = pointsBounds(next);
    setCustomPoints(next);
    setBoundaryWidth(bounds.width);
    setBoundaryHeight(bounds.height);
  };

  const handleUpdateBoundaryWidth = (newW: number) => {
    if (newW <= 0 || newW === boundaryWidth) return;
    if (scaleShapeWithBoundary && customPoints.length >= 3 && boundaryWidth > 0) {
      setCustomPoints((prev) => scalePointsProportionally(prev, boundaryWidth, boundaryHeight, newW, boundaryHeight));
    }
    setBoundaryWidth(newW);
  };

  const handleUpdateBoundaryHeight = (newH: number) => {
    if (newH <= 0 || newH === boundaryHeight) return;
    if (scaleShapeWithBoundary && customPoints.length >= 3 && boundaryHeight > 0) {
      setCustomPoints((prev) => scalePointsProportionally(prev, boundaryWidth, boundaryHeight, boundaryWidth, newH));
    }
    setBoundaryHeight(newH);
  };

  const handleAutoFitBoundary = () => {
    if (customPoints.length >= 3) {
      const maxX = Math.max(...customPoints.map((p) => p.x));
      const maxY = Math.max(...customPoints.map((p) => p.y));
      setBoundaryWidth(Math.max(3, maxX));
      setBoundaryHeight(Math.max(3, maxY));
    }
  };

  const handleFitShapeToBoundary = () => {
    if (customPoints.length >= 3) {
      setCustomPoints((prev) => scalePointsToFitBox(prev, boundaryWidth, boundaryHeight));
    }
  };

  const handleResetToRectangle = () => {
    if (!room) return;
    setCustomPoints([
      { x: 0, y: 0 },
      { x: boundaryWidth, y: 0 },
      { x: boundaryWidth, y: boundaryHeight },
      { x: 0, y: boundaryHeight },
    ]);
    setSelectedCornerIdx(null);
    setTargetEdgeIdx(0);
  };

  // Local state for multi-door editing
  const [doorsList, setDoorsList] = useState<RoomDoor[]>([]);
  const [activeDoorId, setActiveDoorId] = useState<string>('door-1');
  const [hasInitializedDoors, setHasInitializedDoors] = useState(false);

  // Reset initialization when modal opens/closes
  React.useEffect(() => {
    if (!isRoomShapeModalOpen) {
      setHasInitializedCustom(false);
      setHasInitializedDoors(false);
    }
  }, [isRoomShapeModalOpen]);

  // Synchronize initial values when room loads
  React.useEffect(() => {
    if (room && isRoomShapeModalOpen) {
      if (!hasInitializedCustom) {
        if (room.polygonPoints && room.polygonPoints.length >= 3) {
          setCustomPoints(room.polygonPoints);
          const maxX = Math.max(...room.polygonPoints.map((p) => p.x));
          const maxY = Math.max(...room.polygonPoints.map((p) => p.y));
          setBoundaryWidth(Math.max(room.gridWidth, maxX));
          setBoundaryHeight(Math.max(room.gridHeight, maxY));
        } else {
          setCustomPoints([
            { x: 0, y: 0 },
            { x: room.gridWidth, y: 0 },
            { x: room.gridWidth, y: room.gridHeight },
            { x: 0, y: room.gridHeight },
          ]);
          setBoundaryWidth(room.gridWidth);
          setBoundaryHeight(room.gridHeight);
        }
        setHasInitializedCustom(true);
      }

      if (!hasInitializedDoors) {
        const initialDoors = getRoomDoors(room);
        setDoorsList(initialDoors);
        if (initialDoors.length > 0) {
          setActiveDoorId(initialDoors[0].id || 'door-1');
        }
        setHasInitializedDoors(true);
      }
    }
  }, [room, isRoomShapeModalOpen, hasInitializedCustom, hasInitializedDoors]);

  // Un-snapped position of a screen point in room meters
  const getSvgRaw = (clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!customSvgRef.current) return null;
    const svg = customSvgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const t = pt.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  };

  const clampSnapPoint = (x: number, y: number) => {
    const limitX = Math.max(boundaryWidth, ...(customPoints.length > 0 ? customPoints.map((p) => p.x) : [boundaryWidth]));
    const limitY = Math.max(boundaryHeight, ...(customPoints.length > 0 ? customPoints.map((p) => p.y) : [boundaryHeight]));
    return {
      x: Math.max(0, Math.min(limitX, snapTo(x, 0.1))),
      y: Math.max(0, Math.min(limitY, snapTo(y, 0.1))),
    };
  };

  // A drag keeps the offset between finger and corner, and only starts after a small movement,
  // so tapping a corner selects it instead of teleporting it under the finger.
  const cornerDragRef = useRef<{ idx: number; startX: number; startY: number; offX: number; offY: number; moved: boolean } | null>(null);

  const startCornerDrag = (idx: number, e: React.PointerEvent) => {
    const p = customPoints[idx];
    const raw = getSvgRaw(e.clientX, e.clientY);
    if (!p || !raw) return;
    cornerDragRef.current = { idx, startX: e.clientX, startY: e.clientY, offX: p.x - raw.x, offY: p.y - raw.y, moved: false };
    setSelectedCornerIdx(idx);
    setTargetEdgeIdx(idx);
    setDraggingPointIdx(idx);
  };

  // One decision for the whole stage: the NEAREST corner (or wall '+') within ~30 screen pixels wins.
  // Separate per-corner touch circles overlapped in small rooms and the wrong corner was grabbed.
  const handleStagePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = customSvgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm || customPoints.length === 0) return;
    const toScreen = (x: number, y: number) => ({ x: x * ctm.a + y * ctm.c + ctm.e, y: x * ctm.b + y * ctm.d + ctm.f });

    let best: { kind: 'corner' | 'plus'; idx: number; dist: number } | null = null;
    customPoints.forEach((p, idx) => {
      const sp = toScreen(p.x, p.y);
      const dist = Math.hypot(e.clientX - sp.x, e.clientY - sp.y);
      if (dist <= 32 && (!best || dist < best.dist)) best = { kind: 'corner', idx, dist };
    });
    customPoints.forEach((p1, idx) => {
      const p2 = customPoints[(idx + 1) % customPoints.length];
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 2.5) return; // same rule as the visible '+'
      const sp = toScreen((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      const dist = Math.hypot(e.clientX - sp.x, e.clientY - sp.y) + 6; // a corner wins a tie
      if (dist <= 30 && (!best || dist < best.dist)) best = { kind: 'plus', idx, dist };
    });
    if (!best) return;
    e.preventDefault();
    e.stopPropagation();
    const target = best as { kind: 'corner' | 'plus'; idx: number; dist: number };
    if (target.kind === 'corner') startCornerDrag(target.idx, e);
    else handleStartAddPointAtEdge(target.idx, e);
  };

  // Global pointer listeners while dragging a vertex circle
  useEffect(() => {
    if (draggingPointIdx === null || !room) return;

    const handlePointerMove = (e: PointerEvent) => {
      const drag = cornerDragRef.current;
      if (!drag) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return; // a tap only selects
        drag.moved = true;
      }
      const raw = getSvgRaw(e.clientX, e.clientY);
      if (!raw) return;
      const coords = clampSnapPoint(raw.x + drag.offX, raw.y + drag.offY);
      setCustomPoints((prev) => {
        if (!prev[draggingPointIdx] || (prev[draggingPointIdx].x === coords.x && prev[draggingPointIdx].y === coords.y)) {
          return prev;
        }
        const updated = [...prev];
        updated[draggingPointIdx] = coords;
        return updated;
      });
    };

    const handlePointerUp = () => {
      const moved = cornerDragRef.current?.moved;
      cornerDragRef.current = null;
      setDraggingPointIdx(null);
      if (!moved) return; // nothing was dragged: leave the room's size alone
      setCustomPoints((current) => {
        if (current.length >= 3) {
          const maxX = Math.max(...current.map((p) => p.x));
          const maxY = Math.max(...current.map((p) => p.y));
          if (maxX > 0 && maxY > 0) {
            setBoundaryWidth(Math.max(3, maxX));
            setBoundaryHeight(Math.max(3, maxY));
          }
        }
        return current;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingPointIdx, room]);

  const handleDeleteCustomPoint = (index: number) => {
    if (customPoints.length <= 3) {
      alert('A room polygon must have at least 3 corner points.');
      return;
    }
    setCustomPoints(customPoints.filter((_, i) => i !== index));
    if (selectedCornerIdx === index) {
      setSelectedCornerIdx(null);
    } else if (selectedCornerIdx !== null && selectedCornerIdx > index) {
      setSelectedCornerIdx(selectedCornerIdx - 1);
    }
  };

  // Keyboard shortcuts: Delete/Backspace to remove selected corner, Escape to exit Stage Fullscreen
  useEffect(() => {
    if (!isRoomShapeModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'Escape' && isStageFullscreen) {
        setIsStageFullscreen(false);
        return;
      }
      // Backspace while typing in a field (e.g. this corner's X/Y) must edit the text, not delete the corner
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCornerIdx !== null && !isTyping) {
        if (customPoints.length > 3) {
          e.preventDefault();
          handleDeleteCustomPoint(selectedCornerIdx);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRoomShapeModalOpen, isStageFullscreen, selectedCornerIdx, customPoints]);

  if (!isRoomShapeModalOpen) return null;

  if (!room) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto mb-3 text-indigo-600 shadow-sm">
            <Pentagon className="w-7 h-7" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 mb-1">No Room Selected</h3>
          <p className="text-xs text-slate-500 mb-4">
            Please create or select a room before configuring its shape and doors.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                setRoomShapeModalOpen(false);
                setRoomManagerOpen(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition-all active:scale-95"
            >
              Open Room Manager
            </button>
            <button
              onClick={() => setRoomShapeModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Explicit Single-Button Override with confirmation dialog to protect custom layouts
  const handleOverrideWithPreset = () => {
    if (!room) return;
    const targetPreset = SHAPE_PRESETS.find((p) => p.id === selectedPresetId) || SHAPE_PRESETS[0];
    const isCustomized = customPoints.length !== 4 || (room.shapeType && room.shapeType !== 'rectangle');

    if (isCustomized) {
      const ok = window.confirm(
        `⚠️ OVERRIDE ROOM ARCHITECTURE?\n\nThis will replace all your current custom wall corners and layout with the "${targetPreset.name}" template.\n\nClick OK to replace the room layout.`
      );
      if (!ok) return;
    }

    const points = targetPreset.generatePoints(boundaryWidth, boundaryHeight, selectedPresetVariation);
    setCustomPoints(points);
    setSelectedCornerIdx(null);
    setTargetEdgeIdx(0);
  };

  // 90° Clockwise Room Rotation (commits active custom points first so current layout rotates)
  const handleRotateRoom90 = async () => {
    if (!room) return;
    if (customPoints.length >= 3) {
      await db.rooms.update(room.id, {
        shapeType: 'custom_polygon',
        polygonPoints: customPoints,
        updatedAt: Date.now(),
      });
    }
    await rotateRoom90Clockwise(room.id);
    const updated = await db.rooms.get(room.id);
    if (updated?.polygonPoints) {
      setCustomPoints(updated.polygonPoints);
    }
  };

  // Mirror Room (Horizontal / Vertical)
  const handleMirrorRoom = async (axis: 'horizontal' | 'vertical') => {
    if (!room) return;
    if (customPoints.length >= 3) {
      await db.rooms.update(room.id, {
        shapeType: 'custom_polygon',
        polygonPoints: customPoints,
        updatedAt: Date.now(),
      });
    }
    await mirrorRoom(room.id, axis);
    const updated = await db.rooms.get(room.id);
    if (updated?.polygonPoints) {
      setCustomPoints(updated.polygonPoints);
    }
  };

  // Project click coordinate onto a wall line segment [p1 -> p2] clamped within boundaries
  const projectPointOntoSegment = (p: Point2D, a: Point2D, b: Point2D): Point2D => {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    if (lenSq === 0) return { x: a.x, y: a.y };
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
    // Keep it slightly inset from vertices so it creates a distinct corner
    t = Math.max(0.1, Math.min(0.9, t));
    const projX = snapTo(a.x + t * abx, 0.1);
    const projY = snapTo(a.y + t * aby, 0.1);
    return {
      x: Math.max(0, Math.min(boundaryWidth, projX)),
      y: Math.max(0, Math.min(boundaryHeight, projY)),
    };
  };

  // Custom Shape Point Management (Insert on any wall/edge & immediately enable dragging)
  const handleStartAddPointAtEdge = (edgeIdx: number, e?: React.PointerEvent, clickCoords?: Point2D) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (customPoints.length === 0) return;
    const safeEdge = Math.max(0, Math.min(customPoints.length - 1, edgeIdx));
    const p1 = customPoints[safeEdge];
    const p2 = customPoints[(safeEdge + 1) % customPoints.length];

    let newPt: Point2D;
    if (clickCoords) {
      newPt = projectPointOntoSegment(clickCoords, p1, p2);
    } else {
      newPt = {
        x: snapTo((p1.x + p2.x) / 2, 0.1),
        y: snapTo((p1.y + p2.y) / 2, 0.1),
      };
    }

    // Ensure it doesn't land on exact existing vertex coordinates (e.g. 1m wall segments)
    if ((newPt.x === p1.x && newPt.y === p1.y) || (newPt.x === p2.x && newPt.y === p2.y)) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      newPt = {
        x: Math.max(0, Math.min(boundaryWidth, snapTo((p1.x + p2.x) / 2 + nx, 0.1))),
        y: Math.max(0, Math.min(boundaryHeight, snapTo((p1.y + p2.y) / 2 + ny, 0.1))),
      };
    }

    const next = [...customPoints];
    const insertIdx = safeEdge + 1;
    next.splice(insertIdx, 0, newPt);
    setCustomPoints(next);
    setSelectedCornerIdx(insertIdx);
    setTargetEdgeIdx(insertIdx);
    // Directly enable drag on the newly created point so moving finger/mouse extrudes it immediately!
    setDraggingPointIdx(insertIdx);
  };

  const handleInsertPointAtEdge = (edgeIdx: number, clickCoords?: Point2D) => {
    handleStartAddPointAtEdge(edgeIdx, undefined, clickCoords);
  };

  const handleAddCustomPoint = (edgeIdx?: number) => {
    if (customPoints.length === 0) return;
    if (edgeIdx !== undefined && !isNaN(edgeIdx)) {
      handleInsertPointAtEdge(edgeIdx);
      return;
    }
    if (selectedCornerIdx !== null && selectedCornerIdx >= 0 && selectedCornerIdx < customPoints.length) {
      handleInsertPointAtEdge(selectedCornerIdx);
      return;
    }
    const defaultIdx = targetEdgeIdx < customPoints.length ? targetEdgeIdx : customPoints.length - 1;
    handleInsertPointAtEdge(defaultIdx);
  };

  const handleUpdateCustomPoint = (index: number, field: 'x' | 'y', val: number) => {
    const next = [...customPoints];
    const maxVal = Math.max(200, field === 'x' ? boundaryWidth : boundaryHeight);
    next[index] = {
      ...next[index],
      [field]: Math.max(0, Math.min(maxVal, val)),
    };
    setCustomPoints(next);
  };

  const handleSaveCustomShape = async () => {
    if (customPoints.length < 3) return;
    const now = Date.now();
    await db.rooms.update(room.id, {
      shapeType: 'custom_polygon',
      polygonPoints: customPoints,
      gridWidth: boundaryWidth,
      gridHeight: boundaryHeight,
      updatedAt: now,
    });
    setRoomShapeModalOpen(false);

    if (isAutoSyncEnabled()) {
      pushLocalToRemote().catch(console.error);
    }
  };

  // Live auto-save helper for doors
  const persistDoors = async (newDoors: RoomDoor[]) => {
    setDoorsList(newDoors);
    if (room) {
      await db.rooms.update(room.id, {
        doors: newDoors,
        door: newDoors[0] || undefined,
        updatedAt: Date.now(),
      });
    }
  };

  // Active selected door helper
  const selectedDoor = doorsList.find((d) => d.id === activeDoorId) || doorsList[0] || null;

  const updateSelectedDoor = async (patch: Partial<RoomDoor>) => {
    if (!selectedDoor) return;
    const updated = doorsList.map((d) => (d.id === selectedDoor.id ? { ...d, ...patch } : d));
    await persistDoors(updated);
  };

  const handleAddDoor = async (preferredWall?: WallSide | string, preferredSegment?: number) => {
    const newId = `door-${Date.now()}`;
    const newIndex = doorsList.length + 1;
    const defaultWalls: WallSide[] = ['bottom', 'top', 'left', 'right'];
    const chosenWall = (preferredWall as WallSide) || defaultWalls[(newIndex - 1) % 4];
    // Center a standard 1m door on the chosen wall so it always fits, even on short walls
    const segments = room ? getRoomWallSegments(room) : [];
    const seg = preferredSegment !== undefined
      ? segments[preferredSegment]
      : segments.find((s) => s.id === chosenWall || s.wallSide === chosenWall);
    const wallLen = seg ? seg.length : (chosenWall === 'top' || chosenWall === 'bottom' ? room?.gridWidth ?? 4 : room?.gridHeight ?? 4);
    const doorWidth = Math.min(1, wallLen);
    const newDoor: RoomDoor = {
      id: newId,
      label: newIndex === 1 ? 'Main Entrance' : `Door ${newIndex}`,
      wall: chosenWall,
      segmentIndex: preferredSegment,
      offset: Math.max(0, roundCm((wallLen - doorWidth) / 2)),
      swing: 'inward_left',
      width: doorWidth,
    };
    const updated = [...doorsList, newDoor];
    setActiveDoorId(newId);
    await persistDoors(updated);
  };

  const handleDeleteDoor = async (doorId: string) => {
    const remaining = doorsList.filter((d) => d.id !== doorId);
    if (activeDoorId === doorId) {
      setActiveDoorId(remaining.length > 0 ? (remaining[0].id || '') : '');
    }
    await persistDoors(remaining);
  };

  const wallSegments = room ? getRoomWallSegments(room) : [];
  const selectedDoorSeg = selectedDoor
    ? (selectedDoor.segmentIndex !== undefined
        ? wallSegments[selectedDoor.segmentIndex]
        : wallSegments.find((s) => s.id === selectedDoor.wall || s.wallSide === selectedDoor.wall))
    : undefined;
  const currentSegLen = selectedDoorSeg
    ? selectedDoorSeg.length
    : (selectedDoor?.wall === 'top' || selectedDoor?.wall === 'bottom' ? room.gridWidth : room.gridHeight);
  const maxDoorOffset = selectedDoor
    ? Math.max(0, roundCm(currentSegLen - (selectedDoor.width || 2)))
    : 0;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-white flex flex-col p-0 select-none animate-in fade-in duration-150'
          : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150'
      }
    >
      <div
        className={
          isFullscreen
            ? 'w-full h-full bg-white flex flex-col rounded-none border-0 overflow-hidden'
            : 'w-full max-w-6xl h-[92vh] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col'
        }
      >
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/90 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 flex-shrink-0">
                <Pentagon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-tight">
                  Room Architecture & Shape Studio
                </h3>
                {isEditingName ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="text"
                      autoFocus
                      value={roomNameInput}
                      onChange={(e) => setRoomNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRoomName();
                        if (e.key === 'Escape') setIsEditingName(false);
                      }}
                      className="bg-white text-slate-900 text-xs sm:text-sm px-2.5 py-0.5 rounded-lg border border-blue-400 font-bold focus:outline-none focus:ring-2 focus:ring-blue-100 max-w-[220px] shadow-xs"
                      placeholder="Room name"
                    />
                    <button
                      onClick={handleSaveRoomName}
                      className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer flex-shrink-0"
                      title="Save room name"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setIsEditingName(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-slate-500 font-medium truncate">
                      "{room.name}" • <span className="font-mono">{activeTab === 'architecture' ? boundaryWidth : room.gridWidth}m × {activeTab === 'architecture' ? boundaryHeight : room.gridHeight}m</span>
                    </p>
                    <button
                      onClick={() => {
                        setRoomNameInput(room.name);
                        setIsEditingName(true);
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                      title={`Rename "${room.name}"`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Fullscreen Studio Toggle Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title={isFullscreen ? 'Exit Fullscreen Studio (Windowed)' : 'Maximize to Fullscreen Studio'}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4 text-slate-700" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-slate-700" />
                  <span className="hidden sm:inline">Fullscreen Studio</span>
                </>
              )}
            </button>

            <div className="h-5 w-px bg-slate-200 mx-0.5" />

            <button
              onClick={handleDeleteCurrentRoom}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title={`Delete "${room.name}" and all furniture & items`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setRoomShapeModalOpen(false)}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/80 px-4 py-1.5 gap-1.5 text-xs font-bold flex-shrink-0">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`py-2 px-3 sm:px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'architecture' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Pentagon className="w-3.5 h-3.5" />
            <span>Room Architecture & Shape</span>
            <span className="ml-0.5 px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-700 text-[10px] font-mono">
              {customPoints.length} corners
            </span>
          </button>
          <button
            onClick={() => setActiveTab('door')}
            className={`py-2 px-3 sm:px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'door' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            <span>Doors ({doorsList.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        {(() => {
          // Dynamic Bounding Box encompassing (0,0), boundary frame, and ALL custom points
          const allX = [0, boundaryWidth, ...(customPoints.length > 0 ? customPoints.map((p) => p.x) : [boundaryWidth])];
          const allY = [0, boundaryHeight, ...(customPoints.length > 0 ? customPoints.map((p) => p.y) : [boundaryHeight])];
          const minX = Math.min(...allX);
          const maxX = Math.max(...allX);
          const minY = Math.min(...allY);
          const maxY = Math.max(...allY);

          const spanX = Math.max(1, maxX - minX);
          const spanY = Math.max(1, maxY - minY);
          const padX = Math.max(1.8, spanX * 0.12);
          const padY = Math.max(1.8, spanY * 0.12);

          const stageViewBox = `${minX - padX} ${minY - padY} ${spanX + padX * 2} ${spanY + padY * 2}`;

          // Visual scale factor based on effective dimension (normalized to ~24m reference room)
          const effectiveSpan = Math.max(spanX, spanY);
          const vScale = Math.max(0.28, Math.min(2.0, effectiveSpan / 24));

          return (
            <div
              className={`flex-1 min-h-0 ${
                activeTab === 'architecture'
                  ? 'flex flex-col p-3 sm:p-4 overflow-y-auto lg:overflow-hidden custom-scrollbar'
                  : 'p-4 sm:p-6 overflow-y-auto custom-scrollbar'
              }`}
            >
              {/* UNIFIED ARCHITECTURE STUDIO: 2-COLUMN SPLIT STUDIO LAYOUT */}
              {activeTab === 'architecture' && (
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
                  {/* LEFT COLUMN: Expansive Interactive Blueprint Stage (Full-screenable by itself) */}
                  <div
                    className={
                      isStageFullscreen
                        ? 'fixed inset-0 z-[70] bg-slate-950 flex flex-col select-none overflow-hidden animate-in fade-in duration-150'
                        : 'flex-1 min-h-[460px] lg:min-h-0 flex flex-col bg-slate-950 rounded-2xl border border-slate-800 relative overflow-hidden shadow-inner'
                    }
                  >
                    {/* Blueprint Stage Top Bar with Quick Transforms & Stage Fullscreen */}
                    <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between z-10 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
                        <span className="text-xs font-bold text-slate-200">
                          {isStageFullscreen ? 'Architectural Stage (Fullscreen Drag Studio)' : 'Architectural Stage'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          ({boundaryWidth}m × {boundaryHeight}m boundary)
                        </span>
                        <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 font-mono text-[10px] border border-slate-700">
                          10 cm snap
                        </span>
                        {(maxX > boundaryWidth || maxY > boundaryHeight) && (
                          <button
                            type="button"
                            onClick={handleAutoFitBoundary}
                            className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono text-[10px] border border-amber-500/40 cursor-pointer flex items-center gap-1"
                            title="Shape corners extend beyond the boundary box. Click to expand boundary to fit shape."
                          >
                            <span>Exceeds boundary • Click to Auto-fit</span>
                          </button>
                        )}
                      </div>

                      {/* Room Transforms: Rotate & Mirror + Stage Fullscreen */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={handleRotateRoom90}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-200 hover:text-white font-bold text-[11px] border border-slate-700 shadow-xs transition-all active:scale-95 cursor-pointer"
                          title="Rotate room and all furniture 90° clockwise"
                        >
                          <RotateCw className="w-3 h-3 text-sky-400" />
                          <span>Rotate 90°</span>
                        </button>
                        <button
                          onClick={() => handleMirrorRoom('horizontal')}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-200 hover:text-white font-bold text-[11px] border border-slate-700 shadow-xs transition-all active:scale-95 cursor-pointer"
                          title="Mirror horizontally (Flip Left ↔ Right)"
                        >
                          <FlipHorizontal className="w-3 h-3 text-sky-400" />
                          <span>Flip Horiz ↔</span>
                        </button>
                        <button
                          onClick={() => handleMirrorRoom('vertical')}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-200 hover:text-white font-bold text-[11px] border border-slate-700 shadow-xs transition-all active:scale-95 cursor-pointer"
                          title="Mirror vertically (Flip Top ↕ Bottom)"
                        >
                          <FlipVertical className="w-3 h-3 text-sky-400" />
                          <span>Flip Vert ↕</span>
                        </button>

                        {/* Fullscreen Stage Mode Toggle Controls */}
                        {isStageFullscreen ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowFullscreenHud((prev) => !prev)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] border shadow-xs transition-all active:scale-95 cursor-pointer ${
                                showFullscreenHud
                                  ? 'bg-blue-600 border-blue-500 text-white'
                                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                              }`}
                              title={showFullscreenHud ? 'Hide floating controls panel' : 'Show floating controls panel'}
                            >
                              <Sliders className="w-3 h-3" />
                              <span>{showFullscreenHud ? 'Hide Controls' : 'Show Controls'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveCustomShape}
                              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                              title="Save current custom room shape"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Save Shape</span>
                            </button>
                            <button
                              type="button"
                              onClick={exitStageFullscreen}
                              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 font-bold text-xs border border-amber-500/40 shadow-md transition-all active:scale-95 cursor-pointer"
                              title="Exit Stage Fullscreen (or press Escape)"
                            >
                              <Minimize2 className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Exit Fullscreen Stage</span>
                              <kbd className="hidden sm:inline px-1 py-0.2 bg-slate-900 text-slate-400 text-[9px] rounded font-mono border border-slate-700">Esc</kbd>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={enterStageFullscreen}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20 transition-all active:scale-95 cursor-pointer ml-0.5"
                            title="Expand dragging stage to full screen for maximum dragging space"
                          >
                            <Maximize2 className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Fullscreen Stage</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Interactive SVG Blueprint Stage */}
                    <div className="flex-1 w-full min-h-0 relative flex items-center justify-center p-3 select-none touch-none overflow-hidden">
                      <svg
                        ref={customSvgRef}
                        onPointerDown={handleStagePointerDown}
                        className="w-full h-full select-none touch-none max-h-full"
                        viewBox={stageViewBox}
                        preserveAspectRatio="xMidYMid meet"
                      >
                        <defs>
                          {/* Continuous 1m Architectural Blueprint Grid */}
                          <pattern
                            id="stage-blueprint-grid"
                            width="1"
                            height="1"
                            patternUnits="userSpaceOnUse"
                          >
                            <circle
                              cx="0"
                              cy="0"
                              r={0.04 * vScale}
                              fill="#475569"
                              opacity="0.6"
                            />
                          </pattern>
                          {/* 5m Major Grid Accents */}
                          <pattern
                            id="stage-blueprint-major-grid"
                            width="5"
                            height="5"
                            patternUnits="userSpaceOnUse"
                          >
                            <circle
                              cx="0"
                              cy="0"
                              r={0.08 * vScale}
                              fill="#64748b"
                              opacity="0.85"
                            />
                          </pattern>
                        </defs>

                        {/* Uniform Drafting Canvas Grid (Covers whole visible stage evenly without arbitrary room cutoffs) */}
                        <rect
                          x={minX - padX}
                          y={minY - padY}
                          width={spanX + padX * 2}
                          height={spanY + padY * 2}
                          fill="url(#stage-blueprint-grid)"
                          pointerEvents="none"
                        />
                        <rect
                          x={minX - padX}
                          y={minY - padY}
                          width={spanX + padX * 2}
                          height={spanY + padY * 2}
                          fill="url(#stage-blueprint-major-grid)"
                          pointerEvents="none"
                        />

                        {/* Active Custom Polygon Fill */}
                        {customPoints.length >= 3 && (
                          <polygon
                            points={customPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                            fill="#3b82f6"
                            fillOpacity="0.22"
                            stroke="#60a5fa"
                            strokeWidth={Math.max(0.35, 1.1 * vScale)}
                          />
                        )}

                        {/* 1. Wall Lines (Clean Architectural Perimeter, No Accidental Point Spawning) */}
                        {customPoints.map((p1, idx) => {
                          const p2 = customPoints[(idx + 1) % customPoints.length];
                          const isTargetWall = targetEdgeIdx === idx || selectedCornerIdx === idx;

                          return (
                            <line
                              key={`wall-line-${idx}`}
                              x1={p1.x}
                              y1={p1.y}
                              x2={p2.x}
                              y2={p2.y}
                              stroke={isTargetWall ? '#38bdf8' : '#60a5fa'}
                              strokeWidth={Math.max(0.6, 1.2 * vScale)}
                              strokeDasharray={isTargetWall ? '2 2' : undefined}
                              pointerEvents="none"
                            />
                          );
                        })}

                        {/* 2. Wall Length Dimension Badges (Offset cleanly away from the 50% midpoint '+' handle) */}
                        {customPoints.map((p1, idx) => {
                          const p2 = customPoints[(idx + 1) % customPoints.length];
                          const wallLen = roundCm(Math.hypot(p2.x - p1.x, p2.y - p1.y));
                          if (wallLen <= 0) return null;

                          // Position at 25% of the wall so it never overlaps the '+' button at 50%
                          const lx = p1.x * 0.75 + p2.x * 0.25;
                          const ly = p1.y * 0.75 + p2.y * 0.25;
                          const dx = p2.x - p1.x;
                          const dy = p2.y - p1.y;
                          const len = Math.hypot(dx, dy) || 1;
                          const nx = -dy / len;
                          const ny = dx / len;
                          const labelDist = 1.35 * vScale;
                          const cx = lx + nx * labelDist;
                          const cy = ly + ny * labelDist;

                          return (
                            <g key={`wall-badge-${idx}`} pointerEvents="none" className="select-none">
                              <rect
                                x={cx - 1.0 * vScale}
                                y={cy - 0.55 * vScale}
                                width={2.0 * vScale}
                                height={1.1 * vScale}
                                rx={0.35 * vScale}
                                fill="#0f172a"
                                fillOpacity="0.88"
                                stroke="#334155"
                                strokeWidth={0.15 * vScale}
                              />
                              <text
                                x={cx}
                                y={cy + 0.3 * vScale}
                                fill="#94a3b8"
                                fontSize={0.75 * vScale}
                                fontWeight="bold"
                                textAnchor="middle"
                                fontFamily="monospace"
                              >
                                {wallLen}m
                              </text>
                            </g>
                          );
                        })}

                        {/* 3. Midpoint '+' Handles (Shown at the 50% midpoint of walls >= 2.5m, compact and clean) */}
                        {customPoints.map((p1, idx) => {
                          const p2 = customPoints[(idx + 1) % customPoints.length];
                          const wallLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                          if (wallLen < 2.5) return null;
                          const mx = (p1.x + p2.x) / 2;
                          const my = (p1.y + p2.y) / 2;
                          const plusRadius = 0.85 * vScale;
                          const hitRadius = 1.35 * vScale;

                          return (
                            <g
                              key={`plus-handle-${idx}`}
                              data-plus-edge={idx}
                              className="cursor-pointer group select-none touch-none"
                              pointerEvents="none"
                            >
                              <title>Add corner point on Wall #{idx + 1}</title>
                              <circle
                                cx={mx}
                                cy={my}
                                r={hitRadius}
                                fill="transparent"
                              />
                              <circle
                                cx={mx}
                                cy={my}
                                r={plusRadius}
                                fill="#0284c7"
                                stroke="#ffffff"
                                strokeWidth={0.25 * vScale}
                                className="group-hover:fill-amber-500 transition-all shadow-md"
                              />
                              <text
                                x={mx}
                                y={my + 0.32 * vScale}
                                fill="#ffffff"
                                fontSize={1.1 * vScale}
                                fontWeight="900"
                                textAnchor="middle"
                                pointerEvents="none"
                                className="select-none"
                              >
                                +
                              </text>
                            </g>
                          );
                        })}

                        {/* 4. Corner Vertex Handles (Rendered on the ABSOLUTE TOP layer for 100% accurate grab & touch) */}
                        {customPoints.map((p, idx) => {
                          const isDragging = draggingPointIdx === idx;
                          const isSelected = selectedCornerIdx === idx;
                          const hitRadius = Math.max(1.8, 2.2 * vScale);
                          const nodeRadius = 1.15 * vScale;

                          return (
                            <g
                              key={`vertex-${idx}`}
                              data-vertex-index={idx}
                              pointerEvents="none"
                              className="select-none touch-none"
                            >
                              {/* Generous Hit Target for effortless corner grabbing */}
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={hitRadius}
                                fill="transparent"
                              />
                              {/* Glow Halo when Selected or Dragging */}
                              {(isDragging || isSelected) && (
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={2.4 * vScale}
                                  fill="#f59e0b"
                                  fillOpacity="0.4"
                                  className="animate-pulse"
                                />
                              )}
                              {/* Vertex Node Circle */}
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={nodeRadius}
                                fill={isDragging || isSelected ? '#f59e0b' : '#2563eb'}
                                stroke="#ffffff"
                                strokeWidth={0.35 * vScale}
                                className="shadow-lg transition-transform active:scale-110"
                              />
                              {/* Corner Number cleanly centered inside the circle */}
                              <text
                                x={p.x}
                                y={p.y + 0.35 * vScale}
                                fill="#ffffff"
                                fontSize={0.95 * vScale}
                                fontWeight="900"
                                textAnchor="middle"
                                pointerEvents="none"
                              >
                                {idx + 1}
                              </text>

                              {/* Coordinate HUD + Direct Red '✕' Delete Point Button */}
                              {isSelected && !isDragging && (() => {
                                const isNearTop = p.y < 3;
                                const tooltipY = isNearTop ? p.y + 1.6 * vScale : p.y - 2.8 * vScale;
                                const textY = isNearTop ? p.y + 2.7 * vScale : p.y - 1.7 * vScale;

                                return (
                                  <g>
                                    {/* Coordinate Tooltip */}
                                    <g pointerEvents="none">
                                      <rect
                                        x={p.x - 3.2 * vScale}
                                        y={tooltipY}
                                        width={5.2 * vScale}
                                        height={1.7 * vScale}
                                        rx={0.4 * vScale}
                                        fill="#0f172a"
                                        stroke="#f59e0b"
                                        strokeWidth={0.2 * vScale}
                                      />
                                      <text
                                        x={p.x - 0.6 * vScale}
                                        y={textY}
                                        fill="#fde047"
                                        fontSize={0.9 * vScale}
                                        fontWeight="black"
                                        textAnchor="middle"
                                      >
                                        X:{p.x}m Y:{p.y}m
                                      </text>
                                    </g>

                                  </g>
                                );
                              })()}
                            </g>
                          );
                        })}
                      </svg>

                      {/* Selected corner: exact position, nudge arrows and delete. It floats over the stage,
                          so selecting a corner never changes the layout (a taller header used to shift the
                          drawing under the finger). */}
                      {selectedCornerIdx !== null && customPoints[selectedCornerIdx] && (
                        <div
                          onPointerDown={(e) => e.stopPropagation()}
                          className="absolute bottom-3 left-3 right-3 z-20 mx-auto max-w-md bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-2 flex flex-col gap-1.5 shadow-2xl"
                        >
                          <div className="flex items-center gap-2 px-1">
                            <span className="text-xs font-black text-amber-300">Corner {selectedCornerIdx + 1}</span>
                            <span className="text-xs font-mono text-slate-300">
                              X {customPoints[selectedCornerIdx].x} m · Y {customPoints[selectedCornerIdx].y} m
                            </span>
                            <button
                              type="button"
                              onClick={() => setWallStepCm(wallStepCm === 1 ? 5 : wallStepCm === 5 ? 10 : wallStepCm === 10 ? 50 : 1)}
                              className="ml-auto min-h-[36px] px-3 rounded-lg bg-slate-800 border border-slate-600 text-xs font-bold text-sky-200 cursor-pointer"
                              aria-label={`Nudge step ${wallStepCm} cm, tap to change`}
                            >
                              Step {wallStepCm} cm
                            </button>
                          </div>
                          <div className="flex gap-1.5">
                            {([
                              ['Left', -1, 0, ArrowLeft],
                              ['Up', 0, -1, ArrowUp],
                              ['Down', 0, 1, ArrowDown],
                              ['Right', 1, 0, ArrowRightIcon],
                            ] as const).map(([label, dx, dy, Icon]) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => nudgeCorner(dx, dy)}
                                aria-label={`Move corner ${label.toLowerCase()} ${wallStepCm} cm`}
                                className="flex-1 min-h-[48px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white flex items-center justify-center cursor-pointer active:scale-95"
                              >
                                <Icon className="w-5 h-5" />
                              </button>
                            ))}
                            {customPoints.length > 3 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomPoint(selectedCornerIdx)}
                                aria-label="Delete this corner"
                                className="min-h-[48px] px-3 rounded-xl bg-rose-500/20 hover:bg-rose-600 border border-rose-500/50 text-rose-200 hover:text-white flex items-center justify-center gap-1 text-xs font-bold cursor-pointer active:scale-95"
                              >
                                <Trash2 className="w-4 h-4" />
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Floating Controls HUD in Fullscreen Stage Mode */}
                      {isStageFullscreen && showFullscreenHud && (
                        <div className="absolute top-4 right-4 z-20 w-80 sm:w-88 max-h-[calc(100vh-140px)] overflow-y-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3.5 shadow-2xl flex flex-col gap-3 custom-scrollbar text-white animate-in slide-in-from-top-2 duration-150">
                          {/* HUD Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                              <Sliders className="w-3.5 h-3.5 text-sky-400" />
                              <span>Stage Controls</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowFullscreenHud(false)}
                              className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                              title="Close controls panel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Boundary Size */}
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-300">Room Boundary Size</span>
                              <span className="font-mono text-sky-400 font-bold">{boundaryWidth}m × {boundaryHeight}m</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700 flex-1">
                                <span className="text-slate-400 text-[10px] font-bold">W:</span>
                                <MeterInput
                                  value={boundaryWidth}
                                  onChange={handleUpdateBoundaryWidth}
                                  min={0.5}
                                  max={200}
                                  className="w-10 text-center font-bold text-xs text-white focus:outline-none bg-transparent font-mono"
                                />
                                <span className="text-slate-400 text-[10px]">m</span>
                              </div>
                              <span className="text-slate-500 text-xs">×</span>
                              <div className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded-lg border border-slate-700 flex-1">
                                <span className="text-slate-400 text-[10px] font-bold">H:</span>
                                <MeterInput
                                  value={boundaryHeight}
                                  onChange={handleUpdateBoundaryHeight}
                                  min={0.5}
                                  max={200}
                                  className="w-10 text-center font-bold text-xs text-white focus:outline-none bg-transparent font-mono"
                                />
                                <span className="text-slate-400 text-[10px]">m</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleAutoFitBoundary}
                                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-[10px] font-bold transition-all border border-slate-700 cursor-pointer"
                              >
                                Auto-fit Boundary
                              </button>
                              <button
                                type="button"
                                onClick={handleFitShapeToBoundary}
                                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-[10px] font-bold transition-all border border-slate-700 cursor-pointer"
                              >
                                Fit Shape
                              </button>
                            </div>
                          </div>

                          {/* Selected Corner */}
                          <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-300">
                                {selectedCornerIdx !== null ? `Corner #${selectedCornerIdx + 1}` : 'Corners'} ({customPoints.length})
                              </span>
                              <span className="text-[10px] text-slate-400">Drag circle on canvas</span>
                            </div>
                            {selectedCornerIdx !== null && customPoints[selectedCornerIdx] ? (
                              <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                                <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                                  {selectedCornerIdx + 1}
                                </span>
                                <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-700 flex-1">
                                  <span className="text-slate-400 text-[10px]">X:</span>
                                  <MeterInput
                                    value={customPoints[selectedCornerIdx].x}
                                    min={0}
                                    max={Math.max(200, boundaryWidth)}
                                    onChange={(val) => handleUpdateCustomPoint(selectedCornerIdx, 'x', val)}
                                    className="w-10 text-center font-bold text-xs text-white focus:outline-none bg-transparent"
                                  />
                                </div>
                                <div className="flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-700 flex-1">
                                  <span className="text-slate-400 text-[10px]">Y:</span>
                                  <MeterInput
                                    value={customPoints[selectedCornerIdx].y}
                                    min={0}
                                    max={Math.max(200, boundaryHeight)}
                                    onChange={(val) => handleUpdateCustomPoint(selectedCornerIdx, 'y', val)}
                                    className="w-10 text-center font-bold text-xs text-white focus:outline-none bg-transparent"
                                  />
                                </div>
                                {customPoints.length > 3 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCustomPoint(selectedCornerIdx)}
                                    className="p-1.5 bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg border border-rose-500/40 transition-colors cursor-pointer flex-shrink-0"
                                    title="Delete this corner point"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">Click any vertex circle on canvas to edit its exact coordinates.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Blueprint Stage Bottom Instructions Bar */}
                    <div className="px-4 py-2 bg-slate-900/95 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 z-10 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sky-300 font-bold">💡 How to edit:</span>
                        <span>Click <strong className="text-sky-300 font-mono">+</strong> on any wall to add corner • Drag circles to reposition • Select & tap <strong className="text-rose-400">×</strong> or Backspace to delete</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-slate-400 font-mono text-[10px]">
                          {customPoints.length} Vertices • {customPoints.length} Walls
                        </div>
                        {!isStageFullscreen ? (
                          <button
                            type="button"
                            onClick={enterStageFullscreen}
                            className="text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 cursor-pointer transition-colors text-[10px]"
                            title="Expand blueprint stage to full screen"
                          >
                            <Maximize2 className="w-3 h-3" />
                            <span>Fullscreen Stage</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={exitStageFullscreen}
                            className="text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer transition-colors text-[10px]"
                            title="Exit stage full screen"
                          >
                            <Minimize2 className="w-3 h-3" />
                            <span>Exit Fullscreen Stage (Esc)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

              {/* RIGHT COLUMN: Controls Sidebar & Preset Override */}
              <div className="w-full lg:w-96 xl:w-[420px] flex flex-col gap-3 min-h-0 flex-shrink-0 bg-slate-50/80 p-3.5 sm:p-4 rounded-2xl border border-slate-200/80">
                {/* 0. Room Boundary Size Card */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Room Boundary Size</span>
                    </h4>
                    <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md font-bold">
                      {boundaryWidth}m × {boundaryHeight}m
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Set the overall room boundary. The architectural stage and all coordinates scale to fit.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-xs flex-1">
                      <span className="text-slate-400 text-[10px] font-bold">W:</span>
                      <MeterInput
                        value={boundaryWidth}
                        onChange={handleUpdateBoundaryWidth}
                        min={0.5}
                        max={200}
                        className="w-12 text-center font-bold text-sm text-slate-800 focus:outline-none bg-transparent font-mono"
                      />
                      <span className="text-slate-400 text-[10px]">m</span>
                    </div>
                    <span className="text-slate-300 text-xs font-bold">×</span>
                    <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-xs flex-1">
                      <span className="text-slate-400 text-[10px] font-bold">H:</span>
                      <MeterInput
                        value={boundaryHeight}
                        onChange={handleUpdateBoundaryHeight}
                        min={0.5}
                        max={200}
                        className="w-12 text-center font-bold text-sm text-slate-800 focus:outline-none bg-transparent font-mono"
                      />
                      <span className="text-slate-400 text-[10px]">m</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900 select-none">
                      <input
                        type="checkbox"
                        checked={scaleShapeWithBoundary}
                        onChange={(e) => setScaleShapeWithBoundary(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Scale shape with size</span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleAutoFitBoundary}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-xs"
                        title="Expand boundary box to surround all shape corners"
                      >
                        Auto-fit Boundary
                      </button>
                      <button
                        type="button"
                        onClick={handleFitShapeToBoundary}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-xs"
                        title="Scale and stretch the shape to fill the current boundary box"
                      >
                        Fit Shape
                      </button>
                    </div>
                  </div>
                </div>

                {/* Walls: type the real length of each wall */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      <span>Walls</span>
                    </h4>
                    <span className="text-[11px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md font-bold">
                      {customPoints.length} walls
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">Measure each wall and type its length. Neighbouring walls follow.</p>
                  <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Step for the plus and minus buttons">
                    {[1, 5, 10, 50].map((cm) => (
                      <button
                        key={cm}
                        type="button"
                        role="radio"
                        aria-checked={wallStepCm === cm}
                        onClick={() => setWallStepCm(cm)}
                        className={`min-h-[40px] rounded-lg text-xs font-bold cursor-pointer ${wallStepCm === cm ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        {cm} cm
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {describeWalls(customPoints).map((w) => {
                      const sideLabel = w.side === 'slanted' ? 'Slanted wall' : w.side[0].toUpperCase() + w.side.slice(1) + ' wall';
                      return (
                        <div
                          key={w.index}
                          onClick={() => setSelectedCornerIdx(w.index)}
                          className={`flex items-center gap-1.5 p-1.5 rounded-xl border ${selectedCornerIdx === w.index ? 'border-blue-400 bg-blue-50/70' : 'border-slate-200 bg-slate-50'}`}
                        >
                          <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-black flex items-center justify-center flex-shrink-0">{w.index + 1}</span>
                          <span className="flex-1 min-w-0 text-xs font-bold text-slate-700 truncate">{sideLabel}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              applyWallLength(w.index, roundCm(w.length - wallStepCm / 100));
                            }}
                            aria-label={`Wall ${w.index + 1} shorter by ${wallStepCm} cm`}
                            className="w-11 h-11 rounded-lg bg-white border border-slate-300 flex items-center justify-center cursor-pointer active:scale-95"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <MeterInput
                            aria-label={`Length of wall ${w.index + 1} in meters`}
                            value={w.length}
                            min={0.2}
                            max={200}
                            onChange={(m) => applyWallLength(w.index, m)}
                            className="w-[72px] h-11 text-center font-mono text-sm font-black bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              applyWallLength(w.index, roundCm(w.length + wallStepCm / 100));
                            }}
                            aria-label={`Wall ${w.index + 1} longer by ${wallStepCm} cm`}
                            className="w-11 h-11 rounded-lg bg-white border border-slate-300 flex items-center justify-center cursor-pointer active:scale-95"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {showCornerEditor ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCornerEditor(false)}
                      className="min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      Hide corner tools
                    </button>
                {/* 1. Wall Corner Manager Card */}
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      <span>Wall Corner Manager</span>
                    </h4>
                    <span className="text-[11px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md font-bold">
                      {customPoints.length} corners
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Click any <span className="font-bold text-sky-600 font-mono">+</span> on the blueprint stage, or select a wall below.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={targetEdgeIdx}
                      onChange={(e) => setTargetEdgeIdx(parseInt(e.target.value, 10))}
                      className="bg-slate-50 text-slate-800 text-xs font-bold px-2.5 py-1.5 rounded-xl border border-slate-300 focus:outline-none focus:border-blue-500 shadow-xs cursor-pointer flex-1"
                      title="Select which wall to insert a new corner on"
                    >
                      {customPoints.map((_, i) => {
                        const next = (i + 1) % customPoints.length;
                        return (
                          <option key={i} value={i}>
                            Wall {i + 1} (Corners {i + 1} → {next + 1})
                          </option>
                        );
                      })}
                    </select>
                    <button
                      onClick={() => handleAddCustomPoint(targetEdgeIdx)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer flex-shrink-0"
                      title={`Insert a new corner on Wall ${targetEdgeIdx + 1}`}
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Add Corner</span>
                    </button>
                  </div>
                </div>

                {/* 2. Vertices List Header */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Corner Coordinates
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Drag on canvas or edit X/Y
                  </span>
                </div>

                {/* Scrollable Vertices List */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {customPoints.map((p, idx) => {
                    const isCurrent = draggingPointIdx === idx || selectedCornerIdx === idx;
                    const nextCornerIdx = ((idx + 1) % customPoints.length) + 1;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedCornerIdx(idx);
                          setTargetEdgeIdx(idx);
                        }}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-blue-50/90 border-blue-400 shadow-xs ring-1 ring-blue-300'
                            : 'bg-white hover:bg-slate-100/70 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-slate-700 flex-shrink-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                            isCurrent ? 'bg-blue-600 text-white font-extrabold' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {idx + 1}
                          </span>
                          <span>Corner #{idx + 1}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-md">
                              Selected
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 font-mono font-bold flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shadow-xs">
                            <span className="text-slate-400 text-[10px]">X:</span>
                            <MeterInput
                              value={p.x}
                              min={0}
                              max={Math.max(200, boundaryWidth)}
                              onChange={(val) => handleUpdateCustomPoint(idx, 'x', val)}
                              className="w-10 text-center font-bold text-slate-800 focus:outline-none bg-transparent"
                            />
                          </div>
                          <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 shadow-xs">
                            <span className="text-slate-400 text-[10px]">Y:</span>
                            <MeterInput
                              value={p.y}
                              min={0}
                              max={Math.max(200, boundaryHeight)}
                              onChange={(val) => handleUpdateCustomPoint(idx, 'y', val)}
                              className="w-10 text-center font-bold text-slate-800 focus:outline-none bg-transparent"
                            />
                          </div>

                          <button
                            onClick={() => handleInsertPointAtEdge(idx)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                            title={`Add a new corner on Wall #${idx + 1} (between Corner ${idx + 1} and ${nextCornerIdx})`}
                          >
                            <Plus className="w-3 h-3 stroke-[2.5]" />
                            <span className="hidden sm:inline">Add After</span>
                          </button>

                          <button
                            onClick={() => handleDeleteCustomPoint(idx)}
                            disabled={customPoints.length <= 3}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              customPoints.length <= 3
                                ? 'text-slate-300 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                            title={customPoints.length <= 3 ? 'A polygon needs at least 3 corners' : 'Remove corner point'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCornerEditor(true)}
                    className="min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Advanced: edit corner points
                  </button>
                )}

                {/* 3. Preset Layout Override Card (The Single Button to Deliberately Override Architecture) */}
                <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-3 flex flex-col gap-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>Preset Template Override</span>
                    </span>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100/90 px-1.5 py-0.5 rounded">
                      Override
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900/80 leading-snug">
                    Replace custom corners with a standard architectural template layout.
                  </p>
                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <select
                      value={`${selectedPresetId}:${selectedPresetVariation}`}
                      onChange={(e) => {
                        const [id, variation] = e.target.value.split(':');
                        setSelectedPresetId(id as RoomShapeType);
                        setSelectedPresetVariation(variation || 'br');
                      }}
                      className="bg-white text-slate-800 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-amber-300 focus:outline-none focus:border-amber-500 shadow-xs cursor-pointer"
                    >
                      <option value="rectangle:standard">Rectangular Room (Standard 4 Walls)</option>
                      <option value="l_shaped:br">L-Shaped Room (Corner: Bottom-Right)</option>
                      <option value="l_shaped:bl">L-Shaped Room (Corner: Bottom-Left)</option>
                      <option value="l_shaped:tr">L-Shaped Room (Corner: Top-Right)</option>
                      <option value="l_shaped:tl">L-Shaped Room (Corner: Top-Left)</option>
                      <option value="t_shaped:south">T-Shaped Space (Wing: South)</option>
                      <option value="t_shaped:north">T-Shaped Space (Wing: North)</option>
                      <option value="t_shaped:east">T-Shaped Space (Wing: East)</option>
                      <option value="t_shaped:west">T-Shaped Space (Wing: West)</option>
                      <option value="u_shaped:standard">U-Shaped Courtyard Layout</option>
                    </select>

                    <button
                      onClick={handleOverrideWithPreset}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 cursor-pointer"
                      title="Override current custom shape and replace with chosen preset template"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Override Layout with Preset</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DOOR & ENTRANCE */}
          {activeTab === 'door' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Header description */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <DoorOpen className="w-3.5 h-3.5 text-amber-500" />
                    <span>Room Doors & Entrances</span>
                  </h4>
                </div>
                <button
                  onClick={() => handleAddDoor()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
                  title="Add another door to this room"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Door</span>
                </button>
              </div>

              {/* Multi-Door Selector Bar */}
              <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <DoorOpen className="w-3.5 h-3.5 text-amber-500" />
                    <span>Doors ({doorsList.length})</span>
                  </span>
                  {selectedDoor && (
                    <button
                      onClick={() => handleDeleteDoor(selectedDoor.id || '')}
                      className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove selected door"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete Door</span>
                    </button>
                  )}
                </div>

                {doorsList.length > 0 ? (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {doorsList.map((d, idx) => {
                      const isSelected = d.id === selectedDoor?.id;
                      return (
                        <button
                          key={d.id || idx}
                          onClick={() => setActiveDoorId(d.id || '')}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                            isSelected
                              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-300'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          <DoorOpen className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-amber-500'}`} />
                          <span>{d.label || `Door ${idx + 1}`}</span>
                          <span className={`text-[10px] font-mono px-1 rounded uppercase ${isSelected ? 'bg-amber-600 text-amber-100' : 'bg-slate-100 text-slate-400'}`}>
                            {d.wall}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-3 text-xs text-slate-400 font-medium">
                    No doors in this room. Click "+ Add Door" to add an entrance.
                  </div>
                )}
              </div>

              {doorsList.length === 0 ? (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center mx-auto text-amber-500 shadow-sm">
                    <DoorOpen className="w-7 h-7" />
                  </div>
                  <div>
                    <h5 className="font-extrabold text-sm text-slate-800">No Doors in this Room</h5>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto mt-0.5">
                      Add an entrance door to specify where you enter this room from or connect to other spaces.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                    <button
                      onClick={() => handleAddDoor('bottom')}
                      className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Main Entrance (Bottom Wall)</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                      Or place directly on specific wall:
                    </span>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      <button
                        onClick={() => handleAddDoor('bottom')}
                        className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-amber-50 hover:border-amber-300 text-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        Bottom Wall (South)
                      </button>
                      <button
                        onClick={() => handleAddDoor('top')}
                        className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-amber-50 hover:border-amber-300 text-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        Top Wall (North)
                      </button>
                      <button
                        onClick={() => handleAddDoor('left')}
                        className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-amber-50 hover:border-amber-300 text-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        Left Wall (West)
                      </button>
                      <button
                        onClick={() => handleAddDoor('right')}
                        className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-amber-50 hover:border-amber-300 text-slate-700 rounded-lg cursor-pointer transition-colors"
                      >
                        Right Wall (East)
                      </button>
                    </div>
                  </div>
                </div>
              ) : selectedDoor ? (
                <>
                  {/* Door Name Input */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                      Door Name:
                    </label>
                    <input
                      type="text"
                      value={selectedDoor.label || ''}
                      onChange={(e) => updateSelectedDoor({ label: e.target.value })}
                      placeholder="e.g. Main Entrance, Balcony, Bathroom"
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Interactive Live Architectural Blueprint of All Doors on Room */}
                  <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 flex flex-col items-center shadow-inner">
                    <div className="w-full flex items-center justify-between text-[11px] font-bold text-slate-400 mb-2 px-1">
                      <span className="flex items-center gap-1.5 text-slate-300">
                        <DoorOpen className="w-3.5 h-3.5 text-amber-400" />
                        <span>Live Blueprint Preview</span>
                      </span>
                      <span className="text-amber-400 font-mono text-[10px]">
                        Active: {selectedDoor.label || 'Door'} ({selectedDoor.offset}m on {selectedDoor.wall} wall)
                      </span>
                    </div>

                    {/* Dynamic Architectural Blueprint Preview */}
                    {(() => {
                      const roomPts: Point2D[] = (room.polygonPoints && room.polygonPoints.length >= 3)
                        ? room.polygonPoints
                        : [
                            { x: 0, y: 0 },
                            { x: room.gridWidth, y: 0 },
                            { x: room.gridWidth, y: room.gridHeight },
                            { x: 0, y: room.gridHeight },
                          ];

                      const bpBoxW = 200;
                      const bpBoxH = 80;
                      const bpScale = Math.min(bpBoxW / room.gridWidth, bpBoxH / room.gridHeight);
                      const bpDrawW = room.gridWidth * bpScale;
                      const bpDrawH = room.gridHeight * bpScale;
                      const bpStartX = 40 + (bpBoxW - bpDrawW) / 2;
                      const bpStartY = 25 + (bpBoxH - bpDrawH) / 2;

                      const toBpX = (gx: number) => bpStartX + gx * bpScale;
                      const toBpY = (gy: number) => bpStartY + gy * bpScale;
                      const bpPolyStr = roomPts.map((p) => `${toBpX(p.x)},${toBpY(p.y)}`).join(' ');

                      return (
                        <svg viewBox="0 0 280 130" className="w-full max-w-[280px] h-[130px] select-none">
                          {/* Background grid */}
                          <defs>
                            <pattern id="modal-subtle-grid" width="14" height="14" patternUnits="userSpaceOnUse">
                              <path d="M 14 0 L 0 0 0 14" fill="none" stroke="#334155" strokeWidth="0.5" opacity="0.4" />
                            </pattern>
                          </defs>
                          <rect width="100%" height="100%" fill="url(#modal-subtle-grid)" rx="8" />

                          {/* Room base floor polygon */}
                          <polygon points={bpPolyStr} fill="#1e293b" />

                          {/* Wall Lines with Labels */}
                          {wallSegments.map((seg) => {
                            const x1 = toBpX(seg.p1.x);
                            const y1 = toBpY(seg.p1.y);
                            const x2 = toBpX(seg.p2.x);
                            const y2 = toBpY(seg.p2.y);
                            const isSelectedWall = selectedDoor.segmentIndex !== undefined
                              ? selectedDoor.segmentIndex === seg.index
                              : (selectedDoor.wall === seg.id || selectedDoor.wall === seg.wallSide);

                            const segDx = x2 - x1;
                            const segDy = y2 - y1;
                            const segLen = Math.hypot(segDx, segDy);
                            const ux = segLen > 0 ? segDx / segLen : 1;
                            const uy = segLen > 0 ? segDy / segLen : 0;
                            // Outward normal (in screen coords, outward to left of direction vector)
                            const onx = uy;
                            const ony = -ux;
                            const midX = (x1 + x2) / 2;
                            const midY = (y1 + y2) / 2;
                            const labelX = midX + onx * 12;
                            const labelY = midY + ony * 12;

                            return (
                              <g
                                key={`seg-line-${seg.index}`}
                                onClick={() => {
                                  const curWidth = selectedDoor.width || 2;
                                  const maxOff = Math.max(0, roundCm(seg.length - curWidth));
                                  const newOffset = Math.min(selectedDoor.offset, maxOff);
                                  updateSelectedDoor({
                                    wall: seg.wallSide || (seg.isSlanted ? `slanted-${seg.index}` : seg.id),
                                    segmentIndex: seg.index,
                                    offset: newOffset,
                                  });
                                }}
                                className="cursor-pointer"
                              >
                                <line
                                  x1={x1}
                                  y1={y1}
                                  x2={x2}
                                  y2={y2}
                                  stroke={isSelectedWall ? '#3b82f6' : '#64748b'}
                                  strokeWidth={isSelectedWall ? '5' : '2.5'}
                                  strokeLinecap="round"
                                />
                                {segLen > 22 && (
                                  <text
                                    x={labelX}
                                    y={labelY}
                                    fill={isSelectedWall ? '#60a5fa' : '#94a3b8'}
                                    fontSize="7.5"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                  >
                                    {seg.isSlanted ? `ANGLED (${seg.length.toFixed(1)}m)` : `${(seg.wallSide || seg.id).toUpperCase()} (${seg.length.toFixed(1)}m)`}
                                  </text>
                                )}
                              </g>
                            );
                          })}

                          {/* Render All Doors in Blueprint */}
                          {doorsList.map((d, idx) => {
                            const isSelected = d.id === selectedDoor.id;
                            const dSeg = d.segmentIndex !== undefined
                              ? wallSegments[d.segmentIndex]
                              : wallSegments.find((s) => s.id === d.wall || s.wallSide === d.wall) || wallSegments[0];
                            if (!dSeg) return null;

                            const ds1x = toBpX(dSeg.p1.x);
                            const ds1y = toBpY(dSeg.p1.y);
                            const ds2x = toBpX(dSeg.p2.x);
                            const ds2y = toBpY(dSeg.p2.y);
                            const segBpLen = Math.hypot(ds2x - ds1x, ds2y - ds1y);
                            const ux = segBpLen > 0 ? (ds2x - ds1x) / segBpLen : 1;
                            const uy = segBpLen > 0 ? (ds2y - ds1y) / segBpLen : 0;
                            // Inward normal (clockwise polygon winding has inward normal (-uy, ux))
                            const inx = -uy;
                            const iny = ux;

                            const dWidthBp = (d.width || 2) * bpScale;
                            const dOffsetBp = Math.min(d.offset * bpScale, Math.max(0, segBpLen - dWidthBp));

                            const t1x = ds1x + ux * dOffsetBp;
                            const t1y = ds1y + uy * dOffsetBp;
                            const t2x = t1x + ux * dWidthBp;
                            const t2y = t1y + uy * dWidthBp;

                            const swing = d.swing || 'inward_left';
                            const isLeft = swing.includes('left');
                            const isInward = swing.includes('inward');
                            const normalMult = isInward ? 1 : -1;

                            const hx = isLeft ? t1x : t2x;
                            const hy = isLeft ? t1y : t2y;
                            const leafTipX = hx + inx * dWidthBp * normalMult;
                            const leafTipY = hy + iny * dWidthBp * normalMult;

                            const strokeColor = isSelected ? '#f59e0b' : '#38bdf8';
                            const leafColor = isSelected ? '#fbbf24' : '#7dd3fc';

                            return (
                              <g
                                key={d.id || idx}
                                onClick={() => setActiveDoorId(d.id || '')}
                                className="cursor-pointer"
                              >
                                <line
                                  x1={t1x}
                                  y1={t1y}
                                  x2={t2x}
                                  y2={t2y}
                                  stroke={strokeColor}
                                  strokeWidth={isSelected ? 6 : 4}
                                  strokeLinecap="round"
                                />
                                <line
                                  x1={hx}
                                  y1={hy}
                                  x2={leafTipX}
                                  y2={leafTipY}
                                  stroke={leafColor}
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                />
                                <circle
                                  cx={hx}
                                  cy={hy}
                                  r={isSelected ? 3.5 : 2.5}
                                  fill={strokeColor}
                                />
                              </g>
                            );
                          })}
                        </svg>
                      );
                    })()}
                  </div>

                  {/* 1. Door Width / Opening Size */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-700">1. Door Opening Width</span>
                      <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                        {formatMeters(selectedDoor.width || 0.8)} wide
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { w: 0.8, title: 'Standard', sub: '80 cm' },
                        { w: 0.9, title: 'Wide', sub: '90 cm' },
                        { w: 1.6, title: 'Double', sub: '160 cm' },
                      ].map((item) => (
                        <button
                          key={item.w}
                          onClick={() => {
                            const newOffset = selectedDoor.offset + item.w > currentSegLen ? Math.max(0, roundCm(currentSegLen - item.w)) : selectedDoor.offset;
                            updateSelectedDoor({ width: item.w, offset: newOffset });
                          }}
                          className={`py-2 px-2 rounded-xl text-center cursor-pointer transition-all ${
                            (selectedDoor.width || 2) === item.w
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold leading-tight">{item.title}</div>
                          <div className={`text-[10px] ${(selectedDoor.width || 2) === item.w ? 'text-blue-100' : 'text-slate-400'}`}>
                            {item.sub}
                          </div>
                        </button>
                      ))}
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-600">
                      <span>Exact width</span>
                      <MeterInput
                        aria-label="Exact door width in meters"
                        value={selectedDoor.width || 0.8}
                        min={0.4}
                        max={Math.max(0.4, currentSegLen)}
                        onChange={(w) => {
                          const newOffset = selectedDoor.offset + w > currentSegLen ? Math.max(0, roundCm(currentSegLen - w)) : selectedDoor.offset;
                          updateSelectedDoor({ width: w, offset: newOffset });
                        }}
                        className="w-20 bg-white text-slate-900 text-xs px-2 py-1.5 rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-slate-400 font-medium">m</span>
                    </label>
                  </div>

                  {/* 2. Wall Selection (All Segments, including Slanted Walls) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      2. Select Wall
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {wallSegments.map((seg) => {
                        const isSelected = selectedDoor.segmentIndex !== undefined
                          ? selectedDoor.segmentIndex === seg.index
                          : (selectedDoor.wall === seg.id || selectedDoor.wall === seg.wallSide);
                        return (
                          <button
                            key={seg.index}
                            onClick={() => {
                              const curWidth = selectedDoor.width || 2;
                              const maxOff = Math.max(0, roundCm(seg.length - curWidth));
                              const newOffset = Math.min(selectedDoor.offset, maxOff);
                              updateSelectedDoor({
                                wall: seg.wallSide || (seg.isSlanted ? `slanted-${seg.index}` : seg.id),
                                segmentIndex: seg.index,
                                offset: newOffset,
                              });
                            }}
                            className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <div className="truncate">{seg.label}</div>
                            <div className={`text-[10px] font-normal ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                              {formatMeters(seg.length)} long {seg.isSlanted ? '• Slanted' : ''}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Position Along Wall */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-700">3. Distance from Wall Corner</span>
                      <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                        {formatMeters(selectedDoor.offset)} from corner
                      </span>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex gap-1.5 mb-2">
                      <button
                        onClick={() => updateSelectedDoor({ offset: 0 })}
                        className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 cursor-pointer"
                      >
                        At corner
                      </button>
                      <button
                        onClick={() => updateSelectedDoor({ offset: roundCm(maxDoorOffset / 2) })}
                        className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 cursor-pointer"
                      >
                        Centered
                      </button>
                      <button
                        onClick={() => updateSelectedDoor({ offset: maxDoorOffset })}
                        className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 cursor-pointer"
                      >
                        Other end
                      </button>
                    </div>

                    <label className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-600">
                      <span>Distance from corner</span>
                      <MeterInput
                        aria-label="Door distance from wall corner in meters"
                        value={selectedDoor.offset}
                        min={0}
                        max={maxDoorOffset}
                        onChange={(offset) => updateSelectedDoor({ offset })}
                        className="w-20 bg-white text-slate-900 text-xs px-2 py-1.5 rounded-lg border border-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-slate-400 font-medium">m</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={maxDoorOffset}
                      step={0.05}
                      value={selectedDoor.offset}
                      onChange={(e) => updateSelectedDoor({ offset: roundCm(parseFloat(e.target.value) || 0) })}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono mt-1">
                      <span>corner</span>
                      <span className="text-slate-500 font-medium">
                        Spans {formatMeters(selectedDoor.offset)} to {formatMeters(selectedDoor.offset + (selectedDoor.width || 0.8))}
                      </span>
                      <span>{formatMeters(maxDoorOffset)}</span>
                    </div>
                  </div>

                  {/* 4. Door Swing Direction */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      4. Door Swing Direction
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'inward_left', label: 'Inward (Left Hinge)' },
                        { id: 'inward_right', label: 'Inward (Right Hinge)' },
                        { id: 'outward_left', label: 'Outward (Left Hinge)' },
                        { id: 'outward_right', label: 'Outward (Right Hinge)' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          onClick={() => updateSelectedDoor({ swing: s.id as DoorSwing })}
                          className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            selectedDoor.swing === s.id
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

            </div>
          )}

            </div>
          );
        })()}

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            {activeTab === 'architecture' ? (
              <span className="hidden sm:inline">
                Drag vertices on the blueprint or adjust numbers on the right.
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'architecture' ? (
              <>
                <button
                  onClick={() => setRoomShapeModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-200/70 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCustomShape}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Room Shape</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => setRoomShapeModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Done</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
