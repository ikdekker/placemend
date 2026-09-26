import React, { useState, useMemo, useRef } from 'react';
import { db } from '../db/database';
import { useAppStore } from '../store/useAppStore';
import { Furniture, FurnitureType, FurnitureShape } from '../types';
import { scheduleAutoSync } from '../services/apiSync';
import { reportClientError } from '../services/errorReport';
import { inferContainerType } from '../utils/containerKind';
import { 
  X, 
  Plus, 
  Sparkles,
  Search,
  Check,
  Zap,
  Armchair,
  UtensilsCrossed,
  Bed,
  Briefcase,
  Archive,
  Layers
} from 'lucide-react';

export type FurnitureCategory = 'living' | 'kitchen' | 'bedroom' | 'office' | 'storage';

interface FurnitureTemplate {
  name: string;
  category: FurnitureCategory;
  subType?: string;
  type: FurnitureType;
  shape?: FurnitureShape;
  width: number;
  length: number;
  color: string;
  defaultContainers: string[];
  description: string;
}

// Template sizes below are in the legacy ~0.3m grid unit; TEMPLATES converts them to meters,
// which is what rooms and furniture use now.
const LEGACY_UNIT_TEMPLATES: FurnitureTemplate[] = [
  // --- LIVING & LOUNGE ---
  {
    name: '3-Seater Sofa / Couch',
    category: 'living',
    subType: 'Seating & Lounging',
    type: 'sofa',
    shape: 'rectangle',
    width: 6,
    length: 3,
    color: '#334155', // navy slate
    defaultContainers: ['Left Seat Cushion', 'Right Seat Cushion', 'Under-Sofa Storage Drawer'],
    description: 'Comfortable family sofa with under-cushion storage',
  },
  {
    name: 'Sectional L-Couch',
    category: 'living',
    subType: 'Seating & Lounging',
    type: 'sofa',
    shape: 'l_shape',
    width: 7,
    length: 5,
    color: '#475569', // slate
    defaultContainers: ['Main Seating Section', 'Chaise Lounge Storage Ottoman', 'Cushion Dividers'],
    description: 'Corner sectional with chaise return (flippable left/right & resizable)',
  },
  {
    name: 'Modular Sectional Run (3-Seater)',
    category: 'living',
    subType: 'Seating & Lounging',
    type: 'sofa',
    shape: 'rectangle',
    width: 5,
    length: 3,
    color: '#475569',
    defaultContainers: ['Main Sofa Cushions', 'Under-Seat Storage'],
    description: 'Armless / modular main couch block - snap with chaise to form any L or U shape',
  },
  {
    name: 'Modular Chaise Lounge / Ottoman',
    category: 'living',
    subType: 'Seating & Lounging',
    type: 'sofa',
    shape: 'rectangle',
    width: 3,
    length: 4,
    color: '#475569',
    defaultContainers: ['Chaise Storage Trunk'],
    description: 'Modular chaise return / ottoman - snaps to either side of modular run',
  },
  {
    name: 'Round Coffee Table',
    category: 'living',
    subType: 'Tables & Surfaces',
    type: 'table',
    shape: 'round',
    width: 3,
    length: 3,
    color: '#b45309', // amber wood
    defaultContainers: ['Tabletop Display', 'Lower Circular Tier', 'Center Storage Bowl'],
    description: 'Circular wooden coffee table with lower tier shelf',
  },
  {
    name: 'Coffee Table (Rectangular)',
    category: 'living',
    subType: 'Tables & Surfaces',
    type: 'table',
    shape: 'rectangle',
    width: 4,
    length: 2,
    color: '#b45309', // amber wood
    defaultContainers: ['Tabletop Display', 'Lower Shelf / Magazine Rack', 'Side Drawer'],
    description: 'Low-profile wooden coffee table with magazine shelf',
  },
  {
    name: 'Living Room Area Rug / Zone',
    category: 'living',
    subType: 'Floor Zones & Mats',
    type: 'other',
    shape: 'zone',
    width: 8,
    length: 6,
    color: '#64748b', // neutral slate
    defaultContainers: ['Rug Surface (Floor Staging)'],
    description: 'Open floor staging zone for lounge seating & floor items',
  },
  {
    name: 'Accent Armchair',
    category: 'living',
    subType: 'Seating & Lounging',
    type: 'sofa',
    width: 3,
    length: 3,
    color: '#0f766e', // deep teal
    defaultContainers: ['Seat Storage Compartment'],
    description: 'Single lounge armchair with storage footstool slot',
  },
  {
    name: 'Coffee Table',
    category: 'living',
    subType: 'Tables & Surfaces',
    type: 'table',
    width: 4,
    length: 2,
    color: '#b45309', // amber wood
    defaultContainers: ['Tabletop Display', 'Lower Shelf / Magazine Rack', 'Side Drawer'],
    description: 'Low-profile wooden coffee table with magazine shelf',
  },
  {
    name: 'Media Console & TV Stand',
    category: 'living',
    subType: 'Media & Storage',
    type: 'cabinet',
    width: 7,
    length: 2,
    color: '#0284c7', // sky
    defaultContainers: ['Left Media Drawer', 'Center Console Shelf (AV/Consoles)', 'Right Media Drawer'],
    description: 'Wide TV sideboard with cable routing and deep drawers',
  },

  // --- KITCHEN & DINING ---
  {
    name: 'Kitchen Counter & Sink',
    category: 'kitchen',
    subType: 'Countertops & Prep',
    type: 'kitchen_counter',
    width: 8,
    length: 2,
    color: '#334155', // granite
    defaultContainers: ['Counter Prep Surface', 'Under-Sink Cabinet (Cleaning Supplies)', 'Drawer 1 (Cutlery)', 'Drawer 2 (Cookware)'],
    description: 'Full kitchen countertop with dual sink and induction cooktop',
  },
  {
    name: 'Kitchen Island Bar',
    category: 'kitchen',
    subType: 'Countertops & Prep',
    type: 'kitchen_island',
    width: 6,
    length: 3,
    color: '#475569', // quartz slate
    defaultContainers: ['Island Marble Surface', 'Prep Drawer (Knives & Boards)', 'Wine & Bottle Rack', 'Deep Pots & Pans Drawer'],
    description: 'Central cooking island with prep station and barstool seating',
  },
  {
    name: 'Round Dining Table (4-Person)',
    category: 'kitchen',
    subType: 'Dining & Seating',
    type: 'table',
    shape: 'round',
    width: 4,
    length: 4,
    color: '#92400e', // warm teak
    defaultContainers: ['Circular Dining Surface', 'Center Lazy Susan / Bowl'],
    description: 'Round solid wood dining table with radial seating layout',
  },
  {
    name: 'Dining Table (6-Person Rectangular)',
    category: 'kitchen',
    subType: 'Dining & Seating',
    type: 'table',
    shape: 'rectangle',
    width: 6,
    length: 3,
    color: '#92400e', // warm teak
    defaultContainers: ['Main Dining Surface', 'Table Runner Storage', 'Placemat Drawer'],
    description: 'Solid wood rectangular dining table with seating layout',
  },
  {
    name: 'Bistro / Breakfast Table',
    category: 'kitchen',
    subType: 'Dining & Seating',
    type: 'table',
    shape: 'round',
    width: 3,
    length: 3,
    color: '#d97706', // warm oak
    defaultContainers: ['Breakfast Surface'],
    description: 'Round breakfast nook dining table with circular pedestal',
  },
  {
    name: 'Refrigerator & Freezer',
    category: 'kitchen',
    subType: 'Appliances',
    type: 'appliance',
    width: 3,
    length: 3,
    color: '#64748b', // stainless steel
    defaultContainers: ['Fridge Top Shelves', 'Crisper Produce Drawers', 'Door Condiment Bins', 'Freezer Bins'],
    description: 'Brushed stainless double-door refrigerator',
  },

  // --- BEDROOM & CLOSET ---
  {
    name: 'Queen Bed (with Underbed Storage)',
    category: 'bedroom',
    subType: 'Beds & Sleeping',
    type: 'bed',
    width: 6,
    length: 7,
    color: '#6366f1', // indigo linen
    defaultContainers: ['Underbed Left Drawer', 'Underbed Right Drawer', 'Headboard Shelf', 'Bedside Linens'],
    description: 'Queen size mattress platform with dual roll-out storage drawers',
  },
  {
    name: 'Single / Twin Bed',
    category: 'bedroom',
    subType: 'Beds & Sleeping',
    type: 'bed',
    width: 4,
    length: 6,
    color: '#818cf8', // light indigo
    defaultContainers: ['Underbed Storage Bin', 'Mattress Top Surface'],
    description: 'Single bed frame with underbed toy / storage bin space',
  },
  {
    name: 'PAX Wardrobe / Closet',
    category: 'bedroom',
    subType: 'Wardrobes & Dressers',
    type: 'closet',
    width: 6,
    length: 2,
    color: '#8b5cf6', // purple
    defaultContainers: ['Top Shelf (Luggage)', 'Hanging Rail (Coats & Shirts)', 'Middle Shelf (Folded Clothes)', 'Bottom Shoe Tray'],
    description: 'Full-height dual door wardrobe system with organizer bins',
  },
  {
    name: 'Dresser (3-Drawer Chest)',
    category: 'bedroom',
    subType: 'Wardrobes & Dressers',
    type: 'dresser',
    width: 4,
    length: 2,
    color: '#ec4899', // pink
    defaultContainers: ['Top Drawer (Socks & Underwear)', 'Middle Drawer (Shirts)', 'Bottom Drawer (Jeans & Sweaters)'],
    description: 'Modern 3-drawer chest for organized clothing storage',
  },
  {
    name: 'Bedside Nightstand',
    category: 'bedroom',
    subType: 'Nightstands & Accents',
    type: 'cabinet',
    width: 2,
    length: 2,
    color: '#a855f7', // violet
    defaultContainers: ['Nightstand Surface', 'Top Drawer', 'Lower Open Cubby'],
    description: 'Compact bedside stand with lamp surface and drawer',
  },

  // --- OFFICE & WORK ---
  {
    name: 'Desk / Workstation',
    category: 'office',
    subType: 'Desks & Workstations',
    type: 'desk',
    width: 6,
    length: 3,
    color: '#10b981', // emerald
    defaultContainers: ['Desk Work Surface', 'Drawer 1 (Stationery)', 'Drawer 2 (Electronics & Cables)', 'Under-desk PC Stand'],
    description: 'Spacious computer desk with keyboard tray and drawer pedestal',
  },
  {
    name: 'Corner L-Desk',
    category: 'office',
    subType: 'Desks & Workstations',
    type: 'desk',
    width: 6,
    length: 5,
    color: '#059669', // dark emerald
    defaultContainers: ['Primary Monitor Desk', 'Secondary Laptop Return', 'File Drawer', 'Cable Management Tray'],
    description: 'Dual-monitor corner workstation with document drawers',
  },
  {
    name: 'Office Filing Cabinet',
    category: 'office',
    subType: 'Office Storage',
    type: 'cabinet',
    width: 3,
    length: 2,
    color: '#0d9488', // teal
    defaultContainers: ['Upper Stationery Drawer', 'Lockable Documents Drawer', 'Hanging File Folder Drawer'],
    description: 'Lockable steel document and tax record filing cabinet',
  },

  // --- STORAGE & GARAGE ---
  {
    name: 'KALLAX Shelving Unit (4x4)',
    category: 'storage',
    subType: 'Shelving & Bookcases',
    type: 'bookshelf',
    width: 5,
    length: 2,
    color: '#6366f1', // indigo
    defaultContainers: ['Top Cubes', 'Middle Cubes', 'Bottom Storage Fabric Bins', 'Side Book Compartment'],
    description: 'Multi-cube modular shelving unit for vinyls, books, and baskets',
  },
  {
    name: 'Industrial Metal Rack (5-Tier)',
    category: 'storage',
    subType: 'Heavy Storage & Racks',
    type: 'storage_rack',
    width: 6,
    length: 2,
    color: '#d97706', // amber
    defaultContainers: ['Tier 1 (Heavy Items / Toolboxes)', 'Tier 2 (Hardware Bins)', 'Tier 3 (Equipment)', 'Tier 4', 'Top Tier'],
    description: 'Heavy duty steel wire rack for garage, pantry, or storage room',
  },
  {
    name: 'Workbench & Tool Station',
    category: 'storage',
    subType: 'Heavy Storage & Racks',
    type: 'workbench',
    width: 8,
    length: 3,
    color: '#ef4444', // red
    defaultContainers: ['Main Work Surface', 'Drawer 1 (Hand Tools)', 'Drawer 2 (Hardware)', 'Under-bench Shelf'],
    description: 'Heavy duty workshop bench with pegboard and tool drawers',
  },
  {
    name: 'Storage Box Stack',
    category: 'storage',
    subType: 'Boxes & Bins',
    type: 'box_stack',
    width: 3,
    length: 3,
    color: '#f97316', // orange
    defaultContainers: ['Top Box (Seasonal Decor)', 'Middle Box (Clothing)', 'Bottom Heavy Box (Books)'],
    description: 'Stackable plastic or kraft storage moving boxes',
  },
];

