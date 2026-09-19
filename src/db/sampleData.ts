import { db } from './database';
import { Location, Room, Furniture, Container, Item } from '../types';

export const SEED_LOCATION: Location = {
  id: 'loc-home',
  name: 'Main Apartment',
  description: 'Primary living and storage space',
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export const SEED_ROOMS: Room[] = [
  {
    id: 'room-living',
    locationId: 'loc-home',
    name: 'Living & Media Room',
    color: '#3b82f6', // blue
    gridWidth: 26,
    gridHeight: 18,
    unitSize: 32,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'room-workshop',
    locationId: 'loc-home',
    name: 'Storage & Workshop',
    color: '#f59e0b', // amber
    gridWidth: 22,
    gridHeight: 16,
    unitSize: 32,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export const SEED_FURNITURE: Furniture[] = [
  // Living room furniture
  {
    id: 'furn-media-console',
    roomId: 'room-living',
    name: 'Media Console Cabinet',
    type: 'cabinet',
    position: { x: 3, y: 2, rotation: 0 },
    dimension: { width: 7, length: 2, height: 60 },
    color: '#0f766e', // Deep Teal Cabinet
    icon: 'Tv',
    notes: 'Under the TV with 3 slide-out storage drawers',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'furn-bookshelf-tall',
    roomId: 'room-living',
    name: 'KALLAX 4x4 Bookshelf',
    type: 'bookshelf',
    position: { x: 19, y: 2, rotation: 0 },
    dimension: { width: 5, length: 2, height: 180 },
    color: '#475569', // Slate Charcoal
    icon: 'Library',
    notes: 'Grid shelf with storage inserts and display items',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'furn-workdesk',
    roomId: 'room-living',
    name: 'Standing Desk Setup',
    type: 'desk',
    position: { x: 3, y: 11, rotation: 0 },
    dimension: { width: 6, length: 3, height: 75 },
    color: '#c29b78', // Warm Natural Oak
    icon: 'Monitor',
    notes: 'Dual monitor desk with cable organizer tray',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  // Workshop furniture
  {
    id: 'furn-metal-rack',
    roomId: 'room-workshop',
    name: 'Heavy Duty Metal Rack A',
    type: 'storage_rack',
    position: { x: 2, y: 2, rotation: 0 },
    dimension: { width: 6, length: 2, height: 200 },
    color: '#475569', // Industrial Steel
    icon: 'Boxes',
    notes: '5 tiered industrial shelving for bins and hardware',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'furn-workbench',
    roomId: 'room-workshop',
    name: 'Work Bench & Tool Wall',
    type: 'workbench',
    position: { x: 11, y: 2, rotation: 0 },
    dimension: { width: 8, length: 3, height: 90 },
    color: '#9a3412', // Sturdy Maple Butcherblock
    icon: 'Wrench',
    notes: 'Heavy wooden top with tool drawers underneath',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export const SEED_CONTAINERS: Container[] = [
  // Media Console
  {
    id: 'cont-console-d1',
    furnitureId: 'furn-media-console',
    name: 'Left Drawer (Cables & Adapters)',
    type: 'drawer',
    orderIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-console-d2',
    furnitureId: 'furn-media-console',
    name: 'Middle Drawer (Gaming & Remotes)',
    type: 'drawer',
    orderIndex: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-console-d3',
    furnitureId: 'furn-media-console',
    name: 'Right Drawer (Documents & Manuals)',
    type: 'drawer',
    orderIndex: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // Kallax
  {
    id: 'cont-kallax-bin1',
    furnitureId: 'furn-bookshelf-tall',
    name: 'Bottom Left DRÖNA Box (Board Games)',
    type: 'box',
    orderIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-kallax-bin1-sub1',
    furnitureId: 'furn-bookshelf-tall',
    parentContainerId: 'cont-kallax-bin1',
    name: 'Card Games & Dice Tray',
    type: 'compartment',
    orderIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-kallax-bin1-sub2',
    furnitureId: 'furn-bookshelf-tall',
    parentContainerId: 'cont-kallax-bin1',
    name: 'Big Box Strategy Games',
    type: 'compartment',
    orderIndex: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-kallax-bin2',
    furnitureId: 'furn-bookshelf-tall',
    name: 'Bottom Right DRÖNA Box (Spare Tech)',
    type: 'box',
    orderIndex: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-kallax-s2',
    furnitureId: 'furn-bookshelf-tall',
    name: 'Middle Open Shelf (Books & Kindle)',
    type: 'shelf',
    orderIndex: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // Desk
  {
    id: 'cont-desk-top',
    furnitureId: 'furn-workdesk',
    name: 'Desk Surface (Stationery tray)',
    type: 'top_surface',
    orderIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // Metal Rack
  {
    id: 'cont-rack-tier1',
    furnitureId: 'furn-metal-rack',
    name: 'Shelf Tier 1 (Power Tools Case)',
    type: 'shelf',
    orderIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-rack-bin-blue',
    furnitureId: 'furn-metal-rack',
    name: 'Tier 2 - Blue Bin (Electrical Supplies)',
    type: 'bin',
    orderIndex: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-rack-bin-red',
    furnitureId: 'furn-metal-rack',
    name: 'Tier 3 - Red Bin (Camping & Outdoor)',
    type: 'bin',
    orderIndex: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // Workbench
  {
    id: 'cont-bench-drawer1',
    furnitureId: 'furn-workbench',
    name: 'Top Drawer (Measuring & Marking)',
    type: 'drawer',
    orderIndex: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cont-bench-drawer2',
    furnitureId: 'furn-workbench',
    name: 'Second Drawer (Hand Tools & Pliers)',
    type: 'drawer',
    orderIndex: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export const SEED_ITEMS: Item[] = [
  // Media Console items
  {
    id: 'item-hdmi',
    containerId: 'cont-console-d1',
    name: 'Ultra High Speed HDMI 2.1 Cable (3m)',
    description: 'Braided 4K/120Hz cable for PlayStation / TV',
    quantity: 2,
    category: 'Electronics',
    tags: ['cables', 'video', 'hdmi', '4k'],
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'item-usbc',
    containerId: 'cont-console-d1',
    name: 'USB-C to USB-C 100W Fast Charging Cable',
    description: 'White 2-meter silicone cable',
    quantity: 3,
    category: 'Electronics',
    tags: ['cables', 'usb-c', 'charger'],
    favorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'item-passports',
    containerId: 'cont-console-d3',
    name: 'Dutch Passports & International Driving Permit',
    description: 'Stored in black RFID travel wallet',
    quantity: 2,
    category: 'Documents',
    tags: ['urgent', 'travel', 'id', 'passport'],
    favorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'item-switch-controller',
    containerId: 'cont-console-d2',
    name: 'Nintendo Switch Pro Wireless Controller',
    description: 'Black pro controller with USB-C port',
    quantity: 1,
    category: 'Gaming',
    tags: ['switch', 'gaming', 'controller'],
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // Bookshelf items
  {
    id: 'item-catan',
    containerId: 'cont-kallax-bin1-sub2',
    name: 'Settlers of Catan (Base Game + 5-6 Player Expansion)',
    description: 'Complete set with all wooden pieces and cards',
    quantity: 1,
    category: 'Games',
    tags: ['boardgame', 'friends', 'catan'],
    favorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'item-card-games',
    containerId: 'cont-kallax-bin1-sub1',
    name: 'Exploding Kittens & Premium Poker Playing Cards',
    description: 'Stored in compact deck boxes',
    quantity: 2,
    category: 'Games',
    tags: ['boardgame', 'party', 'cards'],
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'item-kindle',
    containerId: 'cont-kallax-s2',
    name: 'Kindle Paperwhite 11th Gen',
    description: 'Sage green fabric cover',
    quantity: 1,
    category: 'Electronics',
    tags: ['reading', 'kindle', 'ebook'],
    favorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  // Workshop / Rack items
  {
    id: 'item-drill',
    containerId: 'cont-rack-tier1',
    name: 'Makita 18V Cordless Drill / Driver Set',
    description: 'Includes 2x 4.0Ah batteries and rapid charger',
    quantity: 1,
    category: 'Tools',
    tags: ['powertools', 'drill', 'makita', 'diy'],
    favorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'item-multimeter',
    containerId: 'cont-rack-bin-blue',
    name: 'Digital Multimeter & Test Leads',
    description: 'Fluke compact multimeter with thermocouple probe',
    quantity: 1,
    category: 'Electronics',
    tags: ['electrical', 'multimeter', 'measuring', 'tester'],
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'item-headlamp',
    containerId: 'cont-rack-bin-red',
    name: 'Black Diamond Storm 450 Rechargeable Headlamp',
    description: 'Waterproof 450 lumens head torch with USB charging cable',
    quantity: 1,
    category: 'Outdoor',
    tags: ['camping', 'light', 'torch', 'headlamp', 'emergency'],
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'item-calipers',
    containerId: 'cont-bench-drawer1',
    name: 'Mitutoyo Digital Caliper 150mm',
    description: 'Stainless steel precision digital vernier caliper',
    quantity: 1,
    category: 'Tools',
    tags: ['precision', 'measuring', 'caliper', '3dprint'],
    favorite: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export async function seedDemoDataIfEmpty() {
  const count = await db.rooms.count();
  if (count === 0) {
    await db.transaction('rw', [db.locations, db.rooms, db.furniture, db.containers, db.items], async () => {
      await db.locations.add(SEED_LOCATION);
      await db.rooms.bulkAdd(SEED_ROOMS);
      await db.furniture.bulkAdd(SEED_FURNITURE);
      await db.containers.bulkAdd(SEED_CONTAINERS);
      await db.items.bulkAdd(SEED_ITEMS);
    });
    console.log('Placemend demo database initialized with sample apartment data!');
  } else {
    // Ensure nested demo compartments exist for previously initialized databases
    const hasSubCompartment = await db.containers.get('cont-kallax-bin1-sub1');
    if (!hasSubCompartment) {
      await db.containers.bulkPut(SEED_CONTAINERS);
      await db.items.bulkPut(SEED_ITEMS);
    }
    // Update seed furniture colors to architectural tones if using default colors
    for (const f of SEED_FURNITURE) {
      const existing = await db.furniture.get(f.id);
      if (existing && existing.color !== f.color) {
        await db.furniture.update(f.id, { color: f.color });
      }
    }
  }
}
