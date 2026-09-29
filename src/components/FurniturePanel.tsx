import React, { useEffect, useRef, useState } from 'react';
import { RotateCw, FlipHorizontal, FolderOpen, Trash2, X, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Move, Minus, Plus, ChevronDown } from 'lucide-react';
import { MeterInput } from './MeterInput';
import { roundCm } from '../utils/measure';

const STEPS = [
  { cm: 1, label: '1 cm' },
  { cm: 5, label: '5 cm' },
  { cm: 10, label: '10 cm' },
  { cm: 50, label: '50 cm' },
];

interface Props {
  name: string;
  /** Top-left of the piece's footprint in meters (already accounting for rotation) */
  x: number;
  y: number;
  width: number;
  length: number;
  rotated: boolean;
  roomW: number;
  roomH: number;
  mirrored: boolean;
  dragResizeOn: boolean;
  onToggleDragResize: () => void;
  onRotate: () => void;
  onFlip: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onClose: () => void;
  onSetPosition: (x: number, y: number) => void;
  onSetSize: (axis: 'w' | 'l', meters: number) => void;
  /** Tells the canvas how much room the open panel takes, so the plan can shrink to stay visible */
  onReserve: (heightPx: number) => void;
}

const stop = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onMouseUp: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchMove: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerUp: (e: React.SyntheticEvent) => e.stopPropagation(),
  onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
};

