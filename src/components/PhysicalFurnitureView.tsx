import React, { useState, useRef } from 'react';
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
  Star, 
  Edit3,
  Camera,
  Image as ImageIcon,
  Zap
} from 'lucide-react';

function cleanContainerName(name: string): string {
  // Clean off parenthetical comments like "(Cables & Adapters)" for clean visual display
  return name.replace(/\s*\(.*?\)\s*/g, '').trim();
}

export const PhysicalFurnitureView: React.FC = () => {
  const {
    selectedFurnitureId,
    setSelectedFurnitureId,
    setSelectedContainerId,
    setItemModalOpen,
  } = useAppStore();

  const { isSearching, matchingContainerIds, matchingItemIds, matchCountsByContainer } = useVisualSearch();

  const [showAllItems, setShowAllItems] = useState(false);
  const [viewMode, setViewMode] = useState<'model' | 'photo'>('model');
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotType, setNewSlotType] = useState<Container['type']>('drawer');
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  // Group items by container (counting unique item entries)
  const itemCountMap = new Map<string, number>();
  for (const item of allItems) {
    itemCountMap.set(item.containerId, (itemCountMap.get(item.containerId) || 0) + 1);
  }

  // Top-level sections (e.g. drawers, boxes, shelves directly belonging to furniture)
  const topLevelContainers = containers.filter((c) => !c.parentContainerId);

  // Handle uploading / capturing real furniture photo
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl && furniture) {
        await db.furniture.update(furniture.id, { photoDataUrl: dataUrl });
        setViewMode('photo');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    if (furniture) {
      await db.furniture.update(furniture.id, { photoDataUrl: undefined });
      setViewMode('model');
    }
  };

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

  // Determine physical facade layout:
  // 1. Explicit layout if set on furniture
  // 2. Or 'horizontal_row' if 2-3 drawers and furniture width >= 4 (like console, desk, credenza)
  // 3. Or 'grid' if 4+ containers or bookshelf
  // 4. Otherwise 'vertical_stack'
  const isHorizontalRow =
    furniture.facadeLayout === 'horizontal_row' ||
    ((topLevelContainers.length === 2 || topLevelContainers.length === 3) &&
      (furniture.type === 'cabinet' || furniture.type === 'desk' || furniture.type === 'dresser' || (furniture.dimension?.width || 0) >= 4));

  const isGrid =
    furniture.facadeLayout === 'grid' ||
    (!isHorizontalRow && (furniture.type === 'bookshelf' || topLevelContainers.length >= 4));

  return (
    <div className="flex-1 min-h-0 w-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      {/* Hidden file input for camera / photo upload */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoChange}
        className="hidden"
      />

      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between shadow-xs flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            data-action="back-to-room"
            onClick={() => setSelectedFurnitureId(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600 stroke-[2.5]" />
            <span>Room</span>
          </button>

          <div className="flex items-center gap-1.5 min-w-0">
            <span
              style={{ backgroundColor: furniture.color || '#475569' }}
              className="w-3 h-3 rounded-md shadow-xs flex-shrink-0"
            />
            <h1 className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight truncate">
              {furniture.name}
            </h1>
          </div>
        </div>

        {/* Header Actions: Photo Toggle & All Items */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {furniture.photoDataUrl ? (
            <button
              onClick={() => setViewMode(viewMode === 'model' ? 'photo' : 'model')}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                viewMode === 'photo' 
                  ? 'bg-purple-600 text-white shadow-purple-500/20' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="Toggle between semi-3D visual layout and real furniture photo"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{viewMode === 'photo' ? '3D View' : 'Real Photo'}</span>
            </button>
          ) : (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-xs"
              title="Take or upload a real photo of this furniture"
            >
              <Camera className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">+ Photo</span>
            </button>
          )}

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
            <span>{showAllItems ? 'Visual' : `All (${allItems.length})`}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y w-full p-4 sm:p-6 pb-36 sm:pb-16 flex flex-col items-center">
        {showAllItems ? (
          /* Flat All Items List Mode */
          <div className="w-full max-w-2xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                All {allItems.length} unique items inside {furniture.name}
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
                            <span>{cleanContainerName(container.name)}</span>
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
        ) : viewMode === 'photo' && furniture.photoDataUrl ? (
          /* Real-World Furniture Photo Mode */
          <div className="w-full max-w-xl flex flex-col items-center gap-4">
            <div className="relative w-full rounded-3xl overflow-hidden border-4 border-white shadow-2xl bg-black/5">
              <img 
                src={furniture.photoDataUrl} 
                alt={furniture.name} 
                className="w-full max-h-[380px] object-cover"
              />
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white text-xs font-bold hover:bg-black/80 transition-all cursor-pointer flex items-center gap-1 shadow-md"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Change</span>
                </button>
                <button
                  onClick={handleRemovePhoto}
                  className="p-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white hover:text-rose-400 hover:bg-black/80 transition-all cursor-pointer shadow-md"
                  title="Remove Photo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quick Drawer Selectors under Photo */}
            <div className="w-full flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 text-center">
                Tap a drawer or compartment to open
              </span>
              <div className={isHorizontalRow ? 'grid grid-cols-3 gap-2.5' : isGrid ? 'grid grid-cols-2 sm:grid-cols-4 gap-2.5' : 'flex flex-col gap-2'}>
                {topLevelContainers.map((container) => {
                  const directCount = itemCountMap.get(container.id) || 0;
                  const children = containers.filter((c) => c.parentContainerId === container.id);
                  const childCount = children.reduce((acc, c) => acc + (itemCountMap.get(c.id) || 0), 0);
                  const totalCount = directCount + childCount;
                  const isMatch = isSearching && matchingContainerIds.has(container.id);
                  const matchCount = matchCountsByContainer.get(container.id) || 0;

                  return (
                    <button
                      key={container.id}
                      onClick={() => setSelectedContainerId(container.id)}
                      className={`p-3 rounded-2xl border-2 font-extrabold text-xs transition-all flex flex-col items-center gap-1 shadow-sm active:scale-95 cursor-pointer ${
                        isMatch 
                          ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-300' 
                          : 'bg-white text-slate-800 border-slate-200 hover:border-blue-500 hover:shadow-md'
                      }`}
                    >
                      <span className="truncate w-full text-center">{cleanContainerName(container.name)}</span>
                      {isMatch ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-600 text-white font-black">
                          ⚡ {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                          {totalCount} {totalCount === 1 ? 'item' : 'items'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Semi-3D Physical Furniture Facade */
          <div className="w-full max-w-xl flex flex-col items-center gap-4 sm:gap-5">
            <div className="text-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                Tap a drawer or compartment to open
              </span>
            </div>

            {/* Realistic Semi-3D Furniture Shell */}
            <div className="w-full flex flex-col items-center">
              {/* Top Crown / Tabletop Slab (Realistic Bevel & Sheen) */}
              <div 
                style={{ backgroundColor: furniture.color || '#0f766e' }}
                className="w-[99%] h-4 sm:h-5 rounded-t-2xl shadow-sm border-t border-x border-white/40 relative overflow-hidden flex items-center justify-center"
              >
                {/* Light reflection sheen on top ledge */}
                <div className="absolute inset-x-0 top-0 h-[2px] bg-white/50" />
                <div className="w-16 h-1 rounded-full bg-white/20" />
              </div>

              {/* Main Cabinet Frame Housing */}
              <div
                style={{
                  backgroundColor: `${furniture.color || '#0f766e'}1a`,
                  borderColor: furniture.color || '#0f766e',
                }}
                className="w-full rounded-2xl p-3 sm:p-4 border-4 shadow-2xl relative"
              >
                {topLevelContainers.length === 0 ? (
                  <div className="bg-white/85 rounded-2xl p-8 text-center flex flex-col items-center gap-3">
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
                  /* Spatial Layout: Side-by-Side Horizontal Row for Consoles, Grid for Shelves */
                  <div className={
                    isHorizontalRow
                      ? 'grid grid-cols-3 gap-2 sm:gap-3.5'
                      : isGrid
                      ? 'grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5'
                      : 'flex flex-col gap-3'
                  }>
                    {topLevelContainers.map((container) => {
                      const directCount = itemCountMap.get(container.id) || 0;
                      const children = containers.filter((c) => c.parentContainerId === container.id);
                      const childCount = children.reduce((acc, c) => acc + (itemCountMap.get(c.id) || 0), 0);
                      const totalCount = directCount + childCount;

                      const isMatch = isSearching && matchingContainerIds.has(container.id);
                      const isDimmed = isSearching && !isMatch;
                      const matchCount = matchCountsByContainer.get(container.id) || 0;

                      const isDrawer = container.type === 'drawer';
                      const isBox = container.type === 'box' || container.type === 'bin';

                      // Render Tactile Horizontal Drawer Face
                      if (isHorizontalRow) {
                        return (
                          <div
                            key={container.id}
                            onClick={() => setSelectedContainerId(container.id)}
                            className={`relative rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between items-center text-center cursor-pointer transition-all duration-200 group active:scale-95 min-h-[120px] sm:min-h-[145px] select-none ${
                              isMatch
                                ? 'ring-4 ring-amber-400 bg-amber-50/95 border-2 border-amber-400 shadow-xl shadow-amber-300/50 scale-[1.02] z-10'
                                : isDrawer
                                ? 'bg-gradient-to-b from-white via-slate-50 to-slate-100 border-2 border-slate-300 hover:border-blue-500 shadow-md hover:shadow-xl'
                                : isBox
                                ? 'bg-gradient-to-b from-amber-50 via-amber-100/60 to-amber-100/90 border-2 border-amber-300 hover:border-amber-500 shadow-md hover:shadow-xl'
                                : 'bg-white border-2 border-slate-200 hover:border-emerald-500 shadow-md hover:shadow-xl'
                            } ${isDimmed ? 'opacity-30 grayscale-[30%]' : 'opacity-100'}`}
                          >
                            {/* Drawer Top Row: Corner screw & Unique Item Count Badge */}
                            <div className="w-full flex items-center justify-between pointer-events-none">
                              <div className={`w-2 h-2 rounded-full transition-colors ${
                                isMatch ? 'bg-amber-400' : 'bg-slate-300 group-hover:bg-blue-400'
                              }`} />
                              {isMatch ? (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-extrabold text-[10px] shadow-xs flex items-center gap-1 animate-pulse">
                                  <span>⚡</span>
                                  <span>{matchCount} {matchCount === 1 ? 'match' : 'matches'}</span>
                                </span>
                              ) : totalCount > 0 ? (
                                <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white font-mono text-[10px] sm:text-xs font-black shadow-xs">
                                  {totalCount}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  Empty
                                </span>
                              )}
                            </div>

                            {/* Centered Tactile Metallic Pull-Handle */}
                            <div className="my-auto py-2 flex flex-col items-center pointer-events-none">
                              {isDrawer ? (
                                <div className="flex flex-col items-center gap-1">
                                  <div className={`w-11 sm:w-16 h-2 rounded-full transition-all duration-200 shadow-inner border ${
                                    isMatch 
                                      ? 'bg-gradient-to-r from-amber-400 via-amber-200 to-amber-400 border-amber-400 shadow-amber-300/50' 
                                      : 'bg-gradient-to-r from-slate-300 via-slate-100 to-slate-300 border-slate-300 group-hover:from-blue-300 group-hover:to-blue-400'
                                  }`} />
                                </div>
                              ) : isBox ? (
                                <div className="w-8 h-2 rounded-md bg-amber-800/40 shadow-xs" />
                              ) : (
                                <div className="w-6 h-1 rounded-full bg-slate-300" />
                              )}
                            </div>

                            {/* Clean Spatial Label (Zero parenthetical noise) */}
                            <div className="w-full pointer-events-none">
                              <h3 className={`font-extrabold text-xs sm:text-sm tracking-tight truncate ${
                                isMatch ? 'text-amber-950 font-black' : 'text-slate-800 group-hover:text-blue-600'
                              }`}>
                                {cleanContainerName(container.name)}
                              </h3>
                            </div>
                          </div>
                        );
                      }

                      // Render Cubby / Grid / Stacked Drawer Face
                      return (
                        <div
                          key={container.id}
                          onClick={() => setSelectedContainerId(container.id)}
                          className={`relative rounded-2xl p-3.5 sm:p-4 transition-all duration-200 cursor-pointer shadow-md flex items-center justify-between group active:scale-[0.99] select-none ${
                            isMatch
                              ? 'ring-3 ring-amber-400 bg-amber-50/95 shadow-xl shadow-amber-300/40 border-2 border-amber-400 scale-[1.01]'
                              : isDrawer
                              ? 'bg-gradient-to-b from-white to-slate-50 border-2 border-slate-300 hover:border-blue-500 hover:shadow-xl'
                              : isBox
                              ? 'bg-gradient-to-b from-amber-50 to-amber-100/70 border-2 border-amber-300 hover:border-amber-500 hover:shadow-xl'
                              : 'bg-white border-2 border-slate-200 hover:border-emerald-500 hover:shadow-xl'
                          } ${isDimmed ? 'opacity-30 grayscale-[30%]' : 'opacity-100'}`}
                        >
                          {/* Tactile Drawer Handle (if drawer) */}
                          {isDrawer && (
                            <div className="absolute top-1.5 inset-x-0 flex justify-center pointer-events-none">
                              <div className={`w-14 h-1.5 rounded-full transition-colors shadow-inner ${
                                isMatch ? 'bg-amber-400' : 'bg-slate-300 group-hover:bg-blue-400'
                              }`} />
                            </div>
                          )}

                          {/* Clean Name without parenthetical comments */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${
                              isMatch ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 group-hover:bg-blue-50'
                            }`}>
                              {isDrawer ? (
                                <Archive className="w-5 h-5 text-blue-600" />
                              ) : isBox ? (
                                <Box className="w-5 h-5 text-amber-600" />
                              ) : (
                                <Layers className="w-5 h-5 text-emerald-600" />
                              )}
                            </div>
                            <div className="truncate min-w-0">
                              <h3 className={`font-extrabold text-sm sm:text-base transition-colors truncate ${
                                isMatch ? 'text-amber-950 font-black' : 'text-slate-800 group-hover:text-blue-600'
                              }`}>
                                {cleanContainerName(container.name)}
                              </h3>
                              {children.length > 0 && (
                                <div className="text-[11px] font-semibold text-slate-400">
                                  {children.length} compartments inside
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Unique Items Count Badge & Chevron */}
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
                    })}
                  </div>
                )}
              </div>

              {/* Realistic Sturdy Furniture Feet */}
              <div className="w-[94%] flex items-center justify-between px-3 -mt-1 pointer-events-none">
                <div 
                  style={{ backgroundColor: furniture.color || '#0f766e' }}
                  className="w-4 h-3 rounded-b-md shadow-md opacity-80"
                />
                <div 
                  style={{ backgroundColor: furniture.color || '#0f766e' }}
                  className="w-4 h-3 rounded-b-md shadow-md opacity-80"
                />
              </div>

              {/* Ambient Ground Shadow */}
              <div className="w-[90%] h-2 bg-slate-900/10 rounded-full blur-xs -mt-1" />
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
