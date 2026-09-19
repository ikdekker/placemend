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
    setFurnitureLibraryOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>Add Furniture or Storage Unit</span>
            </h3>
            <p className="text-xs text-slate-400">
              Pick a pre-configured template or configure custom dimensions for your floor plan
            </p>
          </div>
          <button
            onClick={() => setFurnitureLibraryOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-5 custom-scrollbar flex-1">
          {/* Templates Grid */}
          <div>
            <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Quick Templates
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATES.map((tmpl) => (
                <div
                  key={tmpl.name}
                  onClick={() => handleAddTemplate(tmpl)}
                  className="p-3 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 hover:border-blue-500/60 cursor-pointer transition-all flex items-start gap-3 shadow-sm group"
                >
                  <div
                    style={{ backgroundColor: tmpl.color }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 shadow-md group-hover:scale-105 transition-transform"
                  >
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-blue-200">
                      {tmpl.name}
                    </h5>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {tmpl.width}×{tmpl.length} grid units • {tmpl.defaultContainers.length} slots
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Furniture Creator */}
          <div className="pt-3 border-t border-slate-800">
            <h4 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
              Custom Size Furniture
            </h4>
            <form onSubmit={handleAddCustom} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/60 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Custom Pine Credenza, Corner Shelf"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Width (units)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={customWidth}
                    onChange={(e) => setCustomWidth(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Length (units)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={customLength}
                    onChange={(e) => setCustomLength(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Color
                  </label>
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-full h-8 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer p-0.5"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded-lg shadow transition-colors cursor-pointer"
              >
                Place Custom Furniture
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