const LEGACY_UNIT_M = 0.3;
const TEMPLATES: FurnitureTemplate[] = LEGACY_UNIT_TEMPLATES.map((t) => ({
  ...t,
  width: Math.round(t.width * LEGACY_UNIT_M * 10) / 10,
  length: Math.round(t.length * LEGACY_UNIT_M * 10) / 10,
}));

interface CategoryMeta {
  id: FurnitureCategory;
  label: string;
  tagline: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bgLight: string;
}

const CATEGORIES: CategoryMeta[] = [
  { 
    id: 'living', 
    label: 'Living Room', 
    tagline: 'Sofas, Couches, Coffee Tables & TV Consoles',
    icon: Armchair,
    color: '#0284c7',
    bgLight: 'bg-sky-50 text-sky-600 border-sky-100 hover:border-sky-300',
  },
  { 
    id: 'kitchen', 
    label: 'Kitchen & Dining', 
    tagline: 'Countertops, Sinks, Islands, Tables & Appliances',
    icon: UtensilsCrossed,
    color: '#b45309',
    bgLight: 'bg-amber-50 text-amber-700 border-amber-100 hover:border-amber-300',
  },
  { 
    id: 'bedroom', 
    label: 'Bedroom & Closet', 
    tagline: 'Beds, Wardrobes, Dressers & Bedside Nightstands',
    icon: Bed,
    color: '#8b5cf6',
    bgLight: 'bg-purple-50 text-purple-600 border-purple-100 hover:border-purple-300',
  },
  { 
    id: 'office', 
    label: 'Office & Work', 
    tagline: 'Desks, Workstations & Filing Cabinets',
    icon: Briefcase,
    color: '#10b981',
    bgLight: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:border-emerald-300',
  },
  { 
    id: 'storage', 
    label: 'Storage & Garage', 
    tagline: 'Shelving Units, Metal Racks, Workbenches & Boxes',
    icon: Archive,
    color: '#f97316',
    bgLight: 'bg-orange-50 text-orange-600 border-orange-100 hover:border-orange-300',
  },
];

