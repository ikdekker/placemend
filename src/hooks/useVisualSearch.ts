import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { SearchResult, Location } from '../types';

export interface VisualSearchResult {
  isSearching: boolean;
  searchQuery: string;
  totalMatches: number;
  matchingRoomIds: Set<string>;
  matchingFurnitureIds: Set<string>;
  matchingContainerIds: Set<string>;
  matchingItemIds: Set<string>;
  matchCountsByRoom: Map<string, number>;
  matchCountsByFurniture: Map<string, number>;
  matchCountsByContainer: Map<string, number>;
  matchingResults: SearchResult[];
}

export function useVisualSearch(): VisualSearchResult {
  const searchQuery = useAppStore((s) => s.searchQuery);

  const searchData = useLiveQuery(async () => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return {
        isSearching: false,
        searchQuery: '',
        totalMatches: 0,
        matchingRoomIds: new Set<string>(),
        matchingFurnitureIds: new Set<string>(),
        matchingContainerIds: new Set<string>(),
        matchingItemIds: new Set<string>(),
        matchCountsByRoom: new Map<string, number>(),
        matchCountsByFurniture: new Map<string, number>(),
        matchCountsByContainer: new Map<string, number>(),
        matchingResults: [],
      };
    }

    const items = await db.items.toArray();
    const containers = await db.containers.toArray();
    const furniture = await db.furniture.toArray();
    const rooms = await db.rooms.toArray();
    const locations = await db.locations.toArray();

    const containerMap = new Map(containers.map((c) => [c.id, c]));
    const furnitureMap = new Map(furniture.map((f) => [f.id, f]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const locationMap = new Map(locations.map((l) => [l.id, l]));

    const matchingRoomIds = new Set<string>();
    const matchingFurnitureIds = new Set<string>();
    const matchingContainerIds = new Set<string>();
    const matchingItemIds = new Set<string>();
    const matchCountsByRoom = new Map<string, number>();
    const matchCountsByFurniture = new Map<string, number>();
    const matchCountsByContainer = new Map<string, number>();
    const matchingResults: SearchResult[] = [];

    // Query terms for multi-word search
    const terms = q.split(/\s+/).filter(Boolean);
    const isStarredQuery = q === 'is:starred' || q === 'starred' || q === 'favorite';
    const isPackQuery = q === 'is:pack' || q === 'packs' || q === 'multipack';

    // 1. Direct Item Matches
    for (const item of items) {
      const nameLower = item.name.toLowerCase();
      const catLower = (item.category || '').toLowerCase();
      const descLower = (item.description || '').toLowerCase();
      const tagsLower = (item.tags || []).map((t) => t.toLowerCase());

      let matches = false;
      let matchedOn: SearchResult['matchedOn'] = 'name';
      let score = 0;

      if (isStarredQuery) {
        if (item.favorite) {
          matches = true;
          score = 100;
          matchedOn = 'tag';
        }
      } else if (isPackQuery) {
        if (item.quantity > 1) {
          matches = true;
          score = 100;
          matchedOn = 'tag';
        }
      } else {
        // Multi-term matching: all words must be found somewhere in the item fields
        const allTermsMatch = terms.every((term) =>
          nameLower.includes(term) ||
          catLower.includes(term) ||
          descLower.includes(term) ||
          tagsLower.some((t) => t.includes(term))
        );

        if (allTermsMatch) {
          matches = true;
          if (nameLower.startsWith(q)) {
            score = 100;
            matchedOn = 'name';
          } else if (nameLower.includes(q)) {
            score = 85;
            matchedOn = 'name';
          } else if (tagsLower.some((t) => t.includes(q))) {
            score = 70;
            matchedOn = 'tag';
          } else if (catLower.includes(q)) {
            score = 60;
            matchedOn = 'category';
          } else {
            score = 40;
            matchedOn = 'description';
          }
        }
      }

      if (matches) {
        matchingItemIds.add(item.id);

        // Find parent container hierarchy
        let currentContId: string | undefined = item.containerId;
        let furnId: string | undefined;

        while (currentContId) {
          matchingContainerIds.add(currentContId);
          matchCountsByContainer.set(
            currentContId,
            (matchCountsByContainer.get(currentContId) || 0) + 1
          );

          const c = containerMap.get(currentContId);
          if (c) {
            furnId = c.furnitureId;
            currentContId = c.parentContainerId;
          } else {
            break;
          }
        }

        if (furnId) {
          matchingFurnitureIds.add(furnId);
          matchCountsByFurniture.set(
            furnId,
            (matchCountsByFurniture.get(furnId) || 0) + 1
          );

          const furn = furnitureMap.get(furnId);
          if (furn && furn.roomId) {
            matchingRoomIds.add(furn.roomId);
            matchCountsByRoom.set(
              furn.roomId,
              (matchCountsByRoom.get(furn.roomId) || 0) + 1
            );

            const directContainer = containerMap.get(item.containerId);
            const targetRoom = roomMap.get(furn.roomId);
            if (directContainer && targetRoom) {
              const defaultLoc: Location = {
                id: 'loc-home',
                name: 'Home',
                createdAt: 0,
                updatedAt: 0,
              };
              const loc = locationMap.get(targetRoom.locationId) || defaultLoc;
              matchingResults.push({
                item,
                container: directContainer,
                furniture: furn,
                room: targetRoom,
                location: loc,
                matchScore: score,
                matchedOn,
              });
            }
          }
        }
      }
    }

    // 2. Direct Container / Drawer Matches
    for (const c of containers) {
      if (c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)) {
        matchingContainerIds.add(c.id);
        if (c.parentContainerId) matchingContainerIds.add(c.parentContainerId);
        matchingFurnitureIds.add(c.furnitureId);
        matchCountsByFurniture.set(
          c.furnitureId,
          (matchCountsByFurniture.get(c.furnitureId) || 0) + 1
        );
        const furn = furnitureMap.get(c.furnitureId);
        if (furn && furn.roomId) {
          matchingRoomIds.add(furn.roomId);
          matchCountsByRoom.set(
            furn.roomId,
            (matchCountsByRoom.get(furn.roomId) || 0) + 1
          );
        }
      }
    }

    // 3. Direct Furniture Matches
    for (const f of furniture) {
      if (f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q)) {
        matchingFurnitureIds.add(f.id);
        if (f.roomId) {
          matchingRoomIds.add(f.roomId);
        }
      }
    }

    // Sort matching results by relevance score
    matchingResults.sort((a, b) => b.matchScore - a.matchScore);

    return {
      isSearching: true,
      searchQuery: q,
      totalMatches: matchingItemIds.size,
      matchingRoomIds,
      matchingFurnitureIds,
      matchingContainerIds,
      matchingItemIds,
      matchCountsByRoom,
      matchCountsByFurniture,
      matchCountsByContainer,
      matchingResults,
    };
  }, [searchQuery]);

  return (
    searchData || {
      isSearching: Boolean(searchQuery.trim()),
      searchQuery: searchQuery.trim().toLowerCase(),
      totalMatches: 0,
      matchingRoomIds: new Set<string>(),
      matchingFurnitureIds: new Set<string>(),
      matchingContainerIds: new Set<string>(),
      matchingItemIds: new Set<string>(),
      matchCountsByRoom: new Map<string, number>(),
      matchCountsByFurniture: new Map<string, number>(),
      matchCountsByContainer: new Map<string, number>(),
      matchingResults: [],
    }
  );
}
