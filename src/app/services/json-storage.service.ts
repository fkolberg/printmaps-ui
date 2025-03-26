// json-storage.service.ts

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class JsonStorageService {

  private storageMap: Map<string, any> = new Map<string, any>(); // Initialize the map

  constructor() { }

  // Store JSON data with a specific key
  storeJsonData(key: string, data: any): void {
    console.log(`*** Stored data for key: ${key}`);
    console.log(`*** data: ` + data);
    this.storageMap.set(key, data);    
  }

  // Retrieve JSON data by key
  getJsonData(key: string): any | undefined {
    let data =  this.storageMap.get(key);
    console.log(`*** Load data for key: ${key}`);      
    console.log(`*** data: ` + data);
    return data;
  }

  // Check if the key exists in the map
  containsKey(key: string): boolean {
    return this.storageMap.has(key);
  }

  // Remove an item by key
  removeJsonData(key: string): void {
    if (this.storageMap.has(key)) {
      this.storageMap.delete(key);
      console.log(`*** Removed data for key: ${key}`);
    }
  }

  // Clear all stored data
  clearAllData(): void {
    this.storageMap.clear();
    console.log('*** Cleared all stored data');
  }

  // Get all keys in the map (for inspection or debugging)
  getAllKeys(): string[] {
    return Array.from(this.storageMap.keys());
  }

  // Get the entire map
  getAllData(): Map<string, any> {
    return this.storageMap;
  }
}
