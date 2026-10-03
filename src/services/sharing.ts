import { db } from '../db/database';
import { API_BASE_URL, getWorkspaceApiKey, recordPendingDelete } from './apiSync';

// Rooms other people shared with this user live in the same local database, marked with shareId.
// They never go into this user's own cloud workspace: edits are pushed to the owner through
// share.php, and the whole shared room is refreshed from the owner on every shared sync.

export type ShareRole = 'view' | 'edit';
export type ShareMeta = { role: ShareRole; ownerName: string; ownerEmail: string; roomId: string };
export type OutgoingShare = {
  id: string;
  roomId: string;
  email: string;
  role: ShareRole;
  status: 'active' | 'invited';
  contactName: string | null;
  inviteLink: string;
};

type Table = 'rooms' | 'furniture' | 'containers' | 'items';
const TABLES: Table[] = ['rooms', 'furniture', 'containers', 'items'];
const META_KEY = 'placemend_shared_meta';
const PENDING_KEY = 'placemend_shared_pending_deletes';

// ---------------------------------------------------------------- local state

let meta: Record<string, ShareMeta> = load(META_KEY);
const owner = new Map<string, string>(); // id of a shared room/furniture/container -> shareId
let applying = false; // set while writing server data, so the hooks stay out of the way

function load<T>(key: string): Record<string, T> {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export const getShareMeta = (shareId?: string | null): ShareMeta | null => (shareId ? meta[shareId] ?? null : null);
const viewOnly = (shareId?: string) => !!shareId && meta[shareId]?.role === 'view';

let lastAlert = 0;
function readOnlyError(): Error {
  const msg = 'This room is shared with you as view-only.';
  if (Date.now() - lastAlert > 5000) {
    lastAlert = Date.now();
    setTimeout(() => window.alert(msg), 0);
  }
  return new Error(msg);
}

function addPendingShared(shareId: string, table: Table, id: string) {
  const p = load<Partial<Record<Table, Record<string, number>>>>(PENDING_KEY);
  const forShare = p[shareId] ?? {};
  forShare[table] = { ...(forShare[table] ?? {}), [id]: Date.now() };
  p[shareId] = forShare;
  save(PENDING_KEY, p);
}

const parentOf = (table: Table, r: Record<string, unknown>): string | undefined => {
  if (table === 'furniture') return r.roomId as string;
  if (table === 'containers') return (r.parentContainerId as string) || (r.furnitureId as string);
  if (table === 'items') return r.containerId as string;
  return undefined;
};
const parentField: Partial<Record<Table, string[]>> = {
  furniture: ['roomId'],
  containers: ['furnitureId', 'parentContainerId'],
  items: ['containerId'],
};

/** Rebuild the id -> share map from the local database (call once at startup) */
export async function initSharedIndex(): Promise<void> {
  owner.clear();
  for (const t of ['rooms', 'furniture', 'containers'] as Table[]) {
    const rows = await db.table(t).filter((r) => !!r.shareId).toArray();
    for (const r of rows) owner.set(r.id, r.shareId);
  }
}

// New records inside a shared room belong to that share; view-only shares refuse all writes.
for (const t of TABLES) {
  db.table(t).hook('creating', (primKey, obj) => {
    if (applying) return;
    const sid = owner.get(parentOf(t, obj) ?? '');
    if (!sid) return;
    if (viewOnly(sid)) throw readOnlyError();
    obj.shareId = sid;
    if (t !== 'items') owner.set(String(primKey ?? obj.id), sid);
  });

  db.table(t).hook('updating', (modifications, primKey, obj) => {
    const mods = modifications as Record<string, unknown>;
    if (applying) return;
    const old: string | undefined = obj.shareId;
    if (viewOnly(old)) throw readOnlyError();
    const fields = parentField[t] ?? [];
    if (!fields.some((f) => f in mods)) return;
    const next = { ...obj, ...mods };
    const sid = owner.get(parentOf(t, next) ?? '');
    if (sid === old) return;
    if (viewOnly(sid)) throw readOnlyError();
    // It changes hands: remove it on the side it leaves
    if (old) addPendingShared(old, t, String(primKey));
    else recordPendingDelete(t, String(primKey));
    if (t !== 'items') {
      if (sid) owner.set(String(primKey), sid);
      else owner.delete(String(primKey));
    }
    return { shareId: sid } as typeof modifications;
  });

  db.table(t).hook('deleting', (primKey, obj) => {
    if (applying || !obj?.shareId) return;
    // Local copies of view-only rooms may be cleared (sign out, restore a backup); nothing is sent
    // to the owner and the next shared sync brings the room back.
    if (viewOnly(obj.shareId)) return;
    addPendingShared(obj.shareId, t, String(primKey));
  });
}

// ---------------------------------------------------------------- server calls

async function call(method: 'GET' | 'POST', query: string, body?: unknown) {
  const res = await fetch(`${API_BASE_URL}/share.php${query}`, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-API-Key': getWorkspaceApiKey() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP error ${res.status}`);
  return json;
}

const signedIn = () => getWorkspaceApiKey().startsWith('pm_usr_');

/** Send this device's edits in shared rooms (edit permission only) to their owners */
export async function pushShared(): Promise<void> {
  if (!signedIn()) return;
  const pending = load<Partial<Record<Table, Record<string, number>>>>(PENDING_KEY);
  const shareIds = new Set([...Object.keys(meta), ...Object.keys(pending)]);
  for (const sid of shareIds) {
    if (meta[sid]?.role !== 'edit') {
      delete pending[sid]; // view-only or gone: nothing can be sent
      continue;
    }
    const payload: Record<string, unknown> = { action: 'push', shareId: sid, deleted: pending[sid] ?? {} };
    for (const t of TABLES) payload[t] = await db.table(t).filter((r) => r.shareId === sid).toArray();
    try {
      await call('POST', '', payload);
      delete pending[sid];
    } catch (e) {
      console.warn('Shared push failed', e);
    }
  }
  save(PENDING_KEY, pending);
}

/** Refresh every room shared with this user from its owner */
export async function pullShared(): Promise<void> {
  if (!signedIn()) return;
  const json = await call('GET', '?action=incoming');
  const shared: { share: { id: string; roomId: string; role: ShareRole; ownerName: string; ownerEmail: string }; data: Record<Table, { id: string }[]> }[] = json.shared ?? [];
  const nextMeta: Record<string, ShareMeta> = {};
  const incoming: Record<Table, Record<string, unknown>[]> = { rooms: [], furniture: [], containers: [], items: [] };
  for (const s of shared) {
    nextMeta[s.share.id] = { role: s.share.role, ownerName: s.share.ownerName, ownerEmail: s.share.ownerEmail, roomId: s.share.roomId };
    for (const t of TABLES) for (const r of s.data[t] ?? []) incoming[t].push({ ...r, shareId: s.share.id });
  }

  applying = true;
  try {
    await db.transaction('rw', [db.rooms, db.furniture, db.containers, db.items], async () => {
      for (const t of TABLES) {
        const keep = new Set(incoming[t].map((r) => r.id as string));
        const stale = (await db.table(t).filter((r) => !!r.shareId).toArray()).filter((r) => !keep.has(r.id)).map((r) => r.id);
        if (stale.length) await db.table(t).bulkDelete(stale);
        if (incoming[t].length) await db.table(t).bulkPut(incoming[t]);
      }
    });
  } finally {
    applying = false;
  }
  meta = nextMeta;
  save(META_KEY, meta);
  await initSharedIndex();
}

let syncing: Promise<void> | null = null;
/** Push then pull shared rooms; concurrent calls share one run */
export function syncShared(): Promise<void> {
  if (!syncing) {
    syncing = (async () => {
      try {
        await pushShared();
        await pullShared();
      } catch (e) {
        console.warn('Shared sync failed', e);
      } finally {
        syncing = null;
      }
    })();
  }
  return syncing;
}

// owner side
export async function listShares(roomId: string): Promise<OutgoingShare[]> {
  return (await call('GET', `?action=list&roomId=${encodeURIComponent(roomId)}`)).shares;
}
export async function addShare(roomId: string, email: string, role: ShareRole): Promise<OutgoingShare> {
  return (await call('POST', '', { action: 'add', roomId, email, role })).share;
}
export async function updateShare(shareId: string, role: ShareRole): Promise<void> {
  await call('POST', '', { action: 'update', shareId, role });
}
export async function removeShare(shareId: string): Promise<void> {
  await call('POST', '', { action: 'remove', shareId });
}

/** Contact side: stop seeing a shared room */
export async function leaveShare(shareId: string): Promise<void> {
  await call('POST', '', { action: 'leave', shareId });
  await pullShared();
}
