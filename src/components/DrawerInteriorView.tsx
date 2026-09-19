import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Container, Item } from '../types';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Edit3, 
  Star, 
  Package, 
  Cable, 
  Dices, 
  BookOpen, 
  Wrench, 
  Layers, 
  LayoutGrid, 
  ChevronRight,
  SplitSquareVertical,
  Zap
} from 'lucide-react';

export const DrawerInteriorView: React.FC = () => {
  const {
    selectedFurnitureId,
    selectedContainerId,
    setSelectedContainerId,
    setItemModalOpen,
  } = useAppStore();

  const { isSearching, matchingContainerIds, matchingItemIds, matchCountsByContainer } = useVisualSearch();

  const [isAddingCompartment, setIsAddingCompartment] = useState(false);
  const [newCompName, setNewCompName] = useState('');

  const furniture = useLiveQuery(async () => {
    if (!selectedFurnitureId) return undefined;
    return await db.furniture.get(selectedFurnitureId);
  }, [selectedFurnitureId]);

  const activeContainer = useLiveQuery(async () => {
    if (!selectedContainerId) return undefined;
    return await db.containers.get(selectedContainerId);
  }, [selectedContainerId]);

  const parentContainer = useLiveQuery(async () => {
    if (!activeContainer?.parentContainerId) return undefined;
    return await db.containers.get(activeContainer.parentContainerId);
  }, [activeContainer?.parentContainerId]);

  // Sub-compartments if this container is divided
  const childCompartments = useLiveQuery(async () => {
    if (!selectedContainerId) return [];
    return await db.containers.where('parentContainerId').equals(selectedContainerId).sortBy('orderIndex');
  }, [selectedContainerId]) || [];

  // Items stored directly in this container
  const items = useLiveQuery(async () => {
    if (!selectedContainerId) return [];
    return await db.items.where('containerId').equals(selectedContainerId).toArray();
  }, [selectedContainerId]) || [];

  // Items in child compartments (for unique item count)
  const childItemCounts = useLiveQuery(async () => {
    if (childCompartments.length === 0) return {};
    const childIds = childCompartments.map((c) => c.id);
    const childItems = await db.items.where('containerId').anyOf(childIds).toArray();
    const counts: Record<string, number> = {};
    childItems.forEach((it) => {
      counts[it.containerId] = (counts[it.containerId] || 0) + 1;
    });
    return counts;
  }, [childCompartments]) || {};

  if (!furniture || !activeContainer) return null;

  const handleStepBack = () => {
    if (activeContainer.parentContainerId) {
      setSelectedContainerId(activeContainer.parentContainerId);
    } else {
      setSelectedContainerId(null);
    }
  };

  const handleToggleFavorite = async (item: Item, e: React.MouseEvent) => {
    e.stopPropagation();
    await db.items.update(item.id, {
      favorite: !item.favorite,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteItem = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Remove this item from the drawer?')) {
      await db.items.delete(itemId);
    }
  };

  const handleAddCompartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompName.trim()) return;

    const newContainer: Container = {
      id: `comp-${Date.now()}`,
      furnitureId: furniture.id,
      parentContainerId: activeContainer.id,
      name: newCompName.trim(),
      type: 'compartment',
      orderIndex: childCompartments.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.containers.add(newContainer);
    setNewCompName('');
    setIsAddingCompartment(false);
  };

  const getItemVisualIcon = (item: Item) => {
    const text = (item.name + ' ' + (item.category || '')).toLowerCase();
    if (text.includes('cable') || text.includes('usb') || text.includes('hdmi') || text.includes('charger') || text.includes('adapter')) {
      return <Cable className="w-7 h-7 sm:w-8 sm:h-8 text-cyan-600" />;
    }
    if (text.includes('game') || text.includes('catan') || text.includes('dice') || text.includes('poker') || text.includes('playstation') || text.includes('controller')) {
      return <Dices className="w-7 h-7 sm:w-8 sm:h-8 text-purple-600" />;
    }
    if (text.includes('book') || text.includes('kindle') || text.includes('manual') || text.includes('notebook')) {
      return <BookOpen className="w-7 h-7 sm:w-8 sm:h-8 text-amber-600" />;
    }
    if (text.includes('tool') || text.includes('caliper') || text.includes('wrench') || text.includes('meter') || text.includes('hex') || text.includes('screw')) {
      return <Wrench className="w-7 h-7 sm:w-8 sm:h-8 text-orange-600" />;
    }
    return <Package className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />;
  };

  const backLabel = parentContainer ? parentContainer.name : furniture.name;

  return (
    <div className="flex-1 min-h-0 w-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 px-3.5 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between shadow-xs flex-shrink-0 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            data-action="drawer-back"
            onClick={handleStepBack}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-xs active:scale-95 flex-shrink-0 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 stroke-[2.5]" />
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline truncate max-w-[150px]">{backLabel}</span>
          </button>

          <div className="truncate min-w-0">
            <h1 className="font-extrabold text-base sm:text-xl text-slate-900 tracking-tight truncate">
              {activeContainer.name}
            </h1>
          </div>
        </div>

        {/* Quick Add Item Button */}
        {childCompartments.length === 0 && (
          <button
            onClick={() => setItemModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 sm:py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all cursor-pointer active:scale-95 flex-shrink-0 min-h-[44px]"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            <span>Add Item</span>
          </button>
        )}
      </div>

      {/* Main Drawer Interior View */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y w-full p-4 sm:p-6 pb-36 sm:pb-16 flex flex-col items-center">
        <div className="w-full max-w-2xl flex flex-col gap-4">
          
          {/* Sub-Divided Compartments View (if drawer has divider trays) */}
          {childCompartments.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                  Organizer Compartments ({childCompartments.length})
                </span>
                <button
                  onClick={() => setIsAddingCompartment(true)}
                  className="px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 cursor-pointer flex items-center gap-1.5 transition-colors min-h-[36px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Divider</span>
                </button>
              </div>

              {/* Physical Organizer Tray Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 sm:p-5 rounded-3xl bg-amber-50/60 border-4 border-amber-900/15 shadow-inner">
                {childCompartments.map((comp) => {
                  const count = childItemCounts[comp.id] || 0;
                  const isCompMatch = isSearching && matchingContainerIds.has(comp.id);
                  const isCompDimmed = isSearching && !isCompMatch;
                  const compMatchCount = matchCountsByContainer.get(comp.id) || 0;

                  return (
                    <div
                      key={comp.id}
                      onClick={() => setSelectedContainerId(comp.id)}
                      className={`p-4 sm:p-5 rounded-2xl sm:rounded-3xl transition-all cursor-pointer flex items-center justify-between group active:scale-98 min-h-[90px] sm:min-h-[105px] ${
                        isCompMatch
                          ? 'bg-amber-50/95 border-2 border-amber-400 ring-4 ring-amber-400 shadow-md scale-[1.01]'
                          : 'bg-white border-2 border-amber-200 hover:border-blue-500 shadow-sm hover:shadow-lg'
                      } ${isCompDimmed ? 'opacity-35 grayscale-[25%]' : 'opacity-100'}`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                          isCompMatch ? 'bg-amber-100 text-amber-800' : 'bg-purple-50 text-purple-600'
                        }`}>
                          <LayoutGrid className="w-7 h-7" />
                        </div>
                        <div className="truncate min-w-0">
                          <h3 className={`font-black text-base sm:text-lg truncate ${
                            isCompMatch ? 'text-amber-950' : 'text-slate-800 group-hover:text-blue-600'
                          }`}>
                            {comp.name}
                          </h3>
                          <span className="text-xs sm:text-sm font-semibold text-slate-400">
                            {count} {count === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {isCompMatch && (
                          <span className="px-3 py-1 rounded-full bg-amber-500 text-white font-black text-xs shadow-xs flex items-center gap-1 animate-pulse">
                            <span>⚡</span>
                            <span>{compMatchCount}</span>
                          </span>
                        )}
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors text-slate-400 flex-shrink-0 ${
                          isCompMatch ? 'bg-amber-500 text-white' : 'bg-slate-100 group-hover:bg-blue-600 group-hover:text-white'
                        }`}>
                          <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Deepest Level: Visual Item Cards Inside The Drawer */
            <div className="flex flex-col gap-4">
              {/* Drawer Interior Tray Box */}
              <div className="rounded-3xl bg-white/90 border-4 border-slate-300/80 shadow-xl p-4 sm:p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500">
                      Items Inside ({items.length})
                    </span>
                  </div>

                  <button
                    onClick={() => setIsAddingCompartment(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer min-h-[36px]"
                    title="Add a divider to split this drawer into compartments"
                  >
                    <SplitSquareVertical className="w-4 h-4" />
                    <span>Split into Compartments</span>
                  </button>
                </div>

                {/* Visual Items Grid (1 col on narrow mobile, 2 on regular mobile/tablet) */}
                {items.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
                      <Package className="w-9 h-9" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-700 text-base">This drawer is empty</h3>
                      <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Add your first stored item below</p>
                    </div>
                    <button
                      onClick={() => setItemModalOpen(true)}
                      className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all cursor-pointer min-h-[44px]"
                    >
                      + Add Item Here
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {[...items]
                      .sort((a, b) => {
                        if (isSearching) {
                          const aMatch = matchingItemIds.has(a.id);
                          const bMatch = matchingItemIds.has(b.id);
                          if (aMatch && !bMatch) return -1;
                          if (!aMatch && bMatch) return 1;
                        }
                        return 0;
                      })
                      .map((item) => {
                        const isItemMatch = isSearching && matchingItemIds.has(item.id);
                        const isItemDimmed = isSearching && !isItemMatch;

                      return (
                        <div
                          key={item.id}
                          onClick={() => setItemModalOpen(true, item.id)}
                          className={`relative p-4 sm:p-5 rounded-2xl sm:rounded-3xl transition-all cursor-pointer flex flex-col justify-between gap-3.5 group active:scale-98 min-h-[140px] ${
                            isItemMatch
                              ? 'bg-amber-50/95 border-2 border-amber-400 ring-4 ring-amber-400 shadow-xl shadow-amber-400/30 scale-[1.02] z-10'
                              : 'bg-slate-50/80 hover:bg-white border-2 border-slate-200 hover:border-blue-400 shadow-xs hover:shadow-md'
                          } ${isItemDimmed ? 'opacity-35 grayscale-[25%]' : 'opacity-100'}`}
                        >
                          {/* Top: Icon + Multiplier Pill + Favorite / Match Badge */}
                          <div className="flex items-start justify-between">
                            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-xs border flex items-center justify-center group-hover:scale-105 transition-transform flex-shrink-0 ${
                              isItemMatch ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-slate-200/80'
                            }`}>
                              {getItemVisualIcon(item)}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {isItemMatch && (
                                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white font-black text-xs shadow-xs flex items-center gap-1 animate-pulse">
                                  <Zap className="w-3 h-3 fill-white" />
                                  <span>MATCH</span>
                                </span>
                              )}
                              {item.quantity > 1 && (
                                <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-mono text-xs sm:text-sm font-black">
                                  ×{item.quantity}
                                </span>
                              )}
                              <button
                                onClick={(e) => handleToggleFavorite(item, e)}
                                className="min-w-[38px] min-h-[38px] p-2 rounded-xl text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer flex items-center justify-center"
                                title="Favorite"
                              >
                                <Star className={`w-5 h-5 ${item.favorite ? 'text-amber-500 fill-amber-500' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {/* Middle: Clean Item Title (Zero text clutter, readable font) */}
                          <div>
                            <h4 className={`font-black text-base sm:text-lg leading-snug line-clamp-2 ${
                              isItemMatch ? 'text-amber-950 font-black' : 'text-slate-800 group-hover:text-blue-600'
                            }`}>
                              {item.name}
                            </h4>
                          </div>

                          {/* Bottom Actions: Substantial touch targets */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 text-slate-400">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-600">
                              Tap to edit
                            </span>
                            <div className="flex items-center gap-1">
                              <div className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 group-hover:text-blue-600">
                                <Edit3 className="w-4 h-4" />
                              </div>
                              <button
                                onClick={(e) => handleDeleteItem(item.id, e)}
                                className="min-w-[38px] min-h-[38px] p-2 rounded-xl hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center"
                                title="Delete Item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Quick "+ Add Item" Card (Bigger card) */}
                    <button
                      onClick={() => setItemModalOpen(true)}
                      className="p-6 rounded-2xl sm:rounded-3xl border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all flex flex-col items-center justify-center gap-2.5 text-slate-400 hover:text-emerald-700 cursor-pointer min-h-[140px] sm:min-h-[160px]"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-emerald-600">
                        <Plus className="w-7 h-7 stroke-[2.5]" />
                      </div>
                      <span className="text-sm sm:text-base font-extrabold">New Item</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Add Compartment / Divider Form */}
          {isAddingCompartment && (
            <form
              onSubmit={handleAddCompartment}
              className="w-full bg-white rounded-2xl p-4 border border-slate-300 shadow-lg flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600">
                  Add Drawer Divider / Compartment
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAddingCompartment(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <input
                type="text"
                placeholder="e.g. Left Compartment, Small Items Tray..."
                value={newCompName}
                onChange={(e) => setNewCompName(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCompartment(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-600 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md"
                >
                  Save Divider
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
