import React, { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Furniture } from '../types';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Trash2, 
  Layers, 
  Plus, 
  Eye, 
  Grid,
  Move,
  Info
} from 'lucide-react';

export const FloorCanvas: React.FC = () => {
  const {
    selectedRoomId,
    selectedFurnitureId,
    highlightedFurnitureId,
    setSelectedFurnitureId,
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    gridSnap,
    toggleGridSnap,
    showLabels,
    toggleShowLabels,
    resetView,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Dragging furniture
  const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ mouseX: 0, mouseY: 0, origX: 0, origY: 0 });

  const room = useLiveQuery(async () => {
    if (!selectedRoomId) return undefined;
    return await db.rooms.get(selectedRoomId);
  }, [selectedRoomId]);

  const furnitureList = useLiveQuery(async () => {
    if (!selectedRoomId) return [];
    return await db.furniture.where('roomId').equals(selectedRoomId).toArray();
  }, [selectedRoomId]) || [];

  // Items grouped by furniture for quick counts
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
  const gridW = room?.gridWidth || 24;
  const gridH = room?.gridHeight || 18;

  // Zoom on mouse wheel
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => prev * delta);
  };

  // Background pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('canvas-bg')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      setSelectedFurnitureId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (draggingFurnitureId) {
      const dx = (e.clientX - dragStartPos.mouseX) / (unitSize * zoom);
      const dy = (e.clientY - dragStartPos.mouseY) / (unitSize * zoom);

      let newX = dragStartPos.origX + dx;
      let newY = dragStartPos.origY + dy;

      if (gridSnap) {
        newX = Math.round(newX);
        newY = Math.round(newY);
      }

      // Constrain within room
      const furn = furnitureList.find((f) => f.id === draggingFurnitureId);
      if (furn) {
        const w = furn.position.rotation % 180 === 0 ? furn.dimension.width : furn.dimension.length;
        const l = furn.position.rotation % 180 === 0 ? furn.dimension.length : furn.dimension.width;
        newX = Math.max(0, Math.min(gridW - w, newX));
        newY = Math.max(0, Math.min(gridH - l, newY));

        db.furniture.update(draggingFurnitureId, {
          'position.x': newX,
          'position.y': newY,
          updatedAt: Date.now(),
        });
      }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingFurnitureId(null);
  };

  // Rotate selected furniture 90 degrees
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

  return (
    <div 
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      className="relative flex-1 w-full h-full bg-slate-950 overflow-hidden select-none cursor-grab active:cursor-grabbing canvas-bg"
    >
      {/* Floating Canvas Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl text-slate-300">
        <button
          onClick={() => setZoom((z) => z * 1.15)}
          className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom((z) => z * 0.85)}
          className="p-1.5 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-slate-800 mx-0.5" />
        <button
          onClick={toggleGridSnap}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            gridSnap ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40' : 'hover:bg-slate-800 text-slate-400'
          }`}
          title={gridSnap ? 'Grid Snap: ON' : 'Grid Snap: OFF'}
        >
          <Grid className="w-4 h-4" />
        </button>
        <button
          onClick={toggleShowLabels}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            showLabels ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40' : 'hover:bg-slate-800 text-slate-400'
          }`}
          title={showLabels ? 'Labels: Visible' : 'Labels: Hidden'}
        >
          <Eye className="w-4 h-4" />
        </button>
      </div>

      {/* Selected Furniture Controls (Floating overlay when selected) */}
      {selectedFurnitureId && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-slate-900/95 backdrop-blur-md px-3 py-2 rounded-2xl border border-slate-700 shadow-2xl text-slate-200">
          <span className="text-xs font-semibold px-2 font-mono text-blue-400">
            {furnitureList.find((f) => f.id === selectedFurnitureId)?.name || 'Selected'}
          </span>
          <div className="w-px h-4 bg-slate-800" />
          <button
            onClick={rotateSelectedFurniture}
            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg font-medium cursor-pointer transition-colors"
            title="Rotate 90°"
          >
            <RotateCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Rotate</span>
          </button>
          <button
            onClick={deleteSelectedFurniture}
            className="flex items-center gap-1 text-xs px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900/90 text-rose-300 border border-rose-800/60 rounded-lg font-medium cursor-pointer transition-colors"
            title="Remove Furniture"
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
        {/* Floor Perimeter Wall */}
        <div
          style={{
            width: gridW * unitSize,
            height: gridH * unitSize,
          }}
          className="relative bg-slate-900/90 rounded-2xl border-4 border-slate-700/80 shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,0,0,0.6)] overflow-hidden"
        >
          {/* Floor Blueprint Grid Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
            <defs>
              <pattern
                id="blueprint-grid"
                width={unitSize}
                height={unitSize}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${unitSize} 0 L 0 0 0 ${unitSize}`}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="0.75"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#blueprint-grid)" />
          </svg>

          {/* Room Name Watermark */}
          <div className="absolute bottom-3 right-4 font-mono font-black text-2xl text-slate-800/60 select-none uppercase tracking-widest pointer-events-none">
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
                  setDraggingFurnitureId(furn.id);
                  setDragStartPos({
                    mouseX: e.clientX,
                    mouseY: e.clientY,
                    origX: furn.position.x,
                    origY: furn.position.y,
                  });
                }}
                style={{
                  left: `${left}px`,
                  top: `${top}px`,
                  width: `${w}px`,
                  height: `${l}px`,
                  backgroundColor: furn.color || '#3b82f6',
                }}
                className={`absolute rounded-xl shadow-lg cursor-pointer transition-shadow flex flex-col items-center justify-center p-1 border-2 select-none group ${
                  isSelected
                    ? 'ring-4 ring-blue-400 border-white z-20 shadow-blue-500/40 shadow-2xl'
                    : 'border-slate-900/60 hover:border-blue-300/80 z-10'
                } ${
                  isHighlighted ? 'animate-bounce ring-4 ring-amber-400 border-white z-30' : ''
                }`}
              >
                {/* Visual Locator Pulse Beacon */}
                {isHighlighted && (
                  <span className="absolute -inset-2 rounded-2xl bg-amber-400/40 animate-ping pointer-events-none" />
                )}

                {/* Sub-zone / Shelf slots lines texture */}
                <div className="absolute inset-1 rounded-lg border border-white/20 pointer-events-none flex flex-col justify-around py-0.5 opacity-60">
                  <div className="w-full h-px bg-white/20" />
                  <div className="w-full h-px bg-white/20" />
                </div>

                {/* Label & Item Count Badge */}
                {showLabels && (
                  <div className="relative z-10 flex flex-col items-center text-center max-w-full px-1">
                    <span className="text-[11px] font-bold text-white drop-shadow-md leading-tight line-clamp-2">
                      {furn.name}
                    </span>
                    {itemCount > 0 && (
                      <span className="mt-0.5 px-1.5 py-0.2 rounded-full bg-black/60 text-white font-mono text-[9px] font-bold border border-white/20 shadow-sm flex items-center gap-0.5">
                        <span>📦</span>
                        <span>{itemCount}</span>
                      </span>
                    )}
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
