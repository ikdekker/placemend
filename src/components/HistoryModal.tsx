import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { fetchHistory, getWorkspaceApiKey, undoHistoryEntry, HistoryEntry } from '../services/apiSync';
import { X, History, Undo2, Smartphone, Monitor, Bot, RotateCcw, Plus, Minus, Pencil, RefreshCw } from 'lucide-react';

const dayLabel = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};

const timeLabel = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function SourceChip({ source }: { source: string }) {
  const s = source.toLowerCase();
  const Icon = s.includes('phone') ? Smartphone : s.includes('computer') ? Monitor : s.includes('undo') ? RotateCcw : Bot;
  const tone = s.includes('chatgpt') || s.includes('claude') || s.includes('gemini') || s.includes('assistant')
    ? 'bg-violet-50 text-violet-700 border-violet-200'
    : s.includes('undo')
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-bold ${tone}`}>
      <Icon className="w-3 h-3" />
      {source}
    </span>
  );
}

const actionIcon = (a: HistoryEntry['action']) =>
  a === 'create' ? <Plus className="w-4 h-4 text-emerald-600" /> : a === 'delete' ? <Minus className="w-4 h-4 text-rose-600" /> : <Pencil className="w-4 h-4 text-blue-600" />;

/** Change history (all changes, or one item's), with undo */
export const HistoryModal: React.FC = () => {
  const view = useAppStore((s) => s.historyView);
  const setView = useAppStore((s) => s.setHistoryView);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signedIn = getWorkspaceApiKey().startsWith('pm_usr_');

  const load = useCallback(async () => {
    if (!view || !signedIn) return;
    setError(null);
    try {
      setEntries(await fetchHistory(view.recordId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the history.');
    }
  }, [view, signedIn]);

  useEffect(() => {
    setEntries(null);
    setNotice(null);
    void load();
  }, [load]);

  if (!view) return null;

  const undo = async (e: HistoryEntry) => {
    setBusyId(e.id);
    setNotice(null);
    try {
      setNotice(await undoHistoryEntry(e.id));
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Undo failed.');
    } finally {
      setBusyId(null);
    }
  };

  // group by day
  const groups: { day: string; list: HistoryEntry[] }[] = [];
  for (const e of entries ?? []) {
    const day = dayLabel(e.at);
    if (groups.length === 0 || groups[groups.length - 1].day !== day) groups.push({ day, list: [] });
    groups[groups.length - 1].list.push(e);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => setView(null)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change history"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <History className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-slate-900 truncate">{view.title ? `History: ${view.title}` : 'Change history'}</h2>
            <p className="text-xs text-slate-500">Every change, who made it, and undo.</p>
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
            onClick={() => setView(null)}
            aria-label="Close"
            className="w-11 h-11 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {notice && <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-800">{notice}</div>}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!signedIn && <p className="text-sm text-slate-500 py-8 text-center">Sign in to keep a change history in the cloud.</p>}
          {signedIn && error && <p className="text-sm text-rose-600 py-8 text-center">{error}</p>}
          {signedIn && !error && entries === null && <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>}
          {signedIn && entries?.length === 0 && (
            <p className="text-sm text-slate-500 py-8 text-center">
              No changes recorded yet. From now on, every change in the app or by an AI assistant shows up here.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.day} className="mb-3">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1">{g.day}</div>
              <div className="space-y-1.5">
                {g.list.map((e) => (
                  <div key={e.id} className={`flex items-start gap-2.5 p-2.5 rounded-2xl border ${e.undone ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200'}`}>
                    <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">{actionIcon(e.action)}</div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold text-slate-800 leading-snug break-words ${e.undone ? 'line-through' : ''}`}>{e.summary}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[11px] font-mono text-slate-400">{timeLabel(e.at)}</span>
                        <SourceChip source={e.source} />
                        {e.undone && <span className="text-[11px] font-bold text-slate-400">undone</span>}
                      </div>
                    </div>
                    {!e.undone && (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void undo(e)}
                        className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer disabled:opacity-50 flex-shrink-0"
                      >
                        <Undo2 className={`w-4 h-4 ${busyId === e.id ? 'animate-spin' : ''}`} />
                        Undo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
