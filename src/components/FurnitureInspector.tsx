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
    <>
      {/* Mobile Backdrop to easily dismiss drawer by tapping outside */}
      <div 
        onClick={() => setSelectedFurnitureId(null)}
        className="md:hidden fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 transition-opacity"
      />

      <aside className="fixed md:static inset-x-0 bottom-0 z-50 md:z-10 w-full md:w-96 max-h-[82vh] md:max-h-full bg-white border-t md:border-t-0 md:border-l border-slate-200 flex flex-col rounded-t-3xl md:rounded-none shadow-2xl md:shadow-xl overflow-hidden animate-in slide-in-from-bottom md:slide-in-from-right duration-200">
        {/* Mobile Drawer Grab Handle */}
        <div 
          onClick={() => setSelectedFurnitureId(null)}
          className="md:hidden w-full flex items-center justify-center pt-2.5 pb-1 bg-slate-50/80 cursor-pointer"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300" />
        </div>

      {/* Furniture Header */}
      <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <div 
            style={{ backgroundColor: furniture.color || '#3b82f6' }}
            className="w-4 h-4 rounded-md flex-shrink-0 shadow-xs"
          />
          <div className="truncate">
            <h2 className="font-bold text-sm sm:text-base text-slate-900 truncate leading-tight">
              {furniture.name}
            </h2>
            <p className="text-[11px] text-slate-500 capitalize font-mono">
              {furniture.type.replace('_', ' ')} • {furniture.dimension.width}×{furniture.dimension.length} units
            </p>
          </div>
        </div>

        <button
          onClick={() => setSelectedFurnitureId(null)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          title="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Storage Containers (Tabs / Shelves / Drawers) */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>Shelves & Drawers ({containers.length})</span>
          </span>

          <button
            onClick={() => setIsAddingContainer(!isAddingContainer)}
            className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Slot</span>
          </button>
        </div>

        {/* Add Container inline form */}
        {isAddingContainer && (
          <form onSubmit={handleAddContainer} className="mb-2 p-2.5 bg-white rounded-xl border border-slate-300 shadow-xs flex flex-col gap-2">
            <input
              type="text"
              placeholder="e.g. Top Drawer, Shelf 2, Plastic Bin"
              value={newContainerName}
              onChange={(e) => setNewContainerName(e.target.value)}
              autoFocus
              className="w-full bg-slate-50 text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 font-medium"
            />
            <div className="flex items-center gap-2">
              <select
                value={newContainerType}
                onChange={(e) => setNewContainerType(e.target.value as Container['type'])}
                className="bg-slate-50 text-slate-900 text-xs px-2 py-1.5 rounded-lg border border-slate-300 focus:outline-none"
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
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setIsAddingContainer(false)}
                className="text-slate-500 hover:text-slate-800 text-xs py-1 px-2 cursor-pointer"
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-2xs'
                }`}
              >
                <Box className="w-3.5 h-3.5 opacity-80" />
                <span>{cont.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Items Section inside Active Container */}
      <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
        {activeContainer ? (
          <>
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  {activeContainer.name}
                </span>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setItemModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                  title="Add Item here"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>New Item</span>
                </button>

                <button
                  onClick={() => handleDeleteContainer(activeContainer.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Delete Container Slot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Item List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
              {items.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-400">
                  <Package className="w-8 h-8 stroke-1 text-slate-300 mb-2" />
                  <p className="text-xs font-semibold text-slate-600">This slot is empty</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Click "+ New Item" to store something here.
                  </p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white hover:bg-slate-50/80 border border-slate-200 transition-all flex flex-col gap-1.5 shadow-2xs group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {item.name}
                          </h4>
                          {item.quantity > 1 && (
                            <span className="text-[10px] font-mono font-black text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded-full">
                              ×{item.quantity}
                            </span>
                          )}
                          {item.category && (
                            <span className="text-[9px] font-mono font-bold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                              {item.category}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 font-medium">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleToggleFavorite(item)}
                          className={`p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer ${
                            item.favorite ? 'text-amber-500 fill-amber-500' : 'text-slate-300 hover:text-slate-500'
                          }`}
                          title="Toggle Favorite"
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                        <button
                          onClick={() => setItemModalOpen(true, item.id)}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                          title="Edit Item"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
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
                            className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded-md border border-slate-200 font-medium flex items-center gap-0.5"
                          >
                            <Tag className="w-2.5 h-2.5 text-slate-400" />
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
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
            <Layers className="w-8 h-8 stroke-1 text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-600">No shelves or drawers added yet</p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
              Add a slot above (e.g. "Main Compartment" or "Drawer 1") to start placing items.
            </p>
          </div>
        )}
      </div>
    </aside>
    </>
  );
};
