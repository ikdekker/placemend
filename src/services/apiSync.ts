import { db } from '../db/database';
import { Furniture, Container, Item, Room, Location } from '../types';

const STORAGE_KEY = 'placemend_api_key';
const AUTO_SYNC_KEY = 'placemend_auto_sync_enabled';

export const API_BASE_URL = 'https://freshcoders.nl/placemend/api';

/**
 * Get or initialize workspace API key stored in browser localStorage
 */
export function getWorkspaceApiKey(): string {
  let key = localStorage.getItem(STORAGE_KEY);
  if (!key || key.trim() === '') {
    key = 'pm_live_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    localStorage.setItem(STORAGE_KEY, key);
  }
  return key.trim();
}

/**
 * Save user custom or regenerated API key
 */
export function setWorkspaceApiKey(key: string): void {
  const cleanKey = key.trim() || 'pm_live_' + Math.random().toString(36).substring(2, 10);
  localStorage.setItem(STORAGE_KEY, cleanKey);
}

/**
 * Generate a brand new API key
 */
export function generateNewApiKey(): string {
  const newKey = 'pm_live_' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  localStorage.setItem(STORAGE_KEY, newKey);
  return newKey;
}

/**
 * Get whether auto-sync is enabled
 */
export function isAutoSyncEnabled(): boolean {
  return localStorage.getItem(AUTO_SYNC_KEY) === 'true';
}

/**
 * Set auto-sync preference
 */
export function setAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_SYNC_KEY, enabled ? 'true' : 'false');
}

// --- Deletion tombstones ---------------------------------------------------------------------
// Sync used to only add/update, so deleted records came back from the server on the next pull.
// Every local delete is now recorded as { table: { id: deletedAtMs } }, sent with the next push,
// and cleared once the server has accepted it.
type TableName = 'locations' | 'rooms' | 'furniture' | 'containers' | 'items';
type Tombstones = Partial<Record<TableName, Record<string, number>>>;
const SYNCED_TABLES: TableName[] = ['locations', 'rooms', 'furniture', 'containers', 'items'];
const PENDING_DELETES_KEY = 'placemend_pending_deletes';

function loadPendingDeletes(): Tombstones {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePendingDeletes(t: Tombstones): void {
  try {
    localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(t));
  } catch {
    // Storage full or unavailable: the delete still happens locally
  }
}

// Set while applying the server's own tombstones, so those deletes are not re-recorded
let applyingRemoteDeletes = false;

for (const name of SYNCED_TABLES) {
  db.table(name).hook('deleting', (primKey) => {
    if (applyingRemoteDeletes) return;
    const pending = loadPendingDeletes();
    pending[name] = { ...(pending[name] || {}), [String(primKey)]: Date.now() };
    savePendingDeletes(pending);
    scheduleAutoSync();
  });
}

let autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced automatic push to remote cloud workspace if auto-sync is active
 */
export function scheduleAutoSync(delayMs = 1200): void {
  if (!isAutoSyncEnabled()) return;
  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(async () => {
    try {
      await pushLocalToRemote();
      console.log('Background cloud auto-sync completed.');
    } catch (e) {
      console.warn('Background auto-sync failed:', e);
    }
  }, delayMs);
}

export interface SyncResult {
  success: boolean;
  message?: string;
  error?: string;
  timestamp?: number;
  stats?: {
    locations: number;
    rooms: number;
    furniture: number;
    containers: number;
    items: number;
  };
}

/**
 * Push all local Dexie records to remote server API
 */
export async function pushLocalToRemote(apiKey?: string): Promise<SyncResult> {
  const key = apiKey || getWorkspaceApiKey();

  try {
    const sentDeletes = loadPendingDeletes();
    const payload = {
      locations: await db.locations.toArray(),
      rooms: await db.rooms.toArray(),
      furniture: await db.furniture.toArray(),
      containers: await db.containers.toArray(),
      items: await db.items.toArray(),
      deleted: sentDeletes,
    };

    const res = await fetch(`${API_BASE_URL}/sync.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP error ${res.status}`);
    }

    const data = await res.json();

    // The server now holds these tombstones; forget the ones we sent (newer deletes stay pending)
    const pending = loadPendingDeletes();
    for (const table of SYNCED_TABLES) {
      for (const [id, ts] of Object.entries(sentDeletes[table] || {})) {
        if (pending[table]?.[id] === ts) delete pending[table]![id];
      }
    }
    savePendingDeletes(pending);

    return {
      success: true,
      message: data.message || 'Pushed successfully',
      timestamp: data.updatedAt,
      stats: {
        locations: payload.locations.length,
        rooms: payload.rooms.length,
        furniture: payload.furniture.length,
        containers: payload.containers.length,
        items: payload.items.length,
      },
    };
  } catch (err: any) {
    console.error('pushLocalToRemote error:', err);
    return { success: false, error: err.message || 'Failed to push to server' };
  }
}

/**
 * Pull remote server records and merge into local Dexie database
 */
