import React, { useMemo, useRef, useState } from 'react';
import { pickPhoto } from '../utils/pickPhoto';
import { IntegerInput } from './IntegerInput';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { Container, Item } from '../types';
import { API_BASE_URL, getWorkspaceApiKey, scheduleAutoSync } from '../services/apiSync';
import { reportClientError } from '../services/errorReport';
import { PhotoError } from './PhotoError';
import { X, Camera, Sparkles, Loader2, Check } from 'lucide-react';

interface ScannedItem {
  name: string;
  brand: string;
  size: string;
  quantity: number;
  slotId: string;
  category: string;
  confidence: number;
  include: boolean;
}

// Downscale before upload: keeps the request small and the AI call fast and cheap.
// The server (nginx) rejects request bodies over 1 MB, so stay well under that.
const MAX_UPLOAD_BASE64 = 850 * 1024;
export async function photoToJpegBase64(file: File, maxSide = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let base64 = '';
  for (const quality of [0.82, 0.7, 0.58, 0.45]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    if (base64.length <= MAX_UPLOAD_BASE64) break;
  }
  return base64;
}

// "Left Cupboard › Top Shelf" style labels so the AI (and the user) can tell slots apart
function slotLabels(containers: Container[]): { id: string; label: string }[] {
  const byId = new Map(containers.map((c) => [c.id, c]));
  const label = (c: Container): string => {
    const parent = c.parentContainerId ? byId.get(c.parentContainerId) : undefined;
    return parent ? `${label(parent)} › ${c.name}` : c.name;
  };
  return containers.map((c) => ({ id: c.id, label: label(c) })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * rootContainerId: scan only what's in that compartment (e.g. one open door). The AI is told the photo
 * shows just that part, and can only place items in it or its sub-compartments.
 */
export const ScanItemsModal: React.FC<{ furnitureId: string; rootContainerId?: string; onClose: () => void; onAdded?: (count: number) => void }> = ({
  furnitureId,
  rootContainerId,
  onClose,
  onAdded,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScannedItem[] | null>(null);
  const [scansLeft, setScansLeft] = useState<number | null>(null);
  const [lastImage, setLastImage] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    const furniture = await db.furniture.get(furnitureId);
    const room = furniture ? await db.rooms.get(furniture.roomId) : undefined;
    const containers = await db.containers.where('furnitureId').equals(furnitureId).toArray();
    return { furniture, room, containers };
  }, [furnitureId]);

  const allSlots = useMemo(() => slotLabels(data?.containers || []), [data?.containers]);
  // Scoped scan: the chosen compartment plus everything nested inside it
  const scopeIds = useMemo(() => {
    if (!rootContainerId) return null;
    const ids = new Set([rootContainerId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of data?.containers || []) {
        if (c.parentContainerId && ids.has(c.parentContainerId) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      }
    }
    return ids;
  }, [rootContainerId, data?.containers]);
  const slots = useMemo(() => (scopeIds ? allSlots.filter((sl) => scopeIds.has(sl.id)) : allSlots), [allSlots, scopeIds]);
  const scopeLabel = rootContainerId ? allSlots.find((sl) => sl.id === rootContainerId)?.label : undefined;

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
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/vision.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': getWorkspaceApiKey() },
        body: JSON.stringify({
          image,
          mimeType: 'image/jpeg',
          furnitureName: data.furniture.name,
          roomName: data.room?.name || '',
          scopeLabel,
          slots,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Scan failed (HTTP ${res.status})`);
      setScansLeft(typeof json.scansLeftToday === 'number' ? json.scansLeftToday : null);
      // Each photo adds to the list, so a door can be scanned shelf by shelf
      const found = (json.items as Omit<ScannedItem, 'include'>[]).map((it) => ({ ...it, include: true }));
      setResults((prev) => [...(prev || []), ...found]);
      setLastImage(null);
    } catch (err) {
      reportClientError('scan-photo-failed', err, { furnitureId });
      setError((err as Error).message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const update = (idx: number, patch: Partial<ScannedItem>) =>
    setResults((prev) => prev && prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handleAdd = async () => {
    if (!results) return;
    const chosen = results.filter((r) => r.include && r.name.trim() && r.slotId);
    if (chosen.length === 0) return;
    setSaving(true);
    try {
      const now = Date.now();
      const items: Item[] = chosen.map((r, i) => ({
        id: `item-scan-${now}-${i}`,
        containerId: r.slotId,
        name: r.name.trim(),
        description: [r.brand, r.size].filter(Boolean).join(' · ') || undefined,
        quantity: Math.max(1, r.quantity || 1),
        category: r.category || undefined,
        tags: [r.category, r.brand].filter(Boolean).map((t) => t.toLowerCase()),
        createdAt: now,
        updatedAt: now,
      }));
      await db.items.bulkAdd(items);
      scheduleAutoSync();
      onAdded?.(items.length);
      onClose();
    } catch (err) {
      reportClientError('scan-save-failed', err, { furnitureId });
      setError(`Could not save items: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const includedCount = results?.filter((r) => r.include).length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Scan items</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium truncate">
              {scopeLabel ? `Photograph ${scopeLabel}` : `Photograph ${data?.furniture?.name || 'this furniture'}`}, labels facing the camera. One shelf per photo works best.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          {preview && <img src={preview} alt="Scanned furniture" className="w-full max-h-48 object-contain rounded-2xl bg-slate-100" />}

          {data && slots.length === 0 && (
            <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
              This furniture has no shelves or drawers yet. Add them with Layout first, so scanned items have somewhere to go.
            </p>
          )}

          {!results && !scanning && !error && slots.length > 0 && (
            <button
              onClick={() => pickPhoto(inputRef.current)}
              className="w-full py-6 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 hover:bg-indigo-50 text-indigo-700 font-bold text-sm flex flex-col items-center gap-2 cursor-pointer"
            >
              <Camera className="w-6 h-6" />
              <span>{preview ? 'Take another photo' : 'Take or choose a photo'}</span>
            </button>
          )}

          {scanning && (
            <div className="py-8 flex flex-col items-center gap-2 text-slate-600 text-sm font-bold">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span>Identifying products…</span>
            </div>
          )}

          {error && (
            <PhotoError
              error={error}
              busy={scanning}
              onRetry={lastImage ? () => sendPhoto(lastImage) : undefined}
              onRetake={() => pickPhoto(inputRef.current)}
            />
          )}

          {results && results.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">No products recognised. Try a closer, brighter photo.</p>
          )}

          {results && results.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Check the list, untick anything wrong, then add
              </p>
              {results.map((r, idx) => (
                <div key={idx} className={`p-2.5 rounded-2xl border ${r.include ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) => update(idx, { include: e.target.checked })}
                      className="w-5 h-5 accent-indigo-600 flex-shrink-0"
                      aria-label={`Include ${r.name}`}
                    />
                    <input
                      value={r.name}
                      onChange={(e) => update(idx, { name: e.target.value })}
                      className="flex-1 min-w-0 text-sm font-bold text-slate-900 bg-transparent border-b border-transparent focus:border-indigo-400 focus:outline-none"
                    />
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 flex-shrink-0">
                      ×
                      <IntegerInput
                        aria-label={`Quantity of ${r.name}`}
                        min={1}
                        value={r.quantity}
                        onChange={(n) => update(idx, { quantity: n })}
                        className="w-12 text-sm text-slate-900 bg-slate-100 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </label>
                  </div>
                  <div className="mt-1.5 pl-7 grid grid-cols-2 gap-1.5">
                    <input
                      value={r.brand}
                      placeholder="Brand"
                      onChange={(e) => update(idx, { brand: e.target.value })}
                      className="text-xs text-slate-700 bg-slate-100 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <input
                      value={r.size}
                      placeholder="Size"
                      onChange={(e) => update(idx, { size: e.target.value })}
                      className="text-xs text-slate-700 bg-slate-100 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <select
                      value={r.slotId}
                      onChange={(e) => update(idx, { slotId: e.target.value })}
                      className="col-span-2 text-xs text-slate-700 bg-slate-100 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      {slots.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  {r.confidence < 0.5 && <p className="mt-1 pl-7 text-[11px] font-bold text-amber-600">Unsure: please check</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {results && (
          <div className="p-3 sm:p-4 border-t border-slate-100 flex items-center gap-2 bg-white">
            <button
              onClick={() => pickPhoto(inputRef.current)}
              disabled={scanning || saving}
              className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" /> Add photo
            </button>
            {scansLeft !== null && <span className="text-[11px] text-slate-400 font-medium">{scansLeft} scans left today</span>}
            <button
              onClick={handleAdd}
              disabled={saving || includedCount === 0 || slots.length === 0}
              className="ml-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Add {includedCount} item{includedCount === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
