import React, { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { getWorkspaceApiKey } from '../services/apiSync';
import { addShare, getShareMeta, leaveShare, listShares, removeShare, updateShare, OutgoingShare, ShareRole } from '../services/sharing';
import { X, Users, Copy, Check, Trash2, Mail, LogOut } from 'lucide-react';

const RoleSelect: React.FC<{ value: ShareRole; onChange: (r: ShareRole) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <div className="flex rounded-xl bg-slate-100 p-0.5" role="radiogroup" aria-label="Permission">
    {(['view', 'edit'] as ShareRole[]).map((r) => (
      <button
        key={r}
        type="button"
        role="radio"
        aria-checked={value === r}
        disabled={disabled}
        onClick={() => onChange(r)}
        className={`min-h-[40px] px-3 rounded-lg text-xs font-bold cursor-pointer ${value === r ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
      >
        {r === 'view' ? 'Can view' : 'Can edit'}
      </button>
    ))}
  </div>
);

/** Share a room with contacts by email, or (for a room shared with you) see who shared it */
export const ShareRoomModal: React.FC = () => {
  const roomId = useAppStore((s) => s.shareRoomId);
  const close = () => useAppStore.getState().setShareRoomId(null);
  const room = useLiveQuery(() => (roomId ? db.rooms.get(roomId) : undefined), [roomId]);
  const [shares, setShares] = useState<OutgoingShare[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('view');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const signedIn = getWorkspaceApiKey().startsWith('pm_usr_');
  const incoming = getShareMeta(room?.shareId);

  const load = useCallback(async () => {
    if (!roomId || !signedIn || incoming) return;
    try {
      setShares(await listShares(roomId));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load shares.');
    }
  }, [roomId, signedIn, incoming]);

  useEffect(() => {
    setShares(null);
    setMessage(null);
    setEmail('');
    void load();
  }, [load]);

  if (!roomId) return null;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage(ok);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (s: OutgoingShare) => {
    const text = `${room?.name ?? 'A room'} is shared with you in Placemend. Open it here and sign in with Google using ${s.email}: ${s.inviteLink}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Placemend', text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(s.id);
        setTimeout(() => setCopied(null), 1800);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share room"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[88vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-slate-900 truncate">Share “{room?.name ?? 'room'}”</h2>
            <p className="text-xs text-slate-500">{incoming ? 'Shared with you' : 'Contacts see this room, its furniture and items.'}</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="w-11 h-11 rounded-xl text-slate-500 hover:bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {message && <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-800">{message}</div>}

          {!signedIn && <p className="text-sm text-slate-500 text-center py-6">Sign in with Google to share rooms.</p>}

          {signedIn && incoming && (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                <b>{incoming.ownerName}</b> shared this room with you. You <b>{incoming.role === 'edit' ? 'can edit' : 'can view'}</b> it.
                {incoming.role === 'edit' && ' Your changes go straight to their inventory and show up in their history.'}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(async () => { await leaveShare(room!.shareId!); close(); })}
                className="w-full min-h-[48px] rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Remove this room from my Placemend
              </button>
            </div>
          )}

          {signedIn && !incoming && (
            <>
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim()) void run(async () => { const s = await addShare(roomId, email.trim(), role); setEmail(''); if (s.status === 'invited') await copy(s); }, 'Shared!');
                }}
              >
                <label className="block text-xs font-bold text-slate-600">Contact's Google email</label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:ring-2 focus-within:ring-blue-500">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="flex-1 min-h-[48px] bg-transparent text-sm focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <RoleSelect value={role} onChange={setRole} />
                  <button type="submit" disabled={busy || !email.trim()} className="ml-auto min-h-[44px] px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50">
                    Share
                  </button>
                </div>
              </form>

              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Shared with</div>
                {shares === null && <p className="text-sm text-slate-400">Loading…</p>}
                {shares?.length === 0 && <p className="text-sm text-slate-500">Nobody yet.</p>}
                <div className="space-y-2">
                  {shares?.map((s) => (
                    <div key={s.id} className="p-3 rounded-2xl border border-slate-200 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{s.contactName ?? s.email}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {s.contactName ? s.email : s.status === 'invited' ? 'Invited · not on Placemend yet' : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(() => removeShare(s.id), 'Stopped sharing.')}
                          aria-label={`Stop sharing with ${s.email}`}
                          className="w-11 h-11 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <RoleSelect value={s.role} disabled={busy} onChange={(r) => void run(() => updateShare(s.id, r))} />
                        <button
                          type="button"
                          onClick={() => void copy(s)}
                          className="ml-auto min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                        >
                          {copied === s.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                          {copied === s.id ? 'Copied' : 'Send invite'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Your contact signs in to Placemend with this Google email and the room shows up in their room list.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
