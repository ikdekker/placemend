import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { SearchResult } from '../types';
import { 
  Search, 
  MapPin, 
  Box, 
  Tag, 
  ArrowRight, 
  X, 
  ChevronRight,
  Package,
  Layers
} from 'lucide-react';

export const SearchModal: React.FC = () => {
  const {
    isSearchOpen,
    setSearchOpen,
    locateFurniture,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isSearchOpen]);

  // Live searchable index across Items, Containers, Furniture, Rooms & Locations
  const searchResults: SearchResult[] = useLiveQuery(async () => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const items = await db.items.toArray();
    const containers = await db.containers.toArray();
    const furniture = await db.furniture.toArray();
    const rooms = await db.rooms.toArray();
    const locations = await db.locations.toArray();

    const containerMap = new Map(containers.map((c) => [c.id, c]));
    const furnitureMap = new Map(furniture.map((f) => [f.id, f]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const locationMap = new Map(locations.map((l) => [l.id, l]));

    const results: SearchResult[] = [];

    for (const item of items) {
      const nameMatch = item.name.toLowerCase().includes(q);
      const tagMatch = item.tags?.some((t) => t.toLowerCase().includes(q));
      const catMatch = item.category?.toLowerCase().includes(q);
      const descMatch = item.description?.toLowerCase().includes(q);

      if (nameMatch || tagMatch || catMatch || descMatch) {
        const container = containerMap.get(item.containerId);
        if (!container) continue;

        const furn = furnitureMap.get(container.furnitureId);
        if (!furn) continue;

        const rm = roomMap.get(furn.roomId);
        if (!rm) continue;

        const loc = locationMap.get(rm.locationId) || {
          id: 'unknown',
          name: 'Home',
          createdAt: 0,
          updatedAt: 0,
        };

        let score = 0;
        let matchedOn: SearchResult['matchedOn'] = 'name';

        if (nameMatch) {
          score = item.name.toLowerCase().startsWith(q) ? 100 : 80;
          matchedOn = 'name';
        } else if (tagMatch) {
          score = 60;
          matchedOn = 'tag';
        } else if (catMatch) {
          score = 40;
          matchedOn = 'category';
        } else {
          score = 20;
          matchedOn = 'description';
        }

        results.push({
          item,
          container,
          furniture: furn,
          room: rm,
          location: loc,
          matchScore: score,
          matchedOn,
        });
      }
    }

    return results.sort((a, b) => b.matchScore - a.matchScore);
  }, [query]) || [];

  if (!isSearchOpen) return null;

  const handleSelectResult = (result: SearchResult) => {
    locateFurniture(result.room.id, result.furniture.id, result.container.id);
  };

  return (
    <div 
      onClick={() => setSearchOpen(false)}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-black/80 backdrop-blur-md select-none"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-100"
      >
        {/* Search Input Bar */}
        <div className="p-3.5 border-b border-slate-800 flex items-center gap-3 bg-slate-900/90">
          <Search className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search items, tools, cables, documents, tags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-white text-base focus:outline-none placeholder:text-slate-500 font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-500 hover:text-white p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setSearchOpen(false)}
            className="text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg border border-slate-700 transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
          {!query ? (
            <div className="py-12 text-center text-slate-500">
              <Package className="w-8 h-8 stroke-1 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-medium">Type any item or keyword to locate it</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                e.g. "drill", "passport", "cables", "games", "charger"
              </p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <p className="text-xs font-medium">No items found matching "{query}"</p>
            </div>
          ) : (
            searchResults.map((res) => (
              <div
                key={res.item.id}
                onClick={() => handleSelectResult(res)}
                className="p-3 rounded-xl bg-slate-800/60 hover:bg-blue-950/40 border border-slate-700/60 hover:border-blue-500/60 transition-all cursor-pointer flex items-center justify-between gap-3 group shadow-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-white group-hover:text-blue-200">
                      {res.item.name}
                    </span>
                    {res.item.quantity > 1 && (
                      <span className="text-[10px] font-mono text-blue-300 bg-blue-950/80 px-1.5 py-0.2 rounded-full border border-blue-800/40">
                        ×{res.item.quantity}
                      </span>
                    )}
                    {res.item.category && (
                      <span className="text-[9px] font-mono uppercase bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
                        {res.item.category}
                      </span>
                    )}
                  </div>

                  {/* Visual Breadcrumb Location Path */}
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-1 flex-wrap font-medium">
                    <span className="text-blue-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {res.room.name}
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="text-slate-200 font-semibold">{res.furniture.name}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                    <span className="text-slate-400">{res.container.name}</span>
                  </div>
                </div>

                {/* Jump to Canvas Button */}
                <div className="flex items-center gap-1 text-xs font-semibold text-blue-400 group-hover:text-blue-300 bg-slate-800 group-hover:bg-blue-600 group-hover:text-white px-2.5 py-1.5 rounded-lg transition-all flex-shrink-0 shadow-sm">
                  <span>Locate</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
