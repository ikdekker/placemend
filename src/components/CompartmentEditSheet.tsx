import React, { useEffect, useState } from 'react';
import { Container, ContainerType } from '../types';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Trash2, X } from 'lucide-react';

const TYPE_OPTIONS: { type: ContainerType; label: string }[] = [
  { type: 'cabinet_door', label: 'Door' },
  { type: 'drawer', label: 'Drawer' },
  { type: 'shelf', label: 'Shelf' },
  { type: 'box', label: 'Box' },
  { type: 'top_surface', label: 'Top surface' },
  { type: 'hanging_rod', label: 'Rail' },
];

interface Props {
  container: Container;
  kind: ContainerType;
  itemCount: number;
  canMove: { left: boolean; right: boolean; up: boolean; down: boolean };
  onRename: (name: string) => void;
  onChangeType: (type: ContainerType) => void;
  onMove: (dx: number, dy: number) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Bottom sheet for one compartment while editing a furniture layout */
export const CompartmentEditSheet: React.FC<Props> = ({
  container, kind, itemCount, canMove, onRename, onChangeType, onMove, onDelete, onClose,
}) => {
  const [name, setName] = useState(container.name);
  useEffect(() => setName(container.name), [container.id, container.name]);

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== container.name) onRename(trimmed);
    else setName(container.name);
  };

  const moveButton = (enabled: boolean, dx: number, dy: number, label: string, Icon: typeof ArrowLeft) => (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => onMove(dx, dy)}
      aria-label={label}
      title={label}
      className="h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-blue-50 hover:border-blue-400 active:scale-95 cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
    >
      <Icon className="w-5 h-5" />
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 pb-[max(env(safe-area-inset-bottom),16px)] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900">Edit compartment</h3>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <label htmlFor="compartment-name" className="block text-xs font-bold text-slate-600 mb-1">Name</label>
          <input
            id="compartment-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <span className="block text-xs font-bold text-slate-600 mb-1.5">What is it?</span>
          <div className="grid grid-cols-3 gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => onChangeType(opt.type)}
                aria-pressed={kind === opt.type}
                className={`py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                  kind === opt.type ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {kind !== 'top_surface' && (
          <div>
            <span className="block text-xs font-bold text-slate-600 mb-1.5">Move</span>
            <div className="grid grid-cols-4 gap-2">
              {moveButton(canMove.left, -1, 0, 'Move left', ArrowLeft)}
              {moveButton(canMove.up, 0, -1, 'Move up', ArrowUp)}
              {moveButton(canMove.down, 0, 1, 'Move down', ArrowDown)}
              {moveButton(canMove.right, 1, 0, 'Move right', ArrowRight)}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              if (itemCount === 0 || window.confirm(`Delete "${container.name}" and the ${itemCount} item${itemCount === 1 ? '' : 's'} in it?`)) onDelete();
            }}
            className="px-4 py-3 rounded-xl bg-rose-50 text-rose-700 text-sm font-bold hover:bg-rose-100 cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
          <button type="button" onClick={onClose} className="ml-auto px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 cursor-pointer">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
