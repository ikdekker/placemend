import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Container, Item } from '../types';
import { 
  ArrowLeft,
  Plus, 
  Trash2, 
  Edit3, 
  Package, 
  ChevronRight, 
  Layers, 
  X,
  Star,
  Box,
  Archive,
  FolderPlus,
  LayoutGrid
} from 'lucide-react';

export const FurnitureInspector: React.FC = () => {
  const {
    selectedFurnitureId,
    setSelectedFurnitureId,
    selectedContainerId,
    setSelectedContainerId,
    setItemModalOpen,
  } = useAppStore();

  // Navigation level: null = Physical cupboard elevation view; string = zoomed into container
  const [currentContainerId, setCurrentContainerId] = useState<string | null>(null);
  const [showAllItemsMode, setShowAllItemsMode] = useState(false);

  // Adding top-level slot or child compartment
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotType, setNewSlotType] = useState<Container['type']>('drawer');

  // Sync with store selectedContainerId (e.g. from Search modal locator)
  useEffect(() => {
    if (selectedContainerId) {
      setCurrentContainerId(selectedContainerId);
      setShowAllItemsMode(false);
    } else {
      setCurrentContainerId(null);
      setShowAllItemsMode(false);
    }
  }, [selectedFurnitureId, selectedContainerId]);

  const furniture = useLiveQuery(async () => {
    if (!selectedFurnitureId) return undefined;
    return await db.furniture.get(selectedFurnitureId);
  }, [selectedFurnitureId]);

  const containers = useLiveQuery(async () => {
    if (!selectedFurnitureId) return [];
    return await db.containers.where('furnitureId').equals(selectedFurnitureId).sortBy('orderIndex');
  }, [selectedFurnitureId]) || [];

  // All items across this furniture piece
  const allFurnitureItems = useLiveQuery(async () => {
    if (!selectedFurnitureId) return [];
    const conts = await db.containers.where('furnitureId').equals(selectedFurnitureId).toArray();
    const contIds = conts.map((c) => c.id);
    return await db.items.where('containerId').anyOf(contIds).toArray();
  }, [selectedFurnitureId]) || [];

  if (!selectedFurnitureId || !furniture) return null;

  // Build maps
  const containerMap = new Map<string, Container>(containers.map((c) => [c.id, c]));
  
  // Count items per container (including recursively in sub-compartments)
  const itemCountsByContainerId = new Map<string, number>();
  for (const item of allFurnitureItems) {
    itemCountsByContainerId.set(item.containerId, (itemCountsByContainerId.get(item.containerId) || 0) + item.quantity);
  }

  // Top-level containers (sections / drawers of the cupboard)
  const topLevelContainers = containers.filter((c) => !c.parentContainerId);

  // Active container if zoomed in
  const activeContainer = currentContainerId ? containerMap.get(currentContainerId) : null;

  // Sub-compartments inside active container
  const childCompartments = currentContainerId 
    ? containers.filter((c) => c.parentContainerId === currentContainerId)
    : [];

  // Items in active container (if at deepest level)
  const currentItems = currentContainerId 
    ? allFurnitureItems.filter((item) => item.containerId === currentContainerId)
    : [];

  // Handlers
  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotName.trim()) return;

    const newContainer: Container = {
      id: `cont-${Date.now()}`,
      furnitureId: selectedFurnitureId,
      parentContainerId: currentContainerId || undefined,
      name: newSlotName.trim(),
      type: currentContainerId ? 'compartment' : newSlotType,
      orderIndex: containers.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.containers.add(newContainer);
    setNewSlotName('');
    setIsAddingSlot(false);
    // If inside a drawer, zoom into the new compartment
    if (currentContainerId) {
      setCurrentContainerId(newContainer.id);
      setSelectedContainerId(newContainer.id);
    }
  };

  const handleDeleteContainer = async (containerId: string) => {
    if (window.confirm('Delete this drawer / compartment and its contents?')) {
      await db.transaction('rw', [db.containers, db.items], async () => {
        // Delete items in this container or its children
        const childIds = containers.filter((c) => c.parentContainerId === containerId).map((c) => c.id);
        const allTargetIds = [containerId, ...childIds];
        await db.items.where('containerId').anyOf(allTargetIds).delete();
        await db.containers.where('parentContainerId').equals(containerId).delete();
        await db.containers.delete(containerId);
      });
      if (currentContainerId === containerId) {
        const parent = containerMap.get(containerId)?.parentContainerId || null;
        setCurrentContainerId(parent);
        setSelectedContainerId(parent);
      }
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (window.confirm('Delete this item?')) {
      await db.items.delete(itemId);
    }
  };

  const handleToggleFavorite = async (item: Item) => {
    await db.items.update(item.id, {
      favorite: !item.favorite,
      updatedAt: Date.now(),
    });
  };

  // Step back up one level in hierarchy
  const handleStepBack = () => {
    if (showAllItemsMode) {
      setShowAllItemsMode(false);
      return;
    }
    if (activeContainer?.parentContainerId) {
      setCurrentContainerId(activeContainer.parentContainerId);
      setSelectedContainerId(activeContainer.parentContainerId);
    } else {
      setCurrentContainerId(null);
      setSelectedContainerId(null);
    }
  };

  const getSlotIcon = (type: Container['type']) => {
    switch (type) {
      case 'drawer':
        return <Archive className="w-4 h-4 text-blue-600" />;
      case 'box':
      case 'bin':
        return <Box className="w-4 h-4 text-amber-600" />;
      case 'compartment':
        return <LayoutGrid className="w-4 h-4 text-purple-600" />;
      default:
        return <Layers className="w-4 h-4 text-emerald-600" />;
    }
  };

  return (
    <>
      {/* Mobile Backdrop to easily dismiss drawer by tapping outside */}
      <div 
        onClick={() => {
          setSelectedFurnitureId(null);
          setCurrentContainerId(null);
        }}
        className="md:hidden fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 transition-opacity"
      />

      <aside className="fixed md:static inset-x-0 bottom-0 z-50 md:z-10 w-full md:w-96 max-h-[82vh] md:max-h-full bg-white border-t md:border-t-0 md:border-l border-slate-200 flex flex-col rounded-t-3xl md:rounded-none shadow-2xl md:shadow-xl overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-right duration-200">
        {/* Mobile Drawer Grab Handle */}
        <div 
          onClick={() => {
            setSelectedFurnitureId(null);
            setCurrentContainerId(null);
          }}
          className="md:hidden w-full flex items-center justify-center pt-2.5 pb-1 bg-slate-50/80 cursor-pointer"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header with Hierarchical Breadcrumb */}
        <div className="p-3 sm:p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/90 backdrop-blur-md">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {(currentContainerId !== null || showAllItemsMode) && (
              <button
                onClick={handleStepBack}
                className="p-1.5 -ml-1 text-slate-500 hover:text-blue-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer flex-shrink-0"
                title="Back up one level"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            <div 
              style={{ backgroundColor: furniture.color || '#3b82f6' }}
              className="w-3.5 h-3.5 rounded-md flex-shrink-0 shadow-2xs"
            />

            <div className="truncate min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate">
                <span className="truncate">{furniture.name}</span>
                {activeContainer && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="font-bold text-slate-900 truncate">{activeContainer.name}</span>
                  </>
                )}
                {showAllItemsMode && (
                  <>
                    <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="font-bold text-blue-600">All Items</span>
                  </>
                )}
              </div>
              <h2 className="font-bold text-sm sm:text-base text-slate-900 truncate leading-tight">
                {showAllItemsMode 
                  ? 'All Stored Items'
                  : activeContainer 
                    ? activeContainer.name 
                    : furniture.name}
              </h2>
            </div>
          </div>

          <button
            onClick={() => {
              setSelectedFurnitureId(null);
              setCurrentContainerId(null);
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer flex-shrink-0 ml-1"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-slate-50/50">

          {/* MODE A: Show All Items in Cupboard Overview */}
          {showAllItemsMode ? (
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  {allFurnitureItems.length} {allFurnitureItems.length === 1 ? 'item' : 'items'} in this cupboard
                </span>
                <button
                  onClick={() => setShowAllItemsMode(false)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer"
                >
                  View Physical Layout
                </button>
              </div>

              {allFurnitureItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <Package className="w-8 h-8 stroke-1 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-medium text-slate-600">No items stored in this furniture yet</p>
                </div>
              ) : (
                allFurnitureItems.map((item) => {
                  const cont = containerMap.get(item.containerId);
                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {item.name}
                          </h4>
                          {item.quantity > 1 && (
                            <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded-full">
                              ×{item.quantity}
                            </span>
                          )}
                        </div>
                        {cont && (
                          <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                            📍 {cont.name}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleFavorite(item)}
                          className={`p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ${
                            item.favorite ? 'text-amber-500 fill-amber-500' : 'text-slate-300 hover:text-slate-500'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedContainerId(item.containerId);
                            setItemModalOpen(true, item.id);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : currentContainerId === null ? (
            /* MODE B: Top-Level Physical Elevation View of Cupboard / Segments */
            <div className="p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-mono uppercase font-bold tracking-wider text-slate-500">
                    Physical Layout & Sections
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tap any drawer or shelf to zoom in
                  </p>
                </div>

                <button
                  onClick={() => setIsAddingSlot(!isAddingSlot)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Slot</span>
                </button>
              </div>

              {/* Add Slot Form */}
              {isAddingSlot && (
                <form onSubmit={handleAddSlot} className="p-2.5 bg-white rounded-xl border border-slate-300 shadow-xs flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Top Drawer, Shelf 2, Plastic Bin"
                    value={newSlotName}
                    onChange={(e) => setNewSlotName(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-50 text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={newSlotType}
                      onChange={(e) => setNewSlotType(e.target.value as Container['type'])}
                      className="bg-slate-50 text-slate-900 text-xs px-2 py-1.5 rounded-lg border border-slate-300 focus:outline-none"
                    >
                      <option value="drawer">Drawer</option>
                      <option value="shelf">Shelf</option>
                      <option value="box">Box / Bin</option>
                      <option value="top_surface">Top Surface</option>
                      <option value="compartment">Compartment</option>
                    </select>
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingSlot(false)}
                      className="text-slate-500 hover:text-slate-800 text-xs py-1 px-2 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Tactile Physical Layout: Drawers, Shelves, Bins */}
              <div className="space-y-2 pt-1">
                {topLevelContainers.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Layers className="w-8 h-8 stroke-1 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-600">No drawers or shelves defined</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click "+ Add Slot" above to define where items can be stored.
                    </p>
                  </div>
                ) : (
                  topLevelContainers.map((cont) => {
                    const count = itemCountsByContainerId.get(cont.id) || 0;
                    const subCount = containers.filter((c) => c.parentContainerId === cont.id).length;

                    return (
                      <div
                        key={cont.id}
                        onClick={() => {
                          setCurrentContainerId(cont.id);
                          setSelectedContainerId(cont.id);
                        }}
                        className="group relative p-3.5 bg-white hover:bg-blue-50/50 active:bg-blue-100/50 rounded-2xl border-2 border-slate-200 hover:border-blue-400 shadow-sm hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3"
                      >
                        {/* Drawer handle / slot visual bar */}
                        {cont.type === 'drawer' && (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-1 rounded-full bg-slate-200 group-hover:bg-blue-400 transition-colors pointer-events-none opacity-60" />
                        )}

                        <div className="flex items-center gap-3 min-w-0 z-10">
                          <div className="p-2 rounded-xl bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                            {getSlotIcon(cont.type)}
                          </div>
                          <div className="truncate">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-blue-600 truncate transition-colors">
                              {cont.name}
                            </h4>
                            <p className="text-[10px] text-slate-400 uppercase font-mono mt-0.5">
                              {cont.type.replace('_', ' ')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 z-10 flex-shrink-0">
                          {subCount > 0 ? (
                            <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                              {subCount} compartments
                            </span>
                          ) : count > 0 ? (
                            <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                              {count} {count === 1 ? 'item' : 'items'}
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400">
                              Empty
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Escape hatch button: Show all items in cupboard */}
              <div className="pt-3 border-t border-slate-200 flex justify-center">
                <button
                  onClick={() => setShowAllItemsMode(true)}
                  className="text-xs font-bold text-slate-600 hover:text-blue-600 py-2 px-3 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Package className="w-4 h-4 text-slate-400" />
                  <span>Show all items in cupboard ({allFurnitureItems.length})</span>
                </button>
              </div>
            </div>
          ) : childCompartments.length > 0 ? (
            /* MODE C: Intermediate Zoom - Drawer has nested Sub-compartments */
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-mono uppercase font-bold tracking-wider text-slate-500">
                    Compartments inside {activeContainer?.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tap a compartment to view contents
                  </p>
                </div>

                <button
                  onClick={() => setIsAddingSlot(!isAddingSlot)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Divider</span>
                </button>
              </div>

              {/* Add Compartment Form */}
              {isAddingSlot && (
                <form onSubmit={handleAddSlot} className="p-2.5 bg-white rounded-xl border border-slate-300 shadow-xs flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Left Divider, Tray A, Small Bins"
                    value={newSlotName}
                    onChange={(e) => setNewSlotName(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-50 text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                    >
                      Add Compartment
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingSlot(false)}
                      className="text-slate-500 hover:text-slate-800 text-xs py-1 px-2 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Grid of Sub-compartments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {childCompartments.map((comp) => {
                  const count = itemCountsByContainerId.get(comp.id) || 0;
                  return (
                    <div
                      key={comp.id}
                      onClick={() => {
                        setCurrentContainerId(comp.id);
                        setSelectedContainerId(comp.id);
                      }}
                      className="group p-3 bg-white hover:bg-purple-50/50 rounded-xl border-2 border-slate-200 hover:border-purple-400 shadow-xs transition-all cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <LayoutGrid className="w-4 h-4 text-purple-600 flex-shrink-0" />
                        <span className="text-xs font-bold text-slate-800 group-hover:text-purple-700 truncate">
                          {comp.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* MODE D: Deepest Level - Items List inside specific drawer or compartment */
            <div className="flex-1 flex flex-col min-h-0">
              {/* Drawer Top Action Bar */}
              <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {activeContainer?.name}
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                    {currentItems.length} {currentItems.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (activeContainer) {
                        setSelectedContainerId(activeContainer.id);
                        setItemModalOpen(true, null);
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                    title="Add Item here"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>New Item</span>
                  </button>

                  <button
                    onClick={() => setIsAddingSlot(!isAddingSlot)}
                    className="p-1.5 text-slate-400 hover:text-purple-600 rounded-lg hover:bg-purple-50 transition-colors cursor-pointer"
                    title="Divide drawer into compartments"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      if (activeContainer) handleDeleteContainer(activeContainer.id);
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Delete Drawer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sub-divide into compartments prompt if triggered */}
              {isAddingSlot && (
                <form onSubmit={handleAddSlot} className="m-3 p-2.5 bg-white rounded-xl border border-purple-300 shadow-xs flex flex-col gap-2">
                  <span className="text-[11px] font-bold text-purple-700">Add Compartment Divider</span>
                  <input
                    type="text"
                    placeholder="e.g. Left Divider, Front Tray, Small Parts Box"
                    value={newSlotName}
                    onChange={(e) => setNewSlotName(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-50 text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:border-purple-500 font-medium"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                    >
                      Divide
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingSlot(false)}
                      className="text-slate-500 hover:text-slate-800 text-xs py-1 px-2 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Clean Item List (Visual Simplicity - NO TAGS OR CATEGORY CHIPS) */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {currentItems.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center p-4 text-slate-400">
                    <Package className="w-8 h-8 stroke-1 text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-600">This slot is empty</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Click "+ New Item" to place something here.
                    </p>
                  </div>
                ) : (
                  currentItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-white hover:bg-slate-50/80 border border-slate-200 transition-all flex items-center justify-between gap-3 shadow-2xs group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {item.name}
                          </h4>
                          {item.quantity > 1 && (
                            <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded-full">
                              ×{item.quantity}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-slate-500 truncate mt-0.5 font-normal">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleToggleFavorite(item)}
                          className={`p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ${
                            item.favorite ? 'text-amber-500 fill-amber-500' : 'text-slate-300 hover:text-slate-500'
                          }`}
                          title="Toggle Favorite"
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={() => {
                            if (activeContainer) {
                              setSelectedContainerId(activeContainer.id);
                              setItemModalOpen(true, item.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit Item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
