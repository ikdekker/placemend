// Sightings: things a camera or robot (e.g. a robot vacuum's obstacle camera) saw lying around.
// They wait in an inbox (api/sightings.php) until accepted as an item, linked to one, or dismissed.
import { API_BASE_URL, getWorkspaceApiKey, pullRemoteToLocal, pushLocalToRemote } from './apiSync';

export type SecondPassMode = 'off' | 'on_demand' | 'auto';

export type SightingAiItem = { name: string; brand: string; category: string; confidence: number };

export type Sighting = {
  id: string;
  sourceKey: string;
  source: { type: string; name: string };
  sourceRef: string | null;
  label: string;
  confidence: number | null; // 0-100
  roomName: string | null;
  roomId: string | null;
  seenAt: number;
  receivedAt: number;
  details: Record<string, unknown> | null;
  photo: string | null;
  status: 'pending' | 'accepted' | 'linked' | 'dismissed';
  ai: { at: number; model: string; items: SightingAiItem[] } | null;
  itemId?: string;
};

export type SightingSource = {
  type: string;
  name: string;
  lastSeenAt?: number;
  secondPass: SecondPassMode;
  ignoredLabels: string[];
};

const headers = (json = false): Record<string, string> => ({
  Accept: 'application/json',
  'X-API-Key': getWorkspaceApiKey(),
  ...(json ? { 'Content-Type': 'application/json' } : {}),
});

async function readJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP error ${res.status}`);
  return json;
}

export async function fetchSightings(status: 'pending' | 'all' = 'pending'): Promise<{
  sightings: Sighting[];
  sources: Record<string, SightingSource>;
  pendingCount: number;
}> {
  const json = await readJson(await fetch(`${API_BASE_URL}/sightings.php?status=${status}`, { headers: headers() }));
  return { sightings: json.sightings, sources: json.sources || {}, pendingCount: json.pendingCount || 0 };
}

/** The photo as a Blob (fetched with the workspace key, so no key ends up in an image URL) */
export async function fetchSightingPhoto(id: string): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/sightings.php?photo=${encodeURIComponent(id)}`, { headers: headers() });
  if (!res.ok) throw new Error(`Photo not available (HTTP ${res.status})`);
  return res.blob();
}

async function post(body: Record<string, unknown>) {
  return readJson(await fetch(`${API_BASE_URL}/sightings.php`, { method: 'POST', headers: headers(true), body: JSON.stringify(body) }));
}

/** Accept / link change the workspace: send this device's edits first, then bring the result in */
async function workspaceAction(body: Record<string, unknown>): Promise<string> {
  await pushLocalToRemote();
  const json = await post(body);
  await pullRemoteToLocal();
  return json.message || 'Done.';
}

export const acceptSighting = (
  id: string,
  opts: { name: string; quantity?: number; category?: string; containerId?: string; roomId?: string }
) => workspaceAction({ action: 'accept', id, ...opts });

export const linkSighting = (id: string, itemId: string, moveTo = false) => workspaceAction({ action: 'link', id, itemId, moveTo });

export const dismissSighting = (id: string) => post({ action: 'dismiss', id });

export const updateSourceSettings = (source: string, settings: Partial<Pick<SightingSource, 'secondPass' | 'ignoredLabels'>>) =>
  post({ action: 'settings', source, ...settings });

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Second pass ("Match items from …"): the same photo AI as the furniture scan (vision.php) names the
 * object, reusing the exact names of items already stored in that room so they can be matched.
 */
export async function runSecondPass(s: Sighting, knownNames: string[]): Promise<SightingAiItem[]> {
  const blob = await fetchSightingPhoto(s.id);
  const res = await fetch(`${API_BASE_URL}/vision.php`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({
      image: await blobToBase64(blob),
      mimeType: blob.type || 'image/jpeg',
      furnitureName: `Floor (photo by ${s.source.name})`,
      roomName: s.roomName || '',
      scopeLabel: s.label
        ? `the object inside the drawn box, lying on the floor (the camera thought: ${s.label})`
        : 'the object inside the drawn box, lying on the floor',
      slots: [{ id: 'floor', label: 'Floor' }],
      known: knownNames.slice(0, 120),
    }),
  });
  const json = await readJson(res);
  const items: SightingAiItem[] = (json.items || []).map((it: SightingAiItem & { size?: string }) => ({
    name: it.name,
    brand: it.brand || '',
    category: it.category || '',
    confidence: it.confidence ?? 0,
  }));
  await post({ action: 'ai_result', id: s.id, items, model: json.model || '' });
  return items;
}
