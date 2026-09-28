import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Container } from '../types';
import { API_BASE_URL, getWorkspaceApiKey, scheduleAutoSync } from '../services/apiSync';
import { reportClientError } from '../services/errorReport';
import { PhotoError } from './PhotoError';
import { photoToJpegBase64, ScanItemsModal } from './ScanItemsModal';
import { LayoutSection, setDoorInterior } from '../utils/layoutFromAi';
import { effectiveContainerType } from '../utils/containerKind';
import { Camera, Check, Loader2, Sparkles, X } from 'lucide-react';

/**
 * Photo of what's behind the doors. With `door` set, only that door is open in the photo and the
 * recognised parts go behind it; without, all doors are open and sections map to doors left to right.
 */
const InsidePhotoModal: React.FC<{ furnitureId: string; furnitureName: string; doors: Container[]; door?: Container; onDone: () => void; onClose: () => void }> = ({
  furnitureId,
  furnitureName,
  doors,
  door,
  onDone,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ door: Container; parts: LayoutSection['parts'] }[] | null>(null);
  const [lastImage, setLastImage] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const image = await photoToJpegBase64(file);
    setLastImage(image);
    await sendPhoto(image);
  };

  // Kept separately so "Try again" can resend the same photo after a failure
  const sendPhoto = async (image: string) => {
    setError(null);
    setPlan(null);
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/vision.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': getWorkspaceApiKey() },
        body: JSON.stringify({
          mode: 'layout',
          image,
          mimeType: 'image/jpeg',
          furnitureName,
          roomName: '',
          scopeLabel: door ? `${door.name} (only the section behind this door is open)` : '',
          slots: [],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Scan failed (HTTP ${res.status})`);
      const sections = (json.layout?.sections || []) as LayoutSection[];
      setLastImage(null);
      if (door) {
        // One door open: everything recognised belongs behind it
        setPlan([{ door, parts: sections.flatMap((s) => s.parts) }]);
      } else {
        // All doors open: pair sections with doors left to right
        const withDoors = sections.filter((s) => s.door !== 'none');
        const source = withDoors.length === doors.length ? withDoors : sections;
        setPlan(doors.map((d, i) => ({ door: d, parts: source[i]?.parts || [] })));
      }
    } catch (err) {
      reportClientError('setup-inside-failed', err, { furnitureId });
      setError((err as Error).message || 'Could not recognise the inside');
    } finally {
      setScanning(false);
    }
  };

  const apply = async () => {
    if (!plan) return;
    setApplying(true);
    try {
      for (const p of plan) if (p.parts.length > 0) await setDoorInterior(furnitureId, p.door.id, p.parts);
      scheduleAutoSync();
      onDone();
    } catch (err) {
      setError(`Could not save: ${(err as Error).message}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-900">{door ? `Open ${door.name.toLowerCase()}` : 'Open all doors'}</h3>
            <p className="text-xs text-slate-500 font-medium">
              {door ? 'Photograph what is behind this door.' : 'Photograph the whole piece with every door open.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200/60 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {!plan && !scanning && !error && (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full py-6 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/60 text-indigo-700 font-bold text-sm flex flex-col items-center gap-2 cursor-pointer"
            >
              <Camera className="w-6 h-6" />
              <span>Take or choose a photo</span>
            </button>
          )}
          {scanning && (
            <div className="py-8 flex flex-col items-center gap-2 text-slate-600 text-sm font-bold">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span>Recognising shelves, rails and drawers…</span>
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
          {plan && (
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${plan.length}, minmax(0, 1fr))` }}>
              {plan.map((p) => (
                <div key={p.door.id} className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-2 space-y-1">
                  <div className="text-[11px] font-black text-slate-800 truncate">{p.door.name}</div>
                  {p.parts.length === 0 && <div className="text-[11px] text-slate-400">Nothing recognised</div>}
                  {p.parts.map((part, j) => (
                    <div key={j} className="text-[11px] font-bold text-slate-700 bg-white rounded-md px-1.5 py-1 border border-slate-200 truncate">
                      {part.name}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {plan && (
          <div className="p-3 border-t border-slate-100 flex items-center gap-2">
            <button onClick={() => inputRef.current?.click()} className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1.5">
              <Camera className="w-4 h-4" /> Retake
            </button>
            <button
              onClick={apply}
              disabled={applying}
              className="ml-auto px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Looks right
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/** Guide bar that walks a newly photographed piece through: place it → photograph the inside → fill it */
export const SetupGuide: React.FC = () => {
  const { setupFurnitureId, setupStep, setSetup, setAppMode, setSelectedFurnitureId, setSelectedContainerId } = useAppStore();
  const [insideMode, setInsideMode] = useState<null | 'all' | number>(null);
  const [scanRoot, setScanRoot] = useState<string | null>(null);
  const [filled, setFilled] = useState<Set<string>>(new Set());

  const data = useLiveQuery(async () => {
    if (!setupFurnitureId) return undefined;
    const furniture = await db.furniture.get(setupFurnitureId);
    const containers = await db.containers.where('furnitureId').equals(setupFurnitureId).toArray();
    return { furniture, containers };
  }, [setupFurnitureId]);

  // The furniture was deleted meanwhile: end the setup
  useEffect(() => {
    if (data && !data.furniture) setSetup(null);
  }, [data, setSetup]);

  if (!setupFurnitureId || !setupStep || (data && !data.furniture)) return null;
  const name = data?.furniture?.name || 'it';
  const topLevel = (data?.containers || [])
    .filter((c) => !c.parentContainerId)
    .sort((a, b) => (a.columnIndex ?? 0) - (b.columnIndex ?? 0) || (a.orderIndex || 0) - (b.orderIndex || 0));
  const doors = topLevel.filter((c) => effectiveContainerType(c) === 'cabinet_door');

  const goFill = () => {
    setAppMode('view');
    setSelectedContainerId(null);
    setSelectedFurnitureId(setupFurnitureId);
    setSetup(setupFurnitureId, 'fill');
  };
  const finish = () => {
    setSetup(null);
    setFilled(new Set());
    setInsideMode(null);
  };

  const bar = (children: React.ReactNode) => (
    <div className="fixed top-[64px] sm:top-[72px] left-2 right-2 sm:left-auto sm:right-4 sm:w-[420px] z-40 bg-white rounded-2xl shadow-2xl border-2 border-indigo-400 p-3 space-y-2 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" /> Setting up {name}
        </span>
        <button onClick={finish} className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Stop setup">
          Stop
        </button>
      </div>
      {children}
    </div>
  );

  if (setupStep === 'place') {
    return bar(
      <>
        <p className="text-sm font-bold text-slate-800">Drag it to where it stands in the room. Rotate it with the toolbar if needed.</p>
        <button
          onClick={() => (doors.length > 0 ? setSetup(setupFurnitureId, 'inside') : goFill())}
          className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold cursor-pointer"
        >
          It's in place, next
        </button>
      </>
    );
  }

  if (setupStep === 'inside') {
    return (
      <>
        {bar(
          <>
            <p className="text-sm font-bold text-slate-800">Now open the doors so I can see what's behind them.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setInsideMode('all')} className="py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">
                All doors at once
              </button>
              <button onClick={() => setInsideMode(0)} className="py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">
                One door at a time
              </button>
            </div>
            <button onClick={goFill} className="w-full text-xs font-bold text-slate-500 cursor-pointer">
              Skip, I'll fill it as it is
            </button>
          </>
        )}
        {insideMode !== null && data?.furniture && (
          <InsidePhotoModal
            key={String(insideMode)}
            furnitureId={setupFurnitureId}
            furnitureName={name}
            doors={doors}
            door={typeof insideMode === 'number' ? doors[insideMode] : undefined}
            onClose={() => setInsideMode(null)}
            onDone={() => {
              if (typeof insideMode === 'number' && insideMode + 1 < doors.length) setInsideMode(insideMode + 1);
              else {
                setInsideMode(null);
                goFill();
              }
            }}
          />
        )}
      </>
    );
  }

  // Fill: every door, drawer and surface is a place to photograph
  return (
    <>
      {bar(
        <>
          <p className="text-sm font-bold text-slate-800">Fill it: open one place at a time and photograph it.</p>
          <div className="flex flex-wrap gap-1.5">
            {topLevel.map((c) => (
              <button
                key={c.id}
                onClick={() => setScanRoot(c.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 ${
                  filled.has(c.id) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700 hover:bg-indigo-50'
                }`}
              >
                {filled.has(c.id) ? <Check className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                {c.name}
              </button>
            ))}
          </div>
          <button onClick={finish} className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold cursor-pointer">
            Done for now
          </button>
        </>
      )}
      {scanRoot && (
        <ScanItemsModal
          furnitureId={setupFurnitureId}
          rootContainerId={scanRoot}
          onAdded={() => setFilled((prev) => new Set(prev).add(scanRoot))}
          onClose={() => setScanRoot(null)}
        />
      )}
    </>
  );
};
