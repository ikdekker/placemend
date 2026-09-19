import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { 
  Search, 
  Plus, 
  SlidersHorizontal, 
  Zap,
  Home
} from 'lucide-react';

export const MobileNav: React.FC = () => {
  const {
    isSearchOpen,
    setSearchOpen,
    setFurnitureLibraryOpen,
    setRoomManagerOpen,
    selectedFurnitureId,
    setSelectedFurnitureId,
    setSelectedContainerId,
  } = useAppStore();

  const { isSearching, totalMatches } = useVisualSearch();

  const isDeep = selectedFurnitureId !== null;

  const handleGoHome = () => {
    setSelectedContainerId(null);
    setSelectedFurnitureId(null);
  };

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-2 flex items-center justify-between shadow-lg select-none pb-[max(env(safe-area-inset-bottom),8px)]">
      {/* Search */}
      <button
        onClick={() => setSearchOpen(!isSearchOpen)}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer py-1 min-h-[52px] ${
          isSearching ? 'text-amber-600' : 'text-slate-600 hover:text-blue-600'
        }`}
      >
        <div className={`p-2 rounded-xl transition-colors ${
          isSearching ? 'bg-amber-500 text-white shadow-xs' : 'bg-slate-100'
        }`}>
          {isSearching ? <Zap className="w-5 h-5 fill-white" /> : <Search className="w-5 h-5 text-blue-600" />}
        </div>
        <span className="text-[11px] font-black truncate">
          {isSearching ? `${totalMatches} matches` : 'Search'}
        </span>
      </button>

      {/* Room (back to floor plan) — visible when inside furniture/drawer */}
      {isDeep && (
        <button
          onClick={handleGoHome}
          className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-blue-600 transition-colors cursor-pointer py-1 min-h-[52px]"
        >
          <div className="p-2 rounded-xl bg-blue-100">
            <Home className="w-5 h-5 text-blue-600" />
          </div>
          <span className="text-[11px] font-black truncate">Room</span>
        </button>
      )}

      {/* Add Furniture (Center Action) */}
      <button
        onClick={() => setFurnitureLibraryOpen(true)}
        className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 -mt-4 cursor-pointer"
      >
        <div className="w-13 h-13 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 transition-transform active:scale-95">
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </div>
        <span className="text-[11px] font-black text-slate-700 truncate">Add</span>
      </button>

      {/* Rooms */}
      <button
        onClick={() => setRoomManagerOpen(true)}
        className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer py-1 min-h-[52px]"
      >
        <div className="p-2 rounded-xl bg-slate-100">
          <SlidersHorizontal className="w-5 h-5" />
        </div>
        <span className="text-[11px] font-black truncate">Rooms</span>
      </button>
    </div>
  );
};
