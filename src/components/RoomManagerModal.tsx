import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Room } from '../types';
import { X, Plus, Trash2, MapPin, Grid } from 'lucide-react';

export const RoomManagerModal: React.FC = () => {
  const {
    isRoomManagerOpen,
    setRoomManagerOpen,
    selectedLocationId,
    selectedRoomId,
    setSelectedRoomId,
  } = useAppStore();

  const [name, setName] = useState('');
  const [gridWidth, setGridWidth] = useState(24);
  const [gridHeight, setGridHeight] = useState(18);
  const [color, setColor] = useState('#3b82f6');

  const rooms = useLiveQuery(() => 
    selectedLocationId 
      ? db.rooms.where('locationId').equals(selectedLocationId).toArray()
      : db.rooms.toArray()
  , [selectedLocationId]) || [];

  if (!isRoomManagerOpen) return null;

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newRoom: Room = {
      id: `room-${Date.now()}`,
      locationId: selectedLocationId || 'loc-home',
      name: name.trim(),
      color,
      gridWidth: Math.max(10, Math.min(50, gridWidth)),
      gridHeight: Math.max(10, Math.min(50, gridHeight)),
      unitSize: 32,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.rooms.add(newRoom);
    setSelectedRoomId(newRoom.id);
    setName('');
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (rooms.length <= 1) {
      alert('You must keep at least one room.');
      return;
    }
    if (window.confirm('Delete this room and all furniture/items in it?')) {
      await db.transaction('rw', [db.rooms, db.furniture, db.containers, db.items], async () => {
        const furnitures = await db.furniture.where('roomId').equals(roomId).toArray();
        const furnIds = furnitures.map((f) => f.id);
        const containers = await db.containers.where('furnitureId').anyOf(furnIds).toArray();
        const contIds = containers.map((c) => c.id);

        await db.items.where('containerId').anyOf(contIds).delete();
        await db.containers.where('furnitureId').anyOf(furnIds).delete();
        await db.furniture.where('roomId').equals(roomId).delete();
        await db.rooms.delete(roomId);
      });

      if (selectedRoomId === roomId) {
        const remaining = rooms.filter((r) => r.id !== roomId);
        setSelectedRoomId(remaining[0]?.id || null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-400" />
              <span>Rooms & Floor Plans</span>
            </h3>
            <p className="text-xs text-slate-400">
              Manage rooms, switch active spaces, or customize room dimensions
            </p>
          </div>
          <button
            onClick={() => setRoomManagerOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 custom-scrollbar flex-1">
          {/* Room List */}
          <div className="space-y-2">
            <label className="block text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider">
              Existing Rooms
            </label>
            {rooms.map((room) => {
              const isActive = room.id === selectedRoomId;
              return (
                <div
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    isActive
                      ? 'bg-blue-600/20 border-blue-500 text-white'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      style={{ backgroundColor: room.color }}
                      className="w-4 h-4 rounded-md shadow-sm"
                    />
                    <div>
                      <h5 className="font-bold text-xs sm:text-sm">{room.name}</h5>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {room.gridWidth}×{room.gridHeight} units
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isActive && (
                      <span className="text-[10px] font-mono font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRoom(room.id);
                      }}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                      title="Delete Room"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* New Room Form */}
          <div className="pt-3 border-t border-slate-800">
            <label className="block text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Create New Room
            </label>
            <form onSubmit={handleCreateRoom} className="space-y-3 bg-slate-800/40 p-3 rounded-xl border border-slate-700/60">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Room Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Bedroom, Attic, Office"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Width (grid units)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={60}
                    value={gridWidth}
                    onChange={(e) => setGridWidth(parseInt(e.target.value, 10) || 20)}
                    className="w-full bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Height (grid units)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={60}
                    value={gridHeight}
                    onChange={(e) => setGridHeight(parseInt(e.target.value, 10) || 16)}
                    className="w-full bg-slate-800 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 rounded-lg shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Room</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
