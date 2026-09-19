import React, { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { 
  Search, 
  MapPin, 
  Download, 
  Plus, 
  Maximize2, 
  SlidersHorizontal,
  Eye,
  Edit3,
  Pentagon
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    appMode,
    setAppMode,
    selectedLocationId,
    selectedRoomId,
    setSelectedRoomId,
    setSearchOpen,
    setRoomManagerOpen,
    setRoomShapeModalOpen,
    setFurnitureLibraryOpen,
    setBackupModalOpen,
    resetView,
  } = useAppStore();

  const rooms = useLiveQuery(async () => {
    if (selectedLocationId) {
      return await db.rooms.where('locationId').equals(selectedLocationId).toArray();
    }
    return await db.rooms.toArray();
  }, [selectedLocationId]) || [];

  const totalItems = useLiveQuery(async () => await db.items.count()) ?? 0;
  const totalFurniture = useLiveQuery(async () => await db.furniture.count()) ?? 0;

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

  return (
    <header className="w-full bg-white border-b border-slate-200 text-slate-800 px-4 py-2.5 flex items-center justify-between gap-3 shadow-xs select-none z-20">
      {/* Left: Brand & Room Switcher */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 font-black text-lg tracking-tight text-slate-900 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white font-mono text-sm font-bold">
            ⌖
          </div>
          <span className="hidden sm:inline font-bold">Placemend</span>
        </div>

        {/* Room Breadcrumb & Selector */}
        <div className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-150 px-2.5 py-1 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium transition-colors">
          <MapPin className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          <select
            value={selectedRoomId || ''}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer pr-1 truncate max-w-[140px] sm:max-w-[190px]"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id} className="bg-white text-slate-800 font-semibold">
                {room.name}
              </option>
            ))}
          </select>

          <button
            onClick={() => setRoomManagerOpen(true)}
            className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition-colors ml-0.5 cursor-pointer"
            title="Manage Rooms & Spaces"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Room Shape Button (Configure room walls) */}
        {appMode === 'edit' && (
          <button
            onClick={() => setRoomShapeModalOpen(true)}
            className="hidden md:flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-all cursor-pointer"
            title="Configure Room Shape (L-Shape, T-Shape, Box)"
          >
            <Pentagon className="w-3.5 h-3.5 text-indigo-600" />
            <span>Room Shape</span>
          </button>
        )}

        {/* Metrics Badge */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-slate-500 pl-1">
          <span>{totalItems} items</span>
          <span>•</span>
          <span>{totalFurniture} furniture</span>
        </div>
      </div>

      {/* Center: Search Trigger Button */}
      <div className="flex-1 max-w-md mx-2">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full bg-slate-50 hover:bg-white border border-slate-200 hover:border-blue-400 text-slate-500 hover:text-slate-800 px-3.5 py-1.5 rounded-xl flex items-center justify-between text-xs sm:text-sm transition-all shadow-xs group cursor-pointer"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
            <span className="truncate font-normal">Search tools, cables, documents, tags...</span>
          </div>
          <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] text-slate-400 bg-slate-200/70 px-1.5 py-0.5 rounded border border-slate-300/60 font-semibold">
            <span>Ctrl</span>
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Right: Mode Switcher (View vs Edit) & Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Toggle Mode: View vs Edit */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setAppMode('view')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              appMode === 'view'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="View & Search Mode (Clean, no accidental movement)"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">View</span>
          </button>

          <button
            onClick={() => setAppMode('edit')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              appMode === 'edit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Edit Mode (Move, resize, and add furniture)"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Edit</span>
          </button>
        </div>

        {/* Add Furniture (Only in Edit Mode or prominent) */}
        {appMode === 'edit' && (
          <button
            onClick={() => setFurnitureLibraryOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer animate-in fade-in"
            title="Add furniture or storage unit"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Add</span>
          </button>
        )}

        <button
          onClick={() => resetView()}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200"
          title="Recenter Floor Plan View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        <button
          onClick={() => setBackupModalOpen(true)}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200"
          title="Backup & Export JSON Data"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
