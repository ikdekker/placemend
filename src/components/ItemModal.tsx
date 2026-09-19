import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Item } from '../types';
import { X, Tag, Plus, Camera, Image, Check } from 'lucide-react';

export const ItemModal: React.FC = () => {
  const {
    isItemModalOpen,
    editingItemId,
    selectedContainerId,
    setItemModalOpen,
  } = useAppStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [category, setCategory] = useState('General');
  const [tagsInput, setTagsInput] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);

  const [targetContainerId, setTargetContainerId] = useState<string>('');

  const container = useLiveQuery(async () => {
    if (!selectedContainerId) return undefined;
    return await db.containers.get(selectedContainerId);
  }, [selectedContainerId]);

  const furnitureContainers = useLiveQuery(async () => {
    if (!container?.furnitureId) return [];
    return await db.containers.where('furnitureId').equals(container.furnitureId).toArray();
  }, [container?.furnitureId]) || [];

  useEffect(() => {
    if (editingItemId) {
      db.items.get(editingItemId).then((item) => {
        if (item) {
          setName(item.name);
          setDescription(item.description || '');
          setQuantity(item.quantity || 1);
          setCategory(item.category || 'General');
          setTagsInput((item.tags || []).join(', '));
          setFavorite(!!item.favorite);
          setPhotoDataUrl(item.photoDataUrl);
          setTargetContainerId(item.containerId);
        }
      });
    } else {
      setName('');
      setDescription('');
      setQuantity(1);
      setCategory('General');
      setTagsInput('');
      setFavorite(false);
      setPhotoDataUrl(undefined);
      setTargetContainerId(selectedContainerId || '');
    }
  }, [editingItemId, isItemModalOpen, selectedContainerId]);

  if (!isItemModalOpen) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        setPhotoDataUrl(loadEvt.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const assignedContainerId = targetContainerId || selectedContainerId;
    if (!assignedContainerId) {
      alert('Please select a storage container.');
      return;
    }

    if (editingItemId) {
      await db.items.update(editingItemId, {
        containerId: assignedContainerId,
        name: name.trim(),
        description: description.trim(),
        quantity: Math.max(1, Number(quantity) || 1),
        category,
        tags,
        favorite,
        photoDataUrl,
        updatedAt: Date.now(),
      });
    } else {
      const newItem: Item = {
        id: `item-${Date.now()}`,
        containerId: assignedContainerId,
        name: name.trim(),
        description: description.trim(),
        quantity: Math.max(1, Number(quantity) || 1),
        category,
        tags,
        favorite,
        photoDataUrl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await db.items.add(newItem);
    }

    setItemModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div>
            <h3 className="text-base font-bold text-white">
              {editingItemId ? 'Edit Item' : 'New Stored Item'}
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              In: {container?.name || 'Selected Storage Slot'}
            </p>
          </div>
          <button
            onClick={() => setItemModalOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto custom-scrollbar flex-1">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Item Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Passport, Makita Impact Driver, HDMI Cable"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800 text-white text-sm px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Notes & Details
            </label>
            <textarea
              rows={2}
              placeholder="Color, model number, where exactly in the container..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-800 text-white text-sm px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Location Selector (when multiple containers/compartments exist) */}
          {furnitureContainers.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Storage Location / Divider
              </label>
              <select
                value={targetContainerId || selectedContainerId || ''}
                onChange={(e) => setTargetContainerId(e.target.value)}
                className="w-full bg-slate-800 text-white text-sm px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                {furnitureContainers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parentContainerId ? `↳ Divider: ${c.name}` : `Drawer/Shelf: ${c.name}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity & Category Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                className="w-full bg-slate-800 text-white text-sm px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-800 text-white text-sm px-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="General">General</option>
                <option value="Tools">Tools & Hardware</option>
                <option value="Electronics">Electronics & Cables</option>
                <option value="Documents">Documents & Passports</option>
                <option value="Clothing">Clothing & Gear</option>
                <option value="Games">Games & Entertainment</option>
                <option value="Outdoor">Outdoor & Camping</option>
                <option value="Health">Health & Medicine</option>
                <option value="Kitchen">Kitchen Supplies</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>Tags (comma-separated)</span>
              <span className="text-[10px] text-slate-400">e.g. urgent, winter, 4k</span>
            </label>
            <div className="relative">
              <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                placeholder="urgent, travel, backup, spare"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className="w-full bg-slate-800 text-white text-sm pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Photo capture/upload (Local-First stored in IndexedDB) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Item Photo (Optional, Stored Offline)
            </label>
            <div className="flex items-center gap-3">
              {photoDataUrl ? (
                <div className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-700">
                  <img src={photoDataUrl} alt="Item preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl(undefined)}
                    className="absolute top-0 right-0 bg-black/70 p-0.5 rounded-bl text-white hover:text-rose-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : null}

              <label className="flex-1 cursor-pointer border border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-3 flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-white transition-colors bg-slate-800/40">
                <Camera className="w-4 h-4 text-blue-400" />
                <span>Snap or Upload Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Submit buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setItemModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{editingItemId ? 'Save Changes' : 'Store Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
