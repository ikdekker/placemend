import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { 
  Search, 
  MapPin, 
  Layers, 
  Download, 
  Plus, 
  Maximize2, 
  HelpCircle,
  Home,
  SlidersHorizontal,
  FolderArchive
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    selectedLocationId,
    selectedRoomId,
    setSelectedLocationId,
    setSelectedRoomId,
    setSearchOpen,
    setRoomManagerOpen,
    setFurnitureLibraryOpen,
    setBackupModalOpen,
    resetView,
  } = useAppStore();

  const locations = useLiveQuery(() => db.locations.toArray()) || [];
  const rooms = useLiveQuery(() => 
    selectedLocationId 
      ? db.rooms.where('locationId').equals(selectedLocationId).toArray() 
      : db.rooms.toArray()
  , [selectedLocationId]) || [];

  const totalItems = useLiveQuery(() => db.items.count()) ?? 0;
  const totalFurniture = useLiveQuery(() => db.furniture.count()) ?? 0;

  // Global hotkey: '/' or Ctrl+K opens search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && (e.target as HTMLElement)?.tagName !== 'INPUT')) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSearchOpen]);

  const activeRoom = rooms.find((r) => r.id === selectedRoomId);

  return (
    <header className="w-full bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-2.5 flex items-center justify-between gap-3 shadow-md select-none z-20">
      {/* Left: Brand & Room Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 font-black text-lg tracking-tight text-white flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 text-white font-mono text-sm font-bold">
            ⌖
          </div>
          <span className="hidden sm:inline">Placemend</span>
        </div>

        {/* Room Breadcrumb & Selector */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/60 text-xs sm:text-sm">
          <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <select
            value={selectedRoomId || ''}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="bg-transparent text-slate-100 font-semibold focus:outline-none cursor-pointer pr-1 truncate max-w-[150px] sm:max-w-[200px]"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id} className="bg-slate-900 text-white">
                {room.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setRoomManagerOpen(true)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700/60 transition-colors ml-1"
            title="Manage Rooms & Spaces"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Metrics Badge */}
        <div className="hidden md:flex items-center gap-2 text-xs font-mono text-slate-400 pl-2">
          <span>{totalItems} items indexed</span>
          <span>•</span>
          <span>{totalFurniture} furniture</span>
        </div>
      </div>

      {/* Center: Quick Search Trigger Button */}
      <div className="flex-1 max-w-md mx-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full bg-slate-950/70 hover:bg-slate-950 border border-slate-700/80 hover:border-blue-500/60 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl flex items-center justify-between text-xs sm:text-sm transition-all shadow-inner group cursor-pointer"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
            <span className="truncate">Search items, tools, cables, documents...</span>
          </div>
          <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">
            <span>Ctrl</span>
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Right: Actions (Add Furniture, Backup, Reset View) */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => setFurnitureLibraryOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          title="Add furniture, shelf, or storage unit to floor plan"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span className="hidden sm:inline">Add Furniture</span>
        </button>

        <button
          onClick={() => resetView()}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-700"
          title="Recenter Floor Plan View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => setBackupModalOpen(true)}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-700"
          title="Backup & Export JSON Data"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
