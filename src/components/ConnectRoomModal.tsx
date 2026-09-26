import React, { useState } from 'react';
import { MeterInput } from './MeterInput';
import { roundCm } from '../utils/measure';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Room, RoomDoor, WallSide } from '../types';
import { getRoomDoors } from '../utils/roomGeometry';
import { isAutoSyncEnabled, pushLocalToRemote } from '../services/apiSync';
import {
  X,
  DoorOpen,
  Link,
  Unlink,
  Plus,
  ArrowRight,
  Layers,
  Sparkles,
  MapPin,
  Check
} from 'lucide-react';

const ROOM_TEMPLATES = [
  { name: 'Hallway / Corridor', width: 3.6, height: 1.8, color: '#64748b' },
  { name: 'Kitchen & Dining', width: 4.8, height: 3.6, color: '#ea580c' },
  { name: 'Master Bedroom', width: 4.8, height: 4.2, color: '#8b5cf6' },
  { name: 'Home Office / Studio', width: 3.6, height: 3, color: '#0284c7' },
  { name: 'Sunroom & Garden', width: 4.2, height: 3, color: '#16a34a' },
  { name: 'Bathroom & Spa', width: 2.4, height: 1.8, color: '#06b6d4' },
  { name: 'Balcony & Terrace', width: 3, height: 1.5, color: '#d97706' },
];

