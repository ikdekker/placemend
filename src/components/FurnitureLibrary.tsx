import React, { useState } from 'react';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Furniture, FurnitureType } from '../types';
import { 
  X, 
  Plus, 
  Library, 
  Tv, 
  Monitor, 
  Boxes, 
  Wrench, 
  Layers, 
  Square,
  Sparkles
} from 'lucide-react';

interface FurnitureTemplate {
  name: string;
  type: FurnitureType;
  width: number;
  length: number;
  color: string;
  defaultContainers: string[];
}

const TEMPLATES: FurnitureTemplate[] = [
  {
    name: 'Desk / Workstation',
    type: 'desk',
    width: 6,
    length: 3,
    color: '#10b981', // emerald
    defaultContainers: ['Top Surface', 'Drawer 1', 'Drawer 2'],
  },
  {
    name: 'PAX Wardrobe / Closet',
    type: 'closet',
    width: 6,
    length: 2,
    color: '#8b5cf6', // purple
    defaultContainers: ['Top Shelf', 'Hanging Rail', 'Bottom Drawers', 'Shoe Tray'],
  },
  {
    name: 'KALLAX Shelving Unit (4x4)',
    type: 'bookshelf',
    width: 5,
    length: 2,
    color: '#6366f1', // indigo
    defaultContainers: ['Top Cubes', 'Middle Cubes', 'Bottom Storage Bins'],
  },
  {
    name: 'Industrial Metal Rack (5-Tier)',
    type: 'storage_rack',
    width: 6,
    length: 2,
    color: '#d97706', // amber
    defaultContainers: ['Tier 1 (Heavy Items)', 'Tier 2 (Toolboxes)', 'Tier 3 (Parts Bins)', 'Tier 4', 'Top Tier'],
  },
  {
    name: 'Workbench & Tool Station',
    type: 'workbench',
    width: 8,
    length: 3,
    color: '#ef4444', // red
    defaultContainers: ['Main Work Surface', 'Drawer 1 (Hand Tools)', 'Drawer 2 (Hardware)', 'Under-bench Shelf'],
  },
  {
    name: 'Media Console & TV Stand',
    type: 'cabinet',
    width: 7,
    length: 2,
    color: '#0284c7', // sky
    defaultContainers: ['Left Drawer', 'Middle Console', 'Right Drawer'],
  },
  {
    name: 'Storage Box Stack',
    type: 'box_stack',
    width: 3,
    length: 3,
    color: '#f97316', // orange
    defaultContainers: ['Top Box', 'Middle Box', 'Bottom Heavy Box'],
  },
  {
    name: 'Dresser (3-Drawer)',
    type: 'dresser',
    width: 4,
    length: 2,
    color: '#ec4899', // pink
    defaultContainers: ['Top Drawer', 'Middle Drawer', 'Bottom Drawer'],
  },
];

export const FurnitureLibrary: React.FC = () => {
  const {
    selectedRoomId,
    isFurnitureLibraryOpen,
    setFurnitureLibraryOpen,
    setSelectedFurnitureId,
    setAppMode,
  } = useAppStore();

  const [customName, setCustomName] = useState('');
  const [customWidth, setCustomWidth] = useState(4);
  const [customLength, setCustomLength] = useState(2);
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [customType, setCustomType] = useState<FurnitureType>('cabinet');

  if (!isFurnitureLibraryOpen) return null;

  const handleAddTemplate = async (tmpl: FurnitureTemplate) => {
    if (!selectedRoomId) {
      alert('Please select a room first');
      return;
    }

    const newFurnitureId = `furn-${Date.now()}`;
    const newFurniture: Furniture = {
      id: newFurnitureId,
      roomId: selectedRoomId,
      name: tmpl.name,
      type: tmpl.type,
      position: { x: 2, y: 2, rotation: 0 },
      dimension: { width: tmpl.width, length: tmpl.length },
      color: tmpl.color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const containers = tmpl.defaultContainers.map((name, idx) => ({
      id: `cont-${Date.now()}-${idx}`,
      furnitureId: newFurnitureId,
      name,
      type: 'shelf' as const,
      orderIndex: idx,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    await db.transaction('rw', [db.furniture, db.containers], async () => {
      await db.furniture.add(newFurniture);
      await db.containers.bulkAdd(containers);
    });

    setSelectedFurnitureId(newFurnitureId);
    setAppMode('edit');
    setFurnitureLibraryOpen(false);
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !customName.trim()) return;

    const newFurnitureId = `furn-${Date.now()}`;
    const newFurniture: Furniture = {
      id: newFurnitureId,
      roomId: selectedRoomId,
      name: customName.trim(),
      type: customType,
      position: { x: 2, y: 2, rotation: 0 },
      dimension: {
        width: Math.max(1, customWidth),
        length: Math.max(1, customLength),
      },
      color: customColor,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const defaultContainer = {
      id: `cont-${Date.now()}-0`,
      furnitureId: newFurnitureId,
      name: 'Main Storage Slot',
      type: 'shelf' as const,
      orderIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.transaction('rw', [db.furniture, db.containers], async () => {
      await db.furniture.add(newFurniture);
      await db.containers.add(defaultContainer);
    });

    setSelectedFurnitureId(newFurnitureId);
    setAppMode('edit');
    setFurnitureLibraryOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-xs">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Add Furniture or Storage Unit
              </h3>
              <p className="text-xs text-slate-500">
                Pick a pre-configured template or specify custom dimensions for your floor plan
              </p>
            </div>
          </div>
          <button
            onClick={() => setFurnitureLibraryOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 custom-scrollbar flex-1 bg-white">
          {/* Templates Grid */}
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              Quick Templates
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.name}
                  onClick={() => handleAddTemplate(tmpl)}
                  className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-400 cursor-pointer transition-all flex items-start gap-3 shadow-xs group"
                >
                  <div
                    style={{ backgroundColor: tmpl.color }}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs sm:text-sm font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                      {tmpl.name}
                    </h5>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {tmpl.width}m × {tmpl.length}m • {tmpl.defaultContainers.length} storage slots
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Furniture Creator */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              Custom Size Furniture
            </h4>
            <form onSubmit={handleAddCustom} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Custom Pine Credenza, Corner Shelf"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-white text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Width (meters)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={customWidth}
                    onChange={(e) => setCustomWidth(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-white text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 font-mono shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Length (meters)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={customLength}
                    onChange={(e) => setCustomLength(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-white text-slate-800 text-xs px-3 py-2.5 rounded-xl border border-slate-200 font-mono shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Color
                  </label>
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-full h-9 rounded-xl bg-white border border-slate-200 cursor-pointer p-0.5 shadow-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Place Custom Furniture</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
