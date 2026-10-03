import { getAppMode } from '../services/appMode';
import { db } from "./database";
import { Location, Room, Furniture, Container, Item } from "../types";

export const SEED_LOCATION: Location = {
  "id": "loc-home",
  "name": "Main Apartment",
  "description": "Primary living and storage space",
  "createdAt": 1790114554859,
  "updatedAt": 1790114554859
};

export const SEED_ROOMS: Room[] = [
  {
    "id": "room-living",
    "locationId": "loc-home",
    "name": "Living & Media Room",
    "color": "#3b82f6",
    "gridWidth": 6,
    "gridHeight": 8,
    "unitSize": 32,
    "createdAt": 1790111494158,
    "updatedAt": 1790192239782,
    "shapeType": "custom_polygon",
    "polygonPoints": [
      {
        "x": 0,
        "y": 0
      },
      {
        "x": 6,
        "y": 0
      },
      {
        "x": 6,
        "y": 8
      },
      {
        "x": 4,
        "y": 8
      },
      {
        "x": 4,
        "y": 5
      },
      {
        "x": 3,
        "y": 5
      },
      {
        "x": 3,
        "y": 8
      },
      {
        "x": 0,
        "y": 8
      }
    ],
    "doors": [
      {
        "id": "door-1",
        "label": "Main Entrance",
        "wall": "bottom",
        "offset": 0,
        "swing": "inward_left",
        "width": 1,
        "targetRoomId": "room-1790186871801",
        "targetDoorId": "door-reciprocal-1790186871801"
      },
      {
        "id": "door-1790192186539",
        "label": "Door 2",
        "wall": "bottom",
        "segmentIndex": 6,
        "offset": 1,
        "swing": "inward_left",
        "width": 1,
        "targetRoomId": "room-1790192239782",
        "targetDoorId": "door-reciprocal-1790192239782"
      }
    ],
    "door": {
      "id": "door-1",
      "label": "Main Entrance",
      "wall": "bottom",
      "offset": 0,
      "swing": "inward_left",
      "width": 1,
      "targetRoomId": "room-1790186871801",
      "targetDoorId": "door-reciprocal-1790186871801"
    }
  },
  {
    "id": "room-1790186871801",
    "locationId": "loc-home",
    "name": "Hallway / Corridor",
    "color": "#0284c7",
    "shapeType": "custom_polygon",
    "gridWidth": 3,
    "gridHeight": 4,
    "unitSize": 32,
    "doors": [
      {
        "id": "door-reciprocal-1790186871801",
        "label": "To Living & Media Room",
        "wall": "top",
        "offset": 2,
        "swing": "inward_left",
        "width": 1,
        "targetRoomId": "room-living",
        "targetDoorId": "door-1"
      },
      {
        "id": "door-1790191834738",
        "label": "Door 2",
        "wall": "right",
        "segmentIndex": 1,
        "offset": 0,
        "swing": "inward_left",
        "width": 1,
        "targetRoomId": "room-1790192120193",
        "targetDoorId": "door-reciprocal-1790192120193"
      }
    ],
    "door": {
      "id": "door-reciprocal-1790186871801",
      "label": "To Living & Media Room",
      "wall": "top",
      "offset": 2,
      "swing": "inward_left",
      "width": 1,
      "targetRoomId": "room-living",
      "targetDoorId": "door-1"
    },
    "createdAt": 1790186871801,
    "updatedAt": 1790192120193,
    "polygonPoints": [
      {
        "x": 0,
        "y": 0
      },
      {
        "x": 3,
        "y": 0
      },
      {
        "x": 3,
        "y": 4
      },
      {
        "x": 0,
        "y": 4
      }
    ]
  },
  {
    "id": "room-1790192120193",
    "locationId": "loc-home",
    "name": "Home Office / Studio",
    "color": "#0284c7",
    "shapeType": "custom_polygon",
    "gridWidth": 4,
    "gridHeight": 3,
    "unitSize": 32,
    "doors": [
      {
        "id": "door-reciprocal-1790192120193",
        "label": "To Hallway / Corridor",
        "wall": "left",
        "offset": 2,
        "swing": "inward_left",
        "width": 1,
        "targetRoomId": "room-1790186871801",
        "targetDoorId": "door-1790191834738"
      }
    ],
    "door": {
      "id": "door-reciprocal-1790192120193",
      "label": "To Hallway / Corridor",
      "wall": "left",
      "offset": 2,
      "swing": "inward_left",
      "width": 1,
      "targetRoomId": "room-1790186871801",
      "targetDoorId": "door-1790191834738"
    },
    "createdAt": 1790192120193,
    "updatedAt": 1790192149535,
    "polygonPoints": [
      {
        "x": 0,
        "y": 0
      },
      {
        "x": 4,
        "y": 0
      },
      {
        "x": 4,
        "y": 3
      },
      {
        "x": 0,
        "y": 3
      }
    ]
  },
  {
    "id": "room-1790192239782",
    "locationId": "loc-home",
    "name": "Pantry",
    "color": "#ea580c",
    "shapeType": "custom_polygon",
    "gridWidth": 3,
    "gridHeight": 4,
    "unitSize": 32,
    "doors": [
      {
        "id": "door-reciprocal-1790192239782",
        "label": "To Living & Media Room",
        "wall": "top",
        "offset": 2,
        "swing": "inward_left",
        "width": 1,
        "targetRoomId": "room-living",
        "targetDoorId": "door-1790192186539"
      }
    ],
    "door": {
      "id": "door-reciprocal-1790192239782",
      "label": "To Living & Media Room",
      "wall": "top",
      "offset": 2,
      "swing": "inward_left",
      "width": 1,
      "targetRoomId": "room-living",
      "targetDoorId": "door-1790192186539"
    },
    "createdAt": 1790192239782,
    "updatedAt": 1790192271116,
    "polygonPoints": [
      {
        "x": 0,
        "y": 0
      },
      {
        "x": 3,
        "y": 0
      },
      {
        "x": 3,
        "y": 4
      },
      {
        "x": 0,
        "y": 4
      }
    ]
  }
];

