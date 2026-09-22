import React, { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { 
  Search, 
  MapPin, 
  Download, 
  Plus, 
  Maximize2, 
  Eye, 
  Edit3, 
  Pentagon,
  X,
  Zap,
  Sparkles,
  SlidersHorizontal,
  Ruler
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    appMode,
    setAppMode,
    selectedLocationId,
    selectedRoomId,
    setSelectedRoomId,
    isSearchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    clearSearch,
    setRoomShapeModalOpen,
    setRoomManagerOpen,
    setFurnitureLibraryOpen,
    setBackupModalOpen,
    setApiSyncModalOpen,
    resetView,
    setSelectedFurnitureId,
    showDimensions,
    toggleShowDimensions,
  } = useAppStore();

  const { isSearching, totalMatches } = useVisualSearch();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const rooms = useLiveQuery(async () => {
    if (selectedLocationId) {
      return await db.rooms.where('locationId').equals(selectedLocationId).toArray();
    }
    return await db.rooms.toArray();
  }, [selectedLocationId]) || [];

  // Focus search input when search is opened
  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  // Global hotkey: '/' or Ctrl+K opens search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && (e.target as HTMLElement)?.tagName !== 'INPUT')) {
        e.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSearchOpen]);

  return (
    <header className="w-full bg-white border-b border-slate-200 text-slate-800 px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-3 shadow-xs select-none z-30">
      {/* Header Left Content: Logo & Room Selector */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1.5 font-black text-base sm:text-lg tracking-tight text-slate-900 flex-shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white font-mono text-xs sm:text-sm font-bold">
            ⌖
          </div>
          <span className="font-bold text-sm sm:text-base">Placemend</span>
        </div>

        {/* Room Selector (Always accessible) */}
        <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium min-h-[38px]">
          <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <select
            value={selectedRoomId || ''}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer pr-1 truncate max-w-[120px] sm:max-w-[180px]"
          >
            {rooms.map((room) => (
              <option key={room.id} value={room.id} className="bg-white text-slate-800 font-semibold">
                {room.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setRoomManagerOpen(true)}
            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer flex-shrink-0"
            title="Manage Rooms & Spaces (Add or Remove Rooms)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Room Shape Button (Edit Mode, Desktop) */}
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
      </div>

      {/* Center: Live Search Bar (Desktop) */}
      <div className="hidden md:flex flex-1 max-w-md mx-2 relative items-center">
        <Search className={`w-4 h-4 absolute left-3.5 pointer-events-none transition-colors ${
          isSearching ? 'text-amber-500' : 'text-slate-400'
        }`} />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Visual Search: type item name, tag, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`w-full pl-9.5 pr-20 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all shadow-xs focus:outline-none ${
            isSearching 
              ? 'border-2 border-amber-400 bg-amber-50/50 text-slate-900 focus:ring-2 focus:ring-amber-500' 
              : 'border border-slate-200 bg-slate-50 hover:bg-white text-slate-700 focus:border-blue-500'
          }`}
        />

        {/* Matches Badge & Clear Action */}
        <div className="absolute right-2 flex items-center gap-1">
          {isSearching ? (
            <>
              <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-black shadow-xs">
                <Zap className="w-3 h-3 fill-white" />
                <span>{totalMatches} {totalMatches === 1 ? 'match' : 'matches'}</span>
              </span>
              <button
                onClick={clearSearch}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="Clear visual search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-0.5 font-mono text-[10px] text-slate-400 bg-slate-200/70 px-1.5 py-0.5 rounded border border-slate-300/60 font-semibold pointer-events-none">
              <span>⌘K</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* Mobile Search Button */}
        <button
          onClick={() => setSearchOpen(true)}
          className={`md:hidden px-2.5 py-1.5 rounded-xl transition-all cursor-pointer min-h-[38px] flex items-center gap-1 shadow-xs active:scale-95 ${
            isSearching 
              ? 'bg-amber-500 text-white shadow-amber-500/25 ring-2 ring-amber-300' 
              : 'text-slate-600 hover:text-blue-600 hover:bg-slate-100 bg-slate-50 border border-slate-200'
          }`}
          title="Search items visually"
        >
          <Search className="w-4 h-4" />
          {isSearching && (
            <span className="text-xs font-black font-mono">
              {totalMatches}
            </span>
          )}
        </button>

        {/* View vs Edit Mode Toggle (Responsive) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
          <button
            onClick={() => {
              setAppMode('view');
              setSelectedFurnitureId(null);
            }}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              appMode === 'view'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="View Mode"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span>View</span>
          </button>

          <button
            onClick={() => {
              setAppMode('edit');
              setSelectedFurnitureId(null);
            }}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              appMode === 'edit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Edit Mode"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
        </div>

        {/* Desktop Add Button */}
        {appMode === 'edit' && (
          <button
            onClick={() => setFurnitureLibraryOpen(true)}
            className="hidden md:flex bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            title="Add furniture"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add</span>
          </button>
        )}

        {/* Dimensions Toggle Button (Desktop) */}
        <button
          onClick={() => toggleShowDimensions()}
          className={`hidden md:flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer border ${
            showDimensions
              ? 'bg-blue-50 text-blue-600 border-blue-200'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-transparent hover:border-slate-200'
          }`}
          title={showDimensions ? 'Dimensions: ON (Click to hide dimensions)' : 'Dimensions: OFF (Click to show dimensions)'}
        >
          <Ruler className="w-3.5 h-3.5 text-blue-600" />
          <span>Dimensions</span>
        </button>

        {/* Recenter Button (Desktop) */}
        <button
          onClick={() => resetView()}
          className="hidden md:flex p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200"
          title="Recenter Floor Plan View"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* AI & API Sync Button */}
        <button
          onClick={() => setApiSyncModalOpen(true)}
          className="px-2.5 py-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 bg-indigo-50/60 rounded-xl transition-colors cursor-pointer border border-indigo-200/80 min-h-[38px] flex items-center justify-center gap-1.5 font-bold text-xs shadow-xs active:scale-95"
          title="AI Room Indexing & API Sync"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600 fill-indigo-200" />
          <span className="hidden sm:inline">AI Sync</span>
        </button>

        {/* Backup Button */}
        <button
          onClick={() => setBackupModalOpen(true)}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200 min-w-[38px] min-h-[38px] flex items-center justify-center"
          title="Backup & Export JSON Data"
        >
          <Download className="w-4.5 h-4.5" />
        </button>
      </div>
    </header>
  );
};
