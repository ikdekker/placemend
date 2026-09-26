import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Room } from '../types';
import { getRoomDoors } from '../utils/roomGeometry';
import { calculateMultiRoomFloorPlan, MultiRoomFloorPlan, PlacedRoomNode } from '../utils/connectedRoomsLayout';
import { scheduleSeedIfEmpty } from '../db/sampleData';
import {
  X,
  LayoutGrid,
  Plus,
  DoorOpen,
  ArrowRight,
  Layers,
  Sparkles,
  Link,
  Maximize2,
  Minimize2,
  Focus,
  Scaling,
  Box,
  MapPin,
  Search,
  ZoomIn,
  ZoomOut,
  Compass,
  Check
} from 'lucide-react';

export const MultiRoomOverviewModal: React.FC = () => {
  const {
    isMultiRoomOverviewOpen,
    setMultiRoomOverviewOpen,
    selectedLocationId,
    selectedRoomId,
    setSelectedRoomId,
    setRoomManagerOpen,
    setConnectRoomModalOpen,
  } = useAppStore();

  const [viewMode, setViewMode] = useState<'blueprint' | 'grid'>('blueprint');
  const [filterQuery, setFilterQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inspectedRoomId, setInspectedRoomId] = useState<string | null>(selectedRoomId || null);

  // Pan & Zoom state for Connected Blueprint stage
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const hasMovedRef = useRef(false);

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

  const allRooms = useLiveQuery(async () => {
    if (selectedLocationId) {
      const locRooms = await db.rooms.where('locationId').equals(selectedLocationId).toArray();
      if (locRooms.length > 0) return locRooms;
    }
    const all = await db.rooms.toArray();
    if (all.length > 0) return all;
    scheduleSeedIfEmpty();
    return [];
  }, [selectedLocationId]) || [];

  const allFurniture = useLiveQuery(() => db.furniture.toArray()) || [];
  const allItems = useLiveQuery(() => db.items.toArray()) || [];

  // Initialize inspected room to active room, but allow user to click any room on blueprint to inspect
  const prevSelectedRoomIdRef = useRef(selectedRoomId);
  useEffect(() => {
    if (selectedRoomId !== prevSelectedRoomIdRef.current) {
      prevSelectedRoomIdRef.current = selectedRoomId;
      setInspectedRoomId(selectedRoomId);
    } else if (!inspectedRoomId && allRooms.length > 0) {
      setInspectedRoomId(selectedRoomId || allRooms[0].id);
    }
  }, [selectedRoomId, allRooms, inspectedRoomId]);

  // Compute multi-room connected floor plan layout (rooted stably at selectedRoomId)
  const floorPlan: MultiRoomFloorPlan = useMemo(() => {
    return calculateMultiRoomFloorPlan(allRooms, allFurniture, selectedRoomId || undefined);
  }, [allRooms, allFurniture, selectedRoomId]);

  const unitSize = 24; // base pixels per grid unit in blueprint view

  // Fit entire house floor plan to viewport
  const fitEntireHouseToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || floorPlan.bounds.width <= 0 || floorPlan.bounds.height <= 0) return;

    const containerW = el.clientWidth || 800;
    const containerH = el.clientHeight || 500;

    const housePixelW = floorPlan.bounds.width * unitSize;
    const housePixelH = floorPlan.bounds.height * unitSize;

    const pad = 48;
    const scaleX = (containerW - pad) / Math.max(100, housePixelW);
    const scaleY = (containerH - pad) / Math.max(100, housePixelH);
    const optimalZoom = Math.max(0.2, Math.min(1.4, Math.min(scaleX, scaleY)));

    const centeredX = (containerW - housePixelW * optimalZoom) / 2;
    const centeredY = (containerH - housePixelH * optimalZoom) / 2;

    setZoom(optimalZoom);
    setPanOffset({ x: Math.round(centeredX), y: Math.round(centeredY) });
  }, [floorPlan.bounds.width, floorPlan.bounds.height, unitSize]);

  // Auto-fit on modal open, view mode change, or fullscreen toggle
  useEffect(() => {
    if (isMultiRoomOverviewOpen && viewMode === 'blueprint') {
      const timer = setTimeout(() => {
        fitEntireHouseToView();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isMultiRoomOverviewOpen, viewMode, isFullscreen, fitEntireHouseToView]);

  // Sync fullscreen state with native browser fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [isFullscreen]);

  const handleToggleFullscreen = async () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    try {
      if (next && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else if (!next && document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  };

  if (!isMultiRoomOverviewOpen) return null;

  // Calculate high-level stats
  const totalArea = allRooms.reduce((acc, r) => acc + (r.gridWidth * r.gridHeight), 0);
  const totalDoors = allRooms.reduce((acc, r) => acc + getRoomDoors(r).length, 0);
  const connectedDoors = allRooms.reduce(
    (acc, r) => acc + getRoomDoors(r).filter((d) => Boolean(d.targetRoomId)).length,
    0
  );

  const filteredRooms = allRooms.filter((r) =>
    r.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const handleSelectRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setMultiRoomOverviewOpen(false);
  };

  // Blueprint Pan/Zoom Handlers (Mouse & Touch)
  const handlePointerDown = (clientX: number, clientY: number, target: EventTarget | null) => {
    if ((target as HTMLElement)?.closest('button, [data-interactive]')) return;
    setIsPanning(true);
    hasMovedRef.current = false;
    panStartRef.current = {
      x: clientX - panOffset.x,
      y: clientY - panOffset.y,
    };
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isPanning) return;
    hasMovedRef.current = true;
    setPanOffset({
      x: clientX - panStartRef.current.x,
      y: clientY - panStartRef.current.y,
    });
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => handlePointerDown(e.clientX, e.clientY, e.target);
  const handleMouseMove = (e: React.MouseEvent) => handlePointerMove(e.clientX, e.clientY);
  const handleMouseUp = () => handlePointerUp();

  // Multi-Touch Pinch-to-Zoom & Touch Pan
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
      setIsPanning(false);

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
    } else if (e.touches.length === 1 && e.touches[0] && isPanning) {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      // Transition from 2 fingers down to 1 finger pan
      handlePointerDown(e.touches[0].clientX, e.touches[0].clientY, e.target);
    } else if (e.touches.length === 0) {
      setIsPanning(false);
      touchState.current.initialDist = 0;
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
    const newZoom = Math.max(0.15, Math.min(3, zoom * zoomFactor));

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newPanX = mouseX - (mouseX - panOffset.x) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - panOffset.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPanOffset({ x: newPanX, y: newPanY });
  };

  const currentlyInspectedRoom = allRooms.find((r) => r.id === (inspectedRoomId || selectedRoomId));
  const inspectedNode = floorPlan.rooms.find((r) => r.room.id === currentlyInspectedRoom?.id);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-2 sm:p-5'} bg-slate-950/75 backdrop-blur-md select-none animate-in fade-in duration-150`}>
      <div className={`w-full ${isFullscreen ? 'h-full rounded-none' : 'max-w-6xl h-[88vh] rounded-3xl'} bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-xs">
              <Compass className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <span>Multi-Room Floor Plan & House Connections</span>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono font-bold">
                  {allRooms.length} {allRooms.length === 1 ? 'Room' : 'Rooms'}
                </span>
              </h3>
              <p className="text-xs text-slate-500 hidden sm:block">
                View your complete house blueprint layout, interconnected doorways, and room relationships
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle Switch */}
            <div className="flex items-center p-1 bg-slate-200/70 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode('blueprint')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'blueprint'
                    ? 'bg-white text-blue-700 shadow-xs ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Compass className="w-3.5 h-3.5 text-blue-600" />
                <span>Connected Blueprint</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-blue-700 shadow-xs ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5 text-slate-500" />
                <span>Room Cards</span>
              </button>
            </div>

            {/* Add Room */}
            <button
              onClick={() => {
                setMultiRoomOverviewOpen(false);
                setRoomManagerOpen(true);
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span className="hidden sm:inline">Add Room</span>
            </button>

            {/* Close */}
            <button
              onClick={() => setMultiRoomOverviewOpen(false)}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
              title="Close Overview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sleek Minimal Property Metrics Strip */}
        <div className="px-4 sm:px-6 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>{allRooms.length} Rooms</span>
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Scaling className="w-3.5 h-3.5 text-emerald-600" />
              <span>{totalArea} m² Total</span>
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <DoorOpen className="w-3.5 h-3.5 text-amber-600" />
              <span>{totalDoors} Doors ({connectedDoors} connected)</span>
            </span>
            <span className="text-slate-300">•</span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-700">
              <Box className="w-3.5 h-3.5 text-indigo-600" />
              <span>{allFurniture.length} Furniture • {allItems.length} Items</span>
            </span>
          </div>

          <div className="text-[11px] text-slate-400 font-medium hidden md:block">
            Drag to pan • Scroll to zoom • Click room to inspect
          </div>
        </div>

        {/* VIEW 1: CONNECTED BLUEPRINT (Full Room Connections Layout) */}
        {viewMode === 'blueprint' && (
          <div className="relative flex-1 w-full bg-slate-200/80 overflow-hidden flex flex-col">
            {/* Floating Blueprint Controls */}
            <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20 flex items-center gap-1.5 bg-white/95 text-slate-700 backdrop-blur-md px-2.5 py-1.5 rounded-2xl border border-slate-200 shadow-md">
              <button
                onClick={() => setZoom((z) => Math.min(3, z * 1.2))}
                className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-slate-600 hover:text-slate-900"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.15, z / 1.2))}
                className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-slate-600 hover:text-slate-900"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-slate-200" />
              <button
                onClick={fitEntireHouseToView}
                className="flex items-center gap-1 text-xs font-bold px-2 py-1 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer text-blue-600 hover:text-blue-700"
                title="Fit Entire House Layout to View"
              >
                <Focus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Fit House</span>
              </button>
              <div className="w-px h-4 bg-slate-200" />
              <button
                onClick={handleToggleFullscreen}
                className="flex items-center gap-1 text-xs font-bold px-2 py-1 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer text-slate-700 hover:text-blue-600"
                title={isFullscreen ? 'Exit Fullscreen Stage (Esc)' : 'Fullscreen CAD Stage'}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-blue-600" />
                    <span className="hidden sm:inline">Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Fullscreen</span>
                  </>
                )}
              </button>
              <span className="text-[10px] font-mono text-slate-500 px-1 font-bold">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {/* Blueprint Pan & Zoom Stage */}
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onWheel={handleWheel}
              style={{ touchAction: 'none' }}
              className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing overflow-hidden touch-none select-none"
            >
              {/* Transform Canvas */}
              <div
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                  transformOrigin: '0 0',
                }}
                className="absolute transition-transform duration-75 ease-out"
              >
                <svg
                  width={floorPlan.bounds.width * unitSize}
                  height={floorPlan.bounds.height * unitSize}
                  className="overflow-visible"
                >
                  <defs>
                    {/* Scandinavian Light Oak Parquet Pattern (matching main floor canvas) */}
                    <pattern
                      id="blueprint-parquet"
                      width={unitSize * 2}
                      height={unitSize * 2}
                      patternUnits="userSpaceOnUse"
                    >
                      <rect width={unitSize * 2} height={unitSize * 2} fill="#fbf8f3" />
                      <rect x="0" y="0" width={unitSize * 2} height={unitSize} fill="#f7f3eb" />
                      <line x1="0" y1={unitSize} x2={unitSize * 2} y2={unitSize} stroke="#ece4d8" strokeWidth="1" />
                      <line x1={unitSize} y1="0" x2={unitSize} y2={unitSize} stroke="#ece4d8" strokeWidth="1" />
                      <line x1="0" y1={unitSize * 2} x2={unitSize * 2} y2={unitSize * 2} stroke="#ece4d8" strokeWidth="1" />
                      <line x1={unitSize * 0.5} y1={unitSize} x2={unitSize * 0.5} y2={unitSize * 2} stroke="#ece4d8" strokeWidth="1" />
                      <line x1={unitSize * 1.5} y1={unitSize} x2={unitSize * 1.5} y2={unitSize * 2} stroke="#ece4d8" strokeWidth="1" />
                    </pattern>

                    {/* Subtle architectural grid guide */}
                    <pattern
                      id="cad-grid"
                      width={unitSize}
                      height={unitSize}
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d={`M ${unitSize} 0 L 0 0 0 ${unitSize}`}
                        fill="none"
                        stroke="#cbd5e1"
                        strokeWidth="0.5"
                        opacity="0.45"
                      />
                    </pattern>

                    {/* Ambient floor drop shadow */}
                    <filter id="blueprint-shadow" x="-5%" y="-5%" width="110%" height="110%">
                      <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.12" />
                    </filter>
                  </defs>

                  {/* Blueprint Background Grid */}
                  <rect
                    x="0"
                    y="0"
                    width={floorPlan.bounds.width * unitSize}
                    height={floorPlan.bounds.height * unitSize}
                    fill="url(#cad-grid)"
                  />

                  {/* 1. CORRIDOR CONNECTIONS LAYER (Joining connected doorways between rooms) */}
                  {floorPlan.corridors.map((c) => {
                    const p1x = c.p1.x * unitSize;
                    const p1y = c.p1.y * unitSize;
                    const p2x = c.p2.x * unitSize;
                    const p2y = c.p2.y * unitSize;
                    const midX = c.midpoint.x * unitSize;
                    const midY = c.midpoint.y * unitSize;
                    const corridorWidth = (c.doorWidth || 2) * unitSize;

                    return (
                      <g key={`corridor-${c.id}`} className="corridor-bridge">
                        {/* Shaded Connecting Walkway Corridor Wall Boundary */}
                        <line
                          x1={p1x}
                          y1={p1y}
                          x2={p2x}
                          y2={p2y}
                          stroke="#1e293b"
                          strokeWidth={corridorWidth}
                          strokeLinecap="butt"
                        />

                        {/* Corridor Pathway Floor */}
                        <line
                          x1={p1x}
                          y1={p1y}
                          x2={p2x}
                          y2={p2y}
                          stroke="#fbf8f3"
                          strokeWidth={corridorWidth - 4}
                          strokeLinecap="butt"
                        />

                        {/* Glowing Doorway Interconnection Guide Line */}
                        <line
                          x1={p1x}
                          y1={p1y}
                          x2={p2x}
                          y2={p2y}
                          stroke="#10b981"
                          strokeWidth="2.5"
                          strokeDasharray="4 4"
                          strokeOpacity="0.9"
                        />

                        {/* Threshold endpoints nodes */}
                        <circle cx={p1x} cy={p1y} r="3.5" fill="#10b981" />
                        <circle cx={p2x} cy={p2y} r="3.5" fill="#10b981" />

                        {/* Midpoint Doorway Badge */}
                        <g
                          transform={`translate(${midX}, ${midY})`}
                          className="cursor-pointer"
                        >
                          <rect
                            x="-46"
                            y="-10"
                            width="92"
                            height="20"
                            rx="10"
                            fill="#ffffff"
                            stroke="#10b981"
                            strokeWidth="1.5"
                            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.08))"
                          />
                          <text
                            x="0"
                            y="4"
                            textAnchor="middle"
                            fill="#047857"
                            fontSize="9"
                            fontFamily="ui-monospace, monospace"
                            fontWeight="bold"
                          >
                            🔗 Connected
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* 2. ARCHITECTURAL ROOMS LAYER */}
                  {floorPlan.rooms.map((node) => {
                    const r = node.room;
                    const isInspected = r.id === (inspectedRoomId || selectedRoomId);
                    const isActiveInApp = r.id === selectedRoomId;
                    const roomPxW = node.width * unitSize;
                    const roomPxH = node.height * unitSize;
                    const originX = node.x * unitSize;
                    const originY = node.y * unitSize;

                    // Custom polygon string or rectangle
                    const polyStr = node.polygonPoints && node.polygonPoints.length > 0
                      ? node.polygonPoints.map((p) => `${p.x * unitSize},${p.y * unitSize}`).join(' ')
                      : `0,0 ${roomPxW},0 ${roomPxW},${roomPxH} 0,${roomPxH}`;

                    return (
                      <g
                        key={`room-${r.id}`}
                        data-room-id={r.id}
                        data-room-name={r.name}
                        transform={`translate(${originX}, ${originY})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectedRoomId(r.id);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleSelectRoom(r.id);
                        }}
                        className="cursor-pointer group"
                      >
                        {/* Ambient Drop Shadow */}
                        <polygon
                          points={polyStr}
                          fill="#0f172a"
                          opacity="0.08"
                          transform="translate(4, 6)"
                        />

                        {/* Room Floor Surface */}
                        <polygon
                          points={polyStr}
                          fill="url(#blueprint-parquet)"
                          stroke={isInspected ? '#2563eb' : (isActiveInApp ? '#3b82f6' : '#cbd5e1')}
                          strokeWidth={isInspected ? '3' : '2'}
                          className="transition-colors group-hover:brightness-105"
                        />

                        {/* Exterior Architectural Perimeter Walls */}
                        <polygon
                          points={polyStr}
                          fill="none"
                          stroke={isInspected ? '#1d4ed8' : '#1e293b'}
                          strokeWidth="8"
                          strokeLinejoin="round"
                        />

                        {/* Active Selection Glow Ring */}
                        {isInspected && (
                          <polygon
                            points={polyStr}
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="2.5"
                            strokeDasharray="6 3"
                            className="animate-pulse"
                          />
                        )}

                        {/* Placed Furniture Pieces */}
                        {node.furniture.map((furn) => {
                          const fx = (furn.position?.x || 0) * unitSize;
                          const fy = (furn.position?.y || 0) * unitSize;
                          const fw = (furn.dimension?.width || 2) * unitSize;
                          const fl = (furn.dimension?.length || 2) * unitSize;
                          const rot = furn.position?.rotation || 0;
                          const cx = fx + fw / 2;
                          const cy = fy + fl / 2;

                          return (
                            <g
                              key={`furn-${furn.id}`}
                              transform={`rotate(${rot}, ${cx}, ${cy})`}
                              pointerEvents="none"
                            >
                              <rect
                                x={fx}
                                y={fy}
                                width={fw}
                                height={fl}
                                rx="3"
                                fill={furn.color || '#3b82f6'}
                                fillOpacity="0.85"
                                stroke="#ffffff"
                                strokeWidth="0.8"
                              />
                            </g>
                          );
                        })}

                        {/* Room Doors with cutouts & swing arcs */}
                        {node.doors.map(({ door, geo }) => {
                          // Scale geometry points to current unitSize (24px)
                          const scale = unitSize / 32;
                          const t1x = geo.thresholdLine.x1 * scale;
                          const t1y = geo.thresholdLine.y1 * scale;
                          const t2x = geo.thresholdLine.x2 * scale;
                          const t2y = geo.thresholdLine.y2 * scale;
                          const isLinked = Boolean(door.targetRoomId);

                          return (
                            <g key={`door-${door.id}`} className="blueprint-door">
                              {/* Wall Opening Cutout: clear wall stroke */}
                              <line
                                x1={t1x}
                                y1={t1y}
                                x2={t2x}
                                y2={t2y}
                                stroke="#fbf8f3"
                                strokeWidth="10"
                                strokeLinecap="square"
                              />

                              {/* Threshold Doorway Edge */}
                              <line
                                x1={t1x}
                                y1={t1y}
                                x2={t2x}
                                y2={t2y}
                                stroke={isLinked ? '#10b981' : '#94a3b8'}
                                strokeWidth="2"
                              />

                              {/* Swing Arc */}
                              <path
                                d={geo.arcD}
                                transform={`scale(${scale})`}
                                fill="none"
                                stroke={isLinked ? '#10b981' : '#64748b'}
                                strokeWidth="1.2"
                                strokeDasharray="2 2"
                                opacity="0.8"
                              />
                            </g>
                          );
                        })}

                        {/* Architectural Room Title & Tag */}
                        <g transform="translate(10, 14)" pointerEvents="none">
                          <rect
                            x="-4"
                            y="-11"
                            width={Math.max(80, r.name.length * 8 + 30)}
                            height="22"
                            rx="6"
                            fill="#ffffff"
                            fillOpacity="0.95"
                            stroke={isInspected ? '#2563eb' : '#cbd5e1'}
                            strokeWidth="1.2"
                            filter="drop-shadow(0 1px 3px rgba(0,0,0,0.08))"
                          />
                          <circle cx="5" cy="0" r="4" fill={r.color || '#3b82f6'} />
                          <text
                            x="15"
                            y="4"
                            fill="#0f172a"
                            fontSize="11"
                            fontFamily="ui-sans-serif, system-ui, sans-serif"
                            fontWeight="bold"
                          >
                            {r.name}
                          </text>
                        </g>

                        {/* Room Metrics Tag */}
                        <g transform="translate(10, 34)" pointerEvents="none">
                          <text
                            x="0"
                            y="0"
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="ui-monospace, monospace"
                            fontWeight="bold"
                          >
                            {node.width}m × {node.height}m • {node.width * node.height} m²
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Bottom Blueprint Action & Room Detail Inspector */}
            {inspectedNode && (
              <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 text-slate-800 flex items-center justify-between flex-wrap gap-3 z-30 shadow-xs">
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full shadow-xs ring-2 ring-white flex-shrink-0"
                    style={{ backgroundColor: inspectedNode.room.color || '#3b82f6' }}
                  />
                  <div>
                    <div className="font-black text-sm flex items-center gap-2 text-slate-900">
                      <span>{inspectedNode.room.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {inspectedNode.width}m × {inspectedNode.height}m ({inspectedNode.width * inspectedNode.height} m²)
                      </span>
                      {inspectedNode.room.id === selectedRoomId && (
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                          Currently Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                      <span>{inspectedNode.furniture.length} furniture pieces</span>
                      <span>•</span>
                      <span>{inspectedNode.doors.length} doorways</span>
                      {inspectedNode.doors.filter((d) => Boolean(d.door.targetRoomId)).length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                            <Link className="w-3 h-3" />
                            Connected to {inspectedNode.doors.filter((d) => Boolean(d.door.targetRoomId)).map((d) => {
                              const target = allRooms.find((r) => r.id === d.door.targetRoomId);
                              return target?.name;
                            }).filter(Boolean).join(', ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMultiRoomOverviewOpen(false);
                      setSelectedRoomId(inspectedNode.room.id);
                      setConnectRoomModalOpen(true, { roomId: inspectedNode.room.id, doorId: inspectedNode.doors[0]?.door.id || '' });
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Connect another room to this room's doorways"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Connect Door</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectRoom(inspectedNode.room.id)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer ring-2 ring-blue-400/50"
                  >
                    <span>Enter {inspectedNode.room.name}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: ROOM CARDS GRID */}
        {viewMode === 'grid' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
            {/* Filter bar */}
            <div className="px-4 sm:px-6 py-2.5 bg-white border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Search rooms..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-blue-500 shadow-2xs"
                />
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Showing {filteredRooms.length} of {allRooms.length} rooms
              </span>
            </div>

            {/* Grid */}
            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRooms.map((room) => {
                const isActive = room.id === selectedRoomId;
                const doors = getRoomDoors(room);
                const furnInRoom = allFurniture.filter((f) => f.roomId === room.id);
                const area = room.gridWidth * room.gridHeight;

                const polyStr = room.polygonPoints && room.polygonPoints.length > 0
                  ? room.polygonPoints.map((p) => `${p.x},${p.y}`).join(' ')
                  : `0,0 ${room.gridWidth},0 ${room.gridWidth},${room.gridHeight} 0,${room.gridHeight}`;

                const viewBox = `-1 -1 ${room.gridWidth + 2} ${room.gridHeight + 2}`;

                return (
                  <div
                    key={room.id}
                    onClick={() => handleSelectRoom(room.id)}
                    className={`group rounded-2xl border transition-all cursor-pointer overflow-hidden flex flex-col ${
                      isActive
                        ? 'bg-blue-50/40 border-blue-400 shadow-md ring-2 ring-blue-400/50'
                        : 'bg-white hover:bg-slate-50/80 border-slate-200 shadow-xs hover:shadow-md'
                    }`}
                  >
                    {/* Room Card Header */}
                    <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-white">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-xs ring-2 ring-white"
                          style={{ backgroundColor: room.color || '#3b82f6' }}
                        />
                        <div>
                          <div className="font-extrabold text-sm text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                            <span>{room.name}</span>
                            {isActive && (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded-md">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {room.gridWidth}m × {room.gridHeight}m • {area} m²
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectRoom(room.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors cursor-pointer"
                        title="Open this room canvas"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Mini Floor Plan Preview */}
                    <div className="h-32 bg-slate-100 relative flex items-center justify-center p-3 overflow-hidden border-b border-slate-100">
                      <svg
                        viewBox={viewBox}
                        className="w-full h-full max-h-28 transition-transform group-hover:scale-105 duration-200"
                        preserveAspectRatio="xMidYMid meet"
                      >
                        <polygon
                          points={polyStr}
                          fill="#fbf8f3"
                          stroke="#1e293b"
                          strokeWidth="1.2"
                        />

                        {furnInRoom.map((furn) => (
                          <rect
                            key={furn.id}
                            x={furn.position?.x || 0}
                            y={furn.position?.y || 0}
                            width={furn.dimension?.width || 2}
                            height={furn.dimension?.length || 2}
                            fill={furn.color || '#3b82f6'}
                            fillOpacity="0.85"
                            rx="0.2"
                          />
                        ))}
                      </svg>

                      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-white/95 text-slate-700 font-mono text-[10px] border border-slate-200 shadow-2xs">
                        {furnInRoom.length} {furnInRoom.length === 1 ? 'piece' : 'pieces'}
                      </div>
                    </div>

                    {/* Doorways & Interconnections */}
                    <div className="p-3 bg-slate-50/70 border-t border-slate-100 flex-1 flex flex-col justify-between gap-2">
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Doorways & Connections</span>
                          <span className="font-mono text-slate-500 font-bold">{doors.length}</span>
                        </div>

                        {doors.map((door) => {
                          const target = allRooms.find((r) => r.id === door.targetRoomId);
                          return (
                            <div
                              key={door.id}
                              className={`text-xs p-1.5 rounded-xl border flex items-center justify-between gap-1.5 ${
                                target
                                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900 font-bold'
                                  : 'bg-white border-slate-200 text-slate-600'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <DoorOpen className={`w-3.5 h-3.5 flex-shrink-0 ${target ? 'text-emerald-600' : 'text-slate-400'}`} />
                                <span className="truncate">{door.label || 'Door'}</span>
                              </div>

                              {target ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectRoom(target.id);
                                  }}
                                  className="text-[10px] font-extrabold text-emerald-700 bg-white hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-300 transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer"
                                  title={`Jump through door to ${target.name}`}
                                >
                                  <span>To {target.name}</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMultiRoomOverviewOpen(false);
                                    setSelectedRoomId(room.id);
                                    setConnectRoomModalOpen(true, { roomId: room.id, doorId: door.id || '' });
                                  }}
                                  className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer"
                                  title="Connect this door to another room"
                                >
                                  <Plus className="w-2.5 h-2.5 stroke-[3]" />
                                  <span>Connect</span>
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {doors.length === 0 && (
                          <div className="text-[11px] text-slate-400 italic py-1">
                            No doors configured yet.
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectRoom(room.id);
                        }}
                        className="w-full mt-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-1.5 shadow-2xs group-hover:border-blue-400 group-hover:text-blue-600 cursor-pointer"
                      >
                        <span>Enter {room.name}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