export const SEED_FURNITURE: Furniture[] = [
  {
    "id": "furn-living-sectional-couch",
    "roomId": "room-living",
    "name": "Sectional L-Couch",
    "type": "sofa",
    "shape": "l_shape",
    "position": {
      "x": 0.8,
      "y": 2.8,
      "rotation": 0
    },
    "dimension": {
      "width": 3.2,
      "length": 2.4,
      "height": 85
    },
    "color": "#3b82f6",
    "mirrored": false,
    "icon": "Armchair",
    "notes": "Corner sectional couch with chaise lounge return (flippable & resizable)",
    "createdAt": 1790274000000,
    "updatedAt": 1790275000000
  },
  {
    "id": "furn-living-round-coffee-table",
    "roomId": "room-living",
    "name": "Round Coffee Table",
    "type": "table",
    "shape": "round",
    "position": {
      "x": 1.8,
      "y": 1.2,
      "rotation": 0
    },
    "dimension": {
      "width": 1.4,
      "length": 1.4,
      "height": 45
    },
    "color": "#b45309",
    "icon": "UtensilsCrossed",
    "notes": "Circular wooden coffee table with lower tier shelf",
    "createdAt": 1790274000000,
    "updatedAt": 1790275000000
  },
  {
    "id": "furn-bookshelf-tall",
    "roomId": "room-living",
    "name": "KALLAX 4x4 Bookshelf",
    "type": "bookshelf",
    "position": {
      "x": 4.2,
      "y": 0.5,
      "rotation": 0
    },
    "dimension": {
      "width": 1.8,
      "length": 1.5,
      "height": 180
    },
    "color": "#475569",
    "icon": "Library",
    "notes": "Grid shelf with storage inserts and display items",
    "facadeLayout": "grid",
    "columns": 2,
    "createdAt": 1790111494158,
    "updatedAt": 1790275000000
  },
  {
    "id": "furn-media-console",
    "roomId": "room-living",
    "name": "Media Console Cabinet",
    "type": "cabinet",
    "position": {
      "x": 0,
      "y": 0.5,
      "rotation": 90
    },
    "dimension": {
      "width": 2,
      "length": 1,
      "height": 60
    },
    "color": "#0f766e",
    "icon": "Tv",
    "notes": "Under the TV with 3 slide-out storage drawers",
    "facadeLayout": "horizontal_row",
    "columns": 3,
    "createdAt": 1790111494158,
    "updatedAt": 1790275000000
  },
  {
    "id": "furn-workdesk",
    "roomId": "room-living",
    "name": "Standing Desk Setup",
    "type": "desk",
    "position": {
      "x": 4.5,
      "y": 2.6,
      "rotation": 90
    },
    "dimension": {
      "width": 2.2,
      "length": 1,
      "height": 75
    },
    "color": "#c29b78",
    "icon": "Monitor",
    "notes": "Dual monitor desk with cable organizer tray",
    "columns": 2,
    "createdAt": 1790111494158,
    "updatedAt": 1790275000000
  }
];

