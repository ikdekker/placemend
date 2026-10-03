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
import { AddWithPhotoModal } from './components/AddWithPhotoModal';
import { SetupGuide } from './components/SetupGuide';
import { AccountModal } from './components/AccountModal';
import { HistoryModal } from './components/HistoryModal';
import { ShareRoomModal } from './components/ShareRoomModal';
import { initSharedIndex, syncShared } from './services/sharing';
import { ConnectRoomModal } from './components/ConnectRoomModal';
import { MultiRoomOverviewModal } from './components/MultiRoomOverviewModal';
import { SearchModal } from './components/SearchModal';
import { FloatingSearchBanner } from './components/FloatingSearchBanner';
import { MobileNav } from './components/MobileNav';
import { seedDemoDataIfEmpty } from './db/sampleData';
import { db } from './db/database';
import { useAppStore } from './store/useAppStore';
import { fetchCurrentUser, loginWithSigninCode } from './services/auth';
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
        [!!s.historyView, () => s.setHistoryView(null)],
        [!!s.shareRoomId, () => s.setShareRoomId(null)],
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

      // Back from Google's redirect sign-in: swap the one-time code for a session
      const params = new URLSearchParams(window.location.search);
      const signinCode = params.get('signin');
      if (signinCode || params.get('signin_error')) {
        window.history.replaceState(null, '', window.location.pathname + (params.get('invite') ? `?invite=${params.get('invite')}` : ''));
        if (signinCode) {
          try {
            await loginWithSigninCode(signinCode);
          } catch (err) {
            window.alert((err as Error).message || 'Google sign-in failed. Please try again.');
          }
        } else {
          window.alert('Google sign-in did not complete. Please try again.');
        }
      }

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

      // Rooms other people shared with this user
      await initSharedIndex();
      await syncShared();
      // Opened from an invite link: show the shared room, or ask to sign in first
      // (remembered across the trip to Google's sign-in page)
      let invite = new URLSearchParams(window.location.search).get('invite');
      try {
        invite = invite || sessionStorage.getItem('placemend_pending_invite');
      } catch {
        /* storage unavailable */
      }
      if (invite && isMounted) {
        const shared = await db.rooms.filter((r) => r.shareId === invite).first();
        const signedIn = getWorkspaceApiKey().startsWith('pm_usr_');
        try {
          if (shared || signedIn) sessionStorage.removeItem('placemend_pending_invite');
          else sessionStorage.setItem('placemend_pending_invite', invite);
        } catch {
          /* storage unavailable */
        }
        if (shared) useAppStore.getState().setSelectedRoomId(shared.id);
        else if (!signedIn) useAppStore.getState().setAccountModalOpen(true);
        window.history.replaceState(null, '', window.location.pathname);
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

  // Keep shared rooms fresh while the app is open
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void syncShared();
    }, 120000);
    const onVisible = () => document.visibilityState === 'visible' && void syncShared();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

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
      <AddWithPhotoModal />
      <SetupGuide />
      <RoomManagerModal />
      <RoomShapeModal />
      <BackupModal />
      <ApiSyncModal />
      <AccountModal />
      <ConnectRoomModal />
      <MultiRoomOverviewModal />
      <HistoryModal />
      <ShareRoomModal />
    </div>
  );
}

export default App;
