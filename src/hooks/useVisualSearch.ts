import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';

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
      };
    }

    const items = await db.items.toArray();
    const containers = await db.containers.toArray();
    const furniture = await db.furniture.toArray();

    const containerMap = new Map(containers.map((c) => [c.id, c]));
    const furnitureMap = new Map(furniture.map((f) => [f.id, f]));

    const matchingRoomIds = new Set<string>();
    const matchingFurnitureIds = new Set<string>();
    const matchingContainerIds = new Set<string>();
    const matchingItemIds = new Set<string>();
    const matchCountsByRoom = new Map<string, number>();
    const matchCountsByFurniture = new Map<string, number>();
    const matchCountsByContainer = new Map<string, number>();

    // 1. Direct Item Matches
    for (const item of items) {
      const nameMatch = item.name.toLowerCase().includes(q);
      const tagMatch = item.tags?.some((t) => t.toLowerCase().includes(q));
      const catMatch = item.category?.toLowerCase().includes(q);
      const descMatch = item.description?.toLowerCase().includes(q);

      if (nameMatch || tagMatch || catMatch || descMatch) {
        matchingItemIds.add(item.id);

        // Find parent container
        let currentContId: string | undefined = item.containerId;
        let furnId: string | undefined;

        while (currentContId) {
          matchingContainerIds.add(currentContId);
          matchCountsByContainer.set(
            currentContId,
            (matchCountsByContainer.get(currentContId) || 0) + item.quantity
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
            (matchCountsByFurniture.get(furnId) || 0) + item.quantity
          );

          const furn = furnitureMap.get(furnId);
          if (furn && furn.roomId) {
            matchingRoomIds.add(furn.roomId);
            matchCountsByRoom.set(
              furn.roomId,
              (matchCountsByRoom.get(furn.roomId) || 0) + item.quantity
            );
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
    }
  );
}
