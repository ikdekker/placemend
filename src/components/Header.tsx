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
  Zap
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
    setFurnitureLibraryOpen,
    setBackupModalOpen,
    resetView,
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
      {/* Mobile Search Active Bar */}
      {isSearchOpen ? (
        <div className="flex md:hidden items-center gap-2 w-full animate-in fade-in duration-100">
          <div className="flex-1 relative flex items-center">
            <Search className="w-4 h-4 text-amber-500 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search items, cables, games, tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-16 py-1.5 rounded-xl border-2 border-amber-400 bg-amber-50/40 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
            />
            {isSearching && (
              <span className="absolute right-2 flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black shadow-xs">
                <Zap className="w-2.5 h-2.5 fill-white" />
                <span>{totalMatches}</span>
              </span>
            )}
          </div>
          <button
            onClick={() => {
              clearSearch();
              setSearchOpen(false);
            }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
          >
            Done
          </button>
        </div>
      ) : (
        /* Normal Header Left Content */
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 font-black text-base sm:text-lg tracking-tight text-slate-900 flex-shrink-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white font-mono text-xs sm:text-sm font-bold">
              ⌖
            </div>
            <span className="font-bold text-sm sm:text-base">Placemend</span>
          </div>

          {/* Room Selector */}
          <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium min-h-[38px]">
            <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <select
              value={selectedRoomId || ''}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer pr-1 truncate max-w-[110px] sm:max-w-[180px]"
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id} className="bg-white text-slate-800 font-semibold">
                  {room.name}
                </option>
              ))}
            </select>
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
      )}

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
      {!isSearchOpen && (
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Mobile Search Button */}
          <button
            onClick={() => setSearchOpen(true)}
            className={`md:hidden p-2 rounded-xl transition-all cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center ${
              isSearching 
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20' 
                : 'text-slate-600 hover:text-blue-600 hover:bg-slate-100'
            }`}
            title="Search items visually"
          >
            <Search className="w-4.5 h-4.5" />
          </button>

          {/* Desktop View vs Edit Mode */}
          <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => setAppMode('view')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              onClick={() => setAppMode('edit')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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

          {/* Recenter Button (Desktop) */}
          <button
            onClick={() => resetView()}
            className="hidden md:flex p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            title="Recenter Floor Plan View"
          >
            <Maximize2 className="w-4 h-4" />
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
      )}
    </header>
  );
};
