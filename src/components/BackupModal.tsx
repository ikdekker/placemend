import React, { useState } from 'react';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { 
  X, 
  Download, 
  Upload, 
  ShieldCheck, 
  RotateCcw, 
  Check, 
  FileJson 
} from 'lucide-react';
import { seedDemoDataIfEmpty } from '../db/sampleData';

export const BackupModal: React.FC = () => {
  const { isBackupModalOpen, setBackupModalOpen } = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  if (!isBackupModalOpen) return null;

  // Single-click JSON backup export
  const handleExportJSON = async () => {
    setExporting(true);
    try {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        locations: await db.locations.toArray(),
        rooms: await db.rooms.toArray(),
        furniture: await db.furniture.toArray(),
        containers: await db.containers.toArray(),
        items: await db.items.toArray(),
      };

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `placemend-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  // Import JSON backup
  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.rooms || !data.furniture || !data.items) {
        throw new Error('Invalid Placemend backup file');
      }

      if (window.confirm('Import backup? This will merge and restore all spaces, furniture, and items.')) {
        await db.transaction('rw', [db.locations, db.rooms, db.furniture, db.containers, db.items], async () => {
          if (data.locations) await db.locations.bulkPut(data.locations);
          if (data.rooms) await db.rooms.bulkPut(data.rooms);
          if (data.furniture) await db.furniture.bulkPut(data.furniture);
          if (data.containers) await db.containers.bulkPut(data.containers);
          if (data.items) await db.items.bulkPut(data.items);
        });
        setImportStatus('Backup successfully restored!');
        setTimeout(() => setImportStatus(null), 4000);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to parse backup JSON file.');
    }
  };

  // Reset to default demo data
  const handleResetDemo = async () => {
    if (window.confirm('Reset all data back to the clean sample apartment template?')) {
      await db.transaction('rw', [db.locations, db.rooms, db.furniture, db.containers, db.items], async () => {
        await db.items.clear();
        await db.containers.clear();
        await db.furniture.clear();
        await db.rooms.clear();
        await db.locations.clear();
      });
      await seedDemoDataIfEmpty();
      setImportStatus('Demo dataset restored!');
      setTimeout(() => setImportStatus(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col text-slate-800">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Local Storage & Backup</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              100% offline & private. Data never leaves your device.
            </p>
          </div>
          <button
            onClick={() => setBackupModalOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {importStatus && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-xs">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{importStatus}</span>
            </div>
          )}

          {/* Export */}
          <div className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 transition-colors">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-blue-600" />
                <span>Export JSON Backup</span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Save complete inventory, layouts, and items to a single file.
              </p>
            </div>
            <button
              onClick={handleExportJSON}
              disabled={exporting}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer flex-shrink-0 active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>

          {/* Import */}
          <div className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 transition-colors">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Restore from JSON</span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Load a previous Placemend backup file.
              </p>
            </div>
            <label className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer flex-shrink-0 active:scale-95">
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>
          </div>

          {/* Reset sample */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-500">Need to reload sample demo data?</span>
            <button
              onClick={handleResetDemo}
              className="text-xs text-slate-500 hover:text-amber-600 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Demo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
