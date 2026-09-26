import React, { useEffect } from 'react';
import { Header } from './components/Header';
import { FloorCanvas } from './components/FloorCanvas';
import { PhysicalFurnitureView } from './components/PhysicalFurnitureView';
import { DrawerInteriorView } from './components/DrawerInteriorView';
import { ItemModal } from './components/ItemModal';
import { FurnitureLibrary } from './components/FurnitureLibrary';
import { RoomManagerModal } from './components/RoomManagerModal';
import { RoomShapeModal } from './components/RoomShapeModal';
import { BackupModal } from './components/BackupModal';
import { ApiSyncModal } from './components/ApiSyncModal';
import { AccountModal } from './components/AccountModal';
import { ConnectRoomModal } from './components/ConnectRoomModal';
import { MultiRoomOverviewModal } from './components/MultiRoomOverviewModal';
import { SearchModal } from './components/SearchModal';
import { FloatingSearchBanner } from './components/FloatingSearchBanner';
import { MobileNav } from './components/MobileNav';
import { seedDemoDataIfEmpty } from './db/sampleData';
import { db } from './db/database';
import { useAppStore } from './store/useAppStore';
import { fetchCurrentUser } from './services/auth';
import { pullRemoteToLocal, getWorkspaceApiKey, setAutoSyncEnabled } from './services/apiSync';

export function App() {
  const { appMode, selectedFurnitureId, selectedContainerId, setCurrentUser } = useAppStore();

  // Escape closes the top-most open dialog (inputs keep Escape for their own cancel behaviour)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const s = useAppStore.getState();
      const dialogs: [boolean, () => void][] = [
        [s.isItemModalOpen, () => s.setItemModalOpen(false)],
        [s.isConnectRoomModalOpen, () => s.setConnectRoomModalOpen(false)],
        [s.isRoomShapeModalOpen, () => s.setRoomShapeModalOpen(false)],
        [s.isFurnitureLibraryOpen, () => s.setFurnitureLibraryOpen(false)],
        [s.isBackupModalOpen, () => s.setBackupModalOpen(false)],
        [s.isApiSyncModalOpen, () => s.setApiSyncModalOpen(false)],
        [s.isAccountModalOpen, () => s.setAccountModalOpen(false)],
        [s.isRoomManagerOpen, () => s.setRoomManagerOpen(false)],
        [s.isMultiRoomOverviewOpen, () => s.setMultiRoomOverviewOpen(false)],
      ];
      dialogs.find(([open]) => open)?.[1]();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initializeWorkspace = async () => {
      // 1. Ensure baseline apartment layout is present locally
      await seedDemoDataIfEmpty();

      // 2. Auto-validate current user session with server
      try {
        const user = await fetchCurrentUser();
        if (!isMounted) return;

        if (user) {
          setCurrentUser(user);
          // Enable auto-sync for authenticated users
          setAutoSyncEnabled(true);
          // 3. Automatically pull latest cloud workspace for the authenticated user
          if (user.workspaceKey) {
            console.log('Syncing cloud workspace for user:', user.email);
            await pullRemoteToLocal(user.workspaceKey, true);
          }
        } else {
          // If not logged in, but user has an active user-linked workspace key stored, pull it
          const currentKey = getWorkspaceApiKey();
          if (currentKey && currentKey.startsWith('pm_usr_')) {
            await pullRemoteToLocal(currentKey, true);
          }
        }
      } catch (err) {
        console.warn('Initial session validation / sync check:', err);
      }

      // 3. Guarantee baseline apartment rooms exist even after cloud sync or logout
      const finalCount = await db.rooms.count();
      if (finalCount === 0) {
        await seedDemoDataIfEmpty();
      }
    };

    initializeWorkspace();

    return () => {
      isMounted = false;
    };
  }, [setCurrentUser]);

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-100 text-slate-800 overflow-hidden font-sans pb-16 md:pb-0 relative">
      {/* Top Navbar: Space, Quick Search, Tools */}
      <Header />

      {/* Main Workspace Area: True Visual Zoom Navigation */}
      <main className="flex-1 min-h-0 w-full relative flex flex-col overflow-hidden">
        {/* Floating Active Search Pill (when search is illuminating rooms) */}
        <FloatingSearchBanner />

        {appMode === 'edit' || selectedFurnitureId === null ? (
          <FloorCanvas />
        ) : selectedContainerId === null ? (
          <PhysicalFurnitureView />
        ) : (
          <DrawerInteriorView />
        )}
      </main>

      {/* Mobile Bottom Quick Dock */}
      <MobileNav />

      {/* Modals & Sheets */}
      <SearchModal />
      <ItemModal />
      <FurnitureLibrary />
      <RoomManagerModal />
      <RoomShapeModal />
      <BackupModal />
      <ApiSyncModal />
      <AccountModal />
      <ConnectRoomModal />
      <MultiRoomOverviewModal />
    </div>
  );
}

export default App;
