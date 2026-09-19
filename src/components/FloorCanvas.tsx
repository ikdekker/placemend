import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Point2D } from '../types';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Trash2, 
  Grid,
  Eye,
  Edit3,
  Scaling,
  Pentagon
} from 'lucide-react';

export const FloorCanvas: React.FC = () => {
  const {
    appMode,
    selectedRoomId,
    selectedFurnitureId,
    highlightedFurnitureId,
    setSelectedFurnitureId,
    setRoomShapeModalOpen,
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    gridSnap,
    toggleGridSnap,
    showLabels,
    toggleShowLabels,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

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

  const unitSize = room?.unitSize || 32;
  const gridW = room?.gridWidth || 26;
  const gridH = room?.gridHeight || 18;

  // Zoom on wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => prev * delta);
  };

  // Pointer / Touch handlers
  const handlePointerDown = (clientX: number, clientY: number, target: EventTarget) => {
    if (target === containerRef.current || (target as HTMLElement).classList.contains('canvas-bg')) {
      setIsPanning(true);
      setPanStart({ x: clientX - panOffset.x, y: clientY - panOffset.y });
      setSelectedFurnitureId(null);
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
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
    setIsPanning(false);
    setDraggingFurnitureId(null);
    setResizingFurnitureId(null);
  };

  // Mouse wrapper events
  const handleMouseDown = (e: React.MouseEvent) => handlePointerDown(e.clientX, e.clientY, e.target);
  const handleMouseMove = (e: React.MouseEvent) => handlePointerMove(e.clientX, e.clientY);
  const handleMouseUp = () => handlePointerUp();

  // Touch wrapper events
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      handlePointerDown(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  const handleTouchEnd = () => handlePointerUp();

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

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      className="relative flex-1 w-full h-full bg-slate-100 overflow-hidden select-none cursor-grab active:cursor-grabbing canvas-bg touch-none"
    >
      {/* Floating Canvas Controls (Top Left) */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200 shadow-md text-slate-700">
        <button
          onClick={() => setZoom((z) => z * 1.15)}
          className="p-1.5 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => z * 0.85)}
          className="p-1.5 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-slate-200 mx-0.5" />
        <button
          onClick={toggleGridSnap}
          className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
            gridSnap ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'hover:bg-slate-100 text-slate-400'
          }`}
          title={gridSnap ? 'Grid Snap: ON' : 'Grid Snap: OFF'}
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
        {appMode === 'edit' && (
          <button
            onClick={() => setRoomShapeModalOpen(true)}
            className="p-1.5 rounded-xl text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
            title="Configure Room Walls & Shape"
          >
            <Pentagon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mode Indicator Banner (Top Right) */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-600">
        {appMode === 'edit' ? (
          <div className="flex items-center gap-1.5 text-blue-600">
            <Edit3 className="w-3.5 h-3.5 animate-pulse" />
            <span>Edit Mode: Drag to move • Bottom-right handle to resize</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-600">
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span>View Mode: Click furniture to inspect contents</span>
          </div>
        )}
      </div>

      {/* Selected Furniture Controls Toolbar (Only in Edit Mode) */}
      {selectedFurnitureId && appMode === 'edit' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200 shadow-xl text-slate-800">
          <span className="text-xs font-bold font-mono text-blue-600 truncate max-w-[140px]">
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

      {/* Transform Container (Pan & Zoom) */}
      <div
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute transition-transform duration-75 ease-out"
      >
        {/* Floor Perimeter Wall Container */}
        <div
          style={{
            width: gridW * unitSize,
            height: gridH * unitSize,
          }}
          className="relative rounded-2xl overflow-hidden shadow-2xl bg-white border-2 border-slate-300"
        >
          {/* SVG Shape / Walls */}
          {polygonStr ? (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              <polygon
                points={polygonStr}
                fill="#f8fafc"
                stroke="#475569"
                strokeWidth="6"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}

          {/* Clean architectural grid lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
            <defs>
              <pattern
                id="arch-grid"
                width={unitSize}
                height={unitSize}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${unitSize} 0 L 0 0 0 ${unitSize}`}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#arch-grid)" />
          </svg>

          {/* Room Name Tag */}
          <div className="absolute bottom-3 right-4 font-mono font-black text-xl text-slate-300 select-none uppercase tracking-widest pointer-events-none">
            {room?.name || 'Floor Plan'}
          </div>

          {/* Furniture Elements */}
          {furnitureList.map((furn) => {
            const isSelected = furn.id === selectedFurnitureId;
            const isHighlighted = furn.id === highlightedFurnitureId;
            const itemCount = itemCountsByFurniture[furn.id] || 0;

            const isRotated = furn.position.rotation % 180 !== 0;
            const w = (isRotated ? furn.dimension.length : furn.dimension.width) * unitSize;
            const l = (isRotated ? furn.dimension.width : furn.dimension.length) * unitSize;
            const left = furn.position.x * unitSize;
            const top = furn.position.y * unitSize;

            return (
              <div
                key={furn.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelectedFurnitureId(furn.id);
                  if (appMode === 'edit') {
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
                  e.stopPropagation();
                  setSelectedFurnitureId(furn.id);
                  if (appMode === 'edit' && e.touches[0]) {
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
                  backgroundColor: furn.color || '#3b82f6',
                }}
                className={`absolute rounded-xl shadow-md transition-shadow flex flex-col items-center justify-center p-1.5 border-2 select-none group ${
                  appMode === 'edit' ? 'cursor-move' : 'cursor-pointer hover:shadow-lg'
                } ${
                  isSelected
                    ? 'ring-4 ring-blue-500 border-white z-20 shadow-blue-500/30 shadow-2xl'
                    : 'border-slate-800/40 hover:border-slate-800/80 z-10'
                } ${
                  isHighlighted ? 'animate-bounce ring-4 ring-amber-500 border-white z-30' : ''
                }`}
              >
                {/* Visual Locator Pulse Beacon */}
                {isHighlighted && (
                  <span className="absolute -inset-3 rounded-2xl bg-amber-400/50 animate-ping pointer-events-none" />
                )}

                {/* Wood / Shelving Texture Lines */}
                <div className="absolute inset-1 rounded-lg border border-white/30 pointer-events-none flex flex-col justify-around py-0.5 opacity-70">
                  <div className="w-full h-px bg-white/30" />
                  <div className="w-full h-px bg-white/30" />
                </div>

                {/* Label & Item Count Badge */}
                {showLabels && (
                  <div className="relative z-10 flex flex-col items-center text-center max-w-full px-1">
                    <span className="text-xs font-bold text-white drop-shadow-sm leading-tight line-clamp-2">
                      {furn.name}
                    </span>
                    {itemCount > 0 && (
                      <span className="mt-0.5 px-2 py-0.2 rounded-full bg-slate-900/80 text-white font-mono text-[10px] font-black border border-white/30 shadow-sm flex items-center gap-1">
                        <span>📦</span>
                        <span>{itemCount}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Bottom-Right Resize Handle (Visible in Edit Mode, sized for mobile touch) */}
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
                    className="absolute bottom-0.5 right-0.5 w-6 h-6 sm:w-4 sm:h-4 rounded-br-lg bg-white/95 text-slate-800 shadow-md flex items-center justify-center cursor-se-resize z-30 transition-transform active:scale-125 border border-slate-300"
                    title="Drag to resize dimensions"
                  >
                    <Scaling className="w-3.5 h-3.5 sm:w-2.5 sm:h-2.5 text-blue-600" />
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
