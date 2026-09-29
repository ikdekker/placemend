import React, { useEffect, useRef, useState } from 'react';
import { Grid, Eye, Ruler, Focus, Maximize2, Minimize2, SlidersHorizontal, Check } from 'lucide-react';

interface Props {
  /** Edit mode only: snapping while dragging */
  gridSnap?: boolean;
  onToggleGridSnap?: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showDimensions: boolean;
  onToggleDimensions: () => void;
  onRecenter: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

/**
 * One "View" button that opens big, labelled rows, instead of five small icons in a row that are
 * easy to mis-tap on a phone.
 */
export const CanvasOptionsMenu: React.FC<Props> = ({
  gridSnap,
  onToggleGridSnap,
  showLabels,
  onToggleLabels,
  showDimensions,
  onToggleDimensions,
  onRecenter,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const row = (icon: React.ReactNode, label: string, opts: { on?: boolean; onClick: () => void; close?: boolean }) => (
    <button
      type="button"
      role={opts.on !== undefined ? 'switch' : undefined}
      aria-checked={opts.on}
      onClick={() => {
        opts.onClick();
        if (opts.close) setOpen(false);
      }}
      className="w-full min-h-[48px] px-3 flex items-center gap-3 rounded-xl text-sm font-bold text-slate-800 hover:bg-slate-100 active:bg-slate-200 cursor-pointer text-left"
    >
      <span className="w-6 flex justify-center text-slate-500">{icon}</span>
      <span className="flex-1">{label}</span>
      {opts.on !== undefined && (
        <span className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${opts.on ? 'bg-blue-600 justify-end' : 'bg-slate-300 justify-start'}`}>
          <span className="w-5 h-5 rounded-full bg-white shadow flex items-center justify-center">
            {opts.on && <Check className="w-3 h-3 text-blue-600" />}
          </span>
        </span>
      )}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="View options"
        title="View options"
        className={`min-h-[44px] min-w-[44px] px-2 rounded-xl flex items-center justify-center gap-1 text-xs font-bold cursor-pointer transition-colors ${
          open ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
        }`}
      >
        <SlidersHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-1.5 z-50 animate-in fade-in duration-100">
          {onToggleGridSnap && row(<Grid className="w-5 h-5" />, 'Snap while dragging', { on: !!gridSnap, onClick: onToggleGridSnap })}
          {row(<Eye className="w-5 h-5" />, 'Names on furniture', { on: showLabels, onClick: onToggleLabels })}
          {row(<Ruler className="w-5 h-5" />, 'Show sizes', { on: showDimensions, onClick: onToggleDimensions })}
          <div className="h-px bg-slate-100 my-1" />
          {row(<Focus className="w-5 h-5" />, 'Fit room to screen', { onClick: onRecenter, close: true })}
          {row(isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />, isFullscreen ? 'Exit full screen' : 'Full screen', {
            onClick: onToggleFullscreen,
            close: true,
          })}
        </div>
      )}
    </div>
  );
};
