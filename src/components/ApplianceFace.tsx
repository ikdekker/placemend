import React from 'react';
import { ApplianceKind } from '../utils/containerKind';

/** The front of a built-in appliance, drawn so it reads as an oven/hood/dishwasher at a glance */
export const ApplianceFace: React.FC<{ kind: ApplianceKind }> = ({ kind }) => {
  if (kind === 'hood') {
    // Stainless canopy narrowing towards the wall cabinet above, with a filter strip and buttons
    return (
      <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
        <div className="mx-[12%] flex-1 min-h-[10px] bg-gradient-to-b from-slate-300 to-slate-200 border-x border-slate-400/60" />
        <div className="h-[44%] min-h-[26px] rounded-b-lg bg-gradient-to-b from-slate-200 via-white to-slate-300 border border-slate-400/70 shadow-md relative">
          <div className="absolute left-[10%] right-[10%] bottom-1.5 h-1.5 rounded-full bg-slate-500/40" />
          <div className="absolute right-[12%] top-1.5 flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-600/70" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'oven' || kind === 'microwave') {
    // Black glass with a control strip on top and a handle bar
    return (
      <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-b from-slate-800 to-slate-950 border-2 border-slate-700 shadow-md pointer-events-none overflow-hidden">
        <div className="h-[18%] min-h-[14px] bg-slate-900 border-b border-slate-700 flex items-center justify-center gap-2">
          <span className="px-1 rounded bg-black text-[9px] font-mono font-bold text-sky-400">12:00</span>
          <span className="w-2 h-2 rounded-full bg-slate-600" />
          <span className="w-2 h-2 rounded-full bg-slate-600" />
        </div>
        <div className="mx-[10%] mt-[6%] h-1.5 rounded-full bg-gradient-to-r from-slate-500 via-slate-300 to-slate-500" />
        <div className="absolute left-[12%] right-[12%] top-[38%] bottom-[12%] rounded-lg bg-black/60 border border-white/10">
          <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent rounded-lg" />
        </div>
      </div>
    );
  }
  if (kind === 'dishwasher') {
    return (
      <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-b from-slate-100 to-slate-200 border-2 border-slate-300 shadow-md pointer-events-none">
        <div className="h-[16%] min-h-[12px] border-b border-slate-300 flex items-center justify-end gap-1 pr-3">
          <span className="w-4 h-1.5 rounded-full bg-slate-500/60" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
        <div className="absolute left-[30%] right-[30%] top-[24%] h-1.5 rounded-full bg-slate-400/70" />
      </div>
    );
  }
  if (kind === 'fridge') {
    return (
      <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-br from-slate-200 via-slate-100 to-slate-300 border-2 border-slate-300 shadow-md pointer-events-none">
        <div className="absolute left-0 right-0 top-[38%] h-px bg-slate-400" />
        <div className="absolute right-3 top-[12%] w-1.5 h-[18%] rounded-full bg-slate-500/60" />
        <div className="absolute right-3 top-[48%] w-1.5 h-[30%] rounded-full bg-slate-500/60" />
      </div>
    );
  }
  return <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-slate-200 border-2 border-slate-300 pointer-events-none" />;
};
