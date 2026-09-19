import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { RoomShapeType, Point2D, WallSide, DoorSwing, RoomDoor } from '../types';
import { rotateRoom90Clockwise } from '../utils/roomGeometry';
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
  Maximize2
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

  // Local state for door editing
  const [doorWall, setDoorWall] = useState<WallSide>('bottom');
  const [doorOffset, setDoorOffset] = useState<number>(2);
  const [doorSwing, setDoorSwing] = useState<DoorSwing>('inward_left');
  const [doorWidth, setDoorWidth] = useState<number>(2);

  // Synchronize initial values when room loads
  React.useEffect(() => {
    if (room) {
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

      if (room.door) {
        setDoorWall(room.door.wall);
        setDoorOffset(room.door.offset);
        setDoorSwing(room.door.swing || 'inward_left');
        setDoorWidth(room.door.width || 2);
      }
    }
  }, [room, hasInitializedCustom]);

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

  // Save Door Configuration
  const handleSaveDoor = async () => {
    const newDoor: RoomDoor = {
      wall: doorWall,
      offset: Math.max(0, doorOffset),
      swing: doorSwing,
      width: doorWidth,
    };
    await db.rooms.update(room.id, {
      door: newDoor,
      updatedAt: Date.now(),
    });
    setRoomShapeModalOpen(false);
  };

  const maxDoorOffset = doorWall === 'top' || doorWall === 'bottom'
    ? Math.max(0, room.gridWidth - doorWidth)
    : Math.max(0, room.gridHeight - doorWidth);

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
            <span>Presets & Rotate</span>
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
            <span>Door & Entrance</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          
          {/* TAB 1: PRESETS & ROTATE */}
          {activeTab === 'presets' && (
            <div className="space-y-4">
              {/* Quick 90° Rotation Banner */}
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
                    <RotateCw className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-blue-950 uppercase tracking-wide">
                      Rotate Room 90°
                    </h4>
                    <p className="text-[11px] text-blue-700">
                      Rotates room walls, door, and interior furniture clockwise
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleRotateRoom90}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-xs transition-all active:scale-95 cursor-pointer flex-shrink-0"
                >
                  Rotate 90°
                </button>
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
            <div className="space-y-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Entrance Door Placement
                </span>
                <p className="text-[11px] text-slate-400">
                  Specify which wall the door is on, its offset position, and swing direction
                </p>
              </div>

              {/* Wall Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Select Wall
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['top', 'bottom', 'left', 'right'] as WallSide[]).map((wall) => (
                    <button
                      key={wall}
                      onClick={() => setDoorWall(wall)}
                      className={`py-2 px-3 rounded-xl text-xs font-black capitalize transition-all cursor-pointer ${
                        doorWall === wall
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {wall}
                    </button>
                  ))}
                </div>
              </div>

              {/* Offset along wall slider */}
              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-700">Position Along Wall</span>
                  <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                    {doorOffset}m from corner
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxDoorOffset}
                  value={doorOffset}
                  onChange={(e) => setDoorOffset(parseInt(e.target.value, 10) || 0)}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400 font-mono mt-1">
                  <span>0m</span>
                  <span>{maxDoorOffset}m</span>
                </div>
              </div>

              {/* Door Swing Direction */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Door Swing Arc
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'inward_left', label: 'Inward Left' },
                    { id: 'inward_right', label: 'Inward Right' },
                    { id: 'outward_left', label: 'Outward Left' },
                    { id: 'outward_right', label: 'Outward Right' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setDoorSwing(s.id as DoorSwing)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        doorSwing === s.id
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Door Width */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Door Opening Width
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDoorWidth(1)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                      doorWidth === 1 ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Narrow (1m)
                  </button>
                  <button
                    onClick={() => setDoorWidth(2)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                      doorWidth === 2 ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Standard (2m)
                  </button>
                  <button
                    onClick={() => setDoorWidth(3)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                      doorWidth === 3 ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Double Door (3m)
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveDoor}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                >
                  Save Door Position
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={handleRotateRoom90}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rotate Room 90°</span>
          </button>

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