export async function pullRemoteToLocal(apiKey?: string, force = false): Promise<SyncResult> {
  const key = apiKey || getWorkspaceApiKey();

  try {
    const res = await fetch(`${API_BASE_URL}/sync.php`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': key,
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP error ${res.status}`);
    }

    const json = await res.json();
    const remoteData = json.data;

    if (!remoteData) {
      return { success: true, message: 'No remote data found.' };
    }

    // Server tombstones (PHP encodes an empty map as [], so normalise) plus our own unsent deletes
    const remoteDeleted: Tombstones =
      remoteData.deleted && !Array.isArray(remoteData.deleted) ? remoteData.deleted : {};
    const localPending = loadPendingDeletes();
    const deletedAt = (table: TableName, id: string): number | undefined => {
      const r = (remoteDeleted[table] as Record<string, number> | undefined)?.[id];
      const l = localPending[table]?.[id];
      return r === undefined && l === undefined ? undefined : Math.max(r ?? 0, l ?? 0);
    };

    await db.transaction('rw', [db.locations, db.rooms, db.furniture, db.containers, db.items], async () => {
      const mergeTable = async <T extends { id: string; updatedAt?: number }>(
        tableName: TableName,
        table: any,
        incomingList?: T[]
      ) => {
        // Apply deletions made on other devices (unless the local copy was edited afterwards)
        const remoteIds = Object.keys((remoteDeleted[tableName] as Record<string, number> | undefined) || {});
        if (remoteIds.length > 0) {
          const localCopies: T[] = await table.bulkGet(remoteIds);
          const toDelete = localCopies
            .filter((rec): rec is T => !!rec && (rec.updatedAt ?? 0) <= (deletedAt(tableName, rec.id) ?? 0))
            .map((rec) => rec.id);
          if (toDelete.length > 0) {
            applyingRemoteDeletes = true;
            try {
              await table.bulkDelete(toDelete);
            } finally {
              applyingRemoteDeletes = false;
            }
          }
        }

        if (!Array.isArray(incomingList) || incomingList.length === 0) return;
        const existing: T[] = await table.toArray();
        const existingMap = new Map(existing.map((item) => [item.id, item]));
        const toPut: T[] = [];
        for (const incoming of incomingList) {
          // Never bring back something deleted after its last edit
          const del = deletedAt(tableName, incoming.id);
          if (del !== undefined && (incoming.updatedAt ?? 0) <= del) continue;
          const current = existingMap.get(incoming.id);
          const isCurrentMissingShape = current && !(current as any).polygonPoints && !!(incoming as any).polygonPoints;
          // Overwrite if force, if record is missing locally, if local is missing custom shape geometry, or if incoming is newer/equal
          if (force || !current || isCurrentMissingShape || (incoming.updatedAt ?? 0) >= (current.updatedAt ?? 0)) {
            toPut.push(incoming);
          }
        }
        if (toPut.length > 0) {
          await table.bulkPut(toPut);
        }
      };

      await mergeTable('locations', db.locations, remoteData.locations as Location[]);
      await mergeTable('rooms', db.rooms, remoteData.rooms as Room[]);
      await mergeTable('furniture', db.furniture, remoteData.furniture as Furniture[]);
      await mergeTable('containers', db.containers, remoteData.containers as Container[]);
      await mergeTable('items', db.items, remoteData.items as Item[]);
    });

    return {
      success: true,
      message: 'Pulled & merged successfully',
      timestamp: json.updatedAt,
      stats: {
        locations: remoteData.locations?.length || 0,
        rooms: remoteData.rooms?.length || 0,
        furniture: remoteData.furniture?.length || 0,
        containers: remoteData.containers?.length || 0,
        items: remoteData.items?.length || 0,
      },
    };
  } catch (err: any) {
    console.error('pullRemoteToLocal error:', err);
    return { success: false, error: err.message || 'Failed to pull from server' };
  }
}

/**
 * Bidirectional Sync: Push local changes, merge on server, and apply merged result to Dexie
 */
export async function syncBidirectional(apiKey?: string): Promise<SyncResult> {
  const pushRes = await pushLocalToRemote(apiKey);
  if (!pushRes.success) {
    return pushRes;
  }
  return await pullRemoteToLocal(apiKey);
}

/**
 * Send an AI vision detection payload to the server and immediately pull result to Dexie
 */
export async function submitAiPayload(payload: any, apiKey?: string): Promise<{ success: boolean; message: string; data?: any; error?: string }> {
  const key = apiKey || getWorkspaceApiKey();

  try {
    const res = await fetch(`${API_BASE_URL}/ai.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP error ${res.status}`);
    }

    // Pull changes into Dexie so UI updates immediately
    await pullRemoteToLocal(key);

    return {
      success: true,
      message: json.message,
      data: json.data,
    };
  } catch (err: any) {
    console.error('submitAiPayload error:', err);
    return {
      success: false,
      message: err.message || 'Failed to submit AI detection',
      error: err.message,
    };
  }
}

/**
 * Fetch Vision system prompt template and API documentation
 */
export async function fetchApiDocumentation(): Promise<{ visionPrompt: string; endpoints: Record<string, string> } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/schema.php`);
    if (!res.ok) return null;
    const json = await res.json();
    return {
      visionPrompt: json.visionSystemPrompt || '',
      endpoints: json.endpoints || {},
    };
  } catch (err) {
    console.error('fetchApiDocumentation error:', err);
    return null;
  }
}
