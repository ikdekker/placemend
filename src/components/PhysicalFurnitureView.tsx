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
  Zap,
  Sliders,
  ArrowRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Check
} from 'lucide-react';

function cleanContainerName(name: string): string {
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
  const [isComposing, setIsComposing] = useState(false);
  const [addingToCol, setAddingToCol] = useState<number | null>(null);
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

  // Determine number of columns (1 to 4)
  const numColumns = Math.max(1, Math.min(4, furniture.columns || 3));

  // Organize containers into columns
  const columns: Container[][] = Array.from({ length: numColumns }, () => []);
  topLevelContainers.forEach((container, idx) => {
    let colIdx = container.columnIndex;
    if (colIdx === undefined || colIdx < 0 || colIdx >= numColumns) {
      colIdx = idx % numColumns;
    }
    columns[colIdx].push(container);
  });

  // Sort each column's stack by orderIndex
  columns.forEach((col) => col.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)));

  // Column count updater
  const handleSetColumns = async (cols: number) => {
    if (!furniture) return;
    await db.furniture.update(furniture.id, { columns: cols });
    // Rebalance any containers that were in out-of-bounds columns
    for (const c of topLevelContainers) {
      if ((c.columnIndex ?? 0) >= cols) {
        await db.containers.update(c.id, { columnIndex: cols - 1 });
      }
    }
  };

  // Reordering handlers for Compose Mode
  const handleMoveColumn = async (container: Container, delta: number) => {
    const currentCol = container.columnIndex ?? 0;
    const newCol = Math.max(0, Math.min(numColumns - 1, currentCol + delta));
    if (newCol === currentCol) return;

    const targetColContainers = topLevelContainers.filter(c => (c.columnIndex ?? 0) === newCol);
    await db.containers.update(container.id, {
      columnIndex: newCol,
      orderIndex: targetColContainers.length,
      updatedAt: Date.now(),
    });
  };

  const handleMoveStack = async (container: Container, delta: number) => {
    const colIdx = container.columnIndex ?? 0;
    const colContainers = topLevelContainers
      .filter(c => (c.columnIndex ?? 0) === colIdx)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    const currentIndex = colContainers.findIndex(c => c.id === container.id);
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= colContainers.length) return;

    const otherContainer = colContainers[targetIndex];
    await db.containers.update(container.id, { orderIndex: otherContainer.orderIndex || 0 });
    await db.containers.update(otherContainer.id, { orderIndex: container.orderIndex || 0 });
  };

  const handleDeleteContainer = async (containerId: string) => {
    await db.containers.delete(containerId);
    // Delete any subcompartments or items stored inside
    const childConts = await db.containers.where('parentContainerId').equals(containerId).toArray();
    for (const child of childConts) {
      await db.containers.delete(child.id);
      await db.items.where('containerId').equals(child.id).delete();
    }
    await db.items.where('containerId').equals(containerId).delete();
  };

  // Preset compositions
  const handleApplyPreset = async (preset: '3_side_by_side' | '2_left_2_mid_1_right' | '2x2_grid' | 'dresser_stack') => {
    if (!furniture) return;

    if (preset === '3_side_by_side') {
      await db.furniture.update(furniture.id, { columns: 3 });
      for (let i = 0; i < topLevelContainers.length; i++) {
        await db.containers.update(topLevelContainers[i].id, {
          columnIndex: Math.min(2, i),
          orderIndex: 0,
        });
      }
    } else if (preset === '2_left_2_mid_1_right') {
      await db.furniture.update(furniture.id, { columns: 3 });
      const existing = [...topLevelContainers];
      const distribution = [
        { col: 0, order: 0 },
        { col: 0, order: 1 },
        { col: 1, order: 0 },
        { col: 1, order: 1 },
        { col: 2, order: 0 },
      ];

      for (let i = 0; i < existing.length && i < distribution.length; i++) {
        await db.containers.update(existing[i].id, {
          columnIndex: distribution[i].col,
          orderIndex: distribution[i].order,
        });
      }

      if (existing.length < 5) {
        for (let i = existing.length; i < 5; i++) {
          await db.containers.add({
            id: `cont-${Date.now()}-${i}`,
            furnitureId: furniture.id,
            name: `Drawer ${i + 1}`,
            type: 'drawer',
            columnIndex: distribution[i].col,
            orderIndex: distribution[i].order,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
    } else if (preset === '2x2_grid') {
      await db.furniture.update(furniture.id, { columns: 2 });
      const existing = [...topLevelContainers];
      const distribution = [
        { col: 0, order: 0 },
        { col: 0, order: 1 },
        { col: 1, order: 0 },
        { col: 1, order: 1 },
      ];
      for (let i = 0; i < existing.length && i < distribution.length; i++) {
        await db.containers.update(existing[i].id, {
          columnIndex: distribution[i].col,
          orderIndex: distribution[i].order,
        });
      }
    } else if (preset === 'dresser_stack') {
      await db.furniture.update(furniture.id, { columns: 1 });
      for (let i = 0; i < topLevelContainers.length; i++) {
        await db.containers.update(topLevelContainers[i].id, {
          columnIndex: 0,
          orderIndex: i,
        });
      }
    }
  };

  // Add slot to specific column
  const handleAddSlotToColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingToCol === null) return;

    const colContainers = columns[addingToCol] || [];
    const newContainer: Container = {
      id: `cont-${Date.now()}`,
      furnitureId: furniture.id,
      name: newSlotName.trim() || `Drawer ${topLevelContainers.length + 1}`,
      type: newSlotType,
      columnIndex: addingToCol,
      orderIndex: colContainers.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.containers.add(newContainer);
    setNewSlotName('');
    setAddingToCol(null);
  };

  // Photo handlers
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

  return (
    <div className="flex-1 min-h-0 w-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoChange}
        className="hidden"
      />

      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 px-3.5 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between shadow-xs flex-shrink-0 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            data-action="back-to-room"
            onClick={() => setSelectedFurnitureId(null)}
            className="flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-xs active:scale-95 flex-shrink-0 min-h-[42px]"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 stroke-[2.5]" />
            <span>Room</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span
              style={{ backgroundColor: furniture.color || '#475569' }}
              className="w-3.5 h-3.5 rounded-lg shadow-xs flex-shrink-0"
            />
            <h1 className="font-extrabold text-sm sm:text-lg text-slate-900 tracking-tight truncate">
              {furniture.name}
            </h1>
          </div>
        </div>

        {/* Header Actions: Compose Layout, Photo, & All Items */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => {
              setIsComposing(!isComposing);
              if (showAllItems) setShowAllItems(false);
            }}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs min-h-[42px] ${
              isComposing 
                ? 'bg-blue-600 text-white shadow-blue-500/20 ring-2 ring-blue-400' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Configure drawer layout and composition"
          >
            <Sliders className="w-4 h-4" />
            <span>{isComposing ? 'Done' : 'Layout'}</span>
          </button>

          {furniture.photoDataUrl ? (
            <button
              onClick={() => setViewMode(viewMode === 'model' ? 'photo' : 'model')}
              className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs min-h-[42px] ${
                viewMode === 'photo' 
                  ? 'bg-purple-600 text-white shadow-purple-500/20' 
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">{viewMode === 'photo' ? '3D View' : 'Photo'}</span>
            </button>
          ) : (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs min-h-[42px]"
              title="Add a real photo"
            >
              <Camera className="w-4 h-4 text-blue-600" />
            </button>
          )}

          <button
            data-action="toggle-all-items"
            onClick={() => {
              setShowAllItems(!showAllItems);
              if (isComposing) setIsComposing(false);
            }}
            className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs min-h-[42px] ${
              showAllItems 
                ? 'bg-blue-600 text-white shadow-blue-500/20' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            {showAllItems ? <Grid className="w-4 h-4" /> : <List className="w-4 h-4" />}
            <span>{showAllItems ? 'Visual' : `All (${allItems.length})`}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y w-full p-3 sm:p-6 pb-36 sm:pb-16 flex flex-col items-center">
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
        ) : isComposing ? (
          /* ============================================================ */
          /* INTERACTIVE LAYOUT COMPOSER (CUSTOM DRAWERS & COLUMNS SETUP) */
          /* ============================================================ */
          <div className="w-full max-w-2xl flex flex-col gap-4 animate-in fade-in duration-200">
            {/* Composer Toolbar */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">Customize Drawer Setup</h3>
                  <p className="text-xs sm:text-sm text-slate-500">Configure columns and stack drawers in any layout</p>
                </div>
                <button
                  onClick={() => setIsComposing(false)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-sm cursor-pointer min-h-[38px]"
                >
                  Done
                </button>
              </div>

              {/* Column Count Buttons */}
              <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 flex-wrap gap-2">
                <span className="text-xs sm:text-sm font-bold text-slate-600">Columns:</span>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4].map((cols) => (
                    <button
                      key={cols}
                      onClick={() => handleSetColumns(cols)}
                      className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer min-h-[40px] ${
                        numColumns === cols
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {cols} {cols === 1 ? 'Column' : 'Cols'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-col gap-2 pt-2.5 border-t border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Presets:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => handleApplyPreset('3_side_by_side')}
                    className="p-2.5 sm:p-3 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 border border-slate-200 text-xs font-bold text-center cursor-pointer transition-all min-h-[44px] flex items-center justify-center"
                  >
                    3 Side-by-Side
                  </button>
                  <button
                    onClick={() => handleApplyPreset('2_left_2_mid_1_right')}
                    className="p-2.5 sm:p-3 rounded-xl bg-amber-50/80 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black text-center cursor-pointer transition-all shadow-xs min-h-[44px] flex items-center justify-center"
                    title="2 stacked on left, 2 stacked in middle, 1 on right"
                  >
                    2 Left, 2 Mid, 1 Right
                  </button>
                  <button
                    onClick={() => handleApplyPreset('2x2_grid')}
                    className="p-2.5 sm:p-3 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 border border-slate-200 text-xs font-bold text-center cursor-pointer transition-all min-h-[44px] flex items-center justify-center"
                  >
                    2x2 Grid
                  </button>
                  <button
                    onClick={() => handleApplyPreset('dresser_stack')}
                    className="p-2.5 sm:p-3 rounded-xl bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 border border-slate-200 text-xs font-bold text-center cursor-pointer transition-all min-h-[44px] flex items-center justify-center"
                  >
                    Dresser Stack
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive Columns Canvas */}
            <div className="w-full flex flex-col gap-2">
              <div 
                className="grid gap-2.5 sm:gap-3.5 w-full"
                style={{ gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))` }}
              >
                {columns.map((colContainers, colIdx) => (
                  <div 
                    key={colIdx} 
                    className="bg-white/85 backdrop-blur-xs rounded-2xl p-3 sm:p-3.5 border-2 border-slate-300/80 shadow-sm flex flex-col gap-2.5 min-h-[220px]"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-600">
                        {numColumns === 3 
                          ? (colIdx === 0 ? 'Left' : colIdx === 1 ? 'Middle' : 'Right')
                          : `Col ${colIdx + 1}`}
                      </span>
                      <span className="text-[11px] font-bold text-slate-400">
                        {colContainers.length} {colContainers.length === 1 ? 'slot' : 'slots'}
                      </span>
                    </div>

                    {/* Containers Stacked in this column */}
                    <div className="flex flex-col gap-2.5 flex-1">
                      {colContainers.map((container, itemIdx) => (
                        <div
                          key={container.id}
                          className="p-2.5 sm:p-3 rounded-xl bg-slate-50 border border-slate-200 shadow-xs flex flex-col gap-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-slate-800 truncate text-xs sm:text-sm">
                              {container.name}
                            </span>
                            <button
                              onClick={() => handleDeleteContainer(container.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 cursor-pointer min-w-[30px] min-h-[30px] flex items-center justify-center"
                              title="Delete drawer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Reordering Controls (Bigger thumb targets) */}
                          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                            {/* Column Move (Left / Right) */}
                            <div className="flex items-center gap-1.5">
                              <button
                                disabled={colIdx === 0}
                                onClick={() => handleMoveColumn(container, -1)}
                                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center transition-all ${
                                  colIdx > 0 
                                    ? 'bg-white border border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-400 active:scale-95 cursor-pointer shadow-xs' 
                                    : 'opacity-25 cursor-not-allowed bg-slate-100 border border-slate-200'
                                }`}
                                title="Move left to previous column"
                              >
                                ◀
                              </button>
                              <button
                                disabled={colIdx === numColumns - 1}
                                onClick={() => handleMoveColumn(container, 1)}
                                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center transition-all ${
                                  colIdx < numColumns - 1 
                                    ? 'bg-white border border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-400 active:scale-95 cursor-pointer shadow-xs' 
                                    : 'opacity-25 cursor-not-allowed bg-slate-100 border border-slate-200'
                                }`}
                                title="Move right to next column"
                              >
                                ▶
                              </button>
                            </div>

                            {/* Stack Move (Up / Down) */}
                            <div className="flex items-center gap-1.5">
                              <button
                                disabled={itemIdx === 0}
                                onClick={() => handleMoveStack(container, -1)}
                                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center transition-all ${
                                  itemIdx > 0 
                                    ? 'bg-white border border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-400 active:scale-95 cursor-pointer shadow-xs' 
                                    : 'opacity-25 cursor-not-allowed bg-slate-100 border border-slate-200'
                                }`}
                                title="Move up in stack"
                              >
                                ▲
                              </button>
                              <button
                                disabled={itemIdx === colContainers.length - 1}
                                onClick={() => handleMoveStack(container, 1)}
                                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center transition-all ${
                                  itemIdx < colContainers.length - 1 
                                    ? 'bg-white border border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-400 active:scale-95 cursor-pointer shadow-xs' 
                                    : 'opacity-25 cursor-not-allowed bg-slate-100 border border-slate-200'
                                }`}
                                title="Move down in stack"
                              >
                                ▼
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      {colContainers.length === 0 && (
                        <div className="flex-1 flex items-center justify-center text-center p-3 text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-xl min-h-[90px]">
                          No drawers
                        </div>
                      )}
                    </div>

                    {/* Column Specific Add Drawer Button */}
                    {addingToCol === colIdx ? (
                      <form onSubmit={handleAddSlotToColumn} className="flex flex-col gap-2 p-2.5 bg-blue-50 rounded-xl border border-blue-200">
                        <input
                          type="text"
                          placeholder="Drawer name..."
                          value={newSlotName}
                          onChange={(e) => setNewSlotName(e.target.value)}
                          autoFocus
                          className="w-full px-2.5 py-1.5 text-xs sm:text-sm rounded-lg border border-blue-300 bg-white font-medium"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="submit"
                            className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer min-h-[34px]"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddingToCol(null)}
                            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer min-h-[34px]"
                          >
                            ✕
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setAddingToCol(colIdx)}
                        className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/60 text-slate-600 hover:text-blue-600 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all min-h-[42px]"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : viewMode === 'photo' && furniture.photoDataUrl ? (
          /* Real-World Furniture Photo Mode */
          <div className="w-full max-w-2xl flex flex-col items-center gap-4">
            <div className="relative w-full rounded-3xl overflow-hidden border-4 border-white shadow-2xl bg-black/5">
              <img 
                src={furniture.photoDataUrl} 
                alt={furniture.name} 
                className="w-full max-h-[420px] object-cover"
              />
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md text-white text-xs sm:text-sm font-bold hover:bg-black/80 transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <Camera className="w-4 h-4" />
                  <span>Change</span>
                </button>
                <button
                  onClick={handleRemovePhoto}
                  className="p-2 rounded-xl bg-black/60 backdrop-blur-md text-white hover:text-rose-400 hover:bg-black/80 transition-all cursor-pointer shadow-md"
                  title="Remove Photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Drawer Selectors under Photo */}
            <div className="w-full flex flex-col gap-2.5">
              <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500 text-center">
                Tap a drawer to open
              </span>
              <div 
                className="grid gap-2.5 sm:gap-3 w-full"
                style={{ gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))` }}
              >
                {columns.map((colContainers, colIdx) => (
                  <div key={colIdx} className="flex flex-col gap-2.5">
                    {colContainers.map((container) => {
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
                          className={`p-3.5 sm:p-4 rounded-2xl border-2 font-extrabold text-xs sm:text-sm transition-all flex flex-col items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer min-h-[64px] justify-center ${
                            isMatch 
                              ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-3 ring-amber-300' 
                              : 'bg-white text-slate-800 border-slate-200 hover:border-blue-500 hover:shadow-md'
                          }`}
                        >
                          <span className="truncate w-full text-center">{cleanContainerName(container.name)}</span>
                          {isMatch ? (
                            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-600 text-white font-black">
                              ⚡ {matchCount}
                            </span>
                          ) : (
                            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                              {totalCount}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* PURE VISUAL SEMI-3D FURNITURE FACADE (ZERO TEXT ON DRAWERS)  */
          /* ============================================================ */
          <div className="w-full max-w-2xl flex flex-col items-center gap-4 sm:gap-6 px-1 sm:px-2">
            {/* Realistic Semi-3D Furniture Shell */}
            <div className="w-full flex flex-col items-center">
              {/* Top Crown / Tabletop Slab (Realistic Bevel & Sheen) */}
              <div 
                style={{ backgroundColor: furniture.color || '#0f766e' }}
                className="w-[99%] h-5 sm:h-6 rounded-t-2xl shadow-sm border-t border-x border-white/40 relative overflow-hidden flex items-center justify-center"
              >
                <div className="absolute inset-x-0 top-0 h-[2px] bg-white/50" />
                <div className="w-20 h-1.5 rounded-full bg-white/20" />
              </div>

              {/* Main Cabinet Frame Housing */}
              <div
                style={{
                  backgroundColor: `${furniture.color || '#0f766e'}1a`,
                  borderColor: furniture.color || '#0f766e',
                }}
                className="w-full rounded-2xl sm:rounded-3xl p-3 sm:p-5 border-4 shadow-2xl relative"
              >
                {topLevelContainers.length === 0 ? (
                  <div className="bg-white/85 rounded-2xl p-8 text-center flex flex-col items-center gap-3">
                    <Archive className="w-10 h-10 text-slate-300" />
                    <p className="text-slate-500 font-medium text-sm">
                      This cupboard doesn't have any drawers or shelves yet.
                    </p>
                    <button
                      onClick={() => setIsComposing(true)}
                      className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs sm:text-sm shadow-md min-h-[40px]"
                    >
                      Configure Layout
                    </button>
                  </div>
                ) : (
                  /* Multi-Column Multi-Stack Layout */
                  <div 
                    className="grid gap-2.5 sm:gap-4 w-full"
                    style={{ gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))` }}
                  >
                    {columns.map((colContainers, colIdx) => (
                      <div key={colIdx} className="flex flex-col gap-2.5 sm:gap-3.5 h-full justify-stretch">
                        {colContainers.length === 0 ? (
                          <div className="flex-1 min-h-[160px] sm:min-h-[200px] rounded-2xl border-2 border-dashed border-slate-300/60 bg-slate-50/40 flex items-center justify-center p-3 text-slate-300 text-xs font-bold pointer-events-none">
                            Empty
                          </div>
                        ) : (
                          colContainers.map((container) => {
                            const directCount = itemCountMap.get(container.id) || 0;
                            const children = containers.filter((c) => c.parentContainerId === container.id);
                            const childCount = children.reduce((acc, c) => acc + (itemCountMap.get(c.id) || 0), 0);
                            const totalCount = directCount + childCount;

                            const isMatch = isSearching && matchingContainerIds.has(container.id);
                            const isDimmed = isSearching && !isMatch;
                            const matchCount = matchCountsByContainer.get(container.id) || 0;

                            const isDrawer = container.type === 'drawer';
                            const isBox = container.type === 'box' || container.type === 'bin';

                            // Substantial height for single drawers, and flex-1 so asymmetric drawers match heights
                            const minHeightClass = colContainers.length === 1 
                              ? 'min-h-[180px] sm:min-h-[220px]' 
                              : colContainers.length === 2 
                              ? 'min-h-[125px] sm:min-h-[150px]' 
                              : 'min-h-[100px] sm:min-h-[120px]';

                            /* PURE VISUAL DRAWER FRONT: ZERO TEXT LABELS, BIGGER TACTILE TOUCH TARGET */
                            return (
                              <div
                                key={container.id}
                                onClick={() => setSelectedContainerId(container.id)}
                                className={`flex-1 relative rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col justify-between items-center text-center cursor-pointer transition-all duration-200 group active:scale-98 select-none ${minHeightClass} ${
                                  isMatch
                                    ? 'ring-4 ring-amber-400 bg-amber-50/95 border-2 border-amber-400 shadow-xl shadow-amber-300/50 scale-[1.02] z-10'
                                    : isDrawer
                                    ? 'bg-gradient-to-b from-white via-slate-50 to-slate-100 border-2 border-slate-300 hover:border-blue-500 shadow-md hover:shadow-xl'
                                    : isBox
                                    ? 'bg-gradient-to-b from-amber-50 via-amber-100/60 to-amber-100/90 border-2 border-amber-300 hover:border-amber-500 shadow-md hover:shadow-xl'
                                    : 'bg-white border-2 border-slate-200 hover:border-emerald-500 shadow-md hover:shadow-xl'
                                } ${isDimmed ? 'opacity-30 grayscale-[30%]' : 'opacity-100'}`}
                              >
                                {/* Top Pip Row: Subtle corner screw + Minimal Count Pip */}
                                <div className="w-full flex items-center justify-between pointer-events-none">
                                  <div className={`w-2 h-2 rounded-full transition-colors ${
                                    isMatch ? 'bg-amber-400' : 'bg-slate-300 group-hover:bg-blue-400'
                                  }`} />
                                  {isMatch ? (
                                    <span className="min-w-[32px] h-7 px-2.5 rounded-full bg-amber-500 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1 animate-pulse">
                                      <span>⚡</span>
                                      <span>{matchCount}</span>
                                    </span>
                                  ) : totalCount > 0 ? (
                                    <span className="min-w-[28px] h-7 px-2.5 rounded-full bg-slate-900 text-white font-mono text-xs sm:text-sm font-black shadow-md flex items-center justify-center">
                                      {totalCount}
                                    </span>
                                  ) : (
                                    <div className="w-2 h-2 rounded-full bg-slate-200" />
                                  )}
                                </div>

                                {/* Tactile Center Metallic Pull-Handle (Substantial 3D handle) */}
                                <div className="my-auto py-3 flex flex-col items-center pointer-events-none">
                                  {isDrawer ? (
                                    <div className={`w-16 sm:w-28 h-3.5 sm:h-4 rounded-full transition-all duration-200 shadow-md border-2 ${
                                      isMatch 
                                        ? 'bg-gradient-to-r from-amber-400 via-amber-100 to-amber-400 border-amber-500 shadow-amber-300/60' 
                                        : 'bg-gradient-to-r from-slate-300 via-white to-slate-300 border-slate-400/60 group-hover:from-blue-300 group-hover:via-white group-hover:to-blue-400 group-hover:border-blue-400 shadow-slate-400/30'
                                    }`}>
                                      <div className="w-3/4 h-[2px] mx-auto mt-[2px] rounded-full bg-white/70" />
                                    </div>
                                  ) : isBox ? (
                                    <div className="w-12 sm:w-16 h-3 sm:h-3.5 rounded-md bg-amber-800/40 shadow-xs border border-amber-900/20" />
                                  ) : (
                                    <div className="w-12 sm:w-16 h-2 rounded-full bg-slate-300" />
                                  )}
                                </div>

                                {/* Bottom Accent Screw */}
                                <div className="w-full flex justify-center pointer-events-none opacity-40">
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Realistic Sturdy Furniture Feet */}
              <div className="w-[94%] flex items-center justify-between px-4 -mt-1 pointer-events-none">
                <div 
                  style={{ backgroundColor: furniture.color || '#0f766e' }}
                  className="w-5 h-3.5 sm:w-6 sm:h-4 rounded-b-md shadow-md opacity-80"
                />
                <div 
                  style={{ backgroundColor: furniture.color || '#0f766e' }}
                  className="w-5 h-3.5 sm:w-6 sm:h-4 rounded-b-md shadow-md opacity-80"
                />
              </div>

              {/* Ambient Ground Shadow */}
              <div className="w-[90%] h-2.5 bg-slate-900/10 rounded-full blur-xs -mt-1" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