export const SEED_CONTAINERS: Container[] = [
  {
    "id": "cont-couch-main",
    "furnitureId": "furn-living-sectional-couch",
    "name": "Main Seating Section",
    "type": "compartment",
    "orderIndex": 0,
    "createdAt": 1790274000000,
    "updatedAt": 1790274000000
  },
  {
    "id": "cont-couch-chaise",
    "furnitureId": "furn-living-sectional-couch",
    "name": "Chaise Storage Ottoman",
    "type": "compartment",
    "orderIndex": 1,
    "createdAt": 1790274000000,
    "updatedAt": 1790274000000
  },
  {
    "id": "cont-table-top",
    "furnitureId": "furn-living-round-coffee-table",
    "name": "Tabletop Display",
    "type": "shelf",
    "orderIndex": 0,
    "createdAt": 1790274000000,
    "updatedAt": 1790274000000
  },
  {
    "id": "cont-table-lower",
    "furnitureId": "furn-living-round-coffee-table",
    "name": "Lower Tier Shelf",
    "type": "shelf",
    "orderIndex": 1,
    "createdAt": 1790274000000,
    "updatedAt": 1790274000000
  },
  {
    "id": "cont-console-d1",
    "furnitureId": "furn-media-console",
    "name": "Left Drawer",
    "notes": "Cables & Adapters",
    "type": "drawer",
    "orderIndex": 0,
    "columnIndex": 0,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "cont-console-d2",
    "furnitureId": "furn-media-console",
    "name": "Middle Drawer",
    "notes": "Gaming & Remotes",
    "type": "drawer",
    "orderIndex": 0,
    "columnIndex": 1,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "cont-console-d3",
    "furnitureId": "furn-media-console",
    "name": "Right Drawer",
    "notes": "Documents & Manuals",
    "type": "drawer",
    "orderIndex": 0,
    "columnIndex": 2,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "cont-desk-top",
    "furnitureId": "furn-workdesk",
    "name": "Desk Surface (Stationery tray)",
    "type": "top_surface",
    "orderIndex": 0,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "cont-kallax-bin1",
    "furnitureId": "furn-bookshelf-tall",
    "name": "Bottom Left DRÖNA Box",
    "notes": "Board Games",
    "type": "box",
    "orderIndex": 0,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "cont-kallax-bin1-sub1",
    "furnitureId": "furn-bookshelf-tall",
    "parentContainerId": "cont-kallax-bin1",
    "name": "Card Games & Dice Tray",
    "type": "compartment",
    "orderIndex": 0,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "cont-kallax-bin1-sub2",
    "furnitureId": "furn-bookshelf-tall",
    "parentContainerId": "cont-kallax-bin1",
    "name": "Big Box Strategy Games",
    "type": "compartment",
    "orderIndex": 1,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "cont-kallax-bin2",
    "furnitureId": "furn-bookshelf-tall",
    "name": "Bottom Right DRÖNA Box",
    "notes": "Spare Tech",
    "type": "box",
    "orderIndex": 1,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "cont-kallax-s2",
    "furnitureId": "furn-bookshelf-tall",
    "name": "Middle Open Shelf",
    "notes": "Books & Kindle",
    "type": "shelf",
    "orderIndex": 2,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  }
];

