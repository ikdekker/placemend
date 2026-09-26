import { create } from 'zustand';
import { User, getStoredUser } from '../services/auth';

export type AppMode = 'view' | 'edit';

export interface AppState {
  // Mode: View / Search vs Edit
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  toggleAppMode: () => void;

  // Navigation & Space
  selectedLocationId: string | null;
  selectedRoomId: string | null;
  selectedFurnitureId: string | null;
  selectedContainerId: string | null;
  highlightedFurnitureId: string | null;

  // User Account & Authentication
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;

  // Canvas Viewport Controls
  zoom: number;
  panOffset: { x: number; y: number };
  fitViewTrigger: number;
  gridSnap: boolean;
  showLabels: boolean;
  showDimensions: boolean;
  isRoomShapeModalOpen: boolean;
  roomShapeModalTab: 'presets' | 'custom' | 'door';

  // Modals & Panels
  isSearchOpen: boolean;
  isItemModalOpen: boolean;
  editingItemId: string | null;
  isRoomManagerOpen: boolean;
  isFurnitureLibraryOpen: boolean;
  isBackupModalOpen: boolean;
  isApiSyncModalOpen: boolean;
  isAccountModalOpen: boolean;
  setAccountModalOpen: (open: boolean) => void;
  isConnectRoomModalOpen: boolean;
  connectRoomDoorContext: { roomId: string; doorId: string } | null;
  setConnectRoomModalOpen: (open: boolean, context?: { roomId: string; doorId: string } | null) => void;
  isMultiRoomOverviewOpen: boolean;
  setMultiRoomOverviewOpen: (open: boolean) => void;

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
  toggleGridSnap: () => void;
  toggleShowLabels: () => void;
  toggleShowDimensions: () => void;

  // Modal actions
  setSearchOpen: (open: boolean) => void;
  setItemModalOpen: (open: boolean, itemId?: string | null) => void;
  setRoomManagerOpen: (open: boolean) => void;
  setRoomShapeModalOpen: (open: boolean, tab?: 'presets' | 'custom' | 'door') => void;
  setRoomShapeModalTab: (tab: 'presets' | 'custom' | 'door') => void;
  setFurnitureLibraryOpen: (open: boolean) => void;
  setBackupModalOpen: (open: boolean) => void;
  setApiSyncModalOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;

  // Jump to specific furniture item (e.g. from search)
  locateFurniture: (roomId: string, furnitureId: string, containerId?: string | null) => void;
}

const ROOM_KEY = 'placemend_selected_room';
function readStoredRoomId(): string | null {
  try {
    return localStorage.getItem(ROOM_KEY);
  } catch {
    return null;
  }
}
function storeRoomId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ROOM_KEY, id);
    else localStorage.removeItem(ROOM_KEY);
  } catch {
    // storage unavailable: selection just isn't remembered
  }
}

export const useAppStore = create<AppState>((set) => ({
  appMode: 'view', // default clean view/search mode
  setAppMode: (mode) => set({ appMode: mode }),
  toggleAppMode: () => set((s) => ({ appMode: s.appMode === 'view' ? 'edit' : 'view' })),

  selectedLocationId: 'loc-home',
  // Remember the last opened room across reloads (falls back to the first room if it no longer exists)
  selectedRoomId: readStoredRoomId() ?? 'room-living',
  selectedFurnitureId: null,
  selectedContainerId: null,
  highlightedFurnitureId: null,

  currentUser: typeof window !== 'undefined' ? getStoredUser() : null,
  setCurrentUser: (user) => set({ currentUser: user }),

  zoom: typeof window !== 'undefined' && window.innerWidth < 768 ? 0.46 : 1,
  panOffset: typeof window !== 'undefined' && window.innerWidth < 768 ? { x: 12, y: 180 } : { x: 80, y: 80 },
  fitViewTrigger: 0,
  gridSnap: true,
  showLabels: true,
  showDimensions: false,
  isRoomShapeModalOpen: false,
  roomShapeModalTab: 'presets',

  isSearchOpen: false,
  isItemModalOpen: false,
  editingItemId: null,
  isRoomManagerOpen: false,
  isFurnitureLibraryOpen: false,
  isBackupModalOpen: false,
  isApiSyncModalOpen: false,
  isAccountModalOpen: false,
  setAccountModalOpen: (open) => set({ isAccountModalOpen: open }),
  isConnectRoomModalOpen: false,
  connectRoomDoorContext: null,
  setConnectRoomModalOpen: (open, context = null) =>
    set({
      isConnectRoomModalOpen: open,
      connectRoomDoorContext: context !== undefined ? context : null,
    }),
  isMultiRoomOverviewOpen: false,
  setMultiRoomOverviewOpen: (open) => set({ isMultiRoomOverviewOpen: open }),
  searchQuery: '',

  setSelectedLocationId: (id) => set({ selectedLocationId: id }),
  setSelectedRoomId: (id) => {
    storeRoomId(id);
    set((s) => ({
      selectedRoomId: id,
      selectedFurnitureId: null,
      selectedContainerId: null,
      fitViewTrigger: s.fitViewTrigger + 1,
    }));
  },
  setSelectedFurnitureId: (id) => set({ selectedFurnitureId: id, selectedContainerId: null }),
  setSelectedContainerId: (id) => set({ selectedContainerId: id }),
  setHighlightedFurnitureId: (id) => set({ highlightedFurnitureId: id }),

  setZoom: (zoomOrFn) =>
    set((state) => ({
      zoom: Math.min(8, Math.max(0.15, typeof zoomOrFn === 'function' ? zoomOrFn(state.zoom) : zoomOrFn)),
    })),

  setPanOffset: (offsetOrFn) =>
    set((state) => ({
      panOffset: typeof offsetOrFn === 'function' ? offsetOrFn(state.panOffset) : offsetOrFn,
    })),

  resetView: () => set((s) => ({ fitViewTrigger: s.fitViewTrigger + 1 })),

  toggleGridSnap: () => set((s) => ({ gridSnap: !s.gridSnap })),
  toggleShowLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleShowDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setItemModalOpen: (open, itemId = null) => set({ isItemModalOpen: open, editingItemId: itemId }),
  setRoomManagerOpen: (open) => set({ isRoomManagerOpen: open }),
  setRoomShapeModalOpen: (open, tab) =>
    set((s) => ({
      isRoomShapeModalOpen: open,
      roomShapeModalTab: tab !== undefined ? tab : s.roomShapeModalTab,
    })),
  setRoomShapeModalTab: (tab) => set({ roomShapeModalTab: tab }),
  setFurnitureLibraryOpen: (open) => set({ isFurnitureLibraryOpen: open }),
  setBackupModalOpen: (open) => set({ isBackupModalOpen: open }),
  setApiSyncModalOpen: (open) => set({ isApiSyncModalOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  clearSearch: () => set({ searchQuery: '', isSearchOpen: false }),

  locateFurniture: (roomId, furnitureId, containerId = null) => {
    storeRoomId(roomId);
    set({
      selectedRoomId: roomId,
      selectedFurnitureId: furnitureId,
      selectedContainerId: containerId,
      highlightedFurnitureId: furnitureId,
      isSearchOpen: false,
    });
    // Auto-clear highlight pulse after 4s
    setTimeout(() => {
      set((s) => (s.highlightedFurnitureId === furnitureId ? { highlightedFurnitureId: null } : {}));
    }, 4000);
  },
}));
