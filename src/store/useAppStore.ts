import { create } from 'zustand';

export type ActiveTool = 'select' | 'pan' | 'add-furniture' | 'measure';

export interface AppState {
  // Navigation & Space
  selectedLocationId: string | null;
  selectedRoomId: string | null;
  selectedFurnitureId: string | null;
  selectedContainerId: string | null;
  highlightedFurnitureId: string | null;

  // Canvas Viewport Controls
  zoom: number;
  panOffset: { x: number; y: number };
  activeTool: ActiveTool;
  gridSnap: boolean;
  showLabels: boolean;

  // Modals & Panels
  isSearchOpen: boolean;
  isItemModalOpen: boolean;
  editingItemId: string | null;
  isRoomManagerOpen: boolean;
  isFurnitureLibraryOpen: boolean;
  isBackupModalOpen: boolean;

  // Search
  searchQuery: string;

  // Actions
  setSelectedLocationId: (id: string | null) => void;
  setSelectedRoomId: (id: string | null) => void;
  setSelectedFurnitureId: (id: string | null) => void;
  setSelectedContainerId: (id: string | null) => void;
  setHighlightedFurnitureId: (id: string | null) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPanOffset: (offset: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  resetView: () => void;
  setActiveTool: (tool: ActiveTool) => void;
  toggleGridSnap: () => void;
  toggleShowLabels: () => void;

  // Modal actions
  setSearchOpen: (open: boolean) => void;
  setItemModalOpen: (open: boolean, itemId?: string | null) => void;
  setRoomManagerOpen: (open: boolean) => void;
  setFurnitureLibraryOpen: (open: boolean) => void;
  setBackupModalOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;

  // Jump to specific furniture item (e.g. from search)
  locateFurniture: (roomId: string, furnitureId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedLocationId: 'loc-home',
  selectedRoomId: 'room-living',
  selectedFurnitureId: null,
  selectedContainerId: null,
  highlightedFurnitureId: null,

  zoom: 1,
  panOffset: { x: 50, y: 50 },
  activeTool: 'select',
  gridSnap: true,
  showLabels: true,

  isSearchOpen: false,
  isItemModalOpen: false,
  editingItemId: null,
  isRoomManagerOpen: false,
  isFurnitureLibraryOpen: false,
  isBackupModalOpen: false,
  searchQuery: '',

  setSelectedLocationId: (id) => set({ selectedLocationId: id }),
  setSelectedRoomId: (id) => set({ selectedRoomId: id, selectedFurnitureId: null, selectedContainerId: null }),
  setSelectedFurnitureId: (id) => set({ selectedFurnitureId: id }),
  setSelectedContainerId: (id) => set({ selectedContainerId: id }),
  setHighlightedFurnitureId: (id) => set({ highlightedFurnitureId: id }),

  setZoom: (zoomOrFn) =>
    set((state) => ({
      zoom: Math.min(3, Math.max(0.3, typeof zoomOrFn === 'function' ? zoomOrFn(state.zoom) : zoomOrFn)),
    })),

  setPanOffset: (offsetOrFn) =>
    set((state) => ({
      panOffset: typeof offsetOrFn === 'function' ? offsetOrFn(state.panOffset) : offsetOrFn,
    })),

  resetView: () => set({ zoom: 1, panOffset: { x: 60, y: 60 } }),

  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
  toggleShowLabels: () => set((s) => ({ showLabels: !s.showLabels })),

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setItemModalOpen: (open, itemId = null) => set({ isItemModalOpen: open, editingItemId: itemId }),
  setRoomManagerOpen: (open) => set({ isRoomManagerOpen: open }),
  setFurnitureLibraryOpen: (open) => set({ isFurnitureLibraryOpen: open }),
  setBackupModalOpen: (open) => set({ isBackupModalOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  locateFurniture: (roomId, furnitureId) => {
    set({
      selectedRoomId: roomId,
      selectedFurnitureId: furnitureId,
      highlightedFurnitureId: furnitureId,
      isSearchOpen: false,
    });
    // Auto-clear highlight pulse after 3.5s
    setTimeout(() => {
      set((s) => (s.highlightedFurnitureId === furnitureId ? { highlightedFurnitureId: null } : {}));
    }, 3500);
  },
}));
