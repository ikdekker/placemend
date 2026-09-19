import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Container } from '../types';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  List, 
  Grid, 
  Box, 
  Archive, 
  Layers, 
  ChevronRight,
  Sparkles,
  Star,
  Edit3
} from 'lucide-react';

export const PhysicalFurnitureView: React.FC = () => {
  const {
    selectedFurnitureId,
    setSelectedFurnitureId,
    setSelectedContainerId,
    setItemModalOpen,
  } = useAppStore();

  const { isSearching, matchingContainerIds, matchingItemIds, matchCountsByContainer } = useVisualSearch();

  const [showAllItems, setShowAllItems] = useState(false);
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotType, setNewSlotType] = useState<Container['type']>('drawer');

  const furniture = useLiveQuery(async () => {
    if (!selectedFurnitureId) return undefined;
    return await db.furniture.get(selectedFurnitureId);
  }, [selectedFurnitureId]);

  const containers = useLiveQuery(async () => {
    if (!selectedFurnitureId) return [];
    return await db.containers.where('furnitureId').equals(selectedFurnitureId).sortBy('orderIndex');
  }, [selectedFurnitureId]) || [];

  const allItems = useLiveQuery(async () => {
    if (!selectedFurnitureId) return [];
    const conts = await db.containers.where('furnitureId').equals(selectedFurnitureId).toArray();
    const contIds = conts.map((c) => c.id);
    return await db.items.where('containerId').anyOf(contIds).toArray();
  }, [selectedFurnitureId]) || [];

  if (!furniture) return null;

  // Group items by container
  const itemCountMap = new Map<string, number>();
  for (const item of allItems) {
    itemCountMap.set(item.containerId, (itemCountMap.get(item.containerId) || 0) + item.quantity);
  }

  // Top-level sections (e.g. drawers, boxes, shelves directly belonging to furniture)
  const topLevelContainers = containers.filter((c) => !c.parentContainerId);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotName.trim()) return;

    const newContainer: Container = {
      id: `cont-${Date.now()}`,
      furnitureId: furniture.id,
      name: newSlotName.trim(),
      type: newSlotType,
      orderIndex: topLevelContainers.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.containers.add(newContainer);
    setNewSlotName('');
    setIsAddingSlot(false);
  };

  const getSlotIcon = (type: Container['type']) => {
    switch (type) {
      case 'drawer':
        return <Archive className="w-5 h-5 text-blue-600" />;
      case 'box':
      case 'bin':
        return <Box className="w-5 h-5 text-amber-600" />;
      case 'shelf':
        return <Layers className="w-5 h-5 text-emerald-600" />;
      default:
        return <Grid className="w-5 h-5 text-purple-600" />;
    }
  };

  return (
    <div className="flex-1 min-h-0 w-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            data-action="back-to-room"
            onClick={() => setSelectedFurnitureId(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600 stroke-[2.5]" />
            <span>Room</span>
          </button>

          <div className="flex items-center gap-2">
            <span
              style={{ backgroundColor: furniture.color || '#475569' }}
              className="w-3.5 h-3.5 rounded-md shadow-xs"
            />
            <h1 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
              {furniture.name}
            </h1>
          </div>
        </div>

        <button
          data-action="toggle-all-items"
          onClick={() => setShowAllItems(!showAllItems)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
            showAllItems 
              ? 'bg-blue-600 text-white shadow-blue-500/20' 
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          }`}
        >
          {showAllItems ? <Grid className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
          <span>{showAllItems ? 'Physical View' : `All Items (${allItems.length})`}</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y w-full p-4 sm:p-6 pb-36 sm:pb-16 flex flex-col items-center">
        {showAllItems ? (
          /* Flat All Items List Mode */
          <div className="w-full max-w-2xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                All {allItems.length} items inside {furniture.name}
              </h2>
            </div>

            {allItems.length === 0 ? (
              <div className="text-center py-12 text-slate-400 font-medium">
                No items stored in this furniture piece yet.
              </div>
            ) : (
              allItems.map((item) => {
                const container = containers.find((c) => c.id === item.containerId);
                const isItemMatch = isSearching && matchingItemIds.has(item.id);
                const isItemDimmed = isSearching && !isItemMatch;

                return (
                  <div
                    key={item.id}
                    onClick={() => setItemModalOpen(true, item.id)}
                    className={`p-3.5 rounded-2xl transition-all cursor-pointer group flex items-center justify-between ${
                      isItemMatch
                        ? 'bg-amber-50/90 border-2 border-amber-400 ring-3 ring-amber-400 shadow-md scale-[1.01]'
                        : 'bg-white border border-slate-200 hover:border-blue-400 shadow-xs hover:shadow-md'
                    } ${isItemDimmed ? 'opacity-35 grayscale-[25%]' : 'opacity-100'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold flex-shrink-0 ${
                        isItemMatch ? 'bg-amber-500 text-white' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {item.quantity > 1 ? `×${item.quantity}` : '1'}
                      </div>
                      <div className="truncate min-w-0">
                        <div className="font-bold text-sm text-slate-900 group-hover:text-blue-600 truncate flex items-center gap-2">
                          <span>{item.name}</span>
                          {isItemMatch && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black animate-pulse">
                              ⚡ MATCH
                            </span>
                          )}
                        </div>
                        {container && (
                          <div className="text-xs text-slate-400 font-medium truncate flex items-center gap-1">
                            <span>📍</span>
                            <span>{container.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {item.favorite && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                      <Edit3 className="w-4 h-4 text-slate-400 group-hover:text-blue-600 ml-2" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Physical Elevation & Drawer Layout */
          <div className="w-full max-w-xl flex flex-col items-center gap-5">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Tap a drawer or shelf to open
              </span>
            </div>

            {/* Furniture Physical Cabinet Frame */}
            <div
              style={{
                borderColor: furniture.color || '#475569',
              }}
              className="w-full bg-slate-200/90 rounded-3xl p-3 sm:p-4 border-4 shadow-xl flex flex-col gap-3"
            >
              {topLevelContainers.length === 0 ? (
                <div className="bg-white/80 rounded-2xl p-8 text-center flex flex-col items-center gap-3">
                  <Archive className="w-10 h-10 text-slate-300" />
                  <p className="text-slate-500 font-medium text-sm">
                    This cupboard doesn't have any drawers or shelves yet.
                  </p>
                  <button
                    onClick={() => setIsAddingSlot(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md"
                  >
                    + Add First Drawer / Shelf
                  </button>
                </div>
              ) : (
                topLevelContainers.map((container) => {
                  const directCount = itemCountMap.get(container.id) || 0;
                  const children = containers.filter((c) => c.parentContainerId === container.id);
                  const childCount = children.reduce((acc, c) => acc + (itemCountMap.get(c.id) || 0), 0);
                  const totalCount = directCount + childCount;

                  const isMatch = isSearching && matchingContainerIds.has(container.id);
                  const isDimmed = isSearching && !isMatch;
                  const matchCount = matchCountsByContainer.get(container.id) || 0;

                  const isDrawer = container.type === 'drawer';
                  const isBox = container.type === 'box' || container.type === 'bin';

                  return (
                    <div
                      key={container.id}
                      onClick={() => setSelectedContainerId(container.id)}
                      className={`relative rounded-2xl p-4 sm:p-5 transition-all duration-200 cursor-pointer shadow-md flex items-center justify-between group ${
                        isMatch
                          ? 'ring-3 ring-amber-400 bg-amber-50/95 shadow-xl shadow-amber-300/40 border-2 border-amber-400 scale-[1.01]'
                          : isDrawer
                          ? 'bg-gradient-to-b from-white to-slate-50 border-2 border-slate-300 hover:border-blue-500 hover:shadow-xl hover:scale-[1.01]'
                          : isBox
                          ? 'bg-gradient-to-b from-amber-50 to-amber-100/70 border-2 border-amber-300 hover:border-amber-500 hover:shadow-xl hover:scale-[1.01]'
                          : 'bg-white border-2 border-slate-200 hover:border-emerald-500 hover:shadow-xl hover:scale-[1.01]'
                      } ${isDimmed ? 'opacity-35 grayscale-[25%]' : 'opacity-100'} active:scale-[0.99]`}
                    >
                      {/* Tactile Drawer Handle (if drawer) */}
                      {isDrawer && (
                        <div className="absolute top-1.5 inset-x-0 flex justify-center pointer-events-none">
                          <div className={`w-16 h-1.5 rounded-full transition-colors shadow-inner ${
                            isMatch ? 'bg-amber-400' : 'bg-slate-300 group-hover:bg-blue-400'
                          }`} />
                        </div>
                      )}

                      {/* Box pull strap (if box) */}
                      {isBox && (
                        <div className="absolute top-1.5 inset-x-0 flex justify-center pointer-events-none">
                          <div className="w-10 h-2 rounded-md bg-amber-800/40 shadow-xs" />
                        </div>
                      )}

                      {/* Section Name & Icon */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${
                          isMatch ? 'bg-amber-100 text-amber-800' : 'bg-slate-100/80 group-hover:bg-blue-50'
                        }`}>
                          {getSlotIcon(container.type)}
                        </div>
                        <div className="truncate min-w-0">
                          <h3 className={`font-extrabold text-sm sm:text-base transition-colors truncate ${
                            isMatch ? 'text-amber-950 font-black' : 'text-slate-800 group-hover:text-blue-600'
                          }`}>
                            {container.name}
                          </h3>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            {children.length > 0 
                              ? `${children.length} compartments inside`
                              : container.type}
                          </div>
                        </div>
                      </div>

                      {/* Count Badge & Chevron */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isMatch ? (
                          <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white font-extrabold text-xs shadow-xs flex items-center gap-1 animate-pulse">
                            <span>⚡</span>
                            <span>{matchCount} {matchCount === 1 ? 'match' : 'matches'}</span>
                          </span>
                        ) : totalCount > 0 ? (
                          <span className="px-2.5 py-1 rounded-full bg-slate-900 text-white font-mono text-xs font-black shadow-xs">
                            {totalCount} {totalCount === 1 ? 'item' : 'items'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-500 text-[11px] font-bold">
                            Empty
                          </span>
                        )}
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all ${
                          isMatch ? 'bg-amber-500 text-white' : 'bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-400'
                        }`}>
                          <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Section Action Button */}
            {!isAddingSlot ? (
              <button
                onClick={() => setIsAddingSlot(true)}
                className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-2xl bg-white border border-slate-300 text-slate-700 hover:text-blue-600 hover:border-blue-400 shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-600 stroke-[2.5]" />
                <span>Add Drawer / Shelf / Box</span>
              </button>
            ) : (
              <form
                onSubmit={handleAddSlot}
                className="w-full bg-white rounded-2xl p-4 border border-slate-300 shadow-lg flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600">
                    Add New Storage Slot
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsAddingSlot(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="e.g. Top Drawer, Middle Shelf, Tool Box..."
                  value={newSlotName}
                  onChange={(e) => setNewSlotName(e.target.value)}
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
                />

                <div className="flex items-center gap-2">
                  <select
                    value={newSlotType}
                    onChange={(e) => setNewSlotType(e.target.value as any)}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 bg-slate-50 focus:outline-none"
                  >
                    <option value="drawer">Drawer (Pull-out)</option>
                    <option value="shelf">Shelf (Open)</option>
                    <option value="box">Box / Bin</option>
                    <option value="compartment">Compartment</option>
                  </select>

                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md cursor-pointer transition-all"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
