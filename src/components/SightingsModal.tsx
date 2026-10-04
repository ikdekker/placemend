import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { getWorkspaceApiKey } from '../services/apiSync';
import {
  Sighting,
  SightingSource,
  SecondPassMode,
  fetchSightings,
  fetchSightingPhoto,
  acceptSighting,
  linkSighting,
  dismissSighting,
  updateSourceSettings,
  runSecondPass,
} from '../services/sightings';
import { nameSimilarity } from '../utils/itemMatch';
import { Item } from '../types';
import { X, Inbox, RefreshCw, Bot, Camera, Settings2, Sparkles, Plus, Link2, Trash2 } from 'lucide-react';

const FLOOR = '__floor__';

const whenLabel = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const SECOND_PASS_LABELS: [SecondPassMode, string][] = [
  ['off', 'Off'],
  ['on_demand', 'On request'],
  ['auto', 'Automatic'],
];

function SightingPhoto({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let alive = true;
    fetchSightingPhoto(id)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url ? (
    <img src={url} alt="" className="w-full aspect-[6/5] object-cover rounded-2xl bg-slate-100" />
  ) : (
    <div className="w-full aspect-[6/5] rounded-2xl bg-slate-100 animate-pulse" />
  );
}

type Place = { id: string; label: string; roomId: string };

/** Inbox of things cameras and robots spotted: accept as item, link to an existing one, or dismiss */
export const SightingsModal: React.FC = () => {
  const open = useAppStore((s) => s.isSightingsOpen);
  const setOpen = useAppStore((s) => s.setSightingsOpen);
  const setPending = useAppStore((s) => s.setSightingsPending);
  const [sightings, setSightings] = useState<Sighting[] | null>(null);
  const [sources, setSources] = useState<Record<string, SightingSource>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [placeFor, setPlaceFor] = useState<Record<string, string>>({});

  const signedIn = getWorkspaceApiKey().startsWith('pm_usr_');

  // Own rooms, places and items, for "where to put it" and matching
  const ws = useLiveQuery(async () => {
    const own = <T extends { shareId?: string }>(rows: T[]) => rows.filter((r) => !r.shareId);
    return {
      rooms: own(await db.rooms.toArray()),
      furniture: own(await db.furniture.toArray()),
      containers: own(await db.containers.toArray()),
      items: own(await db.items.toArray()),
    };
  }, []);

  const places = useMemo<Place[]>(() => {
    if (!ws) return [];
    const room = new Map(ws.rooms.map((r) => [r.id, r]));
    const furn = new Map(ws.furniture.map((f) => [f.id, f]));
    const cont = new Map(ws.containers.map((c) => [c.id, c]));
    const out: Place[] = [];
    for (const c of ws.containers) {
      const parts = [c.name];
      let root = c;
      let parent = c.parentContainerId ? cont.get(c.parentContainerId) : undefined;
      for (let guard = 0; parent && guard < 10; guard++) {
        parts.unshift(parent.name);
        root = parent;
        parent = parent.parentContainerId ? cont.get(parent.parentContainerId) : undefined;
      }
      const f = furn.get(root.furnitureId);
      const r = f && room.get(f.roomId);
      if (!f || !r) continue;
      out.push({ id: c.id, roomId: r.id, label: [r.name, f.name, ...parts].join(' › ') });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [ws]);

  const placeLabel = useCallback((containerId: string) => places.find((p) => p.id === containerId)?.label ?? '', [places]);

  const load = useCallback(async () => {
    if (!open || !signedIn) return;
    setError(null);
    try {
      const res = await fetchSightings();
      setSightings(res.sightings);
      setSources(res.sources);
      setPending(res.pendingCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the sightings.');
    }
  }, [open, signedIn, setPending]);

  useEffect(() => {
    setSightings(null);
    setNotice(null);
    void load();
  }, [load]);

  const knownNamesFor = useCallback(
    (s: Sighting) => {
      if (!ws) return [];
      const inRoom = (it: Item) => {
        const label = placeLabel(it.containerId);
        return !s.roomName || label.startsWith(`${s.roomName} ›`);
      };
      return ws.items.filter(inRoom).map((it) => it.name);
    },
    [ws, placeLabel]
  );

  const secondPass = useCallback(
    async (s: Sighting) => {
      setBusy(s.id);
      try {
        const items = await runSecondPass(s, knownNamesFor(s));
        setSightings((prev) => prev?.map((x) => (x.id === s.id ? { ...x, ai: { at: Date.now(), model: '', items } } : x)) ?? prev);
        if (items[0] && !names[s.id]) setNames((n) => ({ ...n, [s.id]: items[0].name }));
      } catch (e) {
        setNotice(e instanceof Error ? e.message : 'The AI pass failed.');
      } finally {
        setBusy(null);
      }
    },
    [knownNamesFor, names]
  );

  // Sources set to "Automatic": run the AI pass for their unmatched sightings when the inbox opens
  const autoRan = useRef(false);
  useEffect(() => {
    if (!open) autoRan.current = false;
    if (!open || autoRan.current || !sightings || !ws) return;
    autoRan.current = true;
    const todo = sightings.filter((s) => !s.ai && s.photo && sources[s.sourceKey]?.secondPass === 'auto').slice(0, 5);
    void (async () => {
      for (const s of todo) await secondPass(s);
    })();
  }, [open, sightings, sources, ws, secondPass]);

  if (!open) return null;

  const run = async (id: string, fn: () => Promise<string>) => {
    setBusy(id);
    setNotice(null);
    try {
      setNotice(await fn());
      setSightings((prev) => prev?.filter((s) => s.id !== id) ?? prev);
      setPending(Math.max(0, (sightings?.length ?? 1) - 1));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async (key: string, change: Partial<Pick<SightingSource, 'secondPass' | 'ignoredLabels'>>) => {
    setSources((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
    try {
      await updateSourceSettings(key, change);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not save the setting.');
      void load();
    }
  };

  // Existing items this could be: by the camera's label and the AI's names
  const matchesFor = (s: Sighting) => {
    if (!ws) return [];
    const candidates = [s.label, ...(s.ai?.items.map((i) => i.name) ?? [])].filter(Boolean);
    return ws.items
      .map((it) => ({ it, score: Math.max(0, ...candidates.map((c) => nameSimilarity(c, it.name))) }))
      .filter((m) => m.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  };

  const groups: { key: string; source: SightingSource; list: Sighting[] }[] = [];
  for (const s of sightings ?? []) {
    let g = groups.find((x) => x.key === s.sourceKey);
    if (!g) {
      g = { key: s.sourceKey, source: sources[s.sourceKey] ?? { ...s.source, secondPass: 'on_demand', ignoredLabels: [] }, list: [] };
      groups.push(g);
    }
    g.list.push(s);
  }
  // Sources without anything pending still get their settings
  for (const [key, source] of Object.entries(sources)) {
    if (!groups.some((g) => g.key === key)) groups.push({ key, source, list: [] });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spotted items"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Inbox className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-slate-900 truncate">Spotted items</h2>
            <p className="text-xs text-slate-500">Things your robot vacuum or cameras saw lying around.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh"
            className="w-11 h-11 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="w-11 h-11 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {notice && <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-800">{notice}</div>}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!signedIn && <p className="text-sm text-slate-500 py-8 text-center">Sign in to receive items spotted by your robot vacuum or cameras.</p>}
          {signedIn && error && <p className="text-sm text-rose-600 py-8 text-center">{error}</p>}
          {signedIn && !error && sightings === null && <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>}
          {signedIn && sightings?.length === 0 && groups.length === 0 && (
            <p className="text-sm text-slate-500 py-8 text-center">
              Nothing spotted yet. Connect a robot vacuum or camera (e.g. through Home Assistant) and what it sees shows up here.
            </p>
          )}

          {groups.map((g) => {
            const SourceIcon = g.source.type.includes('robot') || g.source.type.includes('vacuum') ? Bot : Camera;
            const unmatched = g.list.filter((s) => !s.ai && s.photo);
            return (
              <section key={g.key} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <SourceIcon className="w-4 h-4 text-slate-500" />
                  <h3 className="flex-1 text-[11px] font-black uppercase tracking-wider text-slate-500 truncate">
                    {g.source.name} · {g.list.length} waiting
                  </h3>
                  {g.source.secondPass !== 'off' && unmatched.length > 0 && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void (async () => { for (const s of unmatched) await secondPass(s); })()}
                      className="min-h-[36px] px-2.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Match items from {g.source.name}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSettingsFor(settingsFor === g.key ? null : g.key)}
                    aria-label={`Settings for ${g.source.name}`}
                    className="w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>

                {settingsFor === g.key && (
                  <div className="mb-3 p-3 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-slate-700 mb-1.5">AI second pass (names the exact item)</p>
                      <div className="flex bg-white p-0.5 rounded-xl border border-slate-200">
                        {SECOND_PASS_LABELS.map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => void saveSettings(g.key, { secondPass: mode })}
                            className={`flex-1 min-h-[36px] rounded-lg text-xs font-bold cursor-pointer ${
                              g.source.secondPass === mode ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">Automatic runs when you open this inbox and uses your daily photo-scan budget.</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-700 mb-1.5">Ignored labels (never sent to the inbox)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {g.source.ignoredLabels.map((l) => (
                          <button
                            key={l}
                            type="button"
                            onClick={() => void saveSettings(g.key, { ignoredLabels: g.source.ignoredLabels.filter((x) => x !== l) })}
                            className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
                            title="Stop ignoring"
                          >
                            {l} <X className="w-3 h-3" />
                          </button>
                        ))}
                        <input
                          type="text"
                          placeholder="Add label + Enter"
                          onKeyDown={(e) => {
                            const v = e.currentTarget.value.trim();
                            if (e.key !== 'Enter' || !v) return;
                            e.currentTarget.value = '';
                            void saveSettings(g.key, { ignoredLabels: [...g.source.ignoredLabels, v] });
                          }}
                          className="px-2 py-1 rounded-lg border border-slate-200 text-xs w-36"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {g.list.map((s) => {
                    const name = names[s.id] ?? s.ai?.items[0]?.name ?? s.label;
                    const roomPlaces = places.filter((p) => !s.roomId || p.roomId === s.roomId);
                    const place = placeFor[s.id] ?? (s.roomId ? FLOOR : '');
                    const matches = matchesFor(s);
                    return (
                      <article key={s.id} className="p-3 rounded-2xl border border-slate-200 bg-white space-y-2.5">
                        {s.photo && <SightingPhoto id={s.id} />}
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          {s.label && <span className="px-2 py-0.5 rounded-md bg-slate-100 font-bold text-slate-700">{s.label}{s.confidence !== null ? ` · ${s.confidence}%` : ''}</span>}
                          {s.roomName && <span className="font-semibold text-slate-600">{s.roomName}</span>}
                          <span className="font-mono text-slate-400">{whenLabel(s.seenAt)}</span>
                        </div>

                        {s.ai && s.ai.items.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {s.ai.items.map((it) => (
                              <button
                                key={it.name}
                                type="button"
                                onClick={() => setNames((n) => ({ ...n, [s.id]: it.brand && !it.name.includes(it.brand) ? `${it.brand} ${it.name}` : it.name }))}
                                className="px-2 py-1 rounded-lg bg-violet-50 border border-violet-200 text-xs font-semibold text-violet-800 cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3 inline mr-1" />
                                {it.brand && !it.name.includes(it.brand) ? `${it.brand} ${it.name}` : it.name} · {Math.round(it.confidence * 100)}%
                              </button>
                            ))}
                          </div>
                        )}
                        {s.ai && s.ai.items.length === 0 && <p className="text-xs text-slate-500">The AI could not name anything in this photo.</p>}

                        {matches.length > 0 && (
                          <div className="space-y-1.5">
                            {matches.map(({ it }) => (
                              <button
                                key={it.id}
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void run(s.id, () => linkSighting(s.id, it.id))}
                                className="w-full min-h-[44px] px-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-left text-xs font-semibold text-blue-800 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                              >
                                <Link2 className="w-4 h-4 flex-shrink-0" />
                                <span className="min-w-0 truncate">
                                  It's my <b>{it.name}</b> <span className="text-blue-600/70">({placeLabel(it.containerId) || 'stored'})</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setNames((n) => ({ ...n, [s.id]: e.target.value }))}
                          placeholder="Item name"
                          className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm font-semibold"
                        />
                        <select
                          value={place}
                          onChange={(e) => setPlaceFor((p) => ({ ...p, [s.id]: e.target.value }))}
                          className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm bg-white"
                        >
                          {!s.roomId && <option value="">Choose where it goes…</option>}
                          {s.roomId && <option value={FLOOR}>{s.roomName} › Floor</option>}
                          {roomPlaces.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                          {s.roomId && places.length > roomPlaces.length && (
                            <optgroup label="Other rooms">
                              {places.filter((p) => p.roomId !== s.roomId).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy !== null || !name.trim() || !place}
                            onClick={() =>
                              void run(s.id, () =>
                                acceptSighting(s.id, { name: name.trim(), ...(place === FLOOR ? {} : { containerId: place }) })
                              )
                            }
                            className="flex-1 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Plus className="w-4 h-4" />
                            Add as item
                          </button>
                          {g.source.secondPass !== 'off' && !s.ai && s.photo && (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void secondPass(s)}
                              aria-label="Name it with AI"
                              className="min-h-[44px] px-3 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Sparkles className={`w-4 h-4 ${busy === s.id ? 'animate-pulse' : ''}`} />
                              AI
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void run(s.id, async () => (await dismissSighting(s.id)).message)}
                            aria-label="Dismiss"
                            className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 flex items-center cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
