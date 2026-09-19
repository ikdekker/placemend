import React, { useEffect } from 'react';
import { Header } from './components/Header';
import { FloorCanvas } from './components/FloorCanvas';
import { PhysicalFurnitureView } from './components/PhysicalFurnitureView';
import { DrawerInteriorView } from './components/DrawerInteriorView';
import { ItemModal } from './components/ItemModal';
import { SearchModal } from './components/SearchModal';
import { FurnitureLibrary } from './components/FurnitureLibrary';
import { RoomManagerModal } from './components/RoomManagerModal';
import { RoomShapeModal } from './components/RoomShapeModal';
import { BackupModal } from './components/BackupModal';
import { MobileNav } from './components/MobileNav';
import { seedDemoDataIfEmpty } from './db/sampleData';
import { useAppStore } from './store/useAppStore';

export function App() {
  const { selectedFurnitureId, selectedContainerId } = useAppStore();

  useEffect(() => {
    // Seed rich starter apartment & workshop demo data if database is brand new
    seedDemoDataIfEmpty();
  }, []);

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-100 text-slate-800 overflow-hidden font-sans pb-16 md:pb-0">
      {/* Top Navbar: Space, Quick Search, Tools */}
      <Header />

      {/* Main Workspace Area: True Visual Zoom Navigation */}
      <main className="flex-1 flex w-full h-full overflow-hidden relative">
        {selectedFurnitureId === null ? (
          <FloorCanvas />
        ) : selectedContainerId === null ? (
          <PhysicalFurnitureView />
        ) : (
          <DrawerInteriorView />
        )}
      </main>

      {/* Mobile Bottom Quick Dock */}
      <MobileNav />

      {/* Modals */}
      <SearchModal />
      <ItemModal />
      <FurnitureLibrary />
      <RoomManagerModal />
      <RoomShapeModal />
      <BackupModal />
    </div>
  );
}

export default App;
