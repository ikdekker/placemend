import React, { useState, useRef } from 'react';
import { pickPhoto } from '../utils/pickPhoto';
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
import { applianceKind, effectiveContainerType, isOpenKind, isUnderSink } from '../utils/containerKind';
import { ApplianceFace } from './ApplianceFace';

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

  // Kitchen runs have a second row: wall cabinets above the countertop, with their own columns
  type Zone = 'base' | 'upper';
  const zoneOf = (c: Container): Zone => (c.zone === 'upper' ? 'upper' : 'base');
  const canHaveWallCabinets = ['kitchen_counter', 'cabinet', 'dresser', 'desk', 'workbench', 'other'].includes(furniture.type);
  const maxColumns = furniture.type === 'kitchen_counter' ? 6 : 4;
  const buildZone = (zone: Zone) => {
    const inZone = topLevelContainers.filter((c) => zoneOf(c) === zone);
    const top = inZone.filter((c) => effectiveContainerType(c) === 'top_surface').sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const body = inZone.filter((c) => effectiveContainerType(c) !== 'top_surface');
    const setting = zone === 'upper' ? furniture.upperColumns : furniture.columns;
    // Without an explicit column setting, don't spread one lower shelf over three empty columns
    const num = Math.max(1, Math.min(maxColumns, setting || Math.min(3, body.length || 1)));
    const columns: Container[][] = Array.from({ length: num }, () => []);
    body.forEach((container, idx) => {
      let colIdx = container.columnIndex;
      if (colIdx === undefined || colIdx < 0 || colIdx >= num) colIdx = idx % num;
      columns[colIdx].push(container);
    });
    columns.forEach((col) => col.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0)));
    return { top, body, num, columns };
  };
  const baseZone = buildZone('base');
  const upperZone = buildZone('upper');
  const zones = { base: baseZone, upper: upperZone };
  const facadeTop = baseZone.top;
  const facadeNumColumns = baseZone.num;
  const facadeColumns = baseZone.columns;
  const facadeBody = baseZone.body;
  const facadeIsOpen = facadeBody.every((c) => isOpenKind(effectiveContainerType(c)));
  const hasUpper = upperZone.top.length + upperZone.body.length > 0;

  // --- Layout editing (in place on the front view) ---
  const touchLayout = () => scheduleAutoSync();

  // Give every compartment an explicit column/order (older data relies on implicit placement)
  const normalizeLayout = async () => {
    await db.furniture.update(furniture.id, { columns: facadeNumColumns, ...(hasUpper ? { upperColumns: upperZone.num } : {}) });
    for (const z of [baseZone, upperZone]) {
      for (let col = 0; col < z.columns.length; col++) {
        for (let i = 0; i < z.columns[col].length; i++) {
          const c = z.columns[col][i];
          if (c.columnIndex !== col || c.orderIndex !== i) {
            await db.containers.update(c.id, { columnIndex: col, orderIndex: i });
          }
        }
      }
    }
  };

  // Leaving edit mode: drop empty columns so the front doesn't keep blank gaps
  const compactLayout = async () => {
    for (const zone of ['base', 'upper'] as Zone[]) {
      const z = zones[zone];
      const nonEmpty = z.columns.filter((col) => col.length > 0);
      const keptWidths = z.columns.map((_, i) => columnWidth(i, zone)).filter((_, i) => z.columns[i].length > 0);
      await db.furniture.update(
        furniture.id,
        zone === 'base'
          ? { columns: Math.max(1, nonEmpty.length), columnWidths: keptWidths, updatedAt: Date.now() }
          : { upperColumns: nonEmpty.length || undefined, upperColumnWidths: nonEmpty.length ? keptWidths : undefined, updatedAt: Date.now() }
      );
      for (let col = 0; col < nonEmpty.length; col++) {
        for (let i = 0; i < nonEmpty[col].length; i++) {
          const c = nonEmpty[col][i];
          if (c.columnIndex !== col || c.orderIndex !== i) {
            await db.containers.update(c.id, { columnIndex: col, orderIndex: i, updatedAt: Date.now() });
          }
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

  const addSlot = async (colIdx: number, type: ContainerType = 'drawer', zone: Zone = 'base') => {
    const now = Date.now();
    const z = zones[zone];
    const col = (zone === 'upper' && !hasUpper ? [] : z.columns[colIdx]) || [];
    const defaultName =
      zone === 'upper'
        ? ({ top_surface: 'Top of cabinets', shelf: 'Wall shelf' } as Record<string, string>)[type] || 'Wall cabinet'
        : ({ drawer: 'Drawer', cabinet_door: 'Door', shelf: 'Shelf', top_surface: furniture.type === 'kitchen_counter' ? 'Countertop' : 'Top' } as Record<string, string>)[type] || 'Compartment';
    const id = `cont-${now}`;
    if (zone === 'upper' && !hasUpper) {
      await db.furniture.update(furniture.id, { upperColumns: Math.max(1, colIdx + 1), updatedAt: now });
    } else if (colIdx >= z.num) {
      await db.furniture.update(furniture.id, zone === 'upper' ? { upperColumns: colIdx + 1, updatedAt: now } : { columns: colIdx + 1, updatedAt: now });
    }
    await db.containers.add({
      id,
      furnitureId: furniture.id,
      name: defaultName,
      type,
      ...(zone === 'upper' ? { zone: 'upper' as const } : {}),
      columnIndex: colIdx,
      orderIndex: col.length,
      createdAt: now,
      updatedAt: now,
    });
    touchLayout();
    setEditingSlotId(id);
  };

  const slotPosition = (id: string) => {
    for (const zone of ['base', 'upper'] as Zone[]) {
      const cols = zones[zone].columns;
      for (let col = 0; col < cols.length; col++) {
        const row = cols[col].findIndex((c) => c.id === id);
        if (row >= 0) return { zone, col, row };
      }
    }
    return null;
  };

  const moveSlot = async (container: Container, dx: number, dy: number) => {
    const pos = slotPosition(container.id);
    if (!pos) return;
    const now = Date.now();
    const zoneCols = zones[pos.zone].columns;
    if (dy !== 0) {
      const column = zoneCols[pos.col];
      const other = column[pos.row + dy];
      if (!other) return;
      await db.containers.update(container.id, { orderIndex: pos.row + dy, updatedAt: now });
      await db.containers.update(other.id, { orderIndex: pos.row, updatedAt: now });
    } else if (dx !== 0) {
      const target = pos.col + dx;
      if (target < 0 || target >= zones[pos.zone].num) return;
      await db.containers.update(container.id, { columnIndex: target, orderIndex: zoneCols[target].length, updatedAt: now });
      // Close the gap left behind in the source column
      const rest = zoneCols[pos.col].filter((c) => c.id !== container.id);
      for (let i = 0; i < rest.length; i++) {
        if (rest[i].orderIndex !== i) await db.containers.update(rest[i].id, { orderIndex: i, updatedAt: now });
      }
    }
    touchLayout();
  };

  /** Move a front between the wall cabinets and the base cabinet (end of the same column, or the last one) */
  const moveToZone = async (container: Container, zone: Zone) => {
    const pos = slotPosition(container.id);
    if (!pos || pos.zone === zone) return;
    const now = Date.now();
    const target = zones[zone];
    const exists = zone === 'base' || hasUpper;
    const col = exists ? Math.min(pos.col, target.num - 1) : 0;
    if (zone === 'upper' && !hasUpper) await db.furniture.update(furniture.id, { upperColumns: 1, updatedAt: now });
    await db.containers.update(container.id, {
      zone: zone === 'upper' ? 'upper' : undefined,
      columnIndex: col,
      orderIndex: exists ? target.columns[col].length : 0,
      updatedAt: now,
    });
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

  const addTile = (colIdx: number, label = 'Add', zone: Zone = 'base') => (
    <button
      key={`add-${zone}-${colIdx}`}
      type="button"
      onClick={() => addSlot(colIdx, zone === 'upper' ? 'cabinet_door' : 'drawer', zone)}
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
  const columnWidth = (col: number, zone: Zone = 'base') =>
    (zone === 'upper' ? furniture.upperColumnWidths : furniture.columnWidths)?.[col] || 1;
  // An open door's column gets at least double width while open, so its interior is readable
  const gridColumnsFor = (zone: Zone) =>
    zones[zone].columns
      .map((col, i) => {
        const w = col.some((c) => c.id === openDoorId) ? Math.max(2, columnWidth(i, zone)) : columnWidth(i, zone);
        return `minmax(0, ${w}fr)`;
      })
      .join(' ');
  const gridColumns = gridColumnsFor('base');
  const setColumnWidth = async (col: number, width: number, zone: Zone = 'base') => {
    const widths = Array.from({ length: zones[zone].num }, (_, i) => columnWidth(i, zone));
    widths[col] = width;
    await db.furniture.update(furniture.id, zone === 'upper' ? { upperColumnWidths: widths, updatedAt: Date.now() } : { columnWidths: widths, updatedAt: Date.now() });
    touchLayout();
  };
  /** Where a base column sits along the run, as fractions (for the sink and hob drawn on the countertop) */
  const baseColumnSpan = (col: number) => {
    const widths = facadeColumns.map((_, i) => columnWidth(i));
    const total = widths.reduce((a, b) => a + b, 0) || 1;
    const left = widths.slice(0, col).reduce((a, b) => a + b, 0);
    return { left: left / total, width: widths[col] / total };
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

  const renderFront = (container: Container, stackSize: number, openFrame: boolean, upper = false) =>
    openDoorId === container.id ? renderOpenDoor(container) : renderSlot(container, stackSize, openFrame, false, upper);

  const renderSlot = (container: Container, stackSize: number, openFrame: boolean, compact = false, upper = false) => {
    const kind = effectiveContainerType(container);
    const appliance = kind === 'appliance' ? applianceKind(container.name) ?? 'other' : null;
    const totalCount = containerTotal(container);
    const isMatch = isSearching && matchingContainerIds.has(container.id);
    const isDimmed = isSearching && !isMatch;
    const matchCount = matchCountsByContainer.get(container.id) || 0;
    const color = furniture.color || '#0f766e';
    const minHeightClass = compact
      ? 'min-h-[52px] sm:min-h-[60px]'
      : appliance === 'hood'
      ? 'min-h-[60px] sm:min-h-[72px]'
      : upper
      ? 'min-h-[96px] sm:min-h-[120px]'
      : kind === 'drawer' && stackSize > 1
      ? 'min-h-[64px] sm:min-h-[80px]'
      : stackSize === 1
      ? (openFrame ? 'min-h-[120px] sm:min-h-[150px]' : 'min-h-[180px] sm:min-h-[220px]')
      : stackSize === 2 ? 'min-h-[110px] sm:min-h-[140px]' : 'min-h-[92px] sm:min-h-[112px]';

    const frontClass = isMatch
      ? 'ring-4 ring-amber-400 bg-amber-50/95 border-2 border-amber-400 shadow-xl shadow-amber-300/50 z-10'
      : appliance
      ? 'bg-transparent hover:brightness-110'
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
        style={compact ? undefined : { flexGrow: appliance === 'hood' ? 0.6 : kind === 'cabinet_door' || appliance ? 2 : kind === 'drawer' ? 1 : 1.5, flexBasis: 0 }}
      >
        {appliance && !isMatch && <ApplianceFace kind={appliance} />}
        {/* The cabinet under the sink gets a little water drop, so it's recognisable at a glance */}
        {kind === 'cabinet_door' && isUnderSink(container.name) && (
          <span className="absolute left-3 top-3 text-sky-500 text-sm pointer-events-none" aria-hidden="true">💧</span>
        )}
        {/* Count / match pip */}
        <div className="relative w-full flex items-center justify-end pointer-events-none">
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
        <span
          className={`relative max-w-full text-[11px] sm:text-xs font-bold leading-tight line-clamp-2 break-words pointer-events-none ${
            appliance === 'oven' || appliance === 'microwave' ? 'text-slate-100' : appliance ? 'px-1.5 rounded bg-white/80 text-slate-700' : 'w-full text-slate-600'
          }`}
        >
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
                    right: !!editingPos && editingPos.col < zones[editingPos.zone].num - 1,
                    up: !!editingPos && editingPos.row > 0,
                    down: !!editingPos && editingPos.row < zones[editingPos.zone].columns[editingPos.col].length - 1,
                  }
            }
            onRename={(name) => updateSlot(editingSlot.id, { name })}
            onChangeType={(type) => updateSlot(editingSlot.id, { type })}
            onMove={(dx, dy) => (inside ? moveInside(editingSlot, dy) : moveSlot(editingSlot, dx, dy))}
            onDelete={() => deleteSlot(editingSlot.id)}
            onClose={() => setEditingSlotId(null)}
            doorCount={!inside && kind === 'cabinet_door' ? editingSlot.doorCount || 1 : undefined}
            onChangeDoorCount={(n) => updateSlot(editingSlot.id, { doorCount: n })}
            columnWidth={!inside && editingPos ? columnWidth(editingPos.col, editingPos.zone) : undefined}
            onChangeColumnWidth={(w) => editingPos && setColumnWidth(editingPos.col, w, editingPos.zone)}
            zone={!inside && canHaveWallCabinets ? (editingSlot.zone === 'upper' ? 'upper' : 'base') : undefined}
            onChangeZone={(z) => moveToZone(editingSlot, z)}
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
              onClick={() => pickPhoto(photoInputRef.current)}
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
                  onClick={() => pickPhoto(photoInputRef.current)}
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
              {hasUpper && (
                <div className="flex flex-wrap gap-2 justify-center">
                  {[...upperZone.top, ...upperZone.columns.flat()].map((container) => (
                    <button
                      key={container.id}
                      onClick={() => setSelectedContainerId(container.id)}
                      className="px-3 min-h-[48px] rounded-2xl border-2 bg-white text-slate-800 border-slate-200 hover:border-blue-500 text-xs font-extrabold cursor-pointer"
                    >
                      {cleanContainerName(container.name)} · {containerTotal(container)}
                    </button>
                  ))}
                </div>
              )}
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
              {/* Wall cabinets above the countertop (kitchen runs): top of cabinets, cabinets, then the wall */}
              {(hasUpper || (isComposing && canHaveWallCabinets)) && (
                <div className="w-full flex flex-col items-center" data-zone="upper">
                  {upperZone.top.length > 0 ? (
                    <div className="w-[99%] flex gap-1.5 mb-1">
                      {upperZone.top.map((container) => {
                        const count = containerTotal(container);
                        const isMatch = isSearching && matchingContainerIds.has(container.id);
                        return (
                          <button
                            key={container.id}
                            onClick={() => (isComposing ? setEditingSlotId(container.id) : setSelectedContainerId(container.id))}
                            className={`flex-1 min-w-0 min-h-[40px] rounded-xl px-3 flex items-center justify-between gap-2 bg-white/70 border-2 border-dashed border-slate-300 text-slate-600 cursor-pointer hover:border-blue-400 ${
                              isMatch ? 'ring-4 ring-amber-400' : ''
                            } ${isSearching && !isMatch ? 'opacity-40' : ''}`}
                            title={container.name}
                          >
                            <span className="text-xs font-bold truncate">{cleanContainerName(container.name)}</span>
                            <span className={`min-w-[26px] h-6 px-2 rounded-full font-mono text-xs font-black flex items-center justify-center ${isMatch ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                              {isMatch ? `⚡ ${matchCountsByContainer.get(container.id) || 0}` : count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : isComposing && hasUpper ? (
                    <button
                      type="button"
                      onClick={() => addSlot(0, 'top_surface', 'upper')}
                      className="w-[99%] mb-1 min-h-[40px] rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 hover:bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>Add top of cabinets</span>
                    </button>
                  ) : null}

                  {hasUpper ? (
                    <div className="w-full grid gap-1.5 sm:gap-2.5" style={{ gridTemplateColumns: gridColumnsFor('upper') }}>
                      {upperZone.columns.map((col, colIdx) => (
                        <div key={colIdx} className="flex flex-col gap-1.5 sm:gap-2">
                          {col.map((container) => renderFront(container, col.length, false, true))}
                          {isComposing && addTile(colIdx, 'Add', 'upper')}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addSlot(0, 'cabinet_door', 'upper')}
                      className="w-full min-h-[64px] rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/60 hover:bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>Add wall cabinets above</span>
                    </button>
                  )}
                  {isComposing && hasUpper && upperZone.num < maxColumns && (
                    <div className="w-full mt-2">{addTile(upperZone.num, 'Add wall column', 'upper')}</div>
                  )}

                  {/* The wall between the wall cabinets and the countertop */}
                  <div
                    aria-hidden="true"
                    className="w-[99%] h-9 sm:h-12 mt-1"
                    style={{
                      backgroundColor: '#e2e8f0',
                      backgroundImage:
                        'linear-gradient(90deg, rgba(148,163,184,.35) 1px, transparent 1px), linear-gradient(rgba(148,163,184,.35) 1px, transparent 1px)',
                      backgroundSize: '30px 15px',
                    }}
                  />
                </div>
              )}

              <div className="relative w-full flex flex-col items-center">
              {/* Tap that marks the sink, standing on the countertop above the cabinet under the sink */}
              {facadeColumns.map((col, colIdx) =>
                col.some((c) => isUnderSink(c.name)) ? (
                  <svg
                    key={`tap-${colIdx}`}
                    aria-hidden="true"
                    viewBox="0 0 40 34"
                    className="absolute bottom-full w-8 h-7 sm:w-10 sm:h-8 pointer-events-none"
                    style={{ left: `calc(${(baseColumnSpan(colIdx).left + baseColumnSpan(colIdx).width / 2) * 99 + 0.5}% - 16px)` }}
                  >
                    <path d="M14 34 V12 Q14 3 23 3 Q32 3 32 12 V16" fill="none" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" />
                    <rect x="8" y="30" width="14" height="4" rx="1.5" fill="#64748b" />
                  </svg>
                ) : null
              )}
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

              </div>

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

              {isComposing && facadeColumns.length < maxColumns && (
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
