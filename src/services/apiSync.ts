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
    const payload = {
      locations: await db.locations.toArray(),
      rooms: await db.rooms.toArray(),
      furniture: await db.furniture.toArray(),
      containers: await db.containers.toArray(),
      items: await db.items.toArray(),
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
export async function pullRemoteToLocal(apiKey?: string): Promise<SyncResult> {
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

    await db.transaction('rw', [db.locations, db.rooms, db.furniture, db.containers, db.items], async () => {
      if (Array.isArray(remoteData.locations) && remoteData.locations.length > 0) {
        await db.locations.bulkPut(remoteData.locations as Location[]);
      }
      if (Array.isArray(remoteData.rooms) && remoteData.rooms.length > 0) {
        await db.rooms.bulkPut(remoteData.rooms as Room[]);
      }
      if (Array.isArray(remoteData.furniture) && remoteData.furniture.length > 0) {
        await db.furniture.bulkPut(remoteData.furniture as Furniture[]);
      }
      if (Array.isArray(remoteData.containers) && remoteData.containers.length > 0) {
        await db.containers.bulkPut(remoteData.containers as Container[]);
      }
      if (Array.isArray(remoteData.items) && remoteData.items.length > 0) {
        await db.items.bulkPut(remoteData.items as Item[]);
      }
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
