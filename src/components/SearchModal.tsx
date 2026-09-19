import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { SearchResult, Item } from '../types';
import { 
  Search, 
  MapPin, 
  X, 
  ArrowRight, 
  ChevronRight, 
  Cable, 
  Dices, 
  BookOpen, 
  Wrench, 
  Package, 
  Star, 
  Zap, 
  Map, 
  Sparkles,
  SlidersHorizontal
} from 'lucide-react';

export const SearchModal: React.FC = () => {
  const {
    isSearchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    clearSearch,
    locateFurniture,
  } = useAppStore();

  const {
    isSearching,
    totalMatches,
    matchingResults,
    matchCountsByRoom,
  } = useVisualSearch();

  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input when opened on mobile/desktop
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setSelectedRoomFilter(null);
    }
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;

  // Filter results by selected room tab if any
  const filteredResults = selectedRoomFilter
    ? matchingResults.filter((r) => r.room.id === selectedRoomFilter)
    : matchingResults;

  // Rooms that have matches
  const roomsWithMatches = Array.from(matchCountsByRoom.entries())
    .filter(([_, count]) => count > 0)
    .map(([roomId, count]) => {
      const match = matchingResults.find((r) => r.room.id === roomId);
      return {
        id: roomId,
        name: match?.room.name || 'Room',
        count,
      };
    });

  const getItemVisualIcon = (item: Item) => {
    const text = (item.name + ' ' + (item.category || '')).toLowerCase();
    if (text.includes('cable') || text.includes('usb') || text.includes('hdmi') || text.includes('charger') || text.includes('adapter')) {
      return <Cable className="w-5 h-5 text-cyan-600" />;
    }
    if (text.includes('game') || text.includes('catan') || text.includes('dice') || text.includes('poker') || text.includes('playstation') || text.includes('controller')) {
      return <Dices className="w-5 h-5 text-purple-600" />;
    }
    if (text.includes('book') || text.includes('kindle') || text.includes('manual') || text.includes('notebook')) {
      return <BookOpen className="w-5 h-5 text-amber-600" />;
    }
    if (text.includes('tool') || text.includes('caliper') || text.includes('wrench') || text.includes('meter') || text.includes('hex') || text.includes('screw')) {
      return <Wrench className="w-5 h-5 text-orange-600" />;
    }
    return <Package className="w-5 h-5 text-blue-600" />;
  };

  const handleSelectResult = (result: SearchResult) => {
    locateFurniture(result.room.id, result.furniture.id, result.container.id);
  };

  const handleQuickChip = (term: string) => {
    setSearchQuery(term);
    inputRef.current?.focus();
  };

  return (
    <div 
      onClick={() => setSearchOpen(false)}
      className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center bg-black/60 backdrop-blur-xs select-none p-0 md:p-4 animate-in fade-in duration-150"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-xl bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col h-[85vh] md:h-auto md:max-h-[85vh] overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-4 duration-200"
      >
        {/* Mobile Swipe Drag Indicator Handle */}
        <div className="md:hidden w-full flex justify-center pt-2.5 pb-1 cursor-grab">
          <div className="w-12 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Top Search Input Bar */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2.5 bg-white flex-shrink-0">
          <div className="flex-1 relative flex items-center">
            <Search className="w-5 h-5 text-blue-600 absolute left-3.5 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search items, cables, tools, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-2xl border-2 border-slate-200 focus:border-blue-500 bg-slate-50 focus:bg-white text-sm sm:text-base font-bold text-slate-900 focus:outline-none focus:ring-3 focus:ring-blue-100 transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                title="Clear query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setSearchOpen(false)}
            className="px-3.5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer flex-shrink-0 active:scale-95 min-h-[46px]"
          >
            Done
          </button>
        </div>

        {/* Quick Filter Chips (1-tap searching) */}
        <div className="px-3 sm:px-4 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1 flex-shrink-0">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Quick:</span>
          </span>
          {[
            { label: '🔌 Cables', term: 'cable' },
            { label: '🛠️ Tools', term: 'tool' },
            { label: '🎮 Games', term: 'game' },
            { label: '📖 Books', term: 'book' },
            { label: '⭐ Starred', term: 'is:starred' },
            { label: '📦 Multi-Packs', term: 'is:pack' },
          ].map((chip) => {
            const isActive = searchQuery.toLowerCase() === chip.term;
            return (
              <button
                key={chip.term}
                onClick={() => handleQuickChip(chip.term)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer flex-shrink-0 shadow-xs active:scale-95 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-blue-500/20 ring-2 ring-blue-300'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Room Filter Tabs (when matches span rooms) */}
        {roomsWithMatches.length > 1 && (
          <div className="px-3 sm:px-4 py-2 bg-white border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-shrink-0">
            <button
              onClick={() => setSelectedRoomFilter(null)}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedRoomFilter === null
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Rooms ({totalMatches})
            </button>
            {roomsWithMatches.map((rm) => (
              <button
                key={rm.id}
                onClick={() => setSelectedRoomFilter(rm.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 ${
                  selectedRoomFilter === rm.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{rm.name}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  selectedRoomFilter === rm.id ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {rm.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Results List */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-2.5">
          {!searchQuery.trim() ? (
            /* Empty State: Helpful guidance & suggestions */
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                <Search className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm sm:text-base">
                  Search across your entire home
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Type an item name, or tap a quick category chip above to locate where things are stored.
                </p>
              </div>
            </div>
          ) : filteredResults.length === 0 ? (
            /* No Results Found */
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2">
              <Package className="w-10 h-10 text-slate-300 stroke-1" />
              <h3 className="font-bold text-slate-700 text-sm">No items matching "{searchQuery}"</h3>
              <p className="text-xs text-slate-400">
                Try searching with broader terms or check spelling.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 cursor-pointer"
              >
                Clear Search
              </button>
            </div>
          ) : (
            /* Matching Items */
            filteredResults.map((res) => (
              <div
                key={res.item.id}
                data-testid="search-result-card"
                onClick={() => handleSelectResult(res)}
                className="p-3.5 sm:p-4 rounded-2xl bg-white hover:bg-blue-50/40 border-2 border-slate-200 hover:border-blue-400 transition-all cursor-pointer flex items-center justify-between gap-3 group shadow-xs hover:shadow-md active:scale-98"
              >
                {/* Left: Visual Icon + Item Info + Breadcrumbs */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 group-hover:bg-white border border-slate-200/80 shadow-xs flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    {getItemVisualIcon(res.item)}
                  </div>

                  <div className="truncate min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-extrabold text-sm sm:text-base text-slate-900 group-hover:text-blue-600 truncate">
                        {res.item.name}
                      </h4>
                      {res.item.quantity > 1 && (
                        <span className="text-xs font-mono font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                          ×{res.item.quantity}
                        </span>
                      )}
                      {res.item.favorite && (
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                      )}
                    </div>

                    {/* Hierarchical Breadcrumb Path */}
                    <div className="flex items-center gap-1 text-[11px] sm:text-xs text-slate-400 mt-1 font-medium truncate">
                      <span className="text-blue-600 font-bold flex items-center gap-0.5 truncate">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span>{res.room.name}</span>
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      <span className="text-slate-700 font-semibold truncate">{res.furniture.name}</span>
                      <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
                      <span className="text-slate-500 truncate">{res.container.name}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Direct Locate Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectResult(res);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 group-hover:bg-blue-600 text-slate-700 group-hover:text-white font-extrabold text-xs transition-all flex items-center gap-1 flex-shrink-0 shadow-xs active:scale-95"
                  title="Open this item"
                >
                  <span className="hidden sm:inline">Open</span>
                  <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Sticky Bottom Action Bar: View Spotlight on Floor Plan */}
        {isSearching && matchingResults.length > 0 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 flex-shrink-0">
            <span className="text-xs font-extrabold text-slate-600 pl-1">
              ⚡ {matchingResults.length} {matchingResults.length === 1 ? 'match' : 'matches'} located
            </span>
            <button
              onClick={() => setSearchOpen(false)}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 min-h-[42px]"
            >
              <Map className="w-4 h-4" />
              <span>Show on Floor Plan</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
