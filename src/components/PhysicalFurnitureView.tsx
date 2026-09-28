import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Container, ContainerType } from '../types';
import { useVisualSearch } from '../hooks/useVisualSearch';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  List, 
  Grid, 
  Archive, 
  Star, 
  Edit3,
  Camera,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { ScanItemsModal } from './ScanItemsModal';
import { CompartmentEditSheet } from './CompartmentEditSheet';
import { BuildLayoutModal } from './BuildLayoutModal';
import { scheduleAutoSync } from '../services/apiSync';
import { effectiveContainerType, isOpenKind } from '../utils/containerKind';

function cleanContainerName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, '').trim();
}

export const PhysicalFurnitureView: React.FC = () => {
  const {
    selectedFurnitureId,
    setSelectedFurnitureId,
    setSelectedContainerId,
    setItemModalOpen,
    openDoorId,
    setOpenDoorId,
  } = useAppStore();

  const { isSearching, matchingContainerIds, matchingItemIds, matchCountsByContainer } = useVisualSearch();

  const [showAllItems, setShowAllItems] = useState(false);
  const [viewMode, setViewMode] = useState<'model' | 'photo'>('model');
  const [isComposing, setIsComposing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  // A door opened in place: its column shows what's behind it
  // Scan scoped to one compartment (e.g. the open door); null = whole furniture
  const [scanRootId, setScanRootId] = useState<string | null>(null);
  const [isBuildingLayout, setIsBuildingLayout] = useState(false);
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

  // --- Facade layout: surfaces become the top slab; the rest is drawn by what it really is ---
  const containerTotal = (container: Container) =>
    (itemCountMap.get(container.id) || 0) +
    containers.filter((c) => c.parentContainerId === container.id).reduce((acc, c) => acc + (itemCountMap.get(c.id) || 0), 0);

  const facadeTop = topLevelContainers
    .filter((c) => effectiveContainerType(c) === 'top_surface')
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  const facadeBodyAll = topLevelContainers.filter((c) => effectiveContainerType(c) !== 'top_surface');
  // Without an explicit column setting, don't spread one lower shelf over three empty columns
  const facadeNumColumns = Math.max(1, Math.min(4, furniture.columns || Math.min(3, facadeBodyAll.length || 1)));
  const facadeColumns: Container[][] = Array.from({ length: facadeNumColumns }, () => []);
  facadeBodyAll.forEach((container, idx) => {
    let colIdx = container.columnIndex;
    if (colIdx === undefined || colIdx < 0 || colIdx >= facadeNumColumns) colIdx = idx % facadeNumColumns;
    facadeColumns[colIdx].push(container);
  });
  facadeColumns.forEach((col) => col.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)));
  const facadeBody = facadeBodyAll;
  const facadeIsOpen = facadeBody.every((c) => isOpenKind(effectiveContainerType(c)));

  // --- Layout editing (in place on the front view) ---
  const touchLayout = () => scheduleAutoSync();

  // Give every compartment an explicit column/order (older data relies on implicit placement)
  const normalizeLayout = async () => {
    await db.furniture.update(furniture.id, { columns: facadeNumColumns });
    for (let col = 0; col < facadeColumns.length; col++) {
      for (let i = 0; i < facadeColumns[col].length; i++) {
        const c = facadeColumns[col][i];
        if (c.columnIndex !== col || c.orderIndex !== i) {
          await db.containers.update(c.id, { columnIndex: col, orderIndex: i });
        }
      }
    }
  };

  // Leaving edit mode: drop empty columns so the front doesn't keep blank gaps
  const compactLayout = async () => {
    const nonEmpty = facadeColumns.filter((col) => col.length > 0);
    const keptWidths = facadeColumns.map((_, i) => columnWidth(i)).filter((_, i) => facadeColumns[i].length > 0);
    await db.furniture.update(furniture.id, { columns: Math.max(1, nonEmpty.length), columnWidths: keptWidths, updatedAt: Date.now() });
    for (let col = 0; col < nonEmpty.length; col++) {
      for (let i = 0; i < nonEmpty[col].length; i++) {
        const c = nonEmpty[col][i];
        if (c.columnIndex !== col || c.orderIndex !== i) {
          await db.containers.update(c.id, { columnIndex: col, orderIndex: i, updatedAt: Date.now() });
        }
      }
    }
    touchLayout();
  };

  const toggleLayoutEditing = async () => {
    if (isComposing) {
      setEditingSlotId(null);
      await compactLayout();
      setIsComposing(false);
    } else {
      await normalizeLayout();
      setShowAllItems(false);
      setIsComposing(true);
    }
  };

  const addSlot = async (colIdx: number, type: ContainerType = 'drawer') => {
    const now = Date.now();
    const col = facadeColumns[colIdx] || [];
    const defaultName = { drawer: 'Drawer', cabinet_door: 'Door', shelf: 'Shelf', top_surface: 'Top' }[type as string] || 'Compartment';
    const id = `cont-${now}`;
    if (colIdx >= facadeNumColumns) {
      await db.furniture.update(furniture.id, { columns: colIdx + 1, updatedAt: now });
    }
    await db.containers.add({
      id,
      furnitureId: furniture.id,
      name: defaultName,
      type,
      columnIndex: colIdx,
      orderIndex: col.length,
      createdAt: now,
      updatedAt: now,
    });
    touchLayout();
    setEditingSlotId(id);
  };

  const slotPosition = (id: string) => {
    for (let col = 0; col < facadeColumns.length; col++) {
      const row = facadeColumns[col].findIndex((c) => c.id === id);
      if (row >= 0) return { col, row };
    }
    return null;
  };

  const moveSlot = async (container: Container, dx: number, dy: number) => {
    const pos = slotPosition(container.id);
    if (!pos) return;
    const now = Date.now();
    if (dy !== 0) {
      const column = facadeColumns[pos.col];
      const other = column[pos.row + dy];
      if (!other) return;
      await db.containers.update(container.id, { orderIndex: pos.row + dy, updatedAt: now });
      await db.containers.update(other.id, { orderIndex: pos.row, updatedAt: now });
    } else if (dx !== 0) {
      const target = pos.col + dx;
      if (target < 0 || target >= facadeNumColumns) return;
      await db.containers.update(container.id, { columnIndex: target, orderIndex: facadeColumns[target].length, updatedAt: now });
      // Close the gap left behind in the source column
      const rest = facadeColumns[pos.col].filter((c) => c.id !== container.id);
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].orderIndex !== i) await db.containers.update(rest[i].id, { orderIndex: i, updatedAt: now });
      }
    }
    touchLayout();
  };

  const updateSlot = async (id: string, patch: Partial<Container>) => {
    await db.containers.update(id, { ...patch, updatedAt: Date.now() });
    touchLayout();
  };

  const deleteSlot = async (id: string) => {
    setEditingSlotId(null);
    await handleDeleteContainer(id);
    touchLayout();
  };

  const editingSlot = editingSlotId ? containers.find((c) => c.id === editingSlotId) : undefined;
  const editingPos = editingSlot ? slotPosition(editingSlot.id) : null;

  const addTile = (colIdx: number, label = 'Add') => (
    <button
      key={`add-${colIdx}`}
      type="button"
      onClick={() => addSlot(colIdx)}
      className="w-full min-h-[48px] rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/60 hover:bg-blue-100 text-blue-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
    >
      <Plus className="w-4 h-4 stroke-[2.5]" />
      <span>{label}</span>
    </button>
  );

  // Tall furniture is drawn tall, so a wardrobe doesn't look like a sideboard
  const isTall = ['wardrobe', 'closet', 'bookshelf', 'storage_rack'].includes(furniture.type);
  const tallMinHeight = isTall ? '58vh' : undefined;

  // Relative column widths (PAX: [1, 2, 1] for a 50/100/50 cm combination)
  const columnWidth = (col: number) => furniture.columnWidths?.[col] || 1;
  // An open door's column gets at least double width while open, so its interior is readable
  const gridColumns = facadeColumns
    .map((col, i) => {
      const w = col.some((c) => c.id === openDoorId) ? Math.max(2, columnWidth(i)) : columnWidth(i);
      return `minmax(0, ${w}fr)`;
    })
    .join(' ');
  const setColumnWidth = async (col: number, width: number) => {
    const widths = Array.from({ length: facadeNumColumns }, (_, i) => columnWidth(i));
    widths[col] = width;
    await db.furniture.update(furniture.id, { columnWidths: widths, updatedAt: Date.now() });
    touchLayout();
  };

  // Compartments behind a door (or inside any compartment), top to bottom
  const childrenOf = (id: string) =>
    containers.filter((c) => c.parentContainerId === id).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

  const addInside = async (parentId: string) => {
    const now = Date.now();
    const id = `cont-${now}`;
    await db.containers.add({
      id,
      furnitureId: furniture.id,
      parentContainerId: parentId,
      name: 'Shelf',
      type: 'shelf',
      orderIndex: childrenOf(parentId).length,
      createdAt: now,
      updatedAt: now,
    });
    touchLayout();
    setEditingSlotId(id);
  };

  const moveInside = async (container: Container, dy: number) => {
    if (!container.parentContainerId) return;
    const siblings = childrenOf(container.parentContainerId);
    const idx = siblings.findIndex((c) => c.id === container.id);
    const other = siblings[idx + dy];
    if (!other) return;
    const now = Date.now();
    await db.containers.update(container.id, { orderIndex: idx + dy, updatedAt: now });
    await db.containers.update(other.id, { orderIndex: idx, updatedAt: now });
    touchLayout();
  };

  const tapFront = (container: Container) => {
    if (isComposing) return setEditingSlotId(container.id);
    // Doors with an interior open in place; everything else opens its item list
    if (effectiveContainerType(container) === 'cabinet_door' && childrenOf(container.id).length > 0) {
      return setOpenDoorId(openDoorId === container.id ? null : container.id);
    }
    setSelectedContainerId(container.id);
  };

  // An opened door: same place and size as the door, showing the interior behind it
  const renderOpenDoor = (door: Container) => {
    const inside = childrenOf(door.id);
    return (
      <div
        key={door.id}
        style={{ flex: '1 0 auto' }}
        className="relative min-h-[220px] sm:min-h-[260px] rounded-2xl sm:rounded-3xl bg-slate-100 border-2 border-blue-500 shadow-inner p-2 flex flex-col gap-1 animate-in fade-in duration-150"
      >
        <div className="flex items-center justify-between gap-1 pb-1">
          <span className="text-[11px] font-black text-slate-700 truncate">{cleanContainerName(door.name)}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isComposing && (
              <button
                type="button"
                onClick={() => setScanRootId(door.id)}
                className="p-1.5 rounded-lg bg-indigo-600 text-white cursor-pointer"
                title={`Scan ${door.name}`}
                aria-label={`Scan ${door.name}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpenDoorId(null)}
              className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-[11px] font-bold text-slate-700 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
        {inside.map((c) => renderSlot(c, inside.length, true, true))}
        {isComposing && (
          <button
            type="button"
            onClick={() => addInside(door.id)}
            className="w-full min-h-[44px] rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add inside</span>
          </button>
        )}
        {!isComposing && inside.length === 0 && (
          <button type="button" onClick={() => setSelectedContainerId(door.id)} className="flex-1 text-xs font-bold text-blue-700 cursor-pointer">
            Open items
          </button>
        )}
      </div>
    );
  };

  const renderFront = (container: Container, stackSize: number, openFrame: boolean) =>
    openDoorId === container.id ? renderOpenDoor(container) : renderSlot(container, stackSize, openFrame);

  const renderSlot = (container: Container, stackSize: number, openFrame: boolean, compact = false) => {
    const kind = effectiveContainerType(container);
    const totalCount = containerTotal(container);
    const isMatch = isSearching && matchingContainerIds.has(container.id);
    const isDimmed = isSearching && !isMatch;
    const matchCount = matchCountsByContainer.get(container.id) || 0;
    const color = furniture.color || '#0f766e';
    const minHeightClass = compact
      ? 'min-h-[52px] sm:min-h-[60px]'
      : kind === 'drawer' && stackSize > 1
      ? 'min-h-[64px] sm:min-h-[80px]'
      : stackSize === 1
      ? (openFrame ? 'min-h-[120px] sm:min-h-[150px]' : 'min-h-[180px] sm:min-h-[220px]')
      : stackSize === 2 ? 'min-h-[110px] sm:min-h-[140px]' : 'min-h-[92px] sm:min-h-[112px]';

    const frontClass = isMatch
      ? 'ring-4 ring-amber-400 bg-amber-50/95 border-2 border-amber-400 shadow-xl shadow-amber-300/50 z-10'
      : kind === 'drawer'
      ? 'bg-gradient-to-b from-white via-slate-50 to-slate-100 border-2 border-slate-300 hover:border-blue-500 shadow-md'
      : kind === 'cabinet_door'
      ? 'bg-gradient-to-br from-white to-slate-100 border-2 border-slate-300 hover:border-blue-500 shadow-md'
      : kind === 'box' || kind === 'bin'
      ? 'bg-gradient-to-b from-amber-50 via-amber-100/60 to-amber-100/90 border-2 border-amber-300 hover:border-amber-500 shadow-md'
      : openFrame
      ? 'bg-transparent hover:bg-white/50'
      : 'bg-slate-50/70 border-2 border-slate-200 hover:border-emerald-500 shadow-inner';

    return (
      <div
        key={container.id}
        onClick={() => tapFront(container)}
        className={`relative ${openFrame ? 'rounded-none' : 'rounded-2xl sm:rounded-3xl'} ${kind === 'drawer' ? 'p-2 sm:p-3' : 'p-3 sm:p-4'} ${
          openFrame || kind === 'shelf' ? 'pb-5 sm:pb-6' : ''
        } flex flex-col justify-between items-center text-center cursor-pointer transition-all duration-200 group active:scale-98 select-none ${minHeightClass} ${frontClass} ${
          isDimmed ? 'opacity-30 grayscale-[30%]' : 'opacity-100'
        } ${isComposing ? 'outline-2 outline-dashed outline-blue-400 outline-offset-2' : ''}`}
        title={container.name}
        // Doors are taller than drawers when they share a column, like on real fronts
        style={compact ? undefined : { flexGrow: kind === 'cabinet_door' ? 2 : kind === 'drawer' ? 1 : 1.5, flexBasis: 0 }}
      >
        {/* Count / match pip */}
        <div className="w-full flex items-center justify-end pointer-events-none">
          {isMatch ? (
            <span className="min-w-[32px] h-7 px-2.5 rounded-full bg-amber-500 text-white font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1 animate-pulse">
              ⚡ {matchCount}
            </span>
          ) : totalCount > 0 ? (
            <span className="min-w-[28px] h-7 px-2.5 rounded-full bg-slate-900 text-white font-mono text-xs sm:text-sm font-black shadow-md flex items-center justify-center">
              {totalCount}
            </span>
          ) : null}
        </div>

        {/* What it is: handle for fronts, rail for hanging, nothing for open shelves */}
        <div className={`my-auto ${kind === 'drawer' ? 'py-1' : 'py-2'} flex items-center justify-center pointer-events-none w-full`}>
          {kind === 'drawer' ? (
            <div className="w-16 sm:w-24 h-3.5 sm:h-4 rounded-full shadow-md border-2 bg-gradient-to-r from-slate-300 via-white to-slate-300 border-slate-400/60 group-hover:border-blue-400" />
          ) : kind === 'cabinet_door' && (container.doorCount || 1) >= 2 ? (
            <>
              <div className="absolute top-2 bottom-2 left-1/2 w-0.5 -translate-x-1/2 bg-slate-300" />
              <div className="absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-[calc(100%+6px)] w-2.5 h-12 sm:h-16 rounded-full shadow-md border-2 bg-gradient-to-b from-slate-300 via-white to-slate-300 border-slate-400/60 group-hover:border-blue-400" />
              <div className="absolute left-1/2 top-1/2 -translate-y-1/2 translate-x-[6px] w-2.5 h-12 sm:h-16 rounded-full shadow-md border-2 bg-gradient-to-b from-slate-300 via-white to-slate-300 border-slate-400/60 group-hover:border-blue-400" />
            </>
          ) : kind === 'cabinet_door' ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2.5 h-12 sm:h-16 rounded-full shadow-md border-2 bg-gradient-to-b from-slate-300 via-white to-slate-300 border-slate-400/60 group-hover:border-blue-400" />
          ) : kind === 'box' || kind === 'bin' ? (
            <div className="w-12 sm:w-16 h-3 sm:h-3.5 rounded-md bg-amber-800/40 shadow-xs border border-amber-900/20" />
          ) : kind === 'hanging_rod' ? (
            <div className="absolute left-3 right-3 top-3 h-1.5 rounded-full bg-slate-400" />
          ) : null}
        </div>

        {/* Label: always visible, so you know what you are opening */}
        <span className="w-full text-[11px] sm:text-xs font-bold text-slate-600 truncate pointer-events-none">
          {cleanContainerName(container.name)}
        </span>

        {/* Shelves are planks: draw the board they stand on */}
        {(kind === 'shelf' || (openFrame && !compact)) && (
          <div
            style={{ backgroundColor: color }}
            className="absolute left-0 right-0 bottom-0 h-2.5 sm:h-3 rounded-sm shadow-md pointer-events-none"
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 w-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
      {isScanning && <ScanItemsModal furnitureId={furniture.id} onClose={() => setIsScanning(false)} />}
      {isBuildingLayout && (
        <BuildLayoutModal furnitureId={furniture.id} onClose={() => setIsBuildingLayout(false)} onApplied={() => setOpenDoorId(null)} />
      )}
      {scanRootId && <ScanItemsModal furnitureId={furniture.id} rootContainerId={scanRootId} onClose={() => setScanRootId(null)} />}
      {isComposing && editingSlot && (() => {
        const inside = !!editingSlot.parentContainerId;
        const siblings = inside ? childrenOf(editingSlot.parentContainerId!) : [];
        const sibIdx = siblings.findIndex((c) => c.id === editingSlot.id);
        const kind = effectiveContainerType(editingSlot);
        return (
          <CompartmentEditSheet
            container={editingSlot}
            kind={kind}
            itemCount={containerTotal(editingSlot)}
            canMove={
              inside
                ? { left: false, right: false, up: sibIdx > 0, down: sibIdx >= 0 && sibIdx < siblings.length - 1 }
                : {
                    left: !!editingPos && editingPos.col > 0,
                    right: !!editingPos && editingPos.col < facadeNumColumns - 1,
                    up: !!editingPos && editingPos.row > 0,
                    down: !!editingPos && editingPos.row < facadeColumns[editingPos.col].length - 1,
                  }
            }
            onRename={(name) => updateSlot(editingSlot.id, { name })}
            onChangeType={(type) => updateSlot(editingSlot.id, { type })}
            onMove={(dx, dy) => (inside ? moveInside(editingSlot, dy) : moveSlot(editingSlot, dx, dy))}
            onDelete={() => deleteSlot(editingSlot.id)}
            onClose={() => setEditingSlotId(null)}
            doorCount={!inside && kind === 'cabinet_door' ? editingSlot.doorCount || 1 : undefined}
            onChangeDoorCount={(n) => updateSlot(editingSlot.id, { doorCount: n })}
            columnWidth={!inside && editingPos ? columnWidth(editingPos.col) : undefined}
            onChangeColumnWidth={(w) => editingPos && setColumnWidth(editingPos.col, w)}
            onEditInside={
              !inside && kind === 'cabinet_door'
                ? () => {
                    setOpenDoorId(editingSlot.id);
                    setEditingSlotId(null);
                  }
                : undefined
            }
          />
        );
      })()}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoChange}
        className="hidden"
      />

      {/* Top Header Bar */}
      <div className="bg-white border-b border-slate-200 px-3.5 sm:px-5 py-3 sm:py-3.5 flex flex-wrap items-center justify-between shadow-xs flex-shrink-0 gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-[60%] sm:basis-auto">
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
            onClick={() => setIsScanning(true)}
            className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs min-h-[42px]"
            title="Scan a photo to add the items inside"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Scan</span>
          </button>

          <button
            onClick={toggleLayoutEditing}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-xs min-h-[42px] ${
              isComposing 
                ? 'bg-blue-600 text-white shadow-blue-500/20 ring-2 ring-blue-400' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title={isComposing ? 'Finish editing the layout' : 'Edit the layout: add, rename, move or remove compartments'}
          >
            <Sliders className="w-4 h-4" />
            <span className={isComposing ? '' : 'hidden sm:inline'}>{isComposing ? 'Done' : 'Edit layout'}</span>
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
        ) : viewMode === 'photo' && furniture.photoDataUrl && !isComposing ? (
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
                style={{ gridTemplateColumns: `repeat(${facadeColumns.length}, minmax(0, 1fr))` }}
              >
                {facadeColumns.map((colContainers, colIdx) => (
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
            {isComposing && (
              <div className="w-full flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsBuildingLayout(true)}
                  className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Build from photo
                </button>
                <p className="w-full text-center text-xs sm:text-sm font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-2xl px-3 py-2">
                  Or tap a compartment to rename, change or move it. Tap + to add one.
                </p>
              </div>
            )}
            {/* Furniture shell: surfaces on top, then an open frame (tables, racks) or a closed cabinet */}
            <div className="w-full flex flex-col items-center">
              {/* Top surfaces (tabletop, countertop) are drawn as the slab itself; otherwise a plain crown */}
              {facadeTop.length > 0 ? (
                <div className="w-[99%] flex gap-1.5">
                  {facadeTop.map((container) => {
                    const count = containerTotal(container);
                    const isMatch = isSearching && matchingContainerIds.has(container.id);
                    const isDimmed = isSearching && !isMatch;
                    return (
                      <button
                        key={container.id}
                        onClick={() => (isComposing ? setEditingSlotId(container.id) : setSelectedContainerId(container.id))}
                        style={{ backgroundColor: furniture.color || '#0f766e' }}
                        className={`flex-1 min-w-0 min-h-[52px] rounded-t-2xl px-3 py-2 flex items-center justify-between gap-2 text-white shadow-md border-t border-x border-white/40 cursor-pointer active:scale-[0.99] transition-all ${
                          isMatch ? 'ring-4 ring-amber-400' : 'hover:brightness-110'
                        } ${isDimmed ? 'opacity-40' : ''}`}
                        title={container.name}
                      >
                        <span className="text-xs sm:text-sm font-extrabold truncate">{cleanContainerName(container.name)}</span>
                        <span className={`min-w-[28px] h-7 px-2 rounded-full font-mono text-xs font-black flex items-center justify-center flex-shrink-0 ${
                          isMatch ? 'bg-amber-500 text-white' : 'bg-black/25 text-white'
                        }`}>
                          {isMatch ? `⚡ ${matchCountsByContainer.get(container.id) || 0}` : count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : isComposing ? (
                <button
                  type="button"
                  onClick={() => addSlot(0, 'top_surface')}
                  className="w-[99%] min-h-[44px] rounded-t-2xl border-2 border-dashed border-blue-300 bg-blue-50/60 hover:bg-blue-100 text-blue-700 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add top surface</span>
                </button>
              ) : (
                <div
                  style={{ backgroundColor: furniture.color || '#0f766e' }}
                  className="w-[99%] h-5 sm:h-6 rounded-t-2xl shadow-sm border-t border-x border-white/40"
                />
              )}

              {topLevelContainers.length === 0 && !isComposing ? (
                <div className="w-full bg-white/85 rounded-b-3xl p-8 text-center flex flex-col items-center gap-3 border-4 border-t-0 border-slate-200">
                  <Archive className="w-10 h-10 text-slate-300" />
                  <p className="text-slate-500 font-medium text-sm">This furniture doesn't have any drawers, shelves or surfaces yet.</p>
                  <button
                    onClick={toggleLayoutEditing}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs sm:text-sm shadow-md min-h-[40px]"
                  >
                    Edit layout
                  </button>
                </div>
              ) : facadeBody.length === 0 && !isComposing ? (
                /* Only a surface (plain table): just legs under the top */
                <div className="w-[96%] flex justify-between pointer-events-none">
                  <div style={{ backgroundColor: furniture.color || '#0f766e' }} className="w-2.5 sm:w-3 h-20 sm:h-24 rounded-b-md shadow-md" />
                  <div style={{ backgroundColor: furniture.color || '#0f766e' }} className="w-2.5 sm:w-3 h-20 sm:h-24 rounded-b-md shadow-md" />
                </div>
              ) : facadeIsOpen ? (
                /* Open frame: legs on both sides, shelves as planks you can see onto */
                <div className="w-full flex items-stretch">
                  <div style={{ backgroundColor: furniture.color || '#0f766e' }} className="w-2.5 sm:w-3 rounded-b-md shadow-md flex-shrink-0" />
                  <div
                    className="flex-1 grid gap-x-2 sm:gap-x-4 px-2 sm:px-4"
                    style={{ gridTemplateColumns: gridColumns, gridTemplateRows: '1fr', minHeight: tallMinHeight }}
                  >
                    {facadeColumns.map((col, colIdx) => (
                      <div key={colIdx} className={`flex flex-col ${isComposing ? 'gap-3' : ''}`}>
                        {col.map((container) => renderFront(container, col.length, true))}
                        {isComposing && addTile(colIdx)}
                      </div>
                    ))}
                    
                  </div>
                  <div style={{ backgroundColor: furniture.color || '#0f766e' }} className="w-2.5 sm:w-3 rounded-b-md shadow-md flex-shrink-0" />
                </div>
              ) : (
                /* Closed cabinet housing with fronts per compartment */
                <>
                  <div
                    style={{ backgroundColor: `${furniture.color || '#0f766e'}1a`, borderColor: furniture.color || '#0f766e' }}
                    className="w-full rounded-b-2xl sm:rounded-b-3xl p-3 sm:p-5 border-4 border-t-0 shadow-2xl relative"
                  >
                    <div
                      className="grid gap-2.5 sm:gap-4 w-full"
                      style={{ gridTemplateColumns: gridColumns, gridTemplateRows: '1fr', minHeight: tallMinHeight }}
                    >
                      {facadeColumns.map((col, colIdx) => (
                        <div key={colIdx} className="flex flex-col gap-2.5 sm:gap-3.5 h-full">
                          {col.map((container) => renderFront(container, col.length, false))}
                          {isComposing && addTile(colIdx)}
                        </div>
                      ))}
                      
                    </div>
                  </div>
                  {/* Feet */}
                  <div className="w-[94%] flex items-center justify-between px-4 -mt-1 pointer-events-none">
                    <div style={{ backgroundColor: furniture.color || '#0f766e' }} className="w-5 h-3.5 sm:w-6 sm:h-4 rounded-b-md shadow-md opacity-80" />
                    <div style={{ backgroundColor: furniture.color || '#0f766e' }} className="w-5 h-3.5 sm:w-6 sm:h-4 rounded-b-md shadow-md opacity-80" />
                  </div>
                </>
              )}

              {isComposing && facadeColumns.length < 4 && (
                <div className="w-full mt-4">{addTile(facadeColumns.length, 'Add column')}</div>
              )}

              {/* Ambient Ground Shadow */}
              <div className="w-[90%] h-2.5 bg-slate-900/10 rounded-full blur-xs -mt-1" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
