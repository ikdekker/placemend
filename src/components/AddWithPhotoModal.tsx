import React, { useRef, useState } from 'react';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { FurnitureType } from '../types';
import { API_BASE_URL, getWorkspaceApiKey, scheduleAutoSync } from '../services/apiSync';
import { reportClientError } from '../services/errorReport';
import { PhotoError } from './PhotoError';
import { photoToJpegBase64 } from './ScanItemsModal';
import { MeterInput } from './MeterInput';
import { IdentifiedFurniture, createFurnitureFromPhoto } from '../utils/layoutFromAi';
import { X, Camera, Sparkles, Loader2, Check } from 'lucide-react';

const TYPE_LABELS: [FurnitureType, string][] = [
  ['wardrobe', 'Wardrobe'],
  ['closet', 'Closet'],
  ['cabinet', 'Cabinet'],
  ['dresser', 'Dresser'],
  ['bookshelf', 'Bookshelf'],
  ['storage_rack', 'Rack'],
  ['desk', 'Desk'],
  ['table', 'Table'],
  ['kitchen_counter', 'Kitchen counter'],
  ['kitchen_island', 'Kitchen island'],
  ['bed', 'Bed'],
  ['sofa', 'Sofa'],
  ['workbench', 'Workbench'],
  ['box_stack', 'Boxes'],
  ['appliance', 'Appliance'],
  ['other', 'Other'],
];

const FRONT_LABEL: Record<string, string> = {
  door: 'Door',
  pair: 'Pair of doors',
  drawer: 'Drawer',
  shelf: 'Shelf',
  basket: 'Basket',
  open: 'Open',
};

/** Step 1 of the photo setup: photograph a piece of furniture, check what the AI recognised, add it to the room */
export const AddWithPhotoModal: React.FC = () => {
  const { isAddWithPhotoOpen, setAddWithPhotoOpen, selectedRoomId, setSetup, setAppMode, setSelectedFurnitureId, setFurnitureLibraryOpen } =
    useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ident, setIdent] = useState<IdentifiedFurniture | null>(null);
  const [lastImage, setLastImage] = useState<string | null>(null);

  if (!isAddWithPhotoOpen) return null;

  const close = () => {
    setAddWithPhotoOpen(false);
    setPreview(null);
    setIdent(null);
    setError(null);
    setLastImage(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const image = await photoToJpegBase64(file);
    setPreview(`data:image/jpeg;base64,${image}`);
    setLastImage(image);
    await sendPhoto(image);
  };

  // Kept separately so "Try again" can resend the same photo after a failure
  const sendPhoto = async (image: string) => {
    setError(null);
    setIdent(null);
    setScanning(true);
    try {
      const room = selectedRoomId ? await db.rooms.get(selectedRoomId) : undefined;
      const res = await fetch(`${API_BASE_URL}/vision.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': getWorkspaceApiKey() },
        body: JSON.stringify({ mode: 'identify', image, mimeType: 'image/jpeg', furnitureName: '', roomName: room?.name || '', slots: [] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Scan failed (HTTP ${res.status})`);
      setIdent(json.furniture as IdentifiedFurniture);
      setLastImage(null);
    } catch (err) {
      reportClientError('identify-furniture-failed', err, {});
      setError((err as Error).message || 'Could not recognise the furniture');
    } finally {
      setScanning(false);
    }
  };

  const add = async () => {
    if (!ident || !selectedRoomId) return;
    setAdding(true);
    try {
      const room = await db.rooms.get(selectedRoomId);
      const id = await createFurnitureFromPhoto(selectedRoomId, room, ident);
      scheduleAutoSync();
      // Next: drag it into place on the floor plan (the setup guide takes over from here)
      setFurnitureLibraryOpen(false);
      setAppMode('edit');
      setSelectedFurnitureId(id);
      setSetup(id, 'place');
      close();
    } catch (err) {
      reportClientError('add-identified-furniture-failed', err, {});
      setError(`Could not add it: ${(err as Error).message}`);
    } finally {
      setAdding(false);
    }
  };

  const setField = (patch: Partial<IdentifiedFurniture>) => setIdent((f) => (f ? { ...f, ...patch } : f));
  const inputCls = 'w-full bg-white text-slate-900 text-sm px-2.5 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />

        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Add furniture with a photo</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">Photograph the whole piece as it stands. Doors can be closed.</p>
          </div>
          <button onClick={close} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3">
          {preview && <img src={preview} alt="Furniture" className="w-full max-h-48 object-contain rounded-2xl bg-slate-100" />}

          {!ident && !scanning && (
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
              <span>Recognising the furniture…</span>
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

          {ident && (
            <div className="space-y-3">
              <div>
                <label htmlFor="ai-furn-name" className="block text-xs font-bold text-slate-600 mb-1">Name</label>
                <input id="ai-furn-name" value={ident.name} onChange={(e) => setField({ name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="ai-furn-type" className="block text-xs font-bold text-slate-600 mb-1">Kind</label>
                <select id="ai-furn-type" value={ident.type} onChange={(e) => setField({ type: e.target.value as FurnitureType })} className={inputCls}>
                  {TYPE_LABELS.map(([t, label]) => (
                    <option key={t} value={t}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['width', 'Width (m)'],
                    ['depth', 'Depth (m)'],
                    ['height', 'Height (m)'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label htmlFor={`ai-furn-${key}`} className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
                    <MeterInput id={`ai-furn-${key}`} value={ident[key]} min={0.1} max={10} onChange={(m) => setField({ [key]: m })} className={inputCls} />
                  </div>
                ))}
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-600 mb-1">Front, left to right</span>
                <div className="grid gap-1.5" style={{ gridTemplateColumns: ident.sections.map((s) => `minmax(0, ${s.width}fr)`).join(' ') }}>
                  {ident.sections.map((s, i) => (
                    <div key={i} className="rounded-xl border-2 border-slate-200 bg-slate-50 p-1.5 space-y-1">
                      {s.fronts.map((f, j) => (
                        <div key={j} className="text-[11px] font-bold text-slate-700 bg-white rounded-md px-1.5 py-1 border border-slate-200 truncate">
                          {FRONT_LABEL[f]}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {ident.hasDoors ? 'Next you place it, then photograph behind the doors.' : 'Next you place it, then fill it.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {ident && (
          <div className="p-3 sm:p-4 border-t border-slate-100 flex items-center gap-2 bg-white">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={scanning || adding}
              className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" /> Retake
            </button>
            <button
              onClick={add}
              disabled={adding || !ident.name.trim()}
              className="ml-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer flex items-center gap-1.5"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Add to room
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