/** Selection panel for a piece of furniture: big actions, plus a Position & size section for precise placing */
export const FurniturePanel: React.FC<Props> = ({
  name, x, y, width, length, rotated, roomW, roomH, mirrored, dragResizeOn,
  onToggleDragResize, onRotate, onFlip, onOpen, onDelete, onClose, onSetPosition, onSetSize, onReserve,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [stepCm, setStepCm] = useState(5);
  const [tab, setTab] = useState<'move' | 'size'>('move');
  const panelRef = useRef<HTMLDivElement>(null);
  const step = stepCm / 100;

  const fw = rotated ? length : width;
  const fl = rotated ? width : length;
  const maxX = Math.max(0, roundCm(roomW - fw));
  const maxY = Math.max(0, roundCm(roomH - fl));

  // Reserve space while the section is open so the plan refits above the panel
  useEffect(() => {
    if (!expanded || !panelRef.current) {
      onReserve(0);
      return;
    }
    const el = panelRef.current;
    // Everything from the panel top to the screen bottom is taken (the panel floats above the nav bar)
    const report = () => onReserve(Math.max(0, Math.round(window.innerHeight - el.getBoundingClientRect().top)));
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      onReserve(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  const big = 'min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all';
  const nudge = (dx: number, dy: number, label: string, Icon: typeof ArrowLeft) => (
    <button
      type="button"
      onClick={() => onSetPosition(roundCm(x + dx * step), roundCm(y + dy * step))}
      aria-label={`${label} ${stepCm} cm`}
      title={`${label} ${stepCm} cm`}
      className={`${big} flex-1 bg-white border border-slate-300 text-slate-800 hover:bg-blue-50 hover:border-blue-400`}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
  const align = (label: string, nx: number, ny: number) => (
    <button
      type="button"
      onClick={() => onSetPosition(nx, ny)}
      className="min-h-[44px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer active:scale-95 flex-shrink-0"
    >
      {label}
    </button>
  );
  const sizeField = (axis: 'w' | 'l', label: string, value: number) => (
    <div className="flex items-center gap-1">
      <span className="text-xs font-black text-slate-500 w-4">{label}</span>
      <button
        type="button"
        onClick={() => onSetSize(axis, roundCm(value - step))}
        aria-label={`Smaller ${stepCm} cm`}
        className="w-11 h-11 rounded-lg bg-white border border-slate-300 flex items-center justify-center cursor-pointer active:scale-95"
      >
        <Minus className="w-4 h-4" />
      </button>
      <MeterInput
        aria-label={axis === 'w' ? 'Width in meters' : 'Length in meters'}
        value={value}
        min={0.1}
        max={30}
        onChange={(m) => onSetSize(axis, m)}
        className="w-[68px] h-11 text-center font-mono text-sm font-black bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="button"
        onClick={() => onSetSize(axis, roundCm(value + step))}
        aria-label={`Larger ${stepCm} cm`}
        className="w-11 h-11 rounded-lg bg-white border border-slate-300 flex items-center justify-center cursor-pointer active:scale-95"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div
      ref={panelRef}
      data-toolbar="furniture-controls"
      {...stop}
      className="fixed bottom-[calc(max(env(safe-area-inset-bottom),8px)+84px)] md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-16px)] sm:w-[440px] max-h-[70vh] overflow-y-auto bg-white/98 backdrop-blur-md p-2 rounded-2xl border border-slate-200 shadow-2xl text-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-150 space-y-1.5"
    >
      <div className="flex items-center gap-2 px-1 -mb-0.5">
        <span className="flex-1 min-w-0 text-sm font-extrabold text-slate-900 truncate">{name}</span>
        <button type="button" onClick={onClose} aria-label="Deselect" title="Deselect" className="w-11 h-10 -mr-1 rounded-xl text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button type="button" onClick={onRotate} className={`${big} bg-slate-100 hover:bg-slate-200 text-slate-800 flex-col gap-0.5 !text-[11px]`}>
          <RotateCw className="w-5 h-5 text-blue-600" />
          Rotate
        </button>
        <button type="button" onClick={onFlip} className={`${big} flex-col gap-0.5 !text-[11px] ${mirrored ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'}`}>
          <FlipHorizontal className={`w-5 h-5 ${mirrored ? 'text-white' : 'text-indigo-600'}`} />
          Flip
        </button>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className={`${big} flex-col gap-0.5 !text-[11px] ${expanded ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}
        >
          {expanded ? <ChevronDown className="w-5 h-5" /> : <Move className="w-5 h-5" />}
          Position
        </button>
        <button type="button" onClick={onOpen} className={`${big} flex-col gap-0.5 !text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-800`}>
          <FolderOpen className="w-5 h-5 text-blue-600" />
          Open
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 animate-in fade-in duration-100">
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-xl" role="tablist">
            {(['move', 'size'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`min-h-[38px] rounded-lg text-sm font-bold cursor-pointer ${tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              >
                {t === 'move' ? 'Move' : 'Size'}
              </button>
            ))}
          </div>
          <div>
            <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Nudge step in centimeters">
              {STEPS.map((s) => (
                <button
                  key={s.cm}
                  type="button"
                  role="radio"
                  aria-checked={stepCm === s.cm}
                  onClick={() => setStepCm(s.cm)}
                  className={`min-h-[44px] rounded-xl text-sm font-bold cursor-pointer ${stepCm === s.cm ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {tab === 'move' && (
            <>
          <div className="flex gap-1.5">
            {nudge(-1, 0, 'Move left', ArrowLeft)}
            {nudge(0, -1, 'Move up', ArrowUp)}
            {nudge(0, 1, 'Move down', ArrowDown)}
            {nudge(1, 0, 'Move right', ArrowRight)}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">From left wall</span>
              <MeterInput aria-label="Distance from the left wall in meters" value={x} min={0} max={maxX} onChange={(m) => onSetPosition(m, y)} className="w-full h-11 px-2 font-mono text-sm font-black bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block">
              <span className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">From top wall</span>
              <MeterInput aria-label="Distance from the top wall in meters" value={y} min={0} max={maxY} onChange={(m) => onSetPosition(x, m)} className="w-full h-11 px-2 font-mono text-sm font-black bg-white rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>

          <div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Align">
              {align('Left wall', 0, y)}
              {align('Right wall', maxX, y)}
              {align('Top wall', x, 0)}
              {align('Bottom wall', x, maxY)}
              {align('Center', roundCm(maxX / 2), roundCm(maxY / 2))}
            </div>
          </div>
            </>
          )}

          {tab === 'size' && (
            <>
          <div>
            <span className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">Size (m)</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {sizeField('w', 'W', width)}
              {sizeField('l', 'L', length)}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onToggleDragResize}
              aria-pressed={dragResizeOn}
              className={`${big} flex-1 text-xs ${dragResizeOn ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {dragResizeOn ? 'Resizing by dragging' : 'Resize by dragging'}
            </button>
            <button type="button" onClick={onDelete} className={`${big} px-4 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100`}>
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
