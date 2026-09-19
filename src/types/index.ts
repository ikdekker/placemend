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

export type WallSide = 'top' | 'bottom' | 'left' | 'right';
export type DoorSwing = 'inward_left' | 'inward_right' | 'outward_left' | 'outward_right';

export type RoomDoor = {
  id?: string;
  label?: string;
  wall: WallSide | string;
  segmentIndex?: number; // 0-based wall segment index in room polygon
  offset: number; // grid units from start of wall segment
  swing?: DoorSwing;
  width?: number; // default: 2 grid units
};

export type RoomShapeType = 
  | 'rectangle' 
  | 'l_shaped' 
  | 't_shaped' 
  | 'u_shaped' 
  | 'alcove' 
  | 'chamfered' 
  | 'custom_polygon';

export type Point2D = {
  x: number;
  y: number;
};

export type Location = {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
};

export type Room = {
  id: string;
  locationId: string;
  name: string;
  color: string;
  gridWidth: number;
  gridHeight: number;
  unitSize: number; // pixels per grid cell
  shapeType?: RoomShapeType;
  polygonPoints?: Point2D[]; // Explicit corner points in grid units for non-rectangular rooms
  door?: RoomDoor; // Legacy single door
  doors?: RoomDoor[]; // Multiple doors
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
  name: string;
  type: FurnitureType;
  position: Position;
  dimension: Dimension;
  color: string;
  icon?: string;
  notes?: string;
  photoDataUrl?: string;
  facadeLayout?: 'horizontal_row' | 'grid' | 'vertical_stack';
  columns?: number;
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
  parentContainerId?: string;
  name: string;
  type: ContainerType;
  color?: string;
  orderIndex: number;
  columnIndex?: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type Item = {
  id: string;
  containerId: string;
  name: string;
  description?: string;
  quantity: number;
  category?: string;
  tags: string[];
  photoDataUrl?: string;
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