export const FurnitureLibrary: React.FC = () => {
  const {
    selectedRoomId,
    isFurnitureLibraryOpen,
    setFurnitureLibraryOpen,
    setSelectedFurnitureId,
    setAppMode,
  } = useAppStore();

  // Tiered navigation: null means Level 1 (Categories overview). Selecting a category enters Level 2 (Items in that category).
  const [selectedCategory, setSelectedCategory] = useState<FurnitureCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [rapidPlaceMode, setRapidPlaceMode] = useState(false);
  const [lastPlacedName, setLastPlacedName] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  // One add at a time: while the database is busy, extra taps would each queue another copy
  const addInFlight = useRef(false);

  // Custom furniture state
  const [customName, setCustomName] = useState('');
  const [customShape, setCustomShape] = useState<FurnitureShape>('rectangle');
  const [customWidth, setCustomWidth] = useState(1.2);
  const [customLength, setCustomLength] = useState(0.6);
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [customType, setCustomType] = useState<FurnitureType>('cabinet');

  // Filter templates: If searching, search everywhere; otherwise filter to selectedCategory
  const filteredTemplates = useMemo(() => {
    return TEMPLATES.filter((tmpl) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        tmpl.name.toLowerCase().includes(q) || 
        tmpl.description.toLowerCase().includes(q) ||
        tmpl.type.toLowerCase().includes(q) ||
        (tmpl.subType && tmpl.subType.toLowerCase().includes(q));

      if (q) return matchesSearch;
      if (selectedCategory) return tmpl.category === selectedCategory;
      return false;
    });
  }, [selectedCategory, searchQuery]);

  if (!isFurnitureLibraryOpen) return null;

  // Calculate intelligent, non-overlapping spawn position inside current room
  const findNextSpawnPosition = async (roomW: number, roomH: number, furnW: number, furnL: number) => {
    if (!selectedRoomId) return { x: 2, y: 2, rotation: 0 };
    const existing = await db.furniture.where('roomId').equals(selectedRoomId).toArray();

    // Check if a slot (x, y, w, l) collides with any existing furniture
    const hasCollision = (x: number, y: number, w: number, l: number) => {
      return existing.some((item) => {
        const itemW = item.position.rotation % 180 === 90 ? item.dimension.length : item.dimension.width;
        const itemH = item.position.rotation % 180 === 90 ? item.dimension.width : item.dimension.length;
        return (
          x < item.position.x + itemW &&
          x + w > item.position.x &&
          y < item.position.y + itemH &&
          y + l > item.position.y
        );
      });
    };

    // Scan the room (in meters) for the first free spot that keeps the piece inside the walls
    const maxX = Math.max(0, roomW - furnW);
    const maxY = Math.max(0, roomH - furnL);
    const step = 0.5;
    for (let y = 0; y <= maxY + 1e-6; y += step) {
      for (let x = 0; x <= maxX + 1e-6; x += step) {
        if (!hasCollision(x, y, furnW, furnL)) {
          return { x, y, rotation: 0 };
        }
      }
    }

    // Room is full: place it in the middle so it is at least visible and can be moved
    return { x: Math.round((maxX / 2) * 10) / 10, y: Math.round((maxY / 2) * 10) / 10, rotation: 0 };
  };

  const handleAddTemplate = async (tmpl: FurnitureTemplate) => {
    if (addInFlight.current) return;
    addInFlight.current = true;
    setAddError(null);
    // Track progress so a stalled add can be reported with the step it got stuck on
    const progress = { step: 'start', done: false };
    const diag = () => ({ step: progress.step, template: tmpl.name, selectedRoomId, appMode: useAppStore.getState().appMode });
    const watchdog = setTimeout(async () => {
      if (progress.done) return;
      // Probe which database reads still work, to tell a locked table from a broken index
      const probe = async (name: string, fn: () => Promise<unknown>) => {
        const t0 = performance.now();
        try {
          const r = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
          return `${name}=ok(${Array.isArray(r) ? r.length : String(r)},${Math.round(performance.now() - t0)}ms)`;
        } catch (e) {
          return `${name}=${(e as Error).message}`;
        }
      };
      const probes = await Promise.all([
        probe('rooms.count', () => db.rooms.count()),
        probe('furniture.count', () => db.furniture.count()),
        probe('furniture.toArray', () => db.furniture.toArray()),
        probe('furniture.byRoom', () => db.furniture.where('roomId').equals(selectedRoomId || '').toArray()),
        probe('containers.count', () => db.containers.count()),
      ]);
      reportClientError('add-furniture-stalled', new Error(`Stalled at step "${progress.step}"`), {
        ...diag(),
        probes: probes.join(' '),
        dbOpen: db.isOpen(),
        dbVersion: db.verno,
      });
      setAddError(`Adding ${tmpl.name} is waiting on the local database. This usually means another Placemend tab is holding it: close other Placemend tabs and try again.`);
    }, 5000);
    try {
      await addTemplate(tmpl, progress);
    } catch (err) {
      // Surface failures instead of failing silently (an unhandled rejection shows nothing on mobile)
      console.error('Adding furniture failed:', err);
      reportClientError('add-furniture-failed', err, diag());
      setAddError(`Could not add ${tmpl.name}: ${(err as Error)?.message || String(err)}`);
    } finally {
      progress.done = true;
      addInFlight.current = false;
      clearTimeout(watchdog);
    }
  };

  const addTemplate = async (tmpl: FurnitureTemplate, progress: { step: string }) => {
    if (!selectedRoomId) {
      progress.step = 'no-room-selected';
      setAddError('Pick a room first, then add furniture.');
      return;
    }

    progress.step = 'load-room';
    const currentRoom = await db.rooms.get(selectedRoomId);
    const roomW = currentRoom?.gridWidth || 20;
    const roomH = currentRoom?.gridHeight || 16;
    progress.step = 'find-spawn-position';
    const spawnPos = await findNextSpawnPosition(roomW, roomH, tmpl.width, tmpl.length);

    const newFurnitureId = `furn-${Date.now()}`;
    const newFurniture: Furniture = {
      id: newFurnitureId,
      roomId: selectedRoomId,
      name: tmpl.name,
      type: tmpl.type,
      shape: tmpl.shape || 'rectangle',
      position: spawnPos,
      dimension: { width: tmpl.width, length: tmpl.length },
      color: tmpl.color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const containers = tmpl.defaultContainers.map((name, idx) => ({
      id: `cont-${Date.now()}-${idx}`,
      furnitureId: newFurnitureId,
      name,
      type: inferContainerType(name),
      orderIndex: idx,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    progress.step = 'save-to-database';
    await db.transaction('rw', [db.furniture, db.containers], async () => {
      await db.furniture.add(newFurniture);
      await db.containers.bulkAdd(containers);
    });
    scheduleAutoSync();

    progress.step = 'update-view';
    setSelectedFurnitureId(newFurnitureId);
    setAppMode('edit');

    setLastPlacedName(tmpl.name);
    setTimeout(() => {
      setLastPlacedName(null);
    }, 2000);

    // If rapid placement is disabled, close modal immediately
    if (!rapidPlaceMode) {
      setFurnitureLibraryOpen(false);
    }
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId || !customName.trim()) return;

    const currentRoom = await db.rooms.get(selectedRoomId);
    const roomW = currentRoom?.gridWidth || 20;
    const roomH = currentRoom?.gridHeight || 16;
    const furnW = Math.max(0.2, customWidth);
    const furnL = Math.max(0.2, customLength);
    const spawnPos = await findNextSpawnPosition(roomW, roomH, furnW, furnL);

    const newFurnitureId = `furn-${Date.now()}`;
    const newFurniture: Furniture = {
      id: newFurnitureId,
      roomId: selectedRoomId,
      name: customName.trim(),
      type: customType,
      shape: customShape,
      position: spawnPos,
      dimension: {
        width: furnW,
        length: furnL,
      },
      color: customColor,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const defaultContainer = {
      id: `cont-${Date.now()}-0`,
      furnitureId: newFurnitureId,
      name: 'Main Storage Slot',
      type: 'shelf' as const,
      orderIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.transaction('rw', [db.furniture, db.containers], async () => {
      await db.furniture.add(newFurniture);
      await db.containers.add(defaultContainer);
    });
    scheduleAutoSync();

    setSelectedFurnitureId(newFurnitureId);
    setAppMode('edit');
    setFurnitureLibraryOpen(false);
  };

  const activeCategoryMeta = CATEGORIES.find(c => c.id === selectedCategory);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none animate-in fade-in duration-150">
      <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Search and Rapid Place Toggle */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-xs">
                <Sparkles className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Furniture & Fixture Catalog</span>
                  {lastPlacedName && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
                      <Check className="w-3 h-3 stroke-[3]" /> Added {lastPlacedName}!
                    </span>
                  )}
                </h3>
                {/* Tiered Breadcrumb */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                  <button
                    onClick={() => {
                      setSelectedCategory(null);
                      setSearchQuery('');
                    }}
                    className={`font-semibold hover:text-blue-600 cursor-pointer ${!selectedCategory && !searchQuery ? 'text-blue-600 font-bold' : ''}`}
                  >
                    Categories
                  </button>
                  {selectedCategory && (
                    <>
                      <span>›</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        {activeCategoryMeta?.label}
                      </span>
                    </>
                  )}
                  {searchQuery && (
                    <>
                      <span>›</span>
                      <span className="font-bold text-slate-800">
                        Search: "{searchQuery}"
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Rapid Place Toggle ("Click-Click Put Through") */}
              <button
                type="button"
                onClick={() => setRapidPlaceMode(!rapidPlaceMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  rapidPlaceMode
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs shadow-amber-500/20'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/70'
                }`}
                title="When ON, clicking furniture templates adds them directly without closing this catalog modal"
              >
                <Zap className={`w-3.5 h-3.5 ${rapidPlaceMode ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">Rapid Place</span>
                <span className="text-[10px] opacity-80">{rapidPlaceMode ? 'ON' : 'OFF'}</span>
              </button>

              <button
                onClick={() => setFurnitureLibraryOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search across all categories (tables, couch, counter, bed, desk)..."
              className="w-full bg-slate-50 text-slate-800 text-xs pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 custom-scrollbar flex-1 bg-white">
          {/* TIER 1: Category Selection Grid (Shown when no category is picked and not searching) */}
          {!selectedCategory && !searchQuery && (
            <div>
              <div className="mb-3">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Select a Furniture Category
                </h4>
                <p className="text-xs text-slate-500">
                  Pick a room area to browse tailored furniture, surfaces, and storage pieces:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const count = TEMPLATES.filter(t => t.category === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className="p-4 rounded-2xl bg-slate-50 hover:bg-white border border-slate-200/90 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all flex items-start gap-3.5 group active:scale-[0.98]"
                    >
                      <div
                        style={{ backgroundColor: cat.color }}
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform"
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <h5 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {cat.label}
                          </h5>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 font-bold whitespace-nowrap">
                            {count} items →
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {cat.tagline}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TIER 2: Items Inside Selected Category or Search Results */}
          {(selectedCategory || searchQuery) && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {selectedCategory && !searchQuery && (
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-100 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      ← Back to Categories
                    </button>
                  )}
                  <h4 className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                    {searchQuery 
                      ? `Search Results (${filteredTemplates.length})` 
                      : `${activeCategoryMeta?.label} (${filteredTemplates.length})`}
                  </h4>
                </div>

                {rapidPlaceMode && (
                  <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-current" /> Rapid Place Active (Click-Click Put Through)
                  </span>
                )}
              </div>

              {addError && (

                <div role="alert" className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold break-words">

                  {addError}

                </div>

              )}


              {filteredTemplates.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-xs font-bold text-slate-600 mb-1">No items found matching "{searchQuery}"</p>
                  <p className="text-[11px] text-slate-400 mb-3">Try searching for other items or browse categories.</p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory(null);
                    }}
                    className="px-3 py-1.5 bg-blue-50 text-blue-600 font-bold text-xs rounded-xl hover:bg-blue-100 transition-colors cursor-pointer"
                  >
                    View All Categories
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredTemplates.map((tmpl) => (
                    <div
                      key={tmpl.name}
                      onClick={() => handleAddTemplate(tmpl)}
                      className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-400 cursor-pointer transition-all flex items-start gap-3 shadow-xs group active:scale-[0.98]"
                    >
                      <div
                        style={{ backgroundColor: tmpl.color }}
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h5 className="text-xs sm:text-sm font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                            {tmpl.name}
                          </h5>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 font-bold whitespace-nowrap">
                            {tmpl.width}m × {tmpl.length}m
                          </span>
                        </div>
                        {tmpl.subType && (
                          <span className="inline-block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                            {tmpl.subType}
                          </span>
                        )}
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {tmpl.description}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          📦 {tmpl.defaultContainers.length} storage slots
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Custom Furniture Creator */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              Custom Size & Shape Furniture
            </h4>
            <form onSubmit={handleAddCustom} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Custom Credenza, Sectional, Zone"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full bg-white text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Shape
                  </label>
                  <select
                    value={customShape}
                    onChange={(e) => setCustomShape(e.target.value as FurnitureShape)}
                    className="w-full bg-white text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs font-medium"
                  >
                    <option value="rectangle">Rectangle (Standard)</option>
                    <option value="round">Round / Circle (Radial)</option>
                    <option value="l_shape">L-Shape (Corner Sectional/Counter)</option>
                    <option value="zone">Floor Zone / Staging Mat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Type / Style
                  </label>
                  <select
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value as FurnitureType)}
                    className="w-full bg-white text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs font-medium"
                  >
                    <option value="cabinet">Cabinet / Credenza</option>
                    <option value="table">Table / Dining / Coffee</option>
                    <option value="sofa">Sofa / Couch / Sectional</option>
                    <option value="kitchen_counter">Kitchen Counter & Sink</option>
                    <option value="kitchen_island">Kitchen Island</option>
                    <option value="appliance">Appliance / Fridge</option>
                    <option value="desk">Desk / Workstation</option>
                    <option value="closet">Closet / Wardrobe</option>
                    <option value="bookshelf">Bookshelf / Unit</option>
                    <option value="bed">Bed</option>
                    <option value="dresser">Dresser</option>
                    <option value="storage_rack">Storage Rack</option>
                    <option value="workbench">Workbench</option>
                    <option value="box_stack">Box Stack</option>
                    <option value="other">Floor Staging / Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Width {customShape === 'round' ? '(Diameter)' : '(meters)'}
                  </label>
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    max={20}
                    value={customWidth}
                    onChange={(e) => setCustomWidth(parseFloat(e.target.value) || 0.2)}
                    className="w-full bg-white text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 font-mono shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Length {customShape === 'round' ? '(Diameter)' : '(meters)'}
                  </label>
                  <input
                    type="number"
                    min={0.2}
                    step={0.1}
                    max={20}
                    value={customLength}
                    onChange={(e) => setCustomLength(parseFloat(e.target.value) || 0.2)}
                    className="w-full bg-white text-slate-800 text-xs px-3 py-2 rounded-xl border border-slate-200 font-mono shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Color
                  </label>
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => setCustomColor(e.target.value)}
                    className="w-full h-8 rounded-xl bg-white border border-slate-200 cursor-pointer p-0.5 shadow-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Place Custom Furniture</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