export const SEED_ITEMS: Item[] = [
  {
    "id": "item-audio-dac",
    "containerId": "cont-console-d1",
    "name": "USB-C to 3.5mm Hi-Res Audio Headphone DAC",
    "description": "Braided aluminum adapter",
    "quantity": 2,
    "category": "Electronics",
    "tags": [
      "audio",
      "adapter",
      "headphones"
    ],
    "favorite": false,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-cable-ties",
    "containerId": "cont-console-d1",
    "name": "Reusable Velcro Cable Straps (Pack of 20)",
    "description": "Black cable management wrap",
    "quantity": 20,
    "category": "General",
    "tags": [
      "cables",
      "organization",
      "velcro"
    ],
    "favorite": false,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-card-games",
    "containerId": "cont-kallax-bin1-sub1",
    "name": "Exploding Kittens & Premium Poker Playing Cards",
    "description": "Stored in compact deck boxes",
    "quantity": 2,
    "category": "Games",
    "tags": [
      "boardgame",
      "party",
      "cards"
    ],
    "favorite": false,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-catan",
    "containerId": "cont-kallax-bin1-sub2",
    "name": "Settlers of Catan (Base Game + 5-6 Player Expansion)",
    "description": "Complete set with all wooden pieces and cards",
    "quantity": 1,
    "category": "Games",
    "tags": [
      "boardgame",
      "friends",
      "catan"
    ],
    "favorite": true,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-codenames",
    "containerId": "cont-kallax-bin1-sub1",
    "name": "Codenames: Duet 2-Player Word Game",
    "description": "Cooperative word deduction",
    "quantity": 1,
    "category": "Games",
    "tags": [
      "boardgame",
      "words",
      "coop"
    ],
    "favorite": false,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-ethernet",
    "containerId": "cont-console-d1",
    "name": "Cat 6A Shielded Ethernet Cable (5m)",
    "description": "Snagless RJ45 gigabit network cord",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "network",
      "ethernet",
      "cable"
    ],
    "favorite": false,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-gan-charger",
    "containerId": "cont-console-d1",
    "name": "Anker 65W GaN Nano II Fast Wall Charger",
    "description": "Foldable 3-port compact charger",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "power",
      "anker",
      "charger"
    ],
    "favorite": true,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-hdmi",
    "containerId": "cont-console-d1",
    "name": "Ultra High Speed HDMI 2.1 Cable (3m)",
    "description": "Braided 4K/120Hz cable for PlayStation / TV",
    "quantity": 2,
    "category": "Electronics",
    "tags": [
      "cables",
      "video",
      "hdmi",
      "4k"
    ],
    "favorite": false,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-kindle",
    "containerId": "cont-kallax-s2",
    "name": "Kindle Paperwhite 11th Gen",
    "description": "Sage green fabric cover",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "reading",
      "kindle",
      "ebook"
    ],
    "favorite": true,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-metal-dice",
    "containerId": "cont-kallax-bin1-sub1",
    "name": "7-Piece Antique Bronze Polyhedral RPG Metal Dice Set",
    "description": "D4, D6, D8, D10, D12, D20 in velvet pouch",
    "quantity": 1,
    "category": "Games",
    "tags": [
      "dice",
      "dnd",
      "rpg"
    ],
    "favorite": true,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-passports",
    "containerId": "cont-console-d3",
    "name": "Dutch Passports & International Driving Permit",
    "description": "Stored in black RFID travel wallet",
    "quantity": 2,
    "category": "Documents",
    "tags": [
      "urgent",
      "travel",
      "id",
      "passport"
    ],
    "favorite": true,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-sandisk-ssd",
    "containerId": "cont-console-d1",
    "name": "SanDisk Extreme 1TB Portable Rugged SSD",
    "description": "USB 3.2 Gen 2 external drive with rubber bumper",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "storage",
      "backup",
      "ssd"
    ],
    "favorite": true,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-switch-controller",
    "containerId": "cont-console-d2",
    "name": "Nintendo Switch Pro Wireless Controller",
    "description": "Black pro controller with USB-C port",
    "quantity": 1,
    "category": "Gaming",
    "tags": [
      "switch",
      "gaming",
      "controller"
    ],
    "favorite": false,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-uno-flip",
    "containerId": "cont-kallax-bin1-sub1",
    "name": "Uno Flip! Double-Sided Card Deck",
    "description": "Tin travel box",
    "quantity": 1,
    "category": "Games",
    "tags": [
      "boardgame",
      "cards",
      "party"
    ],
    "favorite": true,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-usbc",
    "containerId": "cont-console-d1",
    "name": "USB-C to USB-C 100W Fast Charging Cable",
    "description": "White 2-meter silicone cable",
    "quantity": 3,
    "category": "Electronics",
    "tags": [
      "cables",
      "usb-c",
      "charger"
    ],
    "favorite": true,
    "createdAt": 1790233918394,
    "updatedAt": 1790233918394
  },
  {
    "id": "item-amazon-basics-48pack",
    "containerId": "cont-console-d2",
    "name": "Amazon Basics 48-Pack Box",
    "description": "Multilingual cardboard box of 48 items (batteries / accessories)",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "amazon-basics",
      "pack-of-48",
      "batteries",
      "supplies"
    ],
    "favorite": false,
    "createdAt": 1790182158656,
    "updatedAt": 1790182158656
  },
  {
    "id": "item-apple-usbc-power-adapter",
    "containerId": "cont-console-d2",
    "name": "Apple USB-C Power Adapter (White)",
    "description": "Large white square USB-C charging brick with attached white cable",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "apple",
      "charger",
      "power-adapter",
      "usb-c",
      "macbook"
    ],
    "favorite": true,
    "createdAt": 1790182158656,
    "updatedAt": 1790182158656
  },
  {
    "id": "item-compact-white-charger",
    "containerId": "cont-console-d2",
    "name": "Compact White Wall Charger",
    "description": "White power adapter brick resting in the rear of the cabinet",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "charger",
      "power",
      "adapter"
    ],
    "favorite": false,
    "createdAt": 1790182158656,
    "updatedAt": 1790182158656
  },
  {
    "id": "item-coiled-ethernet-cable",
    "containerId": "cont-console-d2",
    "name": "Coiled White Ethernet Cable (RJ-45)",
    "description": "Long coiled bundle of white network patch cord with clear RJ45 connector",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "ethernet",
      "network",
      "cable",
      "coiled",
      "rj45"
    ],
    "favorite": false,
    "createdAt": 1790182158656,
    "updatedAt": 1790182158656
  },
  {
    "id": "item-tv-remote",
    "containerId": "cont-console-d2",
    "name": "TV / Media Remote Control",
    "description": "Black remote control with color buttons and numeric keypad",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "remote",
      "tv",
      "media",
      "controller"
    ],
    "favorite": true,
    "createdAt": 1790182158656,
    "updatedAt": 1790182158656
  },
  {
    "id": "item-furniture-leveling-foot-box",
    "containerId": "cont-console-d2",
    "name": "Small Parts Box with Threaded Leveling Foot",
    "description": "Brown square parts box with round black adjustable furniture foot and threaded bolt",
    "quantity": 1,
    "category": "Hardware",
    "tags": [
      "hardware",
      "spare-parts",
      "leveling-foot",
      "screw",
      "bolt"
    ],
    "favorite": false,
    "createdAt": 1790182158656,
    "updatedAt": 1790182158656
  },
  {
    "id": "item-power-strip-rear",
    "containerId": "cont-console-d2",
    "name": "White Power Extension Strip",
    "description": "Multi-socket extension strip along the rear of the cabinet",
    "quantity": 1,
    "category": "Electronics",
    "tags": [
      "power",
      "extension-cord",
      "power-strip",
      "outlet"
    ],
    "favorite": false,
    "createdAt": 1790182158656,
    "updatedAt": 1790182158656
  }
];

