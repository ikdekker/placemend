import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { RoomShapeType, Point2D, WallSide, DoorSwing, RoomDoor } from '../types';
import { rotateRoom90Clockwise, mirrorRoom, getRoomDoors } from '../utils/roomGeometry';
import { 
  X, 
  Check, 
  Pentagon, 
  Square, 
  RotateCw, 
  DoorOpen, 
  Sliders, 
  Plus, 
  Trash2, 
  Layers,
  Sparkles,
  ArrowRight,
  Maximize2,
  FlipHorizontal,
  FlipVertical
} from 'lucide-react';

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
      const cutW = Math.round(w * 0.4);
      const cutH = Math.round(h * 0.4);
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
      const side = Math.round(w * 0.25);
      const topH = Math.round(h * 0.45);
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
        const sideH = Math.round(h * 0.25);
        const leftW = Math.round(w * 0.45);
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
        const sideH = Math.round(h * 0.25);
        const rightW = Math.round(w * 0.45);
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
      const side = Math.round(w * 0.28);
      const cutH = Math.round(h * 0.5);
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
      const nookW = Math.round(w * 0.35);
      const nookH = Math.round(h * 0.3);
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
      const cut = Math.round(Math.min(w, h) * 0.35);
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

export const RoomShapeModal: React.FC = () => {
  const {
    selectedRoomId,
    isRoomShapeModalOpen,
    setRoomShapeModalOpen,
    roomShapeModalTab,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'presets' | 'custom' | 'door'>('presets');
  const [selectedVariation, setSelectedVariation] = useState<string>('br');

  React.useEffect(() => {
    if (isRoomShapeModalOpen && roomShapeModalTab) {
      setActiveTab(roomShapeModalTab);
    }
  }, [isRoomShapeModalOpen, roomShapeModalTab]);

  const room = useLiveQuery(async () => {
    if (!selectedRoomId) return undefined;
    return await db.rooms.get(selectedRoomId);
  }, [selectedRoomId]);

  // Local state for custom polygon editing
  const [customPoints, setCustomPoints] = useState<Point2D[]>([]);
  const [hasInitializedCustom, setHasInitializedCustom] = useState(false);

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
        } else {
          setCustomPoints([
            { x: 0, y: 0 },
            { x: room.gridWidth, y: 0 },
            { x: room.gridWidth, y: room.gridHeight },
            { x: 0, y: room.gridHeight },
          ]);
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

  if (!isRoomShapeModalOpen || !room) return null;

  const currentShape = room.shapeType || 'rectangle';

  // Apply a preset shape
  const handleApplyShape = async (preset: ShapePreset, variation?: string) => {
    const points = preset.generatePoints(room.gridWidth, room.gridHeight, variation || selectedVariation);
    await db.rooms.update(room.id, {
      shapeType: preset.id,
      polygonPoints: preset.id === 'rectangle' ? undefined : points,
      updatedAt: Date.now(),
    });
    setCustomPoints(points);
    setRoomShapeModalOpen(false);
  };

  // 90° Clockwise Room Rotation
  const handleRotateRoom90 = async () => {
    await rotateRoom90Clockwise(room.id);
    const updated = await db.rooms.get(room.id);
    if (updated?.polygonPoints) {
      setCustomPoints(updated.polygonPoints);
    }
  };

  // Mirror Room (Horizontal / Vertical)
  const handleMirrorRoom = async (axis: 'horizontal' | 'vertical') => {
    await mirrorRoom(room.id, axis);
    const updated = await db.rooms.get(room.id);
    if (updated?.polygonPoints) {
      setCustomPoints(updated.polygonPoints);
    }
  };

  // Custom Shape Point Management
  const handleAddCustomPoint = () => {
    if (customPoints.length === 0) return;
    const last = customPoints[customPoints.length - 1];
    const first = customPoints[0];
    const newPt: Point2D = {
      x: Math.round((last.x + first.x) / 2),
      y: Math.round((last.y + first.y) / 2),
    };
    setCustomPoints([...customPoints, newPt]);
  };

  const handleUpdateCustomPoint = (index: number, field: 'x' | 'y', val: number) => {
    const next = [...customPoints];
    const maxVal = field === 'x' ? room.gridWidth : room.gridHeight;
    next[index] = {
      ...next[index],
      [field]: Math.max(0, Math.min(maxVal, val)),
    };
    setCustomPoints(next);
  };

  const handleDeleteCustomPoint = (index: number) => {
    if (customPoints.length <= 3) {
      alert('A room polygon must have at least 3 corner points.');
      return;
    }
    setCustomPoints(customPoints.filter((_, i) => i !== index));
  };

  const handleSaveCustomShape = async () => {
    if (customPoints.length < 3) return;
    await db.rooms.update(room.id, {
      shapeType: 'custom_polygon',
      polygonPoints: customPoints,
      updatedAt: Date.now(),
    });
    setRoomShapeModalOpen(false);
  };

  // Active selected door helper
  const selectedDoor = doorsList.find((d) => d.id === activeDoorId) || doorsList[0] || null;

  const updateSelectedDoor = (patch: Partial<RoomDoor>) => {
    if (!selectedDoor) return;
    setDoorsList((prev) =>
      prev.map((d) => (d.id === selectedDoor.id ? { ...d, ...patch } : d))
    );
  };

  const handleAddDoor = () => {
    const newId = `door-${Date.now()}`;
    const newIndex = doorsList.length + 1;
    const defaultWalls: WallSide[] = ['bottom', 'top', 'left', 'right'];
    const chosenWall = defaultWalls[(newIndex - 1) % 4];
    const newDoor: RoomDoor = {
      id: newId,
      label: `Door ${newIndex}`,
      wall: chosenWall,
      offset: 2,
      swing: 'inward_left',
      width: 2,
    };
    setDoorsList((prev) => [...prev, newDoor]);
    setActiveDoorId(newId);
  };

  const handleDeleteDoor = (doorId: string) => {
    const remaining = doorsList.filter((d) => d.id !== doorId);
    setDoorsList(remaining);
    if (activeDoorId === doorId) {
      setActiveDoorId(remaining.length > 0 ? (remaining[0].id || '') : '');
    }
  };

  // Save Door Configuration
  const handleSaveDoor = async () => {
    await db.rooms.update(room.id, {
      doors: doorsList,
      door: doorsList[0] || undefined,
      updatedAt: Date.now(),
    });
    setRoomShapeModalOpen(false);
  };

  const maxDoorOffset = selectedDoor
    ? (selectedDoor.wall === 'top' || selectedDoor.wall === 'bottom'
        ? Math.max(0, room.gridWidth - (selectedDoor.width || 2))
        : Math.max(0, room.gridHeight - (selectedDoor.width || 2)))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Pentagon className="w-4 h-4 text-blue-600" />
              <span>Room Architecture & Shape</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              "{room.name}" • {room.gridWidth}m × {room.gridHeight}m
            </p>
          </div>
          <button
            onClick={() => setRoomShapeModalOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 p-1 gap-1 text-xs font-bold">
          <button
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'presets' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Pentagon className="w-3.5 h-3.5" />
            <span>Presets & Transforms</span>
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`flex-1 py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'custom' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Custom Shape</span>
          </button>
          <button
            onClick={() => setActiveTab('door')}
            className={`flex-1 py-2 px-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'door' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            <span>Doors ({doorsList.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          
          {/* TAB 1: PRESETS & TRANSFORMS */}
          {activeTab === 'presets' && (
            <div className="space-y-4">
              {/* Room Transforms: Rotate & Mirror */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 flex flex-col gap-2.5">
                <div>
                  <h4 className="text-xs font-black text-blue-950 uppercase tracking-wide">
                    Room Transforms (Rotate & Mirror)
                  </h4>
                  <p className="text-[11px] text-blue-700">
                    Transform room layout, walls, door, and all interior furniture
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={handleRotateRoom90}
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 font-bold text-xs shadow-xs border border-blue-200 transition-all active:scale-95 cursor-pointer"
                    title="Rotate clockwise 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-blue-600" />
                    <span>Rotate 90°</span>
                  </button>
                  <button
                    onClick={() => handleMirrorRoom('horizontal')}
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 font-bold text-xs shadow-xs border border-blue-200 transition-all active:scale-95 cursor-pointer"
                    title="Mirror horizontally (Flip Left ↔ Right)"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5 text-blue-600" />
                    <span>Flip Horiz ↔</span>
                  </button>
                  <button
                    onClick={() => handleMirrorRoom('vertical')}
                    className="flex items-center justify-center gap-1 py-2 px-1.5 rounded-xl bg-white hover:bg-blue-50 text-blue-700 font-bold text-xs shadow-xs border border-blue-200 transition-all active:scale-95 cursor-pointer"
                    title="Mirror vertically (Flip Top ↕ Bottom)"
                  >
                    <FlipVertical className="w-3.5 h-3.5 text-blue-600" />
                    <span>Flip Vert ↕</span>
                  </button>
                </div>
              </div>

              {/* Preset Shapes List */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Select Architectural Room Layout
                </span>

                {SHAPE_PRESETS.map((preset) => {
                  const isSelected = currentShape === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col gap-2.5 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/40 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div 
                        onClick={() => handleApplyShape(preset)}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {preset.id === 'rectangle' ? (
                              <Square className="w-5 h-5" />
                            ) : (
                              <Pentagon className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900">
                              {preset.name}
                            </h4>
                            <p className="text-xs text-slate-500">
                              {preset.description}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          </div>
                        )}
                      </div>

                      {/* Shape Variations (e.g. 4 corner rotations for L and T shapes) */}
                      {preset.variations && (
                        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-200/60">
                          <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">
                            Orientation:
                          </span>
                          {preset.variations.map((v) => (
                            <button
                              key={v.id}
                              onClick={() => {
                                setSelectedVariation(v.id);
                                handleApplyShape(preset, v.id);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                selectedVariation === v.id
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              {v.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOM SHAPE BUILDER */}
          {activeTab === 'custom' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Custom Polygon Wall Vertices ({customPoints.length})
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Define custom room corners in grid units (0 to {room.gridWidth}W, 0 to {room.gridHeight}H)
                  </p>
                </div>
                <button
                  onClick={handleAddCustomPoint}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Corner</span>
                </button>
              </div>

              {/* Interactive Mini Polygon Preview */}
              <div className="w-full h-44 bg-slate-900 rounded-2xl border border-slate-800 relative flex items-center justify-center overflow-hidden p-2">
                <svg
                  className="w-full h-full"
                  viewBox={`-2 -2 ${room.gridWidth + 4} ${room.gridHeight + 4}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  {/* Grid Boundary Frame */}
                  <rect
                    x="0"
                    y="0"
                    width={room.gridWidth}
                    height={room.gridHeight}
                    fill="none"
                    stroke="#334155"
                    strokeWidth="0.5"
                    strokeDasharray="1 1"
                  />
                  {/* Active Custom Polygon */}
                  {customPoints.length >= 3 && (
                    <polygon
                      points={customPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="#3b82f6"
                      fillOpacity="0.25"
                      stroke="#60a5fa"
                      strokeWidth="1"
                    />
                  )}
                  {/* Corner Vertex Dots */}
                  {customPoints.map((p, idx) => (
                    <g key={idx}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="0.9"
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth="0.4"
                      />
                      <text
                        x={p.x + 1}
                        y={p.y - 0.8}
                        fill="#93c5fd"
                        fontSize="1.6"
                        fontWeight="bold"
                      >
                        {idx + 1}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>

              {/* Corner Points Table / Inputs */}
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {customPoints.map((p, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                      <span>Corner #{idx + 1}</span>
                    </div>

                    <div className="flex items-center gap-2 font-mono font-bold">
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200">
                        <span className="text-slate-400 text-[10px]">X:</span>
                        <input
                          type="number"
                          min={0}
                          max={room.gridWidth}
                          value={p.x}
                          onChange={(e) => handleUpdateCustomPoint(idx, 'x', parseInt(e.target.value, 10) || 0)}
                          className="w-10 text-center font-bold text-slate-800 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200">
                        <span className="text-slate-400 text-[10px]">Y:</span>
                        <input
                          type="number"
                          min={0}
                          max={room.gridHeight}
                          value={p.y}
                          onChange={(e) => handleUpdateCustomPoint(idx, 'y', parseInt(e.target.value, 10) || 0)}
                          className="w-10 text-center font-bold text-slate-800 focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={() => handleDeleteCustomPoint(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remove corner point"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveCustomShape}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Save Custom Shape
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DOOR & ENTRANCE */}
          {activeTab === 'door' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Header description */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Room Doors & Entrances
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Add, position, or configure multiple entrance or connecting doors
                  </p>
                </div>
                <button
                  onClick={handleAddDoor}
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

              {selectedDoor && (
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

                    <svg viewBox="0 0 280 130" className="w-full max-w-[280px] h-[130px] select-none">
                      {/* Background grid */}
                      <defs>
                        <pattern id="modal-subtle-grid" width="14" height="14" patternUnits="userSpaceOnUse">
                          <path d="M 14 0 L 0 0 0 14" fill="none" stroke="#334155" strokeWidth="0.5" opacity="0.4" />
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#modal-subtle-grid)" rx="8" />

                      {/* Room base floor */}
                      <rect x="40" y="25" width="200" height="80" fill="#1e293b" rx="6" />

                      {/* Wall Lines with Labels */}
                      {/* Top Wall */}
                      <line 
                        x1="40" y1="25" x2="240" y2="25" 
                        stroke={selectedDoor.wall === 'top' ? '#3b82f6' : '#475569'} 
                        strokeWidth={selectedDoor.wall === 'top' ? '5' : '3'} 
                      />
                      <text x="140" y="18" fill={selectedDoor.wall === 'top' ? '#60a5fa' : '#64748b'} fontSize="9" fontWeight="bold" textAnchor="middle">
                        TOP ({room.gridWidth}m)
                      </text>

                      {/* Bottom Wall */}
                      <line 
                        x1="40" y1="105" x2="240" y2="105" 
                        stroke={selectedDoor.wall === 'bottom' ? '#3b82f6' : '#475569'} 
                        strokeWidth={selectedDoor.wall === 'bottom' ? '5' : '3'} 
                      />
                      <text x="140" y="122" fill={selectedDoor.wall === 'bottom' ? '#60a5fa' : '#64748b'} fontSize="9" fontWeight="bold" textAnchor="middle">
                        BOTTOM ({room.gridWidth}m)
                      </text>

                      {/* Left Wall */}
                      <line 
                        x1="40" y1="25" x2="40" y2="105" 
                        stroke={selectedDoor.wall === 'left' ? '#3b82f6' : '#475569'} 
                        strokeWidth={selectedDoor.wall === 'left' ? '5' : '3'} 
                      />
                      <text x="18" y="68" fill={selectedDoor.wall === 'left' ? '#60a5fa' : '#64748b'} fontSize="9" fontWeight="bold" textAnchor="middle" transform="rotate(-90, 18, 68)">
                        LEFT ({room.gridHeight}m)
                      </text>

                      {/* Right Wall */}
                      <line 
                        x1="240" y1="25" x2="240" y2="105" 
                        stroke={selectedDoor.wall === 'right' ? '#3b82f6' : '#475569'} 
                        strokeWidth={selectedDoor.wall === 'right' ? '5' : '3'} 
                      />
                      <text x="262" y="68" fill={selectedDoor.wall === 'right' ? '#60a5fa' : '#64748b'} fontSize="9" fontWeight="bold" textAnchor="middle" transform="rotate(90, 262, 68)">
                        RIGHT ({room.gridHeight}m)
                      </text>

                      {/* Render All Doors in Blueprint */}
                      {doorsList.map((d, idx) => {
                        const isSelected = d.id === selectedDoor.id;
                        const wallLen = d.wall === 'top' || d.wall === 'bottom' ? room.gridWidth : room.gridHeight;
                        const fracOffset = wallLen > 0 ? d.offset / wallLen : 0;
                        const fracWidth = wallLen > 0 ? (d.width || 2) / wallLen : 0.15;
                        const swing = d.swing || 'inward_left';
                        const isLeftHinge = swing.includes('left');
                        const isInward = swing.includes('inward');
                        const strokeColor = isSelected ? '#f59e0b' : '#38bdf8';
                        const leafColor = isSelected ? '#fbbf24' : '#7dd3fc';

                        if (d.wall === 'bottom') {
                          const dx1 = 40 + fracOffset * 200;
                          const dx2 = Math.min(240, dx1 + fracWidth * 200);
                          const dw = dx2 - dx1;
                          const hx = isLeftHinge ? dx1 : dx2;
                          const hy = 105;
                          const ly = isInward ? hy - dw : hy + dw;
                          return (
                            <g key={d.id || idx} onClick={() => setActiveDoorId(d.id || '')} className="cursor-pointer">
                              <line x1={dx1} y1="105" x2={dx2} y2="105" stroke={strokeColor} strokeWidth={isSelected ? 6 : 4} />
                              <line x1={hx} y1={hy} x2={hx} y2={ly} stroke={leafColor} strokeWidth="2.5" />
                              <circle cx={hx} cy={hy} r={isSelected ? 3.5 : 2.5} fill={strokeColor} />
                            </g>
                          );
                        } else if (d.wall === 'top') {
                          const dx1 = 40 + fracOffset * 200;
                          const dx2 = Math.min(240, dx1 + fracWidth * 200);
                          const dw = dx2 - dx1;
                          const hx = isLeftHinge ? dx1 : dx2;
                          const hy = 25;
                          const ly = isInward ? hy + dw : hy - dw;
                          return (
                            <g key={d.id || idx} onClick={() => setActiveDoorId(d.id || '')} className="cursor-pointer">
                              <line x1={dx1} y1="25" x2={dx2} y2="25" stroke={strokeColor} strokeWidth={isSelected ? 6 : 4} />
                              <line x1={hx} y1={hy} x2={hx} y2={ly} stroke={leafColor} strokeWidth="2.5" />
                              <circle cx={hx} cy={hy} r={isSelected ? 3.5 : 2.5} fill={strokeColor} />
                            </g>
                          );
                        } else if (d.wall === 'left') {
                          const dy1 = 25 + fracOffset * 80;
                          const dy2 = Math.min(105, dy1 + fracWidth * 80);
                          const dw = dy2 - dy1;
                          const hy = isLeftHinge ? dy1 : dy2;
                          const hx = 40;
                          const lx = isInward ? hx + dw : hx - dw;
                          return (
                            <g key={d.id || idx} onClick={() => setActiveDoorId(d.id || '')} className="cursor-pointer">
                              <line x1="40" y1={dy1} x2="40" y2={dy2} stroke={strokeColor} strokeWidth={isSelected ? 6 : 4} />
                              <line x1={hx} y1={hy} x2={lx} y2={hy} stroke={leafColor} strokeWidth="2.5" />
                              <circle cx={hx} cy={hy} r={isSelected ? 3.5 : 2.5} fill={strokeColor} />
                            </g>
                          );
                        } else {
                          // right
                          const dy1 = 25 + fracOffset * 80;
                          const dy2 = Math.min(105, dy1 + fracWidth * 80);
                          const dw = dy2 - dy1;
                          const hy = isLeftHinge ? dy1 : dy2;
                          const hx = 240;
                          const lx = isInward ? hx - dw : hx + dw;
                          return (
                            <g key={d.id || idx} onClick={() => setActiveDoorId(d.id || '')} className="cursor-pointer">
                              <line x1="240" y1={dy1} x2="240" y2={dy2} stroke={strokeColor} strokeWidth={isSelected ? 6 : 4} />
                              <line x1={hx} y1={hy} x2={lx} y2={hy} stroke={leafColor} strokeWidth="2.5" />
                              <circle cx={hx} cy={hy} r={isSelected ? 3.5 : 2.5} fill={strokeColor} />
                            </g>
                          );
                        }
                      })}
                    </svg>
                  </div>

                  {/* 1. Door Width / Opening Size */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-700">1. Door Opening Width</span>
                      <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                        {selectedDoor.width || 2}m width
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { w: 1, title: 'Single Door', sub: '1m / 3.3ft' },
                        { w: 2, title: 'Wide Entry', sub: '2m / 6.6ft' },
                        { w: 3, title: 'Double Doors', sub: '3m / 10ft' },
                      ].map((item) => (
                        <button
                          key={item.w}
                          onClick={() => {
                            const wallLen = selectedDoor.wall === 'top' || selectedDoor.wall === 'bottom' ? room.gridWidth : room.gridHeight;
                            const newOffset = selectedDoor.offset + item.w > wallLen ? Math.max(0, wallLen - item.w) : selectedDoor.offset;
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
                  </div>

                  {/* 2. Wall Selection */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      2. Select Wall
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'top' as WallSide, label: '⬆ Top Wall', len: room.gridWidth },
                        { id: 'bottom' as WallSide, label: '⬇ Bottom Wall', len: room.gridWidth },
                        { id: 'left' as WallSide, label: '⬅ Left Wall', len: room.gridHeight },
                        { id: 'right' as WallSide, label: '➡ Right Wall', len: room.gridHeight },
                      ].map((w) => (
                        <button
                          key={w.id}
                          onClick={() => {
                            const curWidth = selectedDoor.width || 2;
                            const newOffset = selectedDoor.offset + curWidth > w.len ? Math.max(0, w.len - curWidth) : selectedDoor.offset;
                            updateSelectedDoor({ wall: w.id, offset: newOffset });
                          }}
                          className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            selectedDoor.wall === w.id
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          <div>{w.label}</div>
                          <div className={`text-[10px] font-normal ${selectedDoor.wall === w.id ? 'text-blue-100' : 'text-slate-400'}`}>
                            {w.len}m long
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Position Along Wall */}
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-700">3. Distance from Wall Corner</span>
                      <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                        {selectedDoor.offset}m from corner
                      </span>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex gap-1.5 mb-2">
                      <button
                        onClick={() => updateSelectedDoor({ offset: Math.min(1, maxDoorOffset) })}
                        className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 cursor-pointer"
                      >
                        Start (1m)
                      </button>
                      <button
                        onClick={() => updateSelectedDoor({ offset: Math.round(maxDoorOffset / 2) })}
                        className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 cursor-pointer"
                      >
                        Centered ({Math.round(maxDoorOffset / 2)}m)
                      </button>
                      <button
                        onClick={() => updateSelectedDoor({ offset: Math.max(0, maxDoorOffset - 1) })}
                        className="flex-1 py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-600 cursor-pointer"
                      >
                        End ({Math.max(0, maxDoorOffset - 1)}m)
                      </button>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={maxDoorOffset}
                      value={selectedDoor.offset}
                      onChange={(e) => updateSelectedDoor({ offset: parseInt(e.target.value, 10) || 0 })}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono mt-1">
                      <span>0m (corner)</span>
                      <span className="text-slate-500 font-medium">
                        Spans {selectedDoor.offset}m to {selectedDoor.offset + (selectedDoor.width || 2)}m
                      </span>
                      <span>{maxDoorOffset}m</span>
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
              )}

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveDoor}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Doors ({doorsList.length})</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRotateRoom90}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
              title="Rotate 90°"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rotate 90°</span>
            </button>
            <button
              onClick={() => handleMirrorRoom('horizontal')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
              title="Mirror Horizontally (Flip Left ↔ Right)"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span>Flip ↔</span>
            </button>
            <button
              onClick={() => handleMirrorRoom('vertical')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
              title="Mirror Vertically (Flip Top ↕ Bottom)"
            >
              <FlipVertical className="w-3.5 h-3.5" />
              <span>Flip ↕</span>
            </button>
          </div>

          <button
            onClick={() => setRoomShapeModalOpen(false)}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
