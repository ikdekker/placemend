import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Point2D } from '../types';
import { FurnitureGraphic } from './FurnitureGraphic';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { 
  RotateCw, 
  Trash2, 
  Grid, 
  Eye, 
  Pentagon,
  Maximize2,
  Sliders,
  Sparkles
} from 'lucide-react';

export const FloorCanvas: React.FC = () => {
  const {
    appMode,
    selectedRoomId,
    selectedFurnitureId,
    highlightedFurnitureId,
    setSelectedFurnitureId,
    setSelectedRoomId,
    setRoomShapeModalOpen,
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    fitViewTrigger,
    gridSnap,
    toggleGridSnap,
    showLabels,
    toggleShowLabels,
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

  // Dragging / Moving Furniture (Only enabled in Edit Mode)
  const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ mouseX: 0, mouseY: 0, origX: 0, origY: 0 });

  // Resizing Furniture from bottom-right handle (Only enabled in Edit Mode)
  const [resizingFurnitureId, setResizingFurnitureId] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, origW: 0, origL: 0 });

  const room = useLiveQuery(async () => {
    if (!selectedRoomId) return undefined;
    return await db.rooms.get(selectedRoomId);
  }, [selectedRoomId]);

  const furnitureList = useLiveQuery(async () => {
    if (!selectedRoomId) return [];
    return await db.furniture.where('roomId').equals(selectedRoomId).toArray();
  }, [selectedRoomId]) || [];

  // Items grouped by furniture for item counts
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
        counts[furnId] = (counts[furnId] || 0) + item.quantity;
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
  const gridW = room?.gridWidth || 26;
  const gridH = room?.gridHeight || 18;

  // Auto-fit room to viewport (statically locks and centers the room)
  const fitRoomToViewport = useCallback(() => {
    const containerW = containerRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 412);
    const containerH = containerRef.current?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight - 120 : 700);
    if (containerW <= 50 || containerH <= 50) return;

    const rGridW = room?.gridWidth || 26;
    const rGridH = room?.gridHeight || 18;
    const rUnitSize = room?.unitSize || 32;

    const roomW = rGridW * rUnitSize;
    const roomH = rGridH * rUnitSize;

    const isMobile = window.innerWidth < 768;
    // Margins around the room
    const padX = isMobile ? 24 : 48;
    const padY = isMobile ? 28 : 48;

    const scaleX = (containerW - padX) / roomW;
    const scaleY = (containerH - padY) / roomH;
    const optimalZoom = Math.max(0.18, Math.min(1.15, Math.min(scaleX, scaleY)));

    const centeredX = (containerW - roomW * optimalZoom) / 2;
    const centeredY = (containerH - roomH * optimalZoom) / 2;

    setZoom(optimalZoom);
    setPanOffset({
      x: Math.round(centeredX),
      y: Math.round(centeredY),
    });
  }, [room, setZoom, setPanOffset]);

  // Auto-fit on room change or fitViewTrigger
  useEffect(() => {
    fitRoomToViewport();
    const timer = setTimeout(() => {
      fitRoomToViewport();
    }, 100);
    return () => clearTimeout(timer);
  }, [room?.id, room?.gridWidth, room?.gridHeight, fitViewTrigger, fitRoomToViewport]);

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

    // Moving furniture in Edit Mode
    if (draggingFurnitureId && appMode === 'edit') {
      const dx = (clientX - dragStartPos.mouseX) / (unitSize * zoom);
      const dy = (clientY - dragStartPos.mouseY) / (unitSize * zoom);

      let newX = dragStartPos.origX + dx;
      let newY = dragStartPos.origY + dy;

      if (gridSnap) {
        newX = Math.round(newX);
        newY = Math.round(newY);
      }

      const furn = furnitureList.find((f) => f.id === draggingFurnitureId);
      if (furn) {
        const isRot = furn.position.rotation % 180 !== 0;
        const w = isRot ? furn.dimension.length : furn.dimension.width;
        const l = isRot ? furn.dimension.width : furn.dimension.length;
        newX = Math.max(0, Math.min(gridW - w, newX));
        newY = Math.max(0, Math.min(gridH - l, newY));

        db.furniture.update(draggingFurnitureId, {
          'position.x': newX,
          'position.y': newY,
          updatedAt: Date.now(),
        });
      }
      return;
    }

    // Resizing furniture in Edit Mode
    if (resizingFurnitureId && appMode === 'edit') {
      const dx = (clientX - resizeStart.mouseX) / (unitSize * zoom);
      const dy = (clientY - resizeStart.mouseY) / (unitSize * zoom);

      let newW = resizeStart.origW + dx;
      let newL = resizeStart.origL + dy;

      if (gridSnap) {
        newW = Math.round(newW);
        newL = Math.round(newL);
      }

      newW = Math.max(1, Math.min(18, newW));
      newL = Math.max(1, Math.min(18, newL));

      db.furniture.update(resizingFurnitureId, {
        'dimension.width': newW,
        'dimension.length': newL,
        updatedAt: Date.now(),
      });
    }
  };

  const handlePointerUp = () => {
    // If the finger was stationary (< 5px movement), it's a clean TAP:
    if (!hasDragged.current) {
      if (pointerDownPos.current.targetFurnitureId) {
        // Tapped a furniture piece -> Open that furniture
        setSelectedFurnitureId(pointerDownPos.current.targetFurnitureId);
      } else if (appMode === 'view') {
        // Tapped empty room floor in View Mode -> Deselect
        setSelectedFurnitureId(null);
      }
    }

    // Reset hasDragged after gesture completes so subsequent clicks are clean
    setTimeout(() => {
      hasDragged.current = false;
    }, 50);

    setIsPanning(false);
    setDraggingFurnitureId(null);
    setResizingFurnitureId(null);
  };

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
        const newZoom = Math.min(3, Math.max(0.15, initialZoom * scale));

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
  const rotateSelectedFurniture = async () => {
    if (!selectedFurnitureId) return;
    const furn = await db.furniture.get(selectedFurnitureId);
    if (furn) {
      const nextRot = ((furn.position.rotation || 0) + 90) % 360;
      await db.furniture.update(selectedFurnitureId, {
        'position.rotation': nextRot,
        updatedAt: Date.now(),
      });
    }
  };

  // Delete selected furniture
  const deleteSelectedFurniture = async () => {
    if (!selectedFurnitureId) return;
    if (window.confirm('Delete this furniture piece? Associated containers will also be removed.')) {
      await db.transaction('rw', [db.furniture, db.containers, db.items], async () => {
        const containers = await db.containers.where('furnitureId').equals(selectedFurnitureId).toArray();
        const containerIds = containers.map((c) => c.id);
        await db.items.where('containerId').anyOf(containerIds).delete();
        await db.containers.where('furnitureId').equals(selectedFurnitureId).delete();
        await db.furniture.delete(selectedFurnitureId);
      });
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

      {/* Clean Edit Toolbar (Only visible when user actively enters Edit Mode) */}
      {appMode === 'edit' && (
        <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2 py-1.5 rounded-2xl border border-slate-200 shadow-md text-slate-700">
          <button
            onClick={() => setRoomShapeModalOpen(true)}
            className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-xl text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
            title="Configure Room Walls & Shape"
          >
            <Pentagon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Room Shape</span>
          </button>
          <div className="w-px h-4 bg-slate-200" />
          <button
            onClick={toggleGridSnap}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
              gridSnap ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'hover:bg-slate-100 text-slate-400'
            }`}
            title={gridSnap ? 'Snap to Grid: ON' : 'Snap to Grid: OFF'}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={toggleShowLabels}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
              showLabels ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'hover:bg-slate-100 text-slate-400'
            }`}
            title={showLabels ? 'Labels: ON' : 'Labels: OFF'}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={fitRoomToViewport}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
            title="Reset Room Framing"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selected Furniture Controls Toolbar (Only in Edit Mode) */}
      {selectedFurnitureId && appMode === 'edit' && (
        <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-2xl border border-slate-200 shadow-xl text-slate-800">
          <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">
            {furnitureList.find((f) => f.id === selectedFurnitureId)?.name || 'Selected'}
          </span>
          <div className="w-px h-4 bg-slate-200" />
          <button
            onClick={rotateSelectedFurniture}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
            title="Rotate 90°"
          >
            <RotateCw className="w-3.5 h-3.5 text-blue-600" />
            <span>Rotate</span>
          </button>
          <button
            onClick={deleteSelectedFurniture}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl font-bold cursor-pointer transition-colors"
            title="Delete Furniture"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      )}

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
          <svg className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl overflow-hidden">
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

            {/* Main Floor Surface with Warm Parquet */}
            {polygonStr ? (
              <polygon
                points={polygonStr}
                fill="url(#wood-parquet)"
              />
            ) : (
              <rect width="100%" height="100%" fill="url(#wood-parquet)" />
            )}

            {/* Architectural Grid (Subtle Guide) */}
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
            <rect width="100%" height="100%" fill="url(#subtle-grid)" />

            {/* Architectural Door Swing Arc (Bottom Wall Entrance) */}
            <g opacity="0.4" transform={`translate(${unitSize * 2}, ${roomPixelH - 8})`}>
              <path
                d={`M 0 0 A ${unitSize * 2} ${unitSize * 2} 0 0 0 ${unitSize * 2} ${-unitSize * 2}`}
                fill="none"
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <line x1="0" y1="0" x2="0" y2={-unitSize * 2} stroke="#334155" strokeWidth="2.5" />
            </g>

            {/* Architectural Exterior Wall Boundary */}
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
                x="6"
                y="6"
                width={roomPixelW - 12}
                height={roomPixelH - 12}
                rx="14"
                fill="none"
                stroke="#1e293b"
                strokeWidth="12"
              />
            )}

            {/* Inner Plaster Bevel Stroke */}
            {polygonStr ? (
              <polygon
                points={polygonStr}
                fill="none"
                stroke="#475569"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            ) : (
              <rect
                x="12"
                y="12"
                width={roomPixelW - 24}
                height={roomPixelH - 24}
                rx="8"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
              />
            )}
          </svg>

          {/* Furniture Elements */}
          {furnitureList.map((furn) => {
            const isSelected = furn.id === selectedFurnitureId;
            const isHighlighted = furn.id === highlightedFurnitureId;
            const isSearchMatch = isSearching && matchingFurnitureIds.has(furn.id);
            const isSearchDimmed = isSearching && !isSearchMatch;
            const searchCount = matchCountsByFurniture.get(furn.id) || 0;
            const itemCount = itemCountsByFurniture[furn.id] || 0;

            const isRotated = furn.position.rotation % 180 !== 0;
            const w = (isRotated ? furn.dimension.length : furn.dimension.width) * unitSize;
            const l = (isRotated ? furn.dimension.width : furn.dimension.length) * unitSize;
            const left = furn.position.x * unitSize;
            const top = furn.position.y * unitSize;

            return (
              <div
                key={furn.id}
                id={`furniture-${furn.id}`}
                data-furniture-id={furn.id}
                onClick={(e) => {
                  e.stopPropagation();
                  // If user dragged to pan across the room, do NOT open the furniture!
                  if (hasDragged.current) return;
                  setSelectedFurnitureId(furn.id);
                }}
                onMouseDown={(e) => {
                  if (appMode === 'edit') {
                    e.stopPropagation();
                    setSelectedFurnitureId(furn.id);
                    setDraggingFurnitureId(furn.id);
                    setDragStartPos({
                      mouseX: e.clientX,
                      mouseY: e.clientY,
                      origX: furn.position.x,
                      origY: furn.position.y,
                    });
                  }
                }}
                onTouchStart={(e) => {
                  if (appMode === 'edit' && e.touches[0]) {
                    e.stopPropagation();
                    setSelectedFurnitureId(furn.id);
                    setDraggingFurnitureId(furn.id);
                    setDragStartPos({
                      mouseX: e.touches[0].clientX,
                      mouseY: e.touches[0].clientY,
                      origX: furn.position.x,
                      origY: furn.position.y,
                    });
                  }
                }}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${w}px`,
                  height: `${l}px`,
                }}
                className={`absolute select-none transition-all duration-200 ${
                  appMode === 'edit' ? 'cursor-move' : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
                } ${isSelected ? 'z-20' : isSearchMatch ? 'z-25 scale-[1.02]' : 'z-10'} ${
                  isSearchDimmed ? 'opacity-30 grayscale-[35%]' : 'opacity-100'
                }`}
              >
                {/* Rich Top-Down Architectural Furniture Graphic */}
                <FurnitureGraphic
                  type={furn.type}
                  name={furn.name}
                  color={furn.color}
                  width={w}
                  height={l}
                  rotation={furn.position.rotation}
                  itemCount={itemCount}
                  isSelected={isSelected}
                  isHighlighted={isHighlighted || isSearchMatch}
                  showLabels={showLabels}
                />

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

                {/* Bottom-Right Resize Handle (Visible ONLY in Edit Mode) */}
                {appMode === 'edit' && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedFurnitureId(furn.id);
                      setResizingFurnitureId(furn.id);
                      setResizeStart({
                        mouseX: e.clientX,
                        mouseY: e.clientY,
                        origW: furn.dimension.width,
                        origL: furn.dimension.length,
                      });
                    }}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      setSelectedFurnitureId(furn.id);
                      if (e.touches[0]) {
                        setResizingFurnitureId(furn.id);
                        setResizeStart({
                          mouseX: e.touches[0].clientX,
                          mouseY: e.touches[0].clientY,
                          origW: furn.dimension.width,
                          origL: furn.dimension.length,
                        });
                      }
                    }}
                    className="absolute bottom-1 right-1 w-5 h-5 rounded-md bg-white text-slate-800 shadow-md flex items-center justify-center cursor-se-resize z-30 transition-transform active:scale-125 border border-slate-300"
                    title="Drag to resize dimensions"
                  >
                    <Sliders className="w-3 h-3 text-blue-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
