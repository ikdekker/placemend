import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { 
  Search, 
  Layers, 
  Plus, 
  SlidersHorizontal, 
  Eye, 
  Edit3,
  Maximize2
} from 'lucide-react';

export const MobileNav: React.FC = () => {
  const {
    appMode,
    setAppMode,
    setSearchOpen,
    setFurnitureLibraryOpen,
    setRoomManagerOpen,
    resetView,
  } = useAppStore();

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-1 py-1.5 flex items-center justify-between shadow-lg select-none pb-[max(env(safe-area-inset-bottom),6px)]">
      {/* Search */}
      <button
        onClick={() => setSearchOpen(true)}
        className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer py-0.5"
      >
        <div className="p-1.5 rounded-xl bg-slate-100">
          <Search className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
        </div>
        <span className="text-[10px] font-bold truncate">Search</span>
      </button>

      {/* View / Edit Mode Toggle */}
      <button
        onClick={() => setAppMode(appMode === 'view' ? 'edit' : 'view')}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer py-0.5 ${
          appMode === 'edit' ? 'text-blue-600' : 'text-slate-600'
        }`}
      >
        <div className={`p-1.5 rounded-xl ${appMode === 'edit' ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
          {appMode === 'edit' ? <Edit3 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
        </div>
        <span className="text-[10px] font-bold truncate">{appMode === 'edit' ? 'Edit' : 'View'}</span>
      </button>

      {/* Add Furniture (Center Action) */}
      <button
        onClick={() => setFurnitureLibraryOpen(true)}
        className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 -mt-3.5 cursor-pointer"
      >
        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 transition-transform active:scale-95">
          <Plus className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
        </div>
        <span className="text-[10px] font-bold text-slate-700 truncate">Add</span>
      </button>

      {/* Rooms */}
      <button
        onClick={() => setRoomManagerOpen(true)}
        className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer py-0.5"
      >
        <div className="p-1.5 rounded-xl bg-slate-100">
          <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <span className="text-[10px] font-bold truncate">Rooms</span>
      </button>

      {/* Recenter */}
      <button
        onClick={() => resetView()}
        className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer py-0.5"
      >
        <div className="p-1.5 rounded-xl bg-slate-100">
          <Maximize2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
        </div>
        <span className="text-[10px] font-bold truncate">Center</span>
      </button>
    </div>
  );
};
