import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { Zap, List, X } from 'lucide-react';

export const FloatingSearchBanner: React.FC = () => {
  const {
    isSearchOpen,
    setSearchOpen,
    searchQuery,
    clearSearch,
  } = useAppStore();

  const { isSearching, totalMatches } = useVisualSearch();

  if (!isSearching || isSearchOpen) return null;

  return (
    <div className="absolute top-3 inset-x-0 z-30 flex justify-center pointer-events-none px-3 animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-amber-500 text-white shadow-xl shadow-amber-500/25 border border-amber-400 text-xs sm:text-sm font-extrabold max-w-md w-auto">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <Zap className="w-4 h-4 fill-white flex-shrink-0 animate-pulse" />
          <span className="truncate">
            "{searchQuery}"
          </span>
          <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[11px] font-black font-mono flex-shrink-0">
            {totalMatches} {totalMatches === 1 ? 'match' : 'matches'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white text-amber-900 hover:bg-amber-50 font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
            title="View search results list"
          >
            <List className="w-3.5 h-3.5" />
            <span>List</span>
          </button>

          <button
            onClick={clearSearch}
            className="p-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