export async function seedDemoDataIfEmpty() {
  // The demo apartment only exists when someone chose "Look around the demo"; a new user starts
  // with their own empty home (onboarding), and the demo must never end up in an account
  if (getAppMode() !== 'demo') return;

  // 1. Ensure primary apartment location exists
  await db.locations.put(SEED_LOCATION).catch(() => {});

  // 2. Purge any stale demo workshop room or workshop furniture
  await db.rooms.delete('room-workshop').catch(() => {});
  await db.furniture.where('roomId').equals('room-workshop').delete().catch(() => {});
  const workshopFurnIds = ['furn-metal-rack', 'furn-workbench', 'furn-1790100401057'];
  await db.furniture.where('id').anyOf(workshopFurnIds).delete().catch(() => {});
  await db.containers.where('furnitureId').anyOf(workshopFurnIds).delete().catch(() => {});

  // Only seed an empty workspace. Re-applying the seed on every start reverted users' moves,
  // resizes and deletions of the demo furniture.
  if ((await db.rooms.count()) > 0) return;

  // 3. Ensure all 4 connected apartment rooms exist and have valid coordinates & doors
  for (const r of SEED_ROOMS) {
    const existing = await db.rooms.get(r.id);
    if (!existing) {
      await db.rooms.put(r);
    } else {
      await db.rooms.put({
        ...r,
        ...existing,
        locationId: existing.locationId || r.locationId || 'loc-home',
        shapeType: existing.shapeType || r.shapeType,
        polygonPoints: existing.polygonPoints && existing.polygonPoints.length > 0 ? existing.polygonPoints : r.polygonPoints,
        doors: existing.doors && existing.doors.length > 0 ? existing.doors : r.doors,
        door: existing.door || r.door,
        updatedAt: Math.max(existing.updatedAt || 0, r.updatedAt || 0)
      });
    }
  }

  // 4. Ensure the living room furniture pieces exist and have valid coordinates
  for (const f of SEED_FURNITURE) {
    const existing = await db.furniture.get(f.id);
    if (!existing) {
      await db.furniture.put(f);
    } else {
      // Overwrite/update with corrected positions, shapes, and dimensions
      await db.furniture.put({ ...existing, ...f, updatedAt: Math.max(existing.updatedAt || 0, f.updatedAt || 0) });
    }
  }

  // 5. Ensure containers and items exist
  await db.containers.bulkPut(SEED_CONTAINERS);
  await db.items.bulkPut(SEED_ITEMS);
}

/**
 * Seed from inside a useLiveQuery: live queries are read-only, so writing there throws a
 * ReadOnlyError that blanks the app. Schedule the seed outside the query instead; the
 * query re-runs by itself once the rooms table changes.
 */
export function scheduleSeedIfEmpty(): void {
  setTimeout(() => {
    seedDemoDataIfEmpty().catch((err) => console.error('Seeding demo data failed:', err));
  }, 0);
}
