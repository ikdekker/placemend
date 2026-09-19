import React, { useEffect } from 'react';
import { Header } from './components/Header';
import { FloorCanvas } from './components/FloorCanvas';
import { FurnitureInspector } from './components/FurnitureInspector';
import { ItemModal } from './components/ItemModal';
import { SearchModal } from './components/SearchModal';
import { FurnitureLibrary } from './components/FurnitureLibrary';
import { RoomManagerModal } from './components/RoomManagerModal';
import { BackupModal } from './components/BackupModal';
import { seedDemoDataIfEmpty } from './db/sampleData';

export function App() {
  useEffect(() => {
    // Seed rich starter apartment & workshop demo data if database is brand new
    seedDemoDataIfEmpty();
  }, []);

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Navbar: Space, Quick Search, Tools */}
      <Header />

      {/* Main Workspace Area: 2D Floor Plan Canvas + Sliding Furniture Inspector */}
      <main className="flex-1 flex w-full h-full overflow-hidden relative">
        <FloorCanvas />
        <FurnitureInspector />
      </main>

      {/* Modals */}
      <SearchModal />
      <ItemModal />
      <FurnitureLibrary />
      <RoomManagerModal />
      <BackupModal />
    </div>
  );
}

export default App;
