import React, { useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { getShareMeta } from '../services/sharing';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { scheduleSeedIfEmpty } from '../db/sampleData';
import { 
  Search, 
  MapPin, 
  Eye, 
  Edit3, 
  X,
  Zap,
  SlidersHorizontal,
  User,
  LayoutGrid
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
    setRoomManagerOpen,
    setMultiRoomOverviewOpen,
    currentUser,
    setAccountModalOpen,
    setSelectedFurnitureId,
  } = useAppStore();

  const { isSearching, totalMatches } = useVisualSearch();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const rooms = useLiveQuery(async () => {
    if (selectedLocationId) {
      const locRooms = await db.rooms.where('locationId').equals(selectedLocationId).toArray();
      // rooms shared with you keep their owner's location: always list them too
      const shared = await db.rooms.filter((r) => !!r.shareId && r.locationId !== selectedLocationId).toArray();
      if (locRooms.length > 0) return [...locRooms, ...shared];
    }
    const all = await db.rooms.toArray();
    if (all.length > 0) return all;
    scheduleSeedIfEmpty();
    return [];
  }, [selectedLocationId]) || [];

  // A room shared with you as view-only can't enter edit mode
  const currentRoom = rooms.find((r) => r.id === selectedRoomId);
  const viewOnlyRoom = getShareMeta(currentRoom?.shareId)?.role === 'view';
  useEffect(() => {
    if (viewOnlyRoom && appMode === 'edit') setAppMode('view');
  }, [viewOnlyRoom, appMode, setAppMode]);

  // Auto-sync selectedRoomId if null/empty or if pointing to a non-existent room
  useEffect(() => {
    if (rooms.length > 0) {
      const exists = rooms.some((r) => r.id === selectedRoomId);
      if (!exists) {
        setSelectedRoomId(rooms[0].id);
      }
    }
  }, [rooms, selectedRoomId, setSelectedRoomId]);

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
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-black text-base sm:text-lg tracking-tight text-slate-900 flex-shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white font-mono text-xs sm:text-sm font-bold">
            ⌖
          </div>
          <span className="font-bold text-sm sm:text-base hidden sm:inline">Placemend</span>
        </div>

        {/* Room Selector (Always accessible, flexible width on mobile) */}
        <div className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200/60 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium min-h-[38px] min-w-0 max-w-full sm:max-w-[340px] md:max-w-sm flex-1 transition-colors">
          <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
          <select
            value={selectedRoomId || ''}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer pr-1 truncate w-full min-w-0 text-xs sm:text-sm tracking-tight"
          >
            {rooms.length === 0 && (
              <option value="" disabled className="bg-white text-slate-400">
                No rooms
              </option>
            )}
            {rooms.map((room) => (
              <option key={room.id} value={room.id} className="bg-white text-slate-800 font-semibold">
                {room.shareId ? `${room.name} · shared by ${getShareMeta(room.shareId)?.ownerName ?? 'contact'}` : room.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setRoomManagerOpen(true)}
            className="hidden sm:flex p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-200/80 rounded-md transition-colors cursor-pointer flex-shrink-0"
            title="Manage Rooms & Spaces (Add, Rename, or Remove Rooms)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMultiRoomOverviewOpen(true)}
            className="min-w-[40px] min-h-[40px] justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-200/80 rounded-lg transition-colors cursor-pointer flex-shrink-0 flex items-center gap-1"
            title="Multi-Room Connected Overview (House Floor Plan Grid)"
          >
            <LayoutGrid className="w-5 h-5 text-blue-600" />
            <span className="hidden lg:inline text-xs font-bold text-slate-700">All Rooms</span>
          </button>
        </div>
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
        {/* View vs Edit Mode Toggle (Responsive) */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
          <button
            onClick={() => {
              setAppMode('view');
              setSelectedFurnitureId(null);
            }}
            className={`flex items-center gap-1 min-h-[40px] min-w-[44px] justify-center px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              appMode === 'view'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="View Mode"
          >
            <Eye className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden xs:inline sm:inline">View</span>
          </button>

          <button
            onClick={() => {
              if (viewOnlyRoom) {
                window.alert('This room is shared with you as view-only.');
                return;
              }
              setAppMode('edit');
              setSelectedFurnitureId(null);
            }}
            className={`flex items-center gap-1 min-h-[40px] min-w-[44px] justify-center px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              appMode === 'edit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            title="Edit Mode"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">Edit</span>
          </button>
        </div>

        {/* Canvas controls (add, room shape, dimensions, recenter, fullscreen) live in the canvas toolbar;
            backup & tools live in the account menu. */}

        {/* User Account / Sign In Button (Far Top Right) */}
        <button
          onClick={() => setAccountModalOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 shadow-2xs active:scale-95 min-h-[44px] min-w-[44px] justify-center"
          title={currentUser ? `Account: ${currentUser.name} (${currentUser.email})` : 'Sign In to Placemend'}
        >
          {currentUser?.picture ? (
            <img
              src={currentUser.picture}
              alt={currentUser.name}
              className="w-5 h-5 rounded-full object-cover"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px]">
              <User className="w-3 h-3 text-white" />
            </div>
          )}
          <span className="hidden sm:inline truncate max-w-[110px]">
            {currentUser ? currentUser.name : 'Sign In'}
          </span>
        </button>
      </div>
    </header>
  );
};
