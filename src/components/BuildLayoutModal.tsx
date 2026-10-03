import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Container, ContainerType } from '../types';
import { API_BASE_URL, getWorkspaceApiKey, scheduleAutoSync } from '../services/apiSync';
import { reportClientError } from '../services/errorReport';
import { effectiveContainerType } from '../utils/containerKind';
import { PhotoError } from './PhotoError';
import { photoToJpegBase64 } from './ScanItemsModal';
import { X, Camera, Sparkles, Loader2, Check } from 'lucide-react';

type PartType = 'shelf' | 'rail' | 'drawer' | 'basket' | 'open';
interface Section {
  width: 1 | 2;
  door: 'none' | 'single' | 'pair';
  parts: { type: PartType; name: string }[];
}
interface Layout {
  onTop: boolean;
  sections: Section[];
}

const PART_TO_CONTAINER: Record<PartType, ContainerType> = {
  shelf: 'shelf',
  rail: 'hanging_rod',
  drawer: 'drawer',
  basket: 'box',
  open: 'shelf',
};

// "Left door" / "Middle doors" / "Right door" for the common 2-3 section furniture, numbered otherwise
function doorName(index: number, count: number, pair: boolean): string {
  const s = pair ? 'doors' : 'door';
  if (count === 1) return pair ? 'Doors' : 'Door';
  if (count === 2) return `${index === 0 ? 'Left' : 'Right'} ${s}`;
  if (count === 3) return `${['Left', 'Middle', 'Right'][index]} ${s}`;
  return `${pair ? 'Doors' : 'Door'} ${index + 1}`;
}

/**
 * Photograph furniture with its doors open; the AI proposes its structure (sections, doors and what's
 * behind them). The user checks it and applies it, replacing the current layout.
 */
