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
      return <Cable className="w-6 h-6 text-cyan-600" />;
    }
    if (text.includes('game') || text.includes('catan') || text.includes('dice') || text.includes('poker') || text.includes('playstation') || text.includes('controller')) {
      return <Dices className="w-6 h-6 text-purple-600" />;
    }
    if (text.includes('book') || text.includes('kindle') || text.includes('manual') || text.includes('notebook')) {
      return <BookOpen className="w-6 h-6 text-amber-600" />;
    }
    if (text.includes('tool') || text.includes('caliper') || text.includes('wrench') || text.includes('meter') || text.includes('hex') || text.includes('screw')) {
      return <Wrench className="w-6 h-6 text-orange-600" />;
    }
    return <Package className="w-6 h-6 text-blue-600" />;
  };

  const backLabel = parentContainer ? parentContainer.name : furniture.name;

  return (
    <div className="flex-1 min-h-0 w-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            data-action="drawer-back"
            onClick={handleStepBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600 stroke-[2.5]" />
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline truncate max-w-[150px]">{backLabel}</span>
          </button>

          <div className="truncate min-w-0">
            <h1 className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight truncate">
              {activeContainer.name}
            </h1>
          </div>
        </div>

        {/* Quick Add Item Button */}
        {childCompartments.length === 0 && (
          <button
            onClick={() => setItemModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer active:scale-95 flex-shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
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
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Organizer Compartments ({childCompartments.length})
                </span>
                <button
                  onClick={() => setIsAddingCompartment(true)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Divider</span>
                </button>
              </div>

              {/* Physical Organizer Tray Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-3xl bg-amber-50/60 border-4 border-amber-900/15 shadow-inner">
                {childCompartments.map((comp) => {
                  const count = childItemCounts[comp.id] || 0;
                  const isCompMatch = isSearching && matchingContainerIds.has(comp.id);
                  const isCompDimmed = isSearching && !isCompMatch;
                  const compMatchCount = matchCountsByContainer.get(comp.id) || 0;

                  return (
                    <div
                      key={comp.id}
                      onClick={() => setSelectedContainerId(comp.id)}
                      className={`p-4 rounded-2xl transition-all cursor-pointer flex items-center justify-between group active:scale-98 ${
                        isCompMatch
                          ? 'bg-amber-50/95 border-2 border-amber-400 ring-3 ring-amber-400 shadow-md scale-[1.01]'
                          : 'bg-white border-2 border-amber-200 hover:border-blue-500 shadow-sm hover:shadow-lg'
                      } ${isCompDimmed ? 'opacity-35 grayscale-[25%]' : 'opacity-100'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                          isCompMatch ? 'bg-amber-100 text-amber-800' : 'bg-purple-50 text-purple-600'
                        }`}>
                          <LayoutGrid className="w-5 h-5" />
                        </div>
                        <div className="truncate min-w-0">
                          <h3 className={`font-extrabold text-sm truncate ${
                            isCompMatch ? 'text-amber-950 font-black' : 'text-slate-800 group-hover:text-blue-600'
                          }`}>
                            {comp.name}
                          </h3>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {count} {count === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isCompMatch && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-[10px] shadow-xs flex items-center gap-1 animate-pulse">
                            <span>⚡</span>
                            <span>{compMatchCount} {compMatchCount === 1 ? 'match' : 'matches'}</span>
                          </span>
                        )}
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors text-slate-400 flex-shrink-0 ${
                          isCompMatch ? 'bg-amber-500 text-white' : 'bg-slate-100 group-hover:bg-blue-600 group-hover:text-white'
                        }`}>
                          <ChevronRight className="w-4 h-4 stroke-[2.5]" />
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
              <div className="rounded-3xl bg-white/90 border-4 border-slate-300/80 shadow-xl p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Items Inside ({items.length})
                    </span>
                  </div>

                  <button
                    onClick={() => setIsAddingCompartment(true)}
                    className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                    title="Add a divider to split this drawer into compartments"
                  >
                    <SplitSquareVertical className="w-3.5 h-3.5" />
                    <span>Split into Compartments</span>
                  </button>
                </div>

                {/* Visual Items Grid (2 cols on mobile, 3 on tablet) */}
                {items.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
                      <Package className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-700 text-sm">This drawer is empty</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Add your first stored item below</p>
                    </div>
                    <button
                      onClick={() => setItemModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                    >
                      + Add Item Here
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                          className={`relative p-3.5 rounded-2xl transition-all cursor-pointer flex flex-col justify-between gap-3 group active:scale-98 ${
                            isItemMatch
                              ? 'bg-amber-50/95 border-2 border-amber-400 ring-4 ring-amber-400 shadow-xl shadow-amber-400/30 scale-[1.02] z-10'
                              : 'bg-slate-50/80 hover:bg-white border-2 border-slate-200 hover:border-blue-400 shadow-xs hover:shadow-md'
                          } ${isItemDimmed ? 'opacity-35 grayscale-[25%]' : 'opacity-100'}`}
                        >
                          {/* Top: Icon + Multiplier Pill + Favorite / Match Badge */}
                          <div className="flex items-start justify-between">
                            <div className={`w-11 h-11 rounded-xl shadow-xs border flex items-center justify-center group-hover:scale-105 transition-transform flex-shrink-0 ${
                              isItemMatch ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-slate-200/80'
                            }`}>
                              {getItemVisualIcon(item)}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              {isItemMatch && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-black text-[10px] shadow-xs flex items-center gap-1 animate-pulse">
                                  <Zap className="w-2.5 h-2.5 fill-white" />
                                  <span>MATCH</span>
                                </span>
                              )}
                              {item.quantity > 1 && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono text-xs font-black">
                                  ×{item.quantity}
                                </span>
                              )}
                              <button
                                onClick={(e) => handleToggleFavorite(item, e)}
                                className="p-1 rounded-lg text-slate-300 hover:text-amber-500 transition-colors cursor-pointer"
                              >
                                <Star className={`w-4 h-4 ${item.favorite ? 'text-amber-500 fill-amber-500' : ''}`} />
                              </button>
                            </div>
                          </div>

                          {/* Middle: Clean Item Title (Zero text clutter) */}
                          <div>
                            <h4 className={`font-extrabold text-sm leading-snug line-clamp-2 ${
                              isItemMatch ? 'text-amber-950 font-black' : 'text-slate-800 group-hover:text-blue-600'
                            }`}>
                              {item.name}
                            </h4>
                          </div>

                          {/* Bottom Actions */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-slate-400">
                            <span className="text-[10px] font-semibold uppercase tracking-wider">
                              Tap to edit
                            </span>
                            <div className="flex items-center gap-1">
                              <Edit3 className="w-3.5 h-3.5 group-hover:text-blue-600" />
                              <button
                                onClick={(e) => handleDeleteItem(item.id, e)}
                                className="p-1 hover:text-rose-600 transition-colors"
                                title="Delete Item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Quick "+ Add Item" Card */}
                    <button
                      onClick={() => setItemModalOpen(true)}
                      className="p-5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-emerald-700 cursor-pointer min-h-[120px]"
                    >
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                        <Plus className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <span className="text-xs font-bold">New Item</span>
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
