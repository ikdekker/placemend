import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Point2D } from '../types';
import { FurnitureGraphic } from './FurnitureGraphic';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { 
  RotateCcw,
  Pentagon, 
  DoorOpen, 
  MapPin,
  Plus,
  Link,
  ArrowRight,
  ArrowDownRight
} from 'lucide-react';
import { getDoorSvgGeometry, getRoomDoors, snapFurniturePosition, getRoomWallSegments } from '../utils/roomGeometry';
import { scheduleAutoSync } from '../services/apiSync';
import { seedDemoDataIfEmpty, scheduleSeedIfEmpty } from '../db/sampleData';
import { roundCm, snapTo, formatMeters } from '../utils/measure';
import { CanvasOptionsMenu } from './CanvasOptionsMenu';
import { getAppMode } from '../services/appMode';
import { FurniturePanel } from './FurniturePanel';

export const FloorCanvas: React.FC = () => {
  const {
    appMode,
    setAppMode,
    selectedRoomId,
    selectedFurnitureId,
    highlightedFurnitureId,
    setSelectedFurnitureId,
    setSelectedRoomId,
    setRoomShapeModalOpen,
    setRoomManagerOpen,
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    fitViewTrigger,
    gridSnap,
    toggleGridSnap,
    showLabels,
    toggleShowLabels,
    showDimensions,
    toggleShowDimensions,
    setConnectRoomModalOpen,
    setFurnitureLibraryOpen,
  } = useAppStore();

  const { isSearching, matchingFurnitureIds, matchCountsByFurniture, matchingRoomIds } = useVisualSearch();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Touch state for 2-finger pinch-to-zoom
  const touchState = useRef<{
    initialDist: number;
    initialZoom: number;
    initialMidpoint: { x: number; y: number };
    initialPan: { x: number; y: number };
  }>({
    initialDist: 0,
    initialZoom: 1,
    initialMidpoint: { x: 0, y: 0 },
    initialPan: { x: 0, y: 0 },
  });

  // Track pointer/touch start to distinguish 1-finger pan from a stationary tap
  const pointerDownPos = useRef<{ x: number; y: number; time: number; targetFurnitureId: string | null }>({
    x: 0,
    y: 0,
    time: 0,
    targetFurnitureId: null,
  });
  const hasDragged = useRef(false);
  const isPointerDownOnCanvas = useRef(false);

  // Track native browser fullscreen state
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsBrowserFullscreen(!!document.fullscreenElement);
    };
    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleBrowserFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  };

  // Dragging / Moving Furniture (Only enabled in Edit Mode)
  const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ mouseX: 0, mouseY: 0, origX: 0, origY: 0 });
  const [dragLivePos, setDragLivePos] = useState<{ id: string; x: number; y: number } | null>(null);

  // Resizing Furniture from handle (Only enabled in Edit Mode)
  const [resizingFurnitureId, setResizingFurnitureId] = useState<string | null>(null);
  // Resize handles only when asked for: they sit on top of small pieces and turned moves into resizes
  const [dragResizeOn, setDragResizeOn] = useState(false);
  // Height (px) of the open "Position" panel: the plan is fitted into the space above it
  const [reservedBottom, setReservedBottom] = useState(0);
  // Guide lines while dragging a piece that has snapped to a wall or a neighbour (meters)
  const [dragGuides, setDragGuides] = useState<{ x?: number; y?: number } | null>(null);
  // Only the tapped door shows its full label/handles; the others stay small so they don't get in the way
  const [activeDoorId, setActiveDoorId] = useState<string | null>(null);
  useEffect(() => setDragResizeOn(false), [selectedFurnitureId]);
  useEffect(() => {
    if (selectedFurnitureId) setActiveDoorId(null);
  }, [selectedFurnitureId]);
  useEffect(() => {
    if (appMode !== 'edit') setActiveDoorId(null);
  }, [appMode]);
  const [resizeHandleType, setResizeHandleType] = useState<'corner' | 'width' | 'length'>('corner');
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, origW: 0, origL: 0 });
  const [resizeLiveDim, setResizeLiveDim] = useState<{ id: string; w: number; l: number } | null>(null);

  // Door dragging state (Only enabled in Edit Mode)
  const [draggingDoorId, setDraggingDoorId] = useState<string | null>(null);
  const [doorDragStart, setDoorDragStart] = useState<{ mouseX: number; mouseY: number; origOffset: number }>({
    mouseX: 0,
    mouseY: 0,
    origOffset: 0,
  });
  const [doorLiveOffset, setDoorLiveOffset] = useState<number | null>(null);
  const hasDoorDragged = useRef(false);

  // Robust Room Query with auto-healing fallback to ensure rooms always exist
  const room = useLiveQuery(async () => {
    if (selectedRoomId) {
      const r = await db.rooms.get(selectedRoomId);
      if (r) return r;
    }
    const all = await db.rooms.toArray();
    if (all.length > 0) return all[0];

    // Self-healing: if the DB has 0 rooms, seed the baseline layout (outside this read-only query)
    scheduleSeedIfEmpty();
    return undefined;
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
        if (!r && isMounted) {
          if (room) {
            setSelectedRoomId(room.id);
          } else {
            db.rooms.toArray().then((all) => {
              if (all.length > 0 && isMounted) {
                setSelectedRoomId(all[0].id);
              }
            });
          }
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [selectedRoomId, room, setSelectedRoomId]);

  const allRooms = useLiveQuery(() => db.rooms.toArray()) || [];

  const furnitureList = useLiveQuery(async () => {
    const activeId = room?.id || selectedRoomId;
    if (!activeId) return [];
    return await db.furniture.where('roomId').equals(activeId).toArray();
  }, [room?.id, selectedRoomId]) || [];
  // undefined while loading, so the "empty room" hint doesn't flash in furnished rooms
  const furnitureCount = useLiveQuery(
    () => (room?.id || selectedRoomId ? db.furniture.where('roomId').equals((room?.id || selectedRoomId)!).count() : 0),
    [room?.id, selectedRoomId]
  );

  // Items grouped by furniture for unique item counts
  const itemCountsByFurniture = useLiveQuery(async () => {
    const containers = await db.containers.toArray();
    const items = await db.items.toArray();
    const containerToFurniture: Record<string, string> = {};
    containers.forEach((c) => {
      containerToFurniture[c.id] = c.furnitureId;
    });

    const counts: Record<string, number> = {};
    items.forEach((item) => {
      const furnId = containerToFurniture[item.containerId];
      if (furnId) {
        counts[furnId] = (counts[furnId] || 0) + 1;
      }
    });
    return counts;
  }, [furnitureList]) || {};

  // Check if matches exist in other rooms when active room has 0 matches
  const otherRoomsWithMatches = useLiveQuery(async () => {
    if (!isSearching || matchingRoomIds.size === 0) return [];
    const allRooms = await db.rooms.toArray();
    return allRooms.filter((r) => r.id !== selectedRoomId && matchingRoomIds.has(r.id));
  }, [isSearching, matchingRoomIds, selectedRoomId]) || [];

  const unitSize = room?.unitSize || 32;
  const maxPolyX = room?.polygonPoints && room.polygonPoints.length > 0 ? Math.max(...room.polygonPoints.map((p) => p.x)) : 0;
  const maxPolyY = room?.polygonPoints && room.polygonPoints.length > 0 ? Math.max(...room.polygonPoints.map((p) => p.y)) : 0;
  const gridW = Math.max(room?.gridWidth || 26, maxPolyX);
  const gridH = Math.max(room?.gridHeight || 18, maxPolyY);

  const roomDoors = room ? getRoomDoors(room) : [];

  const doorsWithGeo = roomDoors.map((d) => {
    const effectiveOffset = (d.id === draggingDoorId && doorLiveOffset !== null) ? doorLiveOffset : d.offset;
    const effectiveDoor = { ...d, offset: effectiveOffset };
    return {
      door: effectiveDoor,
      geo: getDoorSvgGeometry(effectiveDoor, gridW, gridH, unitSize, room?.polygonPoints),
    };
  });

  // Walk-through portals for doors that sit close together would overlap; step later ones outward a row
  const portalPositions = new Map<string, { x: number; y: number }>();
  {
    const placed: { x: number; y: number; w: number }[] = [];
    const candidates = doorsWithGeo
      .filter(({ door }) => door.targetRoomId)
      .map(({ door, geo }) => ({ door, pos: { ...(geo.exteriorPortalPos || geo.badgePos) } }))
      .sort((a, b) => a.pos.x - b.pos.x);
    for (const { door, pos } of candidates) {
      const name = allRooms.find((r) => r.id === door.targetRoomId)?.name || '';
      const w = (Math.min(name.length, 22) * 7 + 64) / zoom; // approx. pill width, in canvas units (pills are counter-scaled)
      while (placed.some((p) => Math.abs(p.x - pos.x) < (p.w + w) / 2 + 6 && Math.abs(p.y - pos.y) < 34 / zoom)) {
        pos.y += pos.y < (gridH * unitSize) / 2 ? -36 / zoom : 36 / zoom; // step away from the room
      }
      placed.push({ ...pos, w });
      portalPositions.set(door.id || '', pos);
    }
  }

  // Auto-fit room to viewport (statically locks and centers the room)
  const fitRoomToViewport = useCallback(() => {
    const containerW = containerRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 412);
    const containerH = (containerRef.current?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight - 120 : 700)) - reservedBottom;
    if (containerW <= 50 || containerH <= 50) return;

    const rGridW = room?.gridWidth || 26;
    const rGridH = room?.gridHeight || 18;
    const rUnitSize = room?.unitSize || 32;

    const roomW = rGridW * rUnitSize;
    const roomH = rGridH * rUnitSize;

    const isMobile = window.innerWidth < 768;
    // Margins around the room (with generous breathing space for exterior doorway portals)
    // View mode has big walk-through door buttons around the room; edit mode only small door markers
    const editing = appMode === 'edit';
    const padX = isMobile ? (editing ? 90 : 160) : 200; // labels and portals extend past the walls
    // The top toolbar (about 76 px) floats over the plan on phones: keep the room below it
    const topInset = isMobile && editing ? 76 : 0;
    const padY = isMobile ? (editing ? (reservedBottom > 0 ? 50 : 120) : 280) : 200; // panel/nav below

    const scaleX = (containerW - padX) / roomW;
    const scaleY = (containerH - topInset - padY) / roomH;
    // Rooms are in meters (32px/m), so small rooms need well over 1x to fill a phone screen
    const optimalZoom = Math.max(0.18, Math.min(2, Math.min(scaleX, scaleY)));

    const centeredX = (containerW - roomW * optimalZoom) / 2;
    const centeredY = topInset + (containerH - topInset - roomH * optimalZoom) / 2;

    setZoom(optimalZoom);
    setPanOffset({
      x: Math.round(centeredX),
      y: Math.round(centeredY),
    });
  }, [room, setZoom, setPanOffset, reservedBottom, appMode]);

  // Auto-fit on room change, appMode change, or fitViewTrigger
  useEffect(() => {
    fitRoomToViewport();
    const timer = setTimeout(() => {
      fitRoomToViewport();
    }, 100);
    return () => clearTimeout(timer);
  }, [room?.id, room?.gridWidth, room?.gridHeight, appMode, fitViewTrigger, fitRoomToViewport]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      fitRoomToViewport();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitRoomToViewport]);

  // 1-Finger Navigation & Touch Panning across the room
  const handlePointerDown = (clientX: number, clientY: number, target: EventTarget) => {
    const targetEl = target as HTMLElement;

    // Never trigger canvas drag or deselect when clicking buttons, toolbars, door handles, resize handles, or inputs
    if (targetEl && typeof targetEl.closest === 'function') {
      if (targetEl.closest('button, [data-toolbar], [data-door-handle], [data-resize-handle], input, select, textarea')) {
        isPointerDownOnCanvas.current = false;
        return;
      }
    }
    isPointerDownOnCanvas.current = true;

    const furnEl = targetEl && typeof targetEl.closest === 'function' ? targetEl.closest('[data-furniture-id]') : null;
    const furnId = furnEl ? furnEl.getAttribute('data-furniture-id') : null;

    pointerDownPos.current = {
      x: clientX,
      y: clientY,
      time: Date.now(),
      targetFurnitureId: furnId,
    };
    hasDragged.current = false;

    // In Edit Mode: if clicking furniture, handle moving that furniture piece
    if (appMode === 'edit') {
      if (furnId) {
        setSelectedFurnitureId(furnId);
        setDraggingFurnitureId(furnId);
        const furn = furnitureList.find((f) => f.id === furnId);
        if (furn) {
          setDragStartPos({
            mouseX: clientX,
            mouseY: clientY,
            origX: furn.position.x,
            origY: furn.position.y,
          });
          setDragLivePos({
            id: furnId,
            x: furn.position.x,
            y: furn.position.y,
          });
        }
        return;
      }
      // In Edit Mode clicking blank canvas: allow canvas panning
      setIsPanning(true);
      setPanStart({ x: clientX - panOffset.x, y: clientY - panOffset.y });
      setSelectedFurnitureId(null);
      return;
    }

    // In View Mode: 1-Finger Panning across the entire room!
    setIsPanning(true);
    setPanStart({ x: clientX - panOffset.x, y: clientY - panOffset.y });
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    const dist = Math.hypot(clientX - pointerDownPos.current.x, clientY - pointerDownPos.current.y);
    if (dist > 5) {
      hasDragged.current = true;
    }

    // 1-Finger Room Movement
    if (isPanning) {
      setPanOffset({
        x: clientX - panStart.x,
        y: clientY - panStart.y,
      });
      return;
    }

    // Moving door in Edit Mode (supports slanted segments and axis-aligned walls)
    if (draggingDoorId && appMode === 'edit' && room) {
      const curDoor = roomDoors.find((d) => d.id === draggingDoorId);
      if (curDoor) {
        const dist = Math.hypot(clientX - doorDragStart.mouseX, clientY - doorDragStart.mouseY);
        if (dist > 3) {
          hasDoorDragged.current = true;
        }

        const segments = getRoomWallSegments(room);
        let seg = curDoor.segmentIndex !== undefined ? segments[curDoor.segmentIndex] : undefined;
        if (!seg) {
          seg = segments.find((s) => s.id === curDoor.wall || s.wallSide === curDoor.wall) || segments[0];
        }
        const dx = clientX - doorDragStart.mouseX;
        const dy = clientY - doorDragStart.mouseY;
        const segDx = seg.p2.x - seg.p1.x;
        const segDy = seg.p2.y - seg.p1.y;
        const segLen = Math.hypot(segDx, segDy);
        const ux = segLen > 0 ? segDx / segLen : 1;
        const uy = segLen > 0 ? segDy / segLen : 0;
        const projPx = dx * ux + dy * uy;
        const deltaUnits = projPx / (unitSize * zoom);
        let newOffset = doorDragStart.origOffset + deltaUnits;
        newOffset = gridSnap ? snapTo(newOffset, 0.1) : roundCm(newOffset);
        const widthUnits = curDoor.width || 2;
        const maxOffset = Math.max(0, seg.length - widthUnits);
        newOffset = Math.max(0, Math.min(maxOffset, newOffset));
        setDoorLiveOffset(newOffset);
      }
      return;
    }

    // Moving furniture in Edit Mode (magnetic flush wall snap & polygon boundary clamping)
    if (draggingFurnitureId && appMode === 'edit') {
      const dx = (clientX - dragStartPos.mouseX) / (unitSize * zoom);
      const dy = (clientY - dragStartPos.mouseY) / (unitSize * zoom);

      const targetX = dragStartPos.origX + dx;
      const targetY = dragStartPos.origY + dy;

      const furn = furnitureList.find((f) => f.id === draggingFurnitureId);
      if (furn) {
        const isRot = (furn.position.rotation || 0) % 180 !== 0;
        const w = isRot ? furn.dimension.length : furn.dimension.width;
        const l = isRot ? furn.dimension.width : furn.dimension.length;

        // Neighbor furniture list for modular edge-snapping (excluding currently dragged piece)
        const otherFurns = furnitureList
          .filter((f) => f.id !== draggingFurnitureId)
          .map((f) => ({
            x: f.position.x,
            y: f.position.y,
            width: f.dimension.width,
            length: f.dimension.length,
            rotation: f.position.rotation,
          }));

        const snapped = snapFurniturePosition(
          targetX,
          targetY,
          w,
          l,
          gridW,
          gridH,
          room?.polygonPoints,
          gridSnap,
          otherFurns,
          // ~16 screen pixels of pull, whatever the zoom (0.1 to 0.5 m)
          Math.max(0.1, Math.min(0.5, 16 / (unitSize * zoom)))
        );
        setDragGuides(snapped.guideX !== undefined || snapped.guideY !== undefined ? { x: snapped.guideX, y: snapped.guideY } : null);

        setDragLivePos({
          id: draggingFurnitureId,
          x: snapped.x,
          y: snapped.y,
        });
      }
      return;
    }

    // Resizing furniture in Edit Mode (supports orientation rotation & room boundary clamping)
    if (resizingFurnitureId && appMode === 'edit') {
      const furn = furnitureList.find((f) => f.id === resizingFurnitureId);
      if (furn) {
        const dx = (clientX - resizeStart.mouseX) / (unitSize * zoom);
        const dy = (clientY - resizeStart.mouseY) / (unitSize * zoom);

        const isRot = (furn.position.rotation || 0) % 180 !== 0;

        // Boundaries inside room
        const posX = furn.position.x;
        const posY = furn.position.y;
        const maxHoriz = Math.max(1, gridW - posX);
        const maxVert = Math.max(1, gridH - posY);
        const maxW = isRot ? maxVert : maxHoriz;
        const maxL = isRot ? maxHoriz : maxVert;

        let newW = resizeStart.origW;
        let newL = resizeStart.origL;

        if (resizeHandleType === 'corner') {
          const deltaW = isRot ? dy : dx;
          const deltaL = isRot ? dx : dy;
          newW = resizeStart.origW + deltaW;
          newL = resizeStart.origL + deltaL;
        } else if (resizeHandleType === 'width') {
          if (isRot) {
            newL = resizeStart.origL + dx;
          } else {
            newW = resizeStart.origW + dx;
          }
        } else if (resizeHandleType === 'length') {
          if (isRot) {
            newW = resizeStart.origW + dy;
          } else {
            newL = resizeStart.origL + dy;
          }
        }

        if (gridSnap) {
          newW = Math.round(newW * 10) / 10;
          newL = Math.round(newL * 10) / 10;
        } else {
          newW = Math.round(newW * 100) / 100;
          newL = Math.round(newL * 100) / 100;
        }

        newW = Math.max(0.2, Math.min(maxW, newW));
        newL = Math.max(0.2, Math.min(maxL, newL));

        setResizeLiveDim({
          id: resizingFurnitureId,
          w: newW,
          l: newL,
        });
      }
      return;
    }
  };

  // Start resizing furniture from handle (corner, width edge, or length edge)
  const startResizing = (
    e: React.MouseEvent | React.TouchEvent,
    furnId: string,
    type: 'corner' | 'width' | 'length'
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const clientX = 'touches' in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e && e.touches[0] ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const furn = furnitureList.find((f) => f.id === furnId);
    if (!furn) return;

    pointerDownPos.current = {
      x: clientX,
      y: clientY,
      time: Date.now(),
      targetFurnitureId: furnId,
    };
    hasDragged.current = false;
    isPointerDownOnCanvas.current = false;

    setDraggingFurnitureId(null);
    setIsPanning(false);
    setSelectedFurnitureId(furnId);
    setResizingFurnitureId(furnId);
    setResizeHandleType(type);
    setResizeStart({
      mouseX: clientX,
      mouseY: clientY,
      origW: furn.dimension.width,
      origL: furn.dimension.length,
    });
    setResizeLiveDim({
      id: furnId,
      w: furn.dimension.width,
      l: furn.dimension.length,
    });
  };

  const handleDoorDragStart = (e: React.MouseEvent | React.TouchEvent, doorId: string) => {
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const curDoor = roomDoors.find((d) => d.id === doorId);
    if (!curDoor) return;
    hasDoorDragged.current = false;
    setDraggingDoorId(doorId);
    setDoorDragStart({
      mouseX: clientX,
      mouseY: clientY,
      origOffset: curDoor.offset,
    });
    setDoorLiveOffset(curDoor.offset);
  };

  const handlePointerUp = () => {
    // If dragging door, commit the new offset to DB
    if (draggingDoorId && doorLiveOffset !== null && room) {
      const updatedDoors = roomDoors.map((d) =>
        d.id === draggingDoorId ? { ...d, offset: doorLiveOffset } : d
      );
      db.rooms.update(room.id, {
        doors: updatedDoors,
        door: updatedDoors[0] || undefined,
        updatedAt: Date.now(),
      });
      setDraggingDoorId(null);
      setDoorLiveOffset(null);
      setTimeout(() => {
        hasDoorDragged.current = false;
      }, 150);
    }

    // If dragging furniture, commit the new position to DB
    if (draggingFurnitureId && dragLivePos && dragLivePos.id === draggingFurnitureId) {
      db.furniture.update(draggingFurnitureId, {
        'position.x': dragLivePos.x,
        'position.y': dragLivePos.y,
        updatedAt: Date.now(),
      }).then(() => scheduleAutoSync());
      setDragLivePos(null);
    }
    setDragGuides(null);

    // If resizing furniture, commit new dimensions to DB
    if (resizingFurnitureId && resizeLiveDim && resizeLiveDim.id === resizingFurnitureId) {
      db.furniture.update(resizingFurnitureId, {
        'dimension.width': resizeLiveDim.w,
        'dimension.length': resizeLiveDim.l,
        updatedAt: Date.now(),
      }).then(() => scheduleAutoSync());
      setResizeLiveDim(null);
    }

    // If the finger/mouse was stationary (< 5px movement), it's a clean TAP on canvas:
    if (!hasDragged.current) {
      if (!isPointerDownOnCanvas.current) {
        // Did not originate from canvas (e.g. was on a toolbar, resize handle, or button) -> keep selection untouched
      } else if (pointerDownPos.current.targetFurnitureId) {
        // Tapped a furniture piece
        setSelectedFurnitureId(pointerDownPos.current.targetFurnitureId);
      } else {
        // Tapped empty room floor -> Deselect
        setSelectedFurnitureId(null);
        setActiveDoorId(null);
      }
    }
    isPointerDownOnCanvas.current = false;

    // Reset hasDragged after gesture completes so subsequent clicks are clean
    setTimeout(() => {
      hasDragged.current = false;
    }, 50);

    setIsPanning(false);
    setDraggingFurnitureId(null);
    setResizingFurnitureId(null);
  };

  // Global listeners to prevent drag loss if cursor or touch moves fast outside canvas
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (draggingFurnitureId || resizingFurnitureId || isPanning) {
        handlePointerMove(e.clientX, e.clientY);
      }
    };
    const handleGlobalMouseUp = () => {
      if (draggingFurnitureId || resizingFurnitureId || isPanning) {
        handlePointerUp();
      }
    };
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if ((draggingFurnitureId || resizingFurnitureId || isPanning) && e.touches[0]) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const handleGlobalTouchEnd = () => {
      if (draggingFurnitureId || resizingFurnitureId || isPanning) {
        handlePointerUp();
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    window.addEventListener('touchend', handleGlobalTouchEnd);
    window.addEventListener('touchcancel', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      window.removeEventListener('touchcancel', handleGlobalTouchEnd);
    };
  });

  // Mouse wrapper events
  const handleMouseDown = (e: React.MouseEvent) => handlePointerDown(e.clientX, e.clientY, e.target);
  const handleMouseMove = (e: React.MouseEvent) => handlePointerMove(e.clientX, e.clientY);
  const handleMouseUp = () => handlePointerUp();

  // Multi-touch gestures (two-finger pinch to zoom if desired)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
      setIsPanning(false);
      setDraggingFurnitureId(null);
      setResizingFurnitureId(null);

      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };

      touchState.current = {
        initialDist: dist,
        initialZoom: zoom,
        initialMidpoint: mid,
        initialPan: { ...panOffset },
      };
    } else if (e.touches.length === 1 && e.touches[0]) {
      handlePointerDown(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
      const currentDist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      const currentMid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      const { initialDist, initialZoom, initialMidpoint, initialPan } = touchState.current;

      if (initialDist > 0) {
        const scale = currentDist / initialDist;
        const newZoom = Math.min(8, Math.max(0.15, initialZoom * scale));

        const dx = currentMid.x - initialMidpoint.x;
        const dy = currentMid.y - initialMidpoint.y;

        const rect = containerRef.current?.getBoundingClientRect();
        const focalX = initialMidpoint.x - (rect?.left || 0);
        const focalY = initialMidpoint.y - (rect?.top || 0);

        const zoomRatio = newZoom / initialZoom;
        const newPanX = focalX - (focalX - initialPan.x) * zoomRatio + dx;
        const newPanY = focalY - (focalY - initialPan.y) * zoomRatio + dy;

        setZoom(newZoom);
        setPanOffset({ x: newPanX, y: newPanY });
      }
    } else if (e.touches.length === 1 && e.touches[0]) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      touchState.current.initialDist = 0;
    }
    if (e.touches.length === 0) {
      handlePointerUp();
    }
  };

  // Rotate selected furniture 90°
  const rotateSelectedFurniture = async (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!selectedFurnitureId) return;
    const currentId = selectedFurnitureId;
    const furn = await db.furniture.get(currentId);
    if (furn) {
      const nextRot = ((furn.position.rotation || 0) + 90) % 360;
      await db.furniture.update(currentId, {
        position: { ...furn.position, rotation: nextRot },
        updatedAt: Date.now(),
      });
      scheduleAutoSync();
      pointerDownPos.current.targetFurnitureId = currentId;
      setSelectedFurnitureId(currentId);
    }
  };

  // Flip / Mirror selected furniture orientation (e.g. chaise left <-> right)
  const flipSelectedFurniture = async (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!selectedFurnitureId) return;
    const currentId = selectedFurnitureId;
    const furn = await db.furniture.get(currentId);
    if (furn) {
      const nextMirrored = !furn.mirrored;
      await db.furniture.update(currentId, {
        mirrored: nextMirrored,
        updatedAt: Date.now(),
      });
      scheduleAutoSync();
      pointerDownPos.current.targetFurnitureId = currentId;
      setSelectedFurnitureId(currentId);
    }
  };

  // Quick resize dimension adjustments (+/- width or length in grid units)
  // Set width or length to an exact value (cm precision), or step it by delta
  const setFurnitureDimension = async (axis: 'w' | 'l', value: number | ((current: number) => number)) => {
    if (!selectedFurnitureId) return;
    const currentId = selectedFurnitureId;
    const furn = await db.furniture.get(currentId);
    if (furn) {
      const clamp = (v: number) => roundCm(Math.max(0.1, Math.min(30, v)));
      const next = (cur: number) => clamp(typeof value === 'function' ? value(cur) : value);
      const newW = axis === 'w' ? next(furn.dimension.width) : furn.dimension.width;
      const newL = axis === 'l' ? next(furn.dimension.length) : furn.dimension.length;
      await db.furniture.update(currentId, {
        dimension: {
          ...furn.dimension,
          width: newW,
          length: newL,
        },
        updatedAt: Date.now(),
      });
      scheduleAutoSync();
      pointerDownPos.current.targetFurnitureId = currentId;
      setSelectedFurnitureId(currentId);
    }
  };

  // Move a piece to an exact spot (nudging, typed distances, align buttons); keeps it inside the room
  const setFurniturePosition = async (id: string, x: number, y: number, rotated: boolean, dimW: number, dimL: number) => {
    const fw = rotated ? dimL : dimW;
    const fl = rotated ? dimW : dimL;
    const clamped = snapFurniturePosition(x, y, fw, fl, gridW, gridH, room?.polygonPoints, false, undefined, 0);
    await db.furniture.update(id, { 'position.x': roundCm(clamped.x), 'position.y': roundCm(clamped.y), updatedAt: Date.now() });
    scheduleAutoSync();
  };

  // Delete selected furniture
  const deleteSelectedFurniture = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!selectedFurnitureId) return;
    if (window.confirm('Delete this furniture piece? Associated containers will also be removed.')) {
      await db.transaction('rw', [db.furniture, db.containers, db.items], async () => {
        const containers = await db.containers.where('furnitureId').equals(selectedFurnitureId).toArray();
        const containerIds = containers.map((c) => c.id);
        await db.items.where('containerId').anyOf(containerIds).delete();
        await db.containers.where('furnitureId').equals(selectedFurnitureId).delete();
        await db.furniture.delete(selectedFurnitureId);
      });
      scheduleAutoSync();
      setSelectedFurnitureId(null);
    }
  };

  // Build SVG polygon points if non-rectangular shape is configured
  const getPolygonPointsString = (points?: Point2D[]): string | null => {
    if (!points || points.length === 0) return null;
    return points.map((p) => `${p.x * unitSize},${p.y * unitSize}`).join(' ');
  };

  const polygonStr = getPolygonPointsString(room?.polygonPoints);
  const roomPixelW = gridW * unitSize;
  const roomPixelH = gridH * unitSize;

  if (!room) {
    return (
      <div className="relative flex-1 w-full h-full bg-slate-100 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-4 text-blue-600 shadow-sm animate-pulse">
          <MapPin className="w-8 h-8" />
        </div>
        <h3 className="text-base sm:text-lg font-black text-slate-800 mb-1">No rooms yet</h3>
        <p className="text-xs text-slate-500 max-w-xs mb-4">
          Add the room where you most often look for things.
        </p>
        <button
          onClick={async () => {
            if (getAppMode() === 'demo') {
              await seedDemoDataIfEmpty();
              const r = await db.rooms.toArray();
              if (r.length > 0) setSelectedRoomId(r[0].id);
            } else {
              setRoomManagerOpen(true);
            }
          }}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span>{getAppMode() === 'demo' ? 'Restore demo home' : 'Add a room'}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative flex-1 w-full h-full bg-slate-200/80 overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing"
    >
      {/* Other Room Matches Banner */}
      {isSearching && otherRoomsWithMatches.length > 0 && furnitureList.every((f) => !matchingFurnitureIds.has(f.id)) && (
        <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-amber-500 text-white px-3.5 py-1.5 rounded-2xl shadow-xl text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <span>⚡ Matches found in other rooms:</span>
          <div className="flex items-center gap-1.5">
            {otherRoomsWithMatches.map((otherRoom) => (
              <button
                key={otherRoom.id}
                onClick={() => setSelectedRoomId(otherRoom.id)}
                className="px-2.5 py-0.5 rounded-xl bg-white text-amber-800 font-extrabold hover:bg-amber-50 cursor-pointer shadow-xs transition-all active:scale-95"
              >
                Go to {otherRoom.name} →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* An empty room says what to do next */}
      {furnitureCount === 0 && !selectedFurnitureId && (
        <div className="absolute left-3 right-3 bottom-24 sm:bottom-8 z-20 mx-auto max-w-sm bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200 shadow-lg p-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-900">This room is empty</p>
            <p className="text-xs text-slate-500">Add a cupboard, shelf or wardrobe, then fill it.</p>
          </div>
          <button
            type="button"
            onClick={() => setFurnitureLibraryOpen(true)}
            className="min-h-[44px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center gap-1.5 cursor-pointer flex-shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" /> Add furniture
          </button>
        </div>
      )}

      {/* Top toolbar: few, big, labelled buttons; the rest lives in the View menu */}
      <div
        data-toolbar={appMode === 'edit' ? 'edit-controls' : 'view-controls'}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={`absolute z-20 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-1.5 py-1.5 rounded-2xl border border-slate-200 shadow-md text-slate-700 ${
          appMode === 'edit'
            ? 'top-3 left-3 right-3 sm:right-auto sm:top-4 sm:left-4'
            : 'top-3 right-3 sm:top-4 sm:right-4' // view mode: only the View menu, as a small corner button
        }`}
      >
        {appMode === 'edit' && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFurnitureLibraryOpen(true);
              }}
              className="min-h-[44px] flex items-center gap-1.5 text-sm font-bold px-3.5 rounded-xl text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors cursor-pointer flex-shrink-0"
              title="Add Furniture, Tables, Couches, Counters or Fixtures"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              <span>Add</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRoomShapeModalOpen(true, 'presets');
              }}
              className="min-h-[44px] flex items-center gap-1.5 text-sm font-bold px-3 rounded-xl text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer flex-shrink-0"
              title="Room walls and shape"
            >
              <Pentagon className="w-5 h-5" />
              <span>Walls</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRoomShapeModalOpen(true, 'door');
              }}
              className="min-h-[44px] flex items-center gap-1.5 text-sm font-bold px-3 rounded-xl text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer flex-shrink-0"
              title="Room doors and entrances"
            >
              <DoorOpen className="w-5 h-5 text-amber-600" />
              <span>Doors</span>
            </button>
          </>
        )}
        <div className={appMode === 'edit' ? 'ml-auto' : ''}>
          <CanvasOptionsMenu
            gridSnap={appMode === 'edit' ? gridSnap : undefined}
            onToggleGridSnap={appMode === 'edit' ? toggleGridSnap : undefined}
            showLabels={showLabels}
            onToggleLabels={toggleShowLabels}
            showDimensions={showDimensions}
            onToggleDimensions={toggleShowDimensions}
            onRecenter={fitRoomToViewport}
            isFullscreen={isBrowserFullscreen}
            onToggleFullscreen={toggleBrowserFullscreen}
            onShare={room ? () => useAppStore.getState().setShareRoomId(room.id) : undefined}
          />
        </div>
      </div>

      {/* Selection panel: big actions and precise position & size (Edit Mode) */}
      {selectedFurnitureId && appMode === 'edit' && (() => {
        const selectedFurn = furnitureList.find((f) => f.id === selectedFurnitureId);
        if (!selectedFurn) return null;
        const rotated = (selectedFurn.position.rotation || 0) % 180 !== 0;
        return (
          <FurniturePanel
            key={selectedFurn.id}
            name={selectedFurn.name}
            x={selectedFurn.position.x}
            y={selectedFurn.position.y}
            width={selectedFurn.dimension.width}
            length={selectedFurn.dimension.length}
            rotated={rotated}
            roomW={gridW}
            roomH={gridH}
            mirrored={!!selectedFurn.mirrored}
            dragResizeOn={dragResizeOn}
            onToggleDragResize={() => setDragResizeOn(!dragResizeOn)}
            onRotate={() => rotateSelectedFurniture()}
            onFlip={() => flipSelectedFurniture()}
            onOpen={() => setAppMode('view')}
            onDelete={() => deleteSelectedFurniture()}
            onClose={() => setSelectedFurnitureId(null)}
            onSetPosition={(x, y) => setFurniturePosition(selectedFurn.id, x, y, rotated, selectedFurn.dimension.width, selectedFurn.dimension.length)}
            onSetSize={(axis, m) => setFurnitureDimension(axis, m)}
            onReserve={setReservedBottom}
          />
        );
      })()}

      {/* Transform Container (Positioned and scaled to frame the room) */}
      <div
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute transition-transform duration-75 ease-out"
      >
        {/* Architectural Room Floor & Walls */}
        <div
          style={{
            width: roomPixelW,
            height: roomPixelH,
          }}
          className="relative rounded-2xl shadow-2xl canvas-bg"
        >
          {/* SVG Floor Material & Architectural Walls */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* Scandinavian Light Oak Parquet Pattern */}
              <pattern
                id="wood-parquet"
                width={unitSize * 2}
                height={unitSize * 2}
                patternUnits="userSpaceOnUse"
              >
                {/* Subtle base wood tone */}
                <rect width={unitSize * 2} height={unitSize * 2} fill="#fbf8f3" />
                {/* Horizontal planks */}
                <rect x="0" y="0" width={unitSize * 2} height={unitSize} fill="#f7f3eb" />
                <line x1="0" y1={unitSize} x2={unitSize * 2} y2={unitSize} stroke="#ece4d8" strokeWidth="1" />
                <line x1={unitSize} y1="0" x2={unitSize} y2={unitSize} stroke="#ece4d8" strokeWidth="1" />
                {/* Vertical alternate planks */}
                <line x1="0" y1={unitSize * 2} x2={unitSize * 2} y2={unitSize * 2} stroke="#ece4d8" strokeWidth="1" />
                <line x1={unitSize * 0.5} y1={unitSize} x2={unitSize * 0.5} y2={unitSize * 2} stroke="#ece4d8" strokeWidth="1" />
                <line x1={unitSize * 1.5} y1={unitSize} x2={unitSize * 1.5} y2={unitSize * 2} stroke="#ece4d8" strokeWidth="1" />
              </pattern>

              {/* Floor ambient occlusion edge shadow */}
              <filter id="wall-shadow" x="-5%" y="-5%" width="110%" height="110%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* 1. Architectural Exterior Wall Boundary (drawn first so outer half extends outward) */}
            {polygonStr ? (
              <polygon
                points={polygonStr}
                fill="none"
                stroke="#1e293b"
                strokeWidth="12"
                strokeLinejoin="round"
              />
            ) : (
              <rect
                x="0"
                y="0"
                width={roomPixelW}
                height={roomPixelH}
                fill="none"
                stroke="#1e293b"
                strokeWidth="12"
                strokeLinejoin="round"
              />
            )}

            {/* 2. Main Floor Surface with Warm Parquet (covers the inner 6px of the wall stroke, flush with grid (0,0)) */}
            {polygonStr ? (
              <polygon
                points={polygonStr}
                fill="url(#wood-parquet)"
              />
            ) : (
              <rect x="0" y="0" width={roomPixelW} height={roomPixelH} fill="url(#wood-parquet)" />
            )}

            {/* 3. Inner Plaster Bevel Stroke (flush along inner boundary) */}
            {polygonStr ? (
              <polygon
                points={polygonStr}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            ) : (
              <rect
                x="0"
                y="0"
                width={roomPixelW}
                height={roomPixelH}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
              />
            )}

            {/* 4. Architectural Grid (Subtle Guide) */}
            <pattern
              id="subtle-grid"
              width={unitSize}
              height={unitSize}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${unitSize} 0 L 0 0 0 ${unitSize}`}
                fill="none"
                stroke="#e2d8c9"
                strokeWidth="0.5"
                opacity="0.4"
              />
            </pattern>
            {polygonStr ? (
              <polygon points={polygonStr} fill="url(#subtle-grid)" />
            ) : (
              <rect width="100%" height="100%" fill="url(#subtle-grid)" />
            )}

            {/* 5. Architectural Entrance Door Swing Arcs (under doors) */}
            {doorsWithGeo.map(({ door, geo }) => (
              <path
                key={`arc-${door.id}`}
                d={geo.arcD}
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.85"
              />
            ))}

            {/* 6. Architectural Door Opening Cutout, Leaf, & Jambs for All Doors (on top of walls) */}
            {doorsWithGeo.map(({ door, geo }) => (
              <g key={`assembly-${door.id}`} className="room-door-assembly">
                {/* Wall Opening Cutout: clear the dark wall stroke */}
                <line
                  x1={geo.thresholdLine.x1}
                  y1={geo.thresholdLine.y1}
                  x2={geo.thresholdLine.x2}
                  y2={geo.thresholdLine.y2}
                  stroke="#fbf8f3"
                  strokeWidth="14"
                  strokeLinecap="square"
                />
                {/* Subtle threshold line */}
                <line
                  x1={geo.thresholdLine.x1}
                  y1={geo.thresholdLine.y1}
                  x2={geo.thresholdLine.x2}
                  y2={geo.thresholdLine.y2}
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                {/* Door Leaf (the solid swinging door panel) */}
                <line
                  x1={geo.leafLine.x1}
                  y1={geo.leafLine.y1}
                  x2={geo.leafLine.x2}
                  y2={geo.leafLine.y2}
                  stroke="#0f172a"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                {/* Architectural Jamb Blocks */}
                {geo.jambs.map((jamb, idx) => (
                  <rect
                    key={idx}
                    x={jamb.x}
                    y={jamb.y}
                    width={jamb.w}
                    height={jamb.h}
                    fill="#1e293b"
                    rx="1"
                  />
                ))}
              </g>
            ))}

            {/* 7. Architectural CAD Dimension Lines & Wall Measurements */}
            {showDimensions && (
              <g className="room-dimensions pointer-events-none select-none">
                {/* Horizontal Top Dimension: Room Width */}
                <g className="dim-width">
                  {/* Left Witness Line */}
                  <line x1={0} y1={-6} x2={0} y2={-32} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                  {/* Right Witness Line */}
                  <line x1={roomPixelW} y1={-6} x2={roomPixelW} y2={-32} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                  {/* Main Dimension Line */}
                  <line x1={0} y1={-24} x2={roomPixelW} y2={-24} stroke="#475569" strokeWidth="1.5" />
                  {/* Left End Tick (45 deg architectural slash) */}
                  <line x1={-4} y1={-20} x2={4} y2={-28} stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
                  {/* Right End Tick */}
                  <line x1={roomPixelW - 4} y1={-20} x2={roomPixelW + 4} y2={-28} stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
                  {/* Dimension Text Badge */}
                  <g transform={`translate(${roomPixelW / 2}, -24)`}>
                    <rect x={-28} y={-11} width={56} height={22} rx={6} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
                    <text x={0} y={4} textAnchor="middle" fill="#0f172a" fontSize="11" fontFamily="ui-monospace, monospace" fontWeight="bold">
                      {gridW}m
                    </text>
                  </g>
                </g>

                {/* Vertical Left Dimension: Room Height */}
                <g className="dim-height">
                  {/* Top Witness Line */}
                  <line x1={-6} y1={0} x2={-32} y2={0} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                  {/* Bottom Witness Line */}
                  <line x1={-6} y1={roomPixelH} x2={-32} y2={roomPixelH} stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" />
                  {/* Main Dimension Line */}
                  <line x1={-24} y1={0} x2={-24} y2={roomPixelH} stroke="#475569" strokeWidth="1.5" />
                  {/* Top End Tick */}
                  <line x1={-20} y1={-4} x2={-28} y2={4} stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
                  {/* Bottom End Tick */}
                  <line x1={-20} y1={roomPixelH - 4} x2={-28} y2={roomPixelH + 4} stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
                  {/* Dimension Text Badge */}
                  <g transform={`translate(-24, ${roomPixelH / 2})`}>
                    <rect x={-28} y={-11} width={56} height={22} rx={6} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
                    <text x={0} y={4} textAnchor="middle" fill="#0f172a" fontSize="11" fontFamily="ui-monospace, monospace" fontWeight="bold">
                      {gridH}m
                    </text>
                  </g>
                </g>

              </g>
            )}
          </svg>

          {/* Interactive Door Drag & Quick Edit Badges for All Doors (Edit Mode) */}
          {doorsWithGeo.map(({ door, geo }) => {
            const isThisDoorDragging = draggingDoorId === door.id;
            const isActiveDoor = activeDoorId === door.id || isThisDoorDragging;
            if (!isActiveDoor) {
              // Small marker: one clear tap target, out of the way of the furniture
              return (
                <button
                  key={`badge-${door.id}`}
                  type="button"
                  aria-label={`${door.label || 'Door'}: tap to edit`}
                  title={door.label || 'Door'}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFurnitureId(null);
                    setActiveDoorId(door.id || null);
                  }}
                  style={{
                    left: `${geo.badgePos.x}px`,
                    top: `${geo.badgePos.y}px`,
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                  }}
                  className={`absolute z-35 w-11 h-11 flex items-center justify-center select-none ${
                    appMode === 'edit' ? 'pointer-events-auto' : 'invisible pointer-events-none'
                  }`}
                >
                  <span className="w-7 h-7 rounded-full bg-slate-900/90 border-2 border-amber-400 shadow-lg flex items-center justify-center">
                    <DoorOpen className="w-4 h-4 text-amber-400" />
                  </span>
                </button>
              );
            }
            return (
              <div
                key={`badge-${door.id}`}
                style={{
                  left: `${geo.badgePos.x}px`,
                  top: `${geo.badgePos.y}px`,
                  transform: `translate(-50%, -50%) scale(${1 / zoom})`, // constant on-screen size
                }}
                className={`absolute z-35 flex items-center select-none ${
                  appMode === 'edit' ? 'pointer-events-auto opacity-100 scale-100' : 'invisible pointer-events-none opacity-0 scale-90'
                } transition-all duration-150`}
              >
                <div className="relative flex items-center gap-1 bg-slate-900/90 text-white backdrop-blur-md px-2 py-1 rounded-full shadow-2xl border border-white/20 text-xs font-bold ring-2 ring-amber-400/40">
                  {/* Dragging Position HUD Tooltip */}
                  {isThisDoorDragging && (
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap shadow-lg ring-1 ring-white/40 animate-pulse pointer-events-none z-40">
                      {door.offset}m along {door.wall} wall
                    </div>
                  )}

                  {/* Door Drag Handle / Open Modal Tab */}
                  <div
                    data-door-handle={door.id || 'door-handle'}
                    onMouseDown={(e) => handleDoorDragStart(e, door.id || '')}
                    onTouchStart={(e) => handleDoorDragStart(e, door.id || '')}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hasDoorDragged.current) return;
                      setRoomShapeModalOpen(true, 'door');
                    }}
                    className="flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg hover:bg-white/20 cursor-grab active:cursor-grabbing transition-colors"
                    title={`${door.label || 'Door'} (${door.width || 2}m wide, ${door.offset}m from corner on ${door.wall} wall) — Click to configure`}
                  >
                    <DoorOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] whitespace-nowrap font-bold">{door.label || 'Door'}</span>
                  </div>

                  {/* Door Connection to Another Room */}
                  {door.targetRoomId ? (() => {
                    const targetRoom = allRooms.find((r) => r.id === door.targetRoomId);
                    return (
                      <button
                        type="button"
                        data-door-connect={door.id || 'door-connect'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (room) setConnectRoomModalOpen(true, { roomId: room.id, doorId: door.id || '' });
                        }}
                        className="w-9 h-9 rounded-full bg-emerald-500/30 hover:bg-emerald-500/50 border border-emerald-400/40 flex items-center justify-center cursor-pointer transition-all active:scale-95 ml-0.5 flex-shrink-0"
                        title={`Connected to ${targetRoom?.name || 'Room'} — Click to edit or disconnect`}
                      >
                        <Link className="w-4 h-4 text-emerald-300" />
                      </button>
                    );
                  })() : (
                    <button
                      type="button"
                      data-door-connect={door.id || 'door-connect'}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (room) setConnectRoomModalOpen(true, { roomId: room.id, doorId: door.id || '' });
                      }}
                      className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-all active:scale-95 shadow-md cursor-pointer ml-0.5 flex-shrink-0"
                      title="Connect another room to this doorway (+)"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Interactive Doorway Walkthrough Portals (View Mode - positioned OUTSIDE room surface) */}
          {doorsWithGeo.map(({ door, geo }) => {
            if (!door.targetRoomId) return null;
            const targetRoom = allRooms.find((r) => r.id === door.targetRoomId);
            if (!targetRoom) return null;

            const portalPos = portalPositions.get(door.id || '') || geo.exteriorPortalPos || geo.badgePos;
            const threshMidX = (geo.thresholdLine.x1 + geo.thresholdLine.x2) / 2;
            const threshMidY = (geo.thresholdLine.y1 + geo.thresholdLine.y2) / 2;

            return (
              <React.Fragment key={`view-portal-group-${door.id}`}>
                {/* Visual architectural connector line from door opening to exterior portal */}
                {appMode === 'view' && (
                  <svg
                    className="absolute inset-0 pointer-events-none overflow-visible z-30"
                    style={{ overflow: 'visible' }}
                  >
                    <line
                      x1={threshMidX}
                      y1={threshMidY}
                      x2={portalPos.x}
                      y2={portalPos.y}
                      stroke="#10b981"
                      strokeWidth="2"
                      strokeDasharray="3 3"
                      strokeOpacity="0.85"
                    />
                    <circle
                      cx={threshMidX}
                      cy={threshMidY}
                      r="3"
                      fill="#10b981"
                    />
                  </svg>
                )}

                <div
                  style={{
                    left: `${portalPos.x}px`,
                    top: `${portalPos.y}px`,
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`, // constant on-screen size
                  }}
                  className={`absolute z-35 flex items-center select-none ${
                    appMode === 'view' ? 'pointer-events-auto opacity-100 scale-100' : 'invisible pointer-events-none opacity-0 scale-90'
                  } transition-all duration-150`}
                >
                  <button
                    type="button"
                    data-door-portal={door.id || 'door-portal'}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRoomId(door.targetRoomId!);
                    }}
                    className="group flex items-center gap-1.5 bg-slate-900/95 hover:bg-emerald-600 text-white backdrop-blur-md px-3 py-1.5 rounded-full shadow-2xl border border-white/20 text-xs font-bold ring-2 ring-emerald-400/80 hover:ring-emerald-300 transition-all cursor-pointer active:scale-95"
                    title={`Walk through door into ${targetRoom.name}`}
                  >
                    <DoorOpen className="w-3.5 h-3.5 text-emerald-400 group-hover:text-white transition-colors" />
                    <span className="whitespace-nowrap max-w-[160px] truncate">{targetRoom.name}</span>
                    <ArrowRight className="w-3 h-3 text-emerald-300 group-hover:text-white group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </React.Fragment>
            );
          })}

          {/* Guide lines: where the piece being dragged locked on (wall or neighbour) */}
          {dragGuides && (
            <svg className="absolute inset-0 pointer-events-none z-30" style={{ overflow: 'visible' }} width={roomPixelW} height={roomPixelH}>
              {dragGuides.x !== undefined && (
                <line x1={dragGuides.x * unitSize} y1={-12 / zoom} x2={dragGuides.x * unitSize} y2={roomPixelH + 12 / zoom} stroke="#2563eb" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />
              )}
              {dragGuides.y !== undefined && (
                <line x1={-12 / zoom} y1={dragGuides.y * unitSize} x2={roomPixelW + 12 / zoom} y2={dragGuides.y * unitSize} stroke="#2563eb" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />
              )}
            </svg>
          )}

          {/* Furniture Elements */}
          {furnitureList.map((furn) => {
            const isSelected = furn.id === selectedFurnitureId;
            const isHighlighted = furn.id === highlightedFurnitureId;
            const isSearchMatch = isSearching && matchingFurnitureIds.has(furn.id);
            const isSearchDimmed = isSearching && !isSearchMatch;
            const searchCount = matchCountsByFurniture.get(furn.id) || 0;
            const itemCount = itemCountsByFurniture[furn.id] || 0;

            const posX = (dragLivePos && dragLivePos.id === furn.id) ? dragLivePos.x : furn.position.x;
            const posY = (dragLivePos && dragLivePos.id === furn.id) ? dragLivePos.y : furn.position.y;
            const dimW = (resizeLiveDim && resizeLiveDim.id === furn.id) ? resizeLiveDim.w : furn.dimension.width;
            const dimL = (resizeLiveDim && resizeLiveDim.id === furn.id) ? resizeLiveDim.l : furn.dimension.length;

            const isRotated = furn.position.rotation % 180 !== 0;
            const w = (isRotated ? dimL : dimW) * unitSize;
            const l = (isRotated ? dimW : dimL) * unitSize;
            const left = posX * unitSize;
            const top = posY * unitSize;
            const isCurrentlyDragging = draggingFurnitureId === furn.id;

            return (
              <div
                key={furn.id}
                id={`furniture-${furn.id}`}
                data-furniture-id={furn.id}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${w}px`,
                  height: `${l}px`,
                }}
                className={`absolute select-none ${
                  isCurrentlyDragging ? 'transition-none z-35 shadow-2xl scale-[1.02] ring-4 ring-blue-500 rounded-2xl' : 'transition-all duration-150'
                } ${
                  appMode === 'edit' ? 'cursor-move' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
                } ${isSelected && furn.shape !== 'l_shape' && furn.shape !== 'round' ? 'z-20 ring-2 ring-blue-600 rounded-2xl' : isSelected ? 'z-20' : isSearchMatch ? 'z-25 scale-[1.02]' : 'z-10'} ${
                  isSearchDimmed ? 'opacity-30 grayscale-[35%]' : 'opacity-100'
                }`}
              >
                {/* Rich Top-Down Architectural Furniture Graphic */}
                <FurnitureGraphic
                  type={furn.type}
                  shape={furn.shape}
                  name={furn.name}
                  color={furn.color}
                  width={w}
                  height={l}
                  rotation={furn.position.rotation}
                  mirrored={furn.mirrored}
                  itemCount={itemCount}
                  isSelected={isSelected}
                  isHighlighted={isHighlighted || isSearchMatch}
                  showLabels={showLabels}
                  showDimensions={showDimensions}
                  dimensionText={`${formatMeters(dimW, false)} × ${formatMeters(dimL)}`}
                  labelScale={1 / zoom}
                />

                {/* Live Resizing Dimension Tooltip */}
                {resizeLiveDim && resizeLiveDim.id === furn.id && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-40 bg-blue-600 text-white font-mono text-[11px] font-black px-2.5 py-1 rounded-lg shadow-xl pointer-events-none whitespace-nowrap ring-2 ring-white flex items-center gap-1.5 animate-pulse">
                    <span>📐</span>
                    <span>{dimW}m × {dimL}m</span>
                  </div>
                )}

                {/* Visual Glowing Pulse Beacon & Floating Match Badge */}
                {isSearchMatch && (
                  <>
                    <span className="absolute -inset-3 rounded-2xl bg-amber-400/50 animate-ping pointer-events-none" />
                    <span className="absolute -inset-1 rounded-xl ring-4 ring-amber-400 shadow-2xl shadow-amber-400/60 pointer-events-none" />
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-30 pointer-events-none whitespace-nowrap px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-[11px] shadow-lg shadow-amber-500/50 flex items-center gap-1 animate-bounce">
                      <span>⚡</span>
                      <span>{searchCount} {searchCount === 1 ? 'match' : 'matches'}</span>
                    </div>
                  </>
                )}

                {/* Visual Locator Pulse Beacon for Manual Highlight */}
                {isHighlighted && !isSearchMatch && (
                  <span className="absolute -inset-2.5 rounded-xl bg-amber-400/60 animate-ping pointer-events-none" />
                )}

                {/* Resize Handles (Prominently visible when item is selected in Edit Mode) */}
                {appMode === 'edit' && isSelected && dragResizeOn && (
                  <>
                    {/* Bottom-Right Corner Resize Handle (Dual-axis resize) */}
                    <div
                      data-resize-handle="corner"
                      onMouseDown={(e) => startResizing(e, furn.id, 'corner')}
                      onTouchStart={(e) => startResizing(e, furn.id, 'corner')}
                      style={{ touchAction: 'none', transform: `scale(${1 / zoom})`, transformOrigin: '100% 100%' }}
                      className="absolute -bottom-2.5 -right-2.5 w-7 h-7 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xl flex items-center justify-center cursor-se-resize z-40 border-2 border-white ring-2 ring-blue-500/40 transition-transform active:scale-125 before:absolute before:-inset-3 before:content-[''] select-none"
                      title="Drag corner to resize dimensions"
                    >
                      <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
                    </div>

                    {/* Right Edge Resize Handle (Horizontal width resize - if piece is wide enough) */}
                    {w >= 64 && (
                      <div
                        data-resize-handle="width"
                        onMouseDown={(e) => startResizing(e, furn.id, 'width')}
                        onTouchStart={(e) => startResizing(e, furn.id, 'width')}
                        style={{ touchAction: 'none', transform: `translateY(-50%) scale(${1 / zoom})`, transformOrigin: '100% 50%' }}
                        className="absolute top-1/2 -right-1.5w-3 h-8 rounded-full bg-white hover:bg-blue-50 text-blue-600 shadow-md flex items-center justify-center cursor-ew-resize z-35 border-2 border-blue-500 transition-transform active:scale-125 before:absolute before:-inset-2 before:content-[''] select-none"
                        title="Drag edge to resize horizontal dimension"
                      >
                        <div className="w-0.5 h-3 bg-blue-500 rounded-full" />
                      </div>
                    )}

                    {/* Bottom Edge Resize Handle (Vertical length resize - if piece is tall enough) */}
                    {l >= 64 && (
                      <div
                        data-resize-handle="length"
                        onMouseDown={(e) => startResizing(e, furn.id, 'length')}
                        onTouchStart={(e) => startResizing(e, furn.id, 'length')}
                        style={{ touchAction: 'none', transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: '50% 100%' }}
                        className="absolute -bottom-1.5 left-1/2w-8 h-3 rounded-full bg-white hover:bg-blue-50 text-blue-600 shadow-md flex items-center justify-center cursor-ns-resize z-35 border-2 border-blue-500 transition-transform active:scale-125 before:absolute before:-inset-2 before:content-[''] select-none"
                        title="Drag edge to resize vertical dimension"
                      >
                        <div className="w-3 h-0.5 bg-blue-500 rounded-full" />
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
