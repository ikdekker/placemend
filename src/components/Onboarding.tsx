import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Room } from '../types';
import { getWorkspaceApiKey, scheduleAutoSync } from '../services/apiSync';
import { getAppMode, getOnboardingStep, setAppMode, setOnboardingStep, OnboardingStep } from '../services/appMode';
import { seedDemoDataIfEmpty } from '../db/sampleData';
import { Camera, LayoutGrid, MapPin, Search, Sparkles, User, ArrowRight, Check } from 'lucide-react';

const ROOM_NAMES = ['Kitchen', 'Living room', 'Bedroom', 'Home office', 'Hallway', 'Bathroom', 'Storage room', 'Garage'];
const SIZES = [
  { key: 'S', label: 'Small', hint: 'about 3 × 2.5 m', w: 3, h: 2.5 },
  { key: 'M', label: 'Medium', hint: 'about 4 × 3.5 m', w: 4, h: 3.5 },
  { key: 'L', label: 'Large', hint: 'about 6 × 4 m', w: 6, h: 4 },
] as const;
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

const Shell: React.FC<{ children: React.ReactNode; step?: number }> = ({ children, step }) => (
  <div className="fixed inset-0 z-[70] bg-gradient-to-b from-blue-50 via-white to-white overflow-y-auto">
    <div className="min-h-full max-w-md mx-auto px-5 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),24px)] flex flex-col">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-mono font-bold shadow-md shadow-blue-500/20">⌖</div>
        <span className="font-black text-lg text-slate-900">Placemend</span>
        {step !== undefined && (
          <div className="ml-auto flex gap-1.5" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((i) => (
              <span key={i} className={`h-1.5 w-6 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-slate-200'}`} />
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  </div>
);

const bigButton = 'w-full min-h-[56px] rounded-2xl px-4 font-bold text-base flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-all';

/** First-run guide: from an empty app to your own first room and cupboard in a few taps */
export const Onboarding: React.FC<{ ready: boolean }> = ({ ready }) => {
  const roomCount = useLiveQuery(() => db.rooms.count(), []);
  const { setAccountModalOpen, setSelectedRoomId, setAddWithPhotoOpen, setFurnitureLibraryOpen, setAppMode: setViewMode } = useAppStore();
  const signedIn = getWorkspaceApiKey().startsWith('pm_usr_');
  const [step, setStepState] = useState<OnboardingStep>(() => {
    const saved = getOnboardingStep();
    if (saved && saved !== 'done') return signedIn && (saved === 'welcome' || saved === 'account') ? 'room' : saved;
    return signedIn ? 'room' : 'welcome';
  });
  const [roomName, setRoomName] = useState('');
  const [custom, setCustom] = useState('');
  const [size, setSize] = useState<(typeof SIZES)[number]['key']>('M');
  const [busy, setBusy] = useState(false);

  const go = (s: OnboardingStep) => {
    setOnboardingStep(s);
    setStepState(s);
  };

  if (!ready || roomCount === undefined) return null;
  const visible = (roomCount === 0 && getAppMode() !== 'demo' && step !== 'done') || step === 'furniture';
  if (!visible) return null;

  const startDemo = async () => {
    setAppMode('demo');
    go('done');
    await seedDemoDataIfEmpty();
    const first = await db.rooms.toCollection().first();
    if (first) setSelectedRoomId(first.id);
  };

  const createRoom = async () => {
    const name = (roomName === '__custom' ? custom : roomName).trim();
    if (!name) return;
    setBusy(true);
    try {
      const now = Date.now();
      const dims = SIZES.find((s) => s.key === size)!;
      if (!(await db.locations.get('loc-home'))) {
        await db.locations.put({ id: 'loc-home', name: 'My home', createdAt: now, updatedAt: now });
      }
      const room: Room = {
        id: `room-${now}`,
        locationId: 'loc-home',
        name,
        color: COLORS[(await db.rooms.count()) % COLORS.length],
        shapeType: 'rectangle',
        doors: [{ id: `door-${now}`, label: 'Door', wall: 'bottom', offset: Math.round(((dims.w - 0.8) / 2) * 100) / 100, swing: 'inward_left', width: 0.8 }],
        gridWidth: dims.w,
        gridHeight: dims.h,
        unitSize: 32,
        createdAt: now,
        updatedAt: now,
      };
      await db.rooms.add(room);
      setSelectedRoomId(room.id);
      scheduleAutoSync();
      go('furniture');
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------- welcome
  if (step === 'welcome') {
    return (
      <Shell>
        <h1 className="text-3xl font-black text-slate-900 leading-tight">Find anything in your home.</h1>
        <p className="mt-2 text-slate-600">Map your rooms and cupboards once. After that, you always know where things are.</p>
        <ul className="mt-6 space-y-3">
          {[
            [MapPin, 'Your rooms and furniture', 'Draw your home roughly, refine it any time.'],
            [Camera, 'Photograph a cupboard', 'The AI lists what’s inside, you check and save.'],
            [Search, 'Ask “where is…?”', 'Search, or ask ChatGPT, Claude or Alexa.'],
          ].map(([Icon, title, text]) => {
            const I = Icon as typeof MapPin;
            return (
              <li key={title as string} className="flex gap-3 p-3 rounded-2xl bg-white border border-slate-200 shadow-xs">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0"><I className="w-5 h-5" /></div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{title as string}</p>
                  <p className="text-xs text-slate-500">{text as string}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto pt-8 space-y-2.5">
          <button type="button" onClick={() => { setAppMode('own'); go(signedIn ? 'room' : 'account'); }} className={`${bigButton} bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20`}>
            Set up my home <ArrowRight className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => void startDemo()} className={`${bigButton} bg-white border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            Look around a demo home first
          </button>
          <button type="button" onClick={() => { setAppMode('own'); go('account'); setAccountModalOpen(true); }} className="w-full min-h-[44px] text-sm font-bold text-blue-700 cursor-pointer">
            I already have an account
          </button>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------- account
  if (step === 'account') {
    return (
      <Shell step={1}>
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><User className="w-6 h-6" /></div>
        <h1 className="mt-4 text-2xl font-black text-slate-900">Save your home to your account</h1>
        <p className="mt-2 text-slate-600 text-sm">
          With a Google account your home is on all your devices, photo scanning works, and you can share rooms with family.
        </p>
        <div className="mt-auto pt-8 space-y-2.5">
          <button type="button" onClick={() => setAccountModalOpen(true)} className={`${bigButton} bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20`}>
            Continue with Google
          </button>
          <button type="button" onClick={() => go('room')} className={`${bigButton} bg-white border border-slate-300 text-slate-700 hover:bg-slate-50`}>
            Not now, only on this device
          </button>
          <p className="text-[11px] text-slate-500 text-center">Without an account, photo scanning is off. You can sign in later from the account menu.</p>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------- room
  if (step === 'room') {
    const chosen = roomName === '__custom' ? custom.trim() : roomName;
    return (
      <Shell step={2}>
        <h1 className="text-2xl font-black text-slate-900">Which room first?</h1>
        <p className="mt-1 text-slate-600 text-sm">Pick the room where you most often search for things. You can add the others later.</p>
        <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Room">
          {ROOM_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={roomName === n}
              onClick={() => setRoomName(n)}
              className={`min-h-[52px] rounded-2xl text-sm font-bold cursor-pointer border ${roomName === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'}`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={roomName === '__custom'}
            onClick={() => setRoomName('__custom')}
            className={`col-span-2 min-h-[52px] rounded-2xl text-sm font-bold cursor-pointer border ${roomName === '__custom' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}
          >
            Something else…
          </button>
        </div>
        {roomName === '__custom' && (
          <input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Attic, Shed, Kids' room"
            aria-label="Room name"
            className="mt-2 w-full min-h-[52px] px-4 rounded-2xl border border-slate-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        <h2 className="mt-6 text-sm font-black text-slate-900">Roughly how big?</h2>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Room size">
          {SIZES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={size === s.key}
              onClick={() => setSize(s.key)}
              className={`min-h-[60px] rounded-2xl cursor-pointer border flex flex-col items-center justify-center ${size === s.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}
            >
              <span className="text-sm font-bold">{s.label}</span>
              <span className={`text-[11px] ${size === s.key ? 'text-blue-100' : 'text-slate-500'}`}>{s.hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">No need to measure now: you can set exact walls later.</p>

        <div className="mt-auto pt-8">
          <button type="button" disabled={!chosen || busy} onClick={() => void createRoom()} className={`${bigButton} bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 disabled:opacity-40`}>
            Create {chosen || 'room'} <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </Shell>
    );
  }

  // ---------------------------------------------------------------- first furniture
  return (
    <Shell step={3}>
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Check className="w-6 h-6" /></div>
      <h1 className="mt-4 text-2xl font-black text-slate-900">Now your first cupboard</h1>
      <p className="mt-1 text-slate-600 text-sm">A cupboard, wardrobe, shelf or drawer unit, whatever holds the most stuff.</p>
      <div className="mt-6 space-y-2.5">
        <button
          type="button"
          disabled={!signedIn}
          onClick={() => { go('done'); setViewMode('view'); setAddWithPhotoOpen(true); }}
          className="w-full p-4 rounded-2xl bg-white border-2 border-blue-600 text-left flex gap-3 items-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5" /></div>
          <div>
            <p className="font-bold text-slate-900">Take a photo of it</p>
            <p className="text-xs text-slate-500">The AI recognises it, then helps you fill it shelf by shelf.</p>
          </div>
        </button>
        {!signedIn && <p className="text-[11px] text-slate-500 px-1">Photo setup needs an account. Sign in from the account menu to use it.</p>}
        <button
          type="button"
          onClick={() => { go('done'); setViewMode('edit'); setFurnitureLibraryOpen(true); }}
          className="w-full p-4 rounded-2xl bg-white border border-slate-200 text-left flex gap-3 items-center cursor-pointer hover:border-blue-300"
        >
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0"><LayoutGrid className="w-5 h-5" /></div>
          <div>
            <p className="font-bold text-slate-900">Pick it from the catalogue</p>
            <p className="text-xs text-slate-500">Common furniture like IKEA PAX, KALLAX, kitchen cabinets.</p>
          </div>
        </button>
      </div>
      <div className="mt-auto pt-8">
        <button type="button" onClick={() => go('done')} className="w-full min-h-[48px] text-sm font-bold text-slate-500 cursor-pointer">
          Skip, I'll look around first
        </button>
      </div>
    </Shell>
  );
};

/** Shown while viewing the demo home: one tap to start with your own */
export const DemoBanner: React.FC = () => {
  if (getAppMode() !== 'demo') return null;
  const startOwn = async () => {
    if (!window.confirm('Leave the demo and start with your own home? The demo rooms are removed from this device.')) return;
    const { clearLocalData } = await import('../services/apiSync');
    await clearLocalData();
    setAppMode('own');
    setOnboardingStep(getWorkspaceApiKey().startsWith('pm_usr_') ? 'room' : 'account');
    window.location.reload();
  };
  return (
    <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center gap-2 text-xs">
      <span className="font-bold text-amber-900">You're looking at a demo home.</span>
      <button type="button" onClick={() => void startOwn()} className="ml-auto min-h-[36px] px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold cursor-pointer">
        Start my own home
      </button>
    </div>
  );
};
