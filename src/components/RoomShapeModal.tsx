import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { RoomShapeType, Point2D } from '../types';
import { X, Check, Pentagon, Square } from 'lucide-react';

interface ShapePreset {
  id: RoomShapeType;
  name: string;
  description: string;
  generatePoints: (w: number, h: number) => Point2D[];
}

export const SHAPE_PRESETS: ShapePreset[] = [
  {
    id: 'rectangle',
    name: 'Rectangular Room',
    description: 'Standard four-wall box layout',
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
    description: 'Room with an alcove or corner cutout',
    generatePoints: (w, h) => {
      const cutW = Math.round(w * 0.45);
      const cutH = Math.round(h * 0.45);
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
    description: 'Central main corridor with wider front or back wing',
    generatePoints: (w, h) => {
      const side = Math.round(w * 0.25);
      const topH = Math.round(h * 0.45);
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
];

export const RoomShapeModal: React.FC = () => {
  const {
    selectedRoomId,
    isRoomShapeModalOpen,
    setRoomShapeModalOpen,
  } = useAppStore();

  const room = useLiveQuery(async () => {
    if (!selectedRoomId) return undefined;
    return await db.rooms.get(selectedRoomId);
  }, [selectedRoomId]);

  if (!isRoomShapeModalOpen || !room) return null;

  const currentShape = room.shapeType || 'rectangle';

  const handleApplyShape = async (preset: ShapePreset) => {
    const points = preset.generatePoints(room.gridWidth, room.gridHeight);
    await db.rooms.update(room.id, {
      shapeType: preset.id,
      polygonPoints: points,
      updatedAt: Date.now(),
    });
    setRoomShapeModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-none">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Pentagon className="w-4 h-4 text-blue-600" />
              <span>Configure Room Shape</span>
            </h3>
            <p className="text-xs text-slate-500">
              Customize perimeter layout for "{room.name}"
            </p>
          </div>
          <button
            onClick={() => setRoomShapeModalOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {SHAPE_PRESETS.map((preset) => {
            const isSelected = currentShape === preset.id;
            return (
              <div
                key={preset.id}
                onClick={() => handleApplyShape(preset)}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {preset.id === 'rectangle' ? (
                      <Square className="w-5 h-5" />
                    ) : (
                      <Pentagon className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 leading-tight">
                      {preset.name}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
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
            );
          })}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={() => setRoomShapeModalOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
