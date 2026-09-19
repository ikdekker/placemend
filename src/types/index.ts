export type Dimension = {
  width: number; // in grid units
  length: number; // in grid units
  height?: number; // optional in cm
};

export type Position = {
  x: number; // grid column / units
  y: number; // grid row / units
  rotation: number; // 0, 90, 180, 270 degrees
};

export type Location = {
  id: string;
  name: string; // e.g. "Main House", "Warehouse", "Apartment"
  description?: string;
  createdAt: number;
  updatedAt: number;
};

export type Room = {
  id: string;
  locationId: string;
  name: string; // e.g. "Living Room", "Workshop / Garage", "Office"
  color: string; // Room accent color
  gridWidth: number; // e.g. 24 units
  gridHeight: number; // e.g. 18 units
  unitSize: number; // pixels per grid cell (default 32px)
  createdAt: number;
  updatedAt: number;
};

export type FurnitureType =
  | 'desk'
  | 'closet'
  | 'wardrobe'
  | 'bookshelf'
  | 'storage_rack'
  | 'dresser'
  | 'cabinet'
  | 'table'
  | 'bed'
  | 'sofa'
  | 'workbench'
  | 'box_stack'
  | 'other';

export type Furniture = {
  id: string;
  roomId: string;
  name: string; // e.g. "Standing Desk", "IKEA PAX Closet", "Heavy Metal Rack"
  type: FurnitureType;
  position: Position;
  dimension: Dimension;
  color: string;
  icon?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type ContainerType =
  | 'shelf'
  | 'drawer'
  | 'box'
  | 'bin'
  | 'compartment'
  | 'cabinet_door'
  | 'hanging_rod'
  | 'top_surface'
  | 'general';

export type Container = {
  id: string;
  furnitureId: string;
  parentContainerId?: string; // Optional nested container (e.g. Small Organizer inside Drawer 1)
  name: string; // e.g. "Top Drawer", "Shelf #3", "Blue Storage Bin A"
  type: ContainerType;
  color?: string;
  orderIndex: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type Item = {
  id: string;
  containerId: string; // Container where the item currently lives
  name: string; // e.g. "Passport", "Impact Driver 18V", "HDMI Cable 2m"
  description?: string;
  quantity: number;
  category?: string; // e.g. "Electronics", "Documents", "Tools", "Clothing"
  tags: string[]; // e.g. ["urgent", "travel", "cables"]
  photoDataUrl?: string; // Base64 or local object URL stored locally
  barcode?: string;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type SearchResult = {
  item: Item;
  container: Container;
  furniture: Furniture;
  room: Room;
  location: Location;
  matchScore: number;
  matchedOn: 'name' | 'tag' | 'category' | 'description';
};
