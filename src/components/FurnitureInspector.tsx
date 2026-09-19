import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Container, Item } from '../types';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Package, 
  FolderPlus, 
  ChevronRight, 
  Layers, 
  X,
  Star,
  Tag,
  Hash,
  Box
} from 'lucide-react';

export const FurnitureInspector: React.FC = () => {
  const {
    selectedFurnitureId,
    setSelectedFurnitureId,
    selectedContainerId,
    setSelectedContainerId,
    setItemModalOpen,
  } = useAppStore();

  const [newContainerName, setNewContainerName] = useState('');
  const [newContainerType, setNewContainerType] = useState<Container['type']>('shelf');
  const [isAddingContainer, setIsAddingContainer] = useState(false);

  const furniture = useLiveQuery(async () => {
    if (!selectedFurnitureId) return undefined;
    return await db.furniture.get(selectedFurnitureId);
  }, [selectedFurnitureId]);

  const containers = useLiveQuery(async () => {
    if (!selectedFurnitureId) return [];
    return await db.containers.where('furnitureId').equals(selectedFurnitureId).sortBy('orderIndex');
  }, [selectedFurnitureId]) || [];

  // Active selected container
  const activeContainerId = selectedContainerId || containers[0]?.id;
  const activeContainer = containers.find((c) => c.id === activeContainerId);

  // Items in active container
  const items = useLiveQuery(async () => {
    if (!activeContainerId) return [];
    return await db.items.where('containerId').equals(activeContainerId).toArray();
  }, [activeContainerId]) || [];

  if (!selectedFurnitureId || !furniture) return null;

  const handleAddContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContainerName.trim()) return;

    const newContainer: Container = {
      id: `cont-${Date.now()}`,
      furnitureId: selectedFurnitureId,
      name: newContainerName.trim(),
      type: newContainerType,
      orderIndex: containers.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.containers.add(newContainer);
    setSelectedContainerId(newContainer.id);
    setNewContainerName('');
    setIsAddingContainer(false);
  };

  const handleDeleteContainer = async (containerId: string) => {
    if (window.confirm('Delete this shelf/drawer? Items stored inside will also be removed.')) {
      await db.transaction('rw', [db.containers, db.items], async () => {
        await db.items.where('containerId').equals(containerId).delete();
        await db.containers.delete(containerId);
      });
      if (selectedContainerId === containerId) {
        setSelectedContainerId(null);
      }
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (window.confirm('Delete item?')) {
      await db.items.delete(itemId);
    }
  };

  const handleToggleFavorite = async (item: Item) => {
    await db.items.update(item.id, {
      favorite: !item.favorite,
      updatedAt: Date.now(),
    });
  };

  return (
    <aside className="w-80 sm:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-10 select-none shadow-2xl">
      {/* Furniture Header */}
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <div 
            style={{ backgroundColor: furniture.color || '#3b82f6' }}
            className="w-4 h-4 rounded-md flex-shrink-0 shadow-sm"
          />
          <div className="truncate">
            <h2 className="font-bold text-sm sm:text-base text-white truncate leading-tight">
              {furniture.name}
            </h2>
            <p className="text-[11px] text-slate-400 capitalize font-mono">
              {furniture.type.replace('_', ' ')} • {furniture.dimension.width}×{furniture.dimension.length} units
            </p>
          </div>
        </div>

        <button
          onClick={() => setSelectedFurnitureId(null)}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Storage Containers (Tabs / Shelves / Drawers) */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Shelves & Drawers ({containers.length})</span>
          </span>

          <button
            onClick={() => setIsAddingContainer(!isAddingContainer)}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Slot</span>
          </button>
        </div>

        {/* Add Container inline form */}
        {isAddingContainer && (
          <form onSubmit={handleAddContainer} className="mb-2 p-2 bg-slate-800/90 rounded-xl border border-slate-700 flex flex-col gap-2">
            <input
              type="text"
              placeholder="e.g. Top Drawer, Shelf 2, Plastic Bin"
              value={newContainerName}
              onChange={(e) => setNewContainerName(e.target.value)}
              autoFocus
              className="w-full bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center gap-2">
              <select
                value={newContainerType}
                onChange={(e) => setNewContainerType(e.target.value as Container['type'])}
                className="bg-slate-900 text-white text-xs px-2 py-1 rounded border border-slate-700 focus:outline-none"
              >
                <option value="shelf">Shelf</option>
                <option value="drawer">Drawer</option>
                <option value="box">Box</option>
                <option value="bin">Bin</option>
                <option value="top_surface">Top Surface</option>
                <option value="compartment">Compartment</option>
              </select>
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1 px-3 rounded transition-colors"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setIsAddingContainer(false)}
                className="text-slate-400 hover:text-white text-xs py-1 px-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Horizontal Container pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {containers.map((cont) => {
            const isActive = cont.id === activeContainerId;
            return (
              <button
                key={cont.id}
                onClick={() => setSelectedContainerId(cont.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white'
                }`}
              >
                <Box className="w-3 h-3 opacity-80" />
                <span>{cont.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Items Section inside Active Container */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeContainer ? (
          <>
            <div className="p-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">
                  {activeContainer.name}
                </span>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setItemModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
                  title="Add Item here"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>New Item</span>
                </button>

                <button
                  onClick={() => handleDeleteContainer(activeContainer.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                  title="Delete Container Slot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Item List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {items.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-500">
                  <Package className="w-8 h-8 stroke-1 text-slate-600 mb-2" />
                  <p className="text-xs font-medium">This slot is currently empty</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Click "New Item" to store something here.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 transition-all flex flex-col gap-1.5 shadow-sm group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                            {item.name}
                          </h4>
                          {item.quantity > 1 && (
                            <span className="text-[10px] font-mono font-black text-blue-300 bg-blue-950/80 border border-blue-800/60 px-1.5 py-0.2 rounded-full">
                              ×{item.quantity}
                            </span>
                          )}
                          {item.category && (
                            <span className="text-[9px] font-mono uppercase bg-slate-750 text-slate-300 px-1.5 py-0.2 rounded">
                              {item.category}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleToggleFavorite(item)}
                          className={`p-1 rounded hover:bg-slate-700 transition-colors ${
                            item.favorite ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'
                          }`}
                          title="Toggle Favorite"
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={() => setItemModalOpen(true, item.id)}
                          className="p-1 text-slate-500 hover:text-slate-200 rounded hover:bg-slate-700 transition-colors"
                          title="Edit Item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-700 transition-colors"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] text-slate-400 bg-slate-900/80 px-1.5 py-0.2 rounded border border-slate-700/50 flex items-center gap-0.5"
                          >
                            <Tag className="w-2.5 h-2.5 text-slate-500" />
                            <span>{tag}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
            <Layers className="w-8 h-8 stroke-1 text-slate-600 mb-2" />
            <p className="text-xs font-semibold text-slate-400">No shelves or drawers added yet</p>
            <p className="text-[11px] text-slate-600 mt-1 max-w-xs">
              Add a slot above (e.g. "Main Compartment" or "Drawer 1") to start placing items.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