export const BuildLayoutModal: React.FC<{ furnitureId: string; onClose: () => void; onApplied?: () => void }> = ({
  furnitureId,
  onClose,
  onApplied,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [lastImage, setLastImage] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const furniture = await db.furniture.get(furnitureId);
    const room = furniture ? await db.rooms.get(furniture.roomId) : undefined;
    const containers = await db.containers.where('furnitureId').equals(furnitureId).toArray();
    const itemCount = containers.length ? await db.items.where('containerId').anyOf(containers.map((c) => c.id)).count() : 0;
    return { furniture, room, containers, itemCount };
  }, [furnitureId]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !data?.furniture) return;
    const image = await photoToJpegBase64(file);
    setPreview(`data:image/jpeg;base64,${image}`);
    setLastImage(image);
    await sendPhoto(image);
  };

  // Kept separately so "Try again" can resend the same photo after a failure
  const sendPhoto = async (image: string) => {
    if (!data?.furniture) return;
    setError(null);
    setLayout(null);
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/vision.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': getWorkspaceApiKey() },
        body: JSON.stringify({
          mode: 'layout',
          image,
          mimeType: 'image/jpeg',
          furnitureName: data.furniture.name,
          roomName: data.room?.name || '',
          slots: [],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Scan failed (HTTP ${res.status})`);
      setLayout(json.layout as Layout);
      setLastImage(null);
    } catch (err) {
      reportClientError('build-layout-failed', err, { furnitureId });
      setError((err as Error).message || 'Could not recognise the layout');
    } finally {
      setScanning(false);
    }
  };

  const updateSection = (idx: number, patch: Partial<Section>) =>
    setLayout((l) => l && { ...l, sections: l.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });

  // Kitchens (wall cabinets, appliances, countertop) are only refined: the photo fills in what's
  // behind the existing doors, everything else stays. Replacing them lost the whole kitchen layout.
  const keepsStructure = !!data?.containers.some(
    (c) => !c.parentContainerId && (c.zone === 'upper' || effectiveContainerType(c) === 'appliance')
  ) || data?.furniture?.type === 'kitchen_counter';

  const applyInteriors = async () => {
    if (!layout || !data) return;
    const now = Date.now();
    const base = data.containers.filter((c) => !c.parentContainerId && c.zone !== 'upper' && effectiveContainerType(c) !== 'top_surface');
    const columns = Array.from(new Set(base.map((c) => c.columnIndex ?? 0))).sort((a, b) => a - b);
    let filled = 0;
    await db.transaction('rw', [db.containers, db.items], async () => {
      for (let i = 0; i < layout.sections.length && i < columns.length; i++) {
        const sec = layout.sections[i];
        if (sec.door === 'none' || sec.parts.length === 0) continue;
        // The door in the matching column (appliances such as the oven are left alone)
        const door = base
          .filter((c) => (c.columnIndex ?? 0) === columns[i] && effectiveContainerType(c) === 'cabinet_door')
          .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))[0];
        if (!door) continue;
        const parts = sec.parts.map((p) => ({ type: PART_TO_CONTAINER[p.type], name: p.type === 'open' ? p.name || 'Open space' : p.name }));
        // One open space behind a door adds nothing: the door itself already holds the items
        if (parts.length === 1 && sec.parts[0].type === 'open') continue;
        const old = data.containers.filter((c) => c.parentContainerId === door.id).map((c) => c.id);
        if (old.length) {
          await db.items.where('containerId').anyOf(old).modify({ containerId: door.id, updatedAt: now });
          await db.containers.bulkDelete(old);
        }
        await db.containers.bulkAdd(
          parts.map((p, row) => ({
            id: `cont-${now}-${i}-${row}`,
            furnitureId,
            parentContainerId: door.id,
            name: p.name,
            type: p.type,
            orderIndex: row,
            createdAt: now,
            updatedAt: now,
          }))
        );
        await db.containers.update(door.id, { doorCount: sec.door === 'pair' ? 2 : 1, updatedAt: now });
        filled++;
      }
    });
    return filled;
  };

  const apply = async () => {
    if (!layout || !data?.furniture) return;
    if (keepsStructure) {
      setApplying(true);
      try {
        const filled = await applyInteriors();
        scheduleAutoSync();
        if (!filled) window.alert('No doors matched what the photo shows, so nothing was changed. Use Edit layout to add shelves behind a door.');
        onApplied?.();
        onClose();
      } catch (err) {
        reportClientError('build-layout-interiors-failed', err, { furnitureId });
        setError(`Could not apply the layout: ${(err as Error).message}`);
      } finally {
        setApplying(false);
      }
      return;
    }
    const existingItems = data.itemCount;
    if (
      data.containers.length > 0 &&
      !window.confirm(
        existingItems > 0
          ? `This replaces the current layout. The ${existingItems} item${existingItems === 1 ? '' : 's'} in it will be moved to an "Unsorted" box, so nothing is lost. Continue?`
          : 'This replaces the current layout. Continue?'
      )
    ) {
      return;
    }
    setApplying(true);
    try {
      const now = Date.now();
      let seq = 0;
      const id = () => `cont-${now}-${seq++}`;
      const created: Container[] = [];
      const add = (c: Omit<Container, 'id' | 'furnitureId' | 'createdAt' | 'updatedAt'>) => {
        const full: Container = { id: id(), furnitureId, createdAt: now, updatedAt: now, ...c };
        created.push(full);
        return full.id;
      };

      if (layout.onTop) add({ name: 'On top', type: 'top_surface', orderIndex: 0 });
      layout.sections.forEach((sec, col) => {
        const parts = sec.parts.map((p) => ({ type: PART_TO_CONTAINER[p.type], name: p.type === 'open' ? p.name || 'Open space' : p.name }));
        if (sec.door === 'none') {
          parts.forEach((p, row) => add({ name: p.name, type: p.type, columnIndex: col, orderIndex: row }));
        } else {
          const doorId = add({
            name: doorName(col, layout.sections.length, sec.door === 'pair'),
            type: 'cabinet_door',
            doorCount: sec.door === 'pair' ? 2 : 1,
            columnIndex: col,
            orderIndex: 0,
          });
          parts.forEach((p, row) => add({ name: p.name, type: p.type, parentContainerId: doorId, orderIndex: row }));
        }
      });

      // Keep existing items: move them into an "Unsorted" box in the last section
      let unsortedId: string | null = null;
      if (existingItems > 0) {
        unsortedId = add({ name: 'Unsorted', type: 'box', columnIndex: Math.max(0, layout.sections.length - 1), orderIndex: 99 });
      }

      const oldIds = data.containers.map((c) => c.id);
      await db.transaction('rw', [db.furniture, db.containers, db.items], async () => {
        if (unsortedId) {
          await db.items.where('containerId').anyOf(oldIds).modify({ containerId: unsortedId, updatedAt: now });
        }
        await db.containers.bulkDelete(oldIds);
        await db.containers.bulkAdd(created);
        await db.furniture.update(furnitureId, {
          columns: Math.max(1, layout.sections.length),
          columnWidths: layout.sections.map((s) => s.width),
          updatedAt: now,
        });
      });
      scheduleAutoSync();
      onApplied?.();
      onClose();
    } catch (err) {
      reportClientError('build-layout-apply-failed', err, { furnitureId });
      setError(`Could not apply the layout: ${(err as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />

        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Build layout from photo</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">Open all doors and photograph the whole {data?.furniture?.name || 'furniture'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          {preview && <img src={preview} alt="Furniture photo" className="w-full max-h-48 object-contain rounded-2xl bg-slate-100" />}

          {!layout && !scanning && !error && (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full py-6 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 hover:bg-indigo-50 text-indigo-700 font-bold text-sm flex flex-col items-center gap-2 cursor-pointer"
            >
              <Camera className="w-6 h-6" />
              <span>{preview ? 'Try another photo' : 'Take or choose a photo'}</span>
            </button>
          )}

          {scanning && (
            <div className="py-8 flex flex-col items-center gap-2 text-slate-600 text-sm font-bold">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span>Recognising sections and doors…</span>
            </div>
          )}

          {error && (
            <PhotoError
              error={error}
              busy={scanning}
              onRetry={lastImage ? () => sendPhoto(lastImage) : undefined}
              onRetake={() => inputRef.current?.click()}
            />
          )}

          {layout && (
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Check what was recognised, left to right</p>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={layout.onTop}
                  onChange={(e) => setLayout({ ...layout, onTop: e.target.checked })}
                  className="w-5 h-5 accent-indigo-600"
                />
                Things stored on top
              </label>
              <div className="grid gap-2" style={{ gridTemplateColumns: layout.sections.map((s) => `minmax(0, ${s.width}fr)`).join(' ') }}>
                {layout.sections.map((sec, i) => (
                  <div key={i} className="rounded-2xl border-2 border-slate-200 p-2 space-y-1.5 bg-slate-50">
                    <select
                      value={sec.door}
                      onChange={(e) => updateSection(i, { door: e.target.value as Section['door'] })}
                      aria-label={`Section ${i + 1} doors`}
                      className="w-full text-[11px] font-bold bg-white border border-slate-300 rounded-lg px-1 py-1"
                    >
                      <option value="none">Open</option>
                      <option value="single">Door</option>
                      <option value="pair">Pair of doors</option>
                    </select>
                    <select
                      value={sec.width}
                      onChange={(e) => updateSection(i, { width: Number(e.target.value) === 2 ? 2 : 1 })}
                      aria-label={`Section ${i + 1} width`}
                      className="w-full text-[11px] font-bold bg-white border border-slate-300 rounded-lg px-1 py-1"
                    >
                      <option value={1}>Normal</option>
                      <option value={2}>Wide</option>
                    </select>
                    <ul className="space-y-1 pt-1">
                      {sec.parts.map((p, j) => (
                        <li key={j} className="text-[11px] font-bold text-slate-700 bg-white rounded-md px-1.5 py-1 border border-slate-200 truncate" title={p.name}>
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">You can fine-tune shelves and drawers afterwards in Edit layout.</p>
            </div>
          )}
        </div>

        {layout && (
          <div className="p-3 sm:p-4 border-t border-slate-100 flex items-center gap-2 bg-white">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={scanning || applying}
              className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" /> Retake
            </button>
            <button
              onClick={apply}
              disabled={applying}
              className="ml-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer flex items-center gap-1.5"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {keepsStructure ? "Fill in behind the doors" : "Use this layout"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