export const ConnectRoomModal: React.FC = () => {
  const {
    isConnectRoomModalOpen,
    setConnectRoomModalOpen,
    connectRoomDoorContext,
    setSelectedRoomId,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'existing' | 'create'>('create');

  // Form state for creating a new room
  const [newRoomName, setNewRoomName] = useState('Hallway / Corridor');
  const [newRoomWidth, setNewRoomWidth] = useState(4);
  const [newRoomHeight, setNewRoomHeight] = useState(4);
  const [newRoomColor, setNewRoomColor] = useState('#0284c7');

  const sourceRoomId = connectRoomDoorContext?.roomId;
  const sourceDoorId = connectRoomDoorContext?.doorId;

  const sourceRoom = useLiveQuery(
    () => (sourceRoomId ? db.rooms.get(sourceRoomId) : undefined),
    [sourceRoomId]
  );

  const allRooms = useLiveQuery(() => db.rooms.toArray()) || [];

  if (!isConnectRoomModalOpen || !sourceRoom || !sourceDoorId) return null;

  const sourceDoors = getRoomDoors(sourceRoom);
  const sourceDoor = sourceDoors.find((d) => d.id === sourceDoorId) || sourceDoors[0];
  if (!sourceDoor) return null;

  const targetRoom = allRooms.find((r) => r.id === sourceDoor.targetRoomId);

  // Determine an opposite wall for the reciprocal door
  const getOppositeWall = (wall: string): WallSide => {
    switch (wall) {
      case 'top': return 'bottom';
      case 'bottom': return 'top';
      case 'left': return 'right';
      case 'right': return 'left';
      default: return 'bottom';
    }
  };

  // Centre a door of the given width on a wall of a (rectangular) room
  const centredOffset = (room: Pick<Room, 'gridWidth' | 'gridHeight'>, wall: string, width: number) => {
    const wallLen = wall === 'top' || wall === 'bottom' ? room.gridWidth : room.gridHeight;
    return roundCm(Math.max(0, (wallLen - Math.min(width, wallLen)) / 2));
  };

  // Connect to an existing room
  const handleConnectExisting = async (chosenTargetRoom: Room) => {
    const targetDoors = getRoomDoors(chosenTargetRoom);
    let reciprocalDoor = targetDoors.find((d) => !d.targetRoomId);

    const now = Date.now();

    if (!reciprocalDoor) {
      // Create reciprocal door in target room
      const oppWall = getOppositeWall(sourceDoor.wall);
      reciprocalDoor = {
        id: `door-${now}`,
        label: `To ${sourceRoom.name}`,
        wall: oppWall,
        offset: centredOffset(chosenTargetRoom, oppWall, sourceDoor.width || 0.8),
        swing: 'inward_left',
        width: sourceDoor.width || 0.8,
        targetRoomId: sourceRoom.id,
        targetDoorId: sourceDoor.id,
      };
      const updatedTargetDoors = [...targetDoors, reciprocalDoor];
      await db.rooms.update(chosenTargetRoom.id, {
        doors: updatedTargetDoors,
        door: updatedTargetDoors[0],
        updatedAt: now,
      });
    } else {
      // Link existing unlinked door
      const updatedTargetDoors = targetDoors.map((d) =>
        d.id === reciprocalDoor?.id
          ? {
              ...d,
              label: d.label || `To ${sourceRoom.name}`,
              targetRoomId: sourceRoom.id,
              targetDoorId: sourceDoor.id,
            }
          : d
      );
      await db.rooms.update(chosenTargetRoom.id, {
        doors: updatedTargetDoors,
        door: updatedTargetDoors[0],
        updatedAt: now,
      });
    }

    // Update source door
    const updatedSourceDoors = sourceDoors.map((d) =>
      d.id === sourceDoor.id
        ? {
            ...d,
            targetRoomId: chosenTargetRoom.id,
            targetDoorId: reciprocalDoor?.id,
          }
        : d
    );

    await db.rooms.update(sourceRoom.id, {
      doors: updatedSourceDoors,
      door: updatedSourceDoors[0],
      updatedAt: now,
    });

    if (isAutoSyncEnabled()) {
      pushLocalToRemote().catch(console.error);
    }

    setConnectRoomModalOpen(false);
  };

  // Create a brand new room and connect reciprocal doors
  const handleCreateAndConnect = async () => {
    const trimmed = newRoomName.trim();
    if (!trimmed) return;

    const now = Date.now();
    const newRoomId = `room-${now}`;
    const reciprocalDoorId = `door-reciprocal-${now}`;
    const oppWall = getOppositeWall(sourceDoor.wall);

    const reciprocalDoor: RoomDoor = {
      id: reciprocalDoorId,
      label: `To ${sourceRoom.name}`,
      wall: oppWall,
      offset: centredOffset(
        { gridWidth: roundCm(Math.max(0.5, Math.min(50, newRoomWidth))), gridHeight: roundCm(Math.max(0.5, Math.min(50, newRoomHeight))) },
        oppWall,
        sourceDoor.width || 0.8,
      ),
      swing: 'inward_left',
      width: sourceDoor.width || 0.8,
      targetRoomId: sourceRoom.id,
      targetDoorId: sourceDoor.id,
    };

    const newRoom: Room = {
      id: newRoomId,
      locationId: sourceRoom.locationId || 'loc-home',
      name: trimmed,
      color: newRoomColor,
      shapeType: 'rectangle',
      gridWidth: roundCm(Math.max(0.5, Math.min(50, newRoomWidth))),
      gridHeight: roundCm(Math.max(0.5, Math.min(50, newRoomHeight))),
      unitSize: sourceRoom.unitSize || 32,
      doors: [reciprocalDoor],
      door: reciprocalDoor,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Add new room
    await db.rooms.add(newRoom);

    // 2. Link source door to this new room
    const updatedSourceDoors = sourceDoors.map((d) =>
      d.id === sourceDoor.id
        ? {
            ...d,
            targetRoomId: newRoomId,
            targetDoorId: reciprocalDoorId,
          }
        : d
    );

    await db.rooms.update(sourceRoom.id, {
      doors: updatedSourceDoors,
      door: updatedSourceDoors[0],
      updatedAt: now,
    });

    if (isAutoSyncEnabled()) {
      pushLocalToRemote().catch(console.error);
    }

    setConnectRoomModalOpen(false);
    // Optionally switch to the newly created room
    setSelectedRoomId(newRoomId);
  };

  // Disconnect door link
  const handleUnlink = async () => {
    const now = Date.now();

    // 1. Unlink in target room if present
    if (sourceDoor.targetRoomId) {
      const remote = await db.rooms.get(sourceDoor.targetRoomId);
      if (remote) {
        const remoteDoors = getRoomDoors(remote);
        const updatedRemoteDoors = remoteDoors.map((d) =>
          d.targetRoomId === sourceRoom.id ? { ...d, targetRoomId: undefined, targetDoorId: undefined } : d
        );
        await db.rooms.update(remote.id, {
          doors: updatedRemoteDoors,
          door: updatedRemoteDoors[0],
          updatedAt: now,
        });
      }
    }

    // 2. Unlink in source room
    const updatedSourceDoors = sourceDoors.map((d) =>
      d.id === sourceDoor.id ? { ...d, targetRoomId: undefined, targetDoorId: undefined } : d
    );

    await db.rooms.update(sourceRoom.id, {
      doors: updatedSourceDoors,
      door: updatedSourceDoors[0],
      updatedAt: now,
    });

    if (isAutoSyncEnabled()) {
      pushLocalToRemote().catch(console.error);
    }

    setConnectRoomModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>Connect Doorway</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono font-bold">
                  {sourceDoor.label || 'Door'}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                In <span className="font-semibold text-slate-700">{sourceRoom.name}</span> on the {sourceDoor.wall} wall
              </p>
            </div>
          </div>
          <button
            onClick={() => setConnectRoomModalOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Connection Status if linked */}
        {targetRoom && (
          <div className="p-3 mx-4 mt-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Connected to <strong className="font-extrabold">{targetRoom.name}</strong> ({targetRoom.gridWidth}m × {targetRoom.gridHeight}m)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setSelectedRoomId(targetRoom.id);
                  setConnectRoomModalOpen(false);
                }}
                className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg border border-emerald-300 transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                title={`Switch to ${targetRoom.name}`}
              >
                <span>Go to Room</span>
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                onClick={handleUnlink}
                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-lg border border-rose-200 transition-colors cursor-pointer flex items-center gap-1"
                title="Disconnect doorway"
              >
                <Unlink className="w-3 h-3" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 pt-3 gap-2 text-xs font-bold flex-shrink-0">
          <button
            onClick={() => setActiveTab('create')}
            className={`py-2 px-3 sm:px-4 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'create' ? 'bg-white text-blue-600 shadow-xs border border-slate-200/80' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Create & Connect New Room</span>
          </button>
          <button
            onClick={() => setActiveTab('existing')}
            className={`py-2 px-3 sm:px-4 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'existing' ? 'bg-white text-blue-600 shadow-xs border border-slate-200/80' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>Connect Existing Room ({allRooms.filter((r) => r.id !== sourceRoom.id).length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-4">
          {activeTab === 'create' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Quick Room Inspiration
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ROOM_TEMPLATES.map((tmpl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setNewRoomName(tmpl.name);
                        setNewRoomWidth(tmpl.width);
                        setNewRoomHeight(tmpl.height);
                        setNewRoomColor(tmpl.color);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                        newRoomName === tmpl.name
                          ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold shadow-2xs'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tmpl.color }} />
                      <span>{tmpl.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({tmpl.width}×{tmpl.height}m)</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Room Name *
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Hallway, Kitchen, Sunroom"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="connect-room-width" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Width (meters)
                  </label>
                  <MeterInput
                    id="connect-room-width"
                    min={0.5}
                    max={50}
                    value={newRoomWidth}
                    onChange={setNewRoomWidth}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="connect-room-length" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Length (meters)
                  </label>
                  <MeterInput
                    id="connect-room-length"
                    min={0.5}
                    max={50}
                    value={newRoomHeight}
                    onChange={setNewRoomHeight}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner font-mono"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateAndConnect}
                disabled={!newRoomName.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-extrabold text-sm rounded-2xl shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Create & Connect "{newRoomName}"</span>
              </button>
            </div>
          )}

          {activeTab === 'existing' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                Select an existing room. Placemend will connect this doorway to that room (and create or link a doorway back).
              </p>
              {allRooms
                .filter((r) => r.id !== sourceRoom.id)
                .map((r) => {
                  const isCurrentTarget = r.id === sourceDoor.targetRoomId;
                  const targetDoors = getRoomDoors(r);
                  return (
                    <div
                      key={r.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                        isCurrentTarget
                          ? 'bg-blue-50/70 border-blue-400 ring-1 ring-blue-300 shadow-xs'
                          : 'bg-white hover:bg-slate-50 border-slate-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-4 h-4 rounded-full flex-shrink-0 shadow-xs"
                          style={{ backgroundColor: r.color || '#3b82f6' }}
                        />
                        <div>
                          <div className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
                            <span>{r.name}</span>
                            {isCurrentTarget && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                                Current Link
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">
                            {r.gridWidth}m × {r.gridHeight}m • {targetDoors.length} {targetDoors.length === 1 ? 'door' : 'doors'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleConnectExisting(r)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1 ${
                          isCurrentTarget
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 pointer-events-none'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs active:scale-95'
                        }`}
                      >
                        {isCurrentTarget ? (
                          <>
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Connected</span>
                          </>
                        ) : (
                          <>
                            <Link className="w-3.5 h-3.5" />
                            <span>Connect</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}

              {allRooms.filter((r) => r.id !== sourceRoom.id).length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No other rooms found in this workspace. Switch to "Create & Connect New Room" to add one!
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
