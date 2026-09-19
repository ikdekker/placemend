import Dexie, { type Table } from 'dexie';
import { Location, Room, Furniture, Container, Item } from '../types';

export class PlacemendDatabase extends Dexie {
  locations!: Table<Location, string>;
  rooms!: Table<Room, string>;
  furniture!: Table<Furniture, string>;
  containers!: Table<Container, string>;
  items!: Table<Item, string>;

  constructor() {
    super('PlacemendDB');
    this.version(1).stores({
      locations: 'id, name, createdAt',
      rooms: 'id, locationId, name, createdAt',
      furniture: 'id, roomId, name, type, createdAt',
      containers: 'id, furnitureId, parentContainerId, orderIndex, createdAt',
      items: 'id, containerId, name, category, *tags, barcode, favorite, createdAt',
    });
  }
}

export const db = new PlacemendDatabase();
