import { supabase } from '../supabaseClient';

class OfflineSync {
  constructor() {
    this.dbName = 'defect-manager-db';
    this.dbVersion = 1;
    this.stores = {
      defects: 'defects',
      syncQueue: 'syncQueue',
      vessels: 'vessels'
    };
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Defects store - uses compound key
        if (!db.objectStoreNames.contains(this.stores.defects)) {
          const defectStore = db.createObjectStore(this.stores.defects, { 
            keyPath: 'id',
            autoIncrement: true 
          });
          defectStore.createIndex('vessel_id', 'vessel_id', { unique: false });
          defectStore.createIndex('date_reported', 'Date Reported', { unique: false });
        }
        
        // Sync queue store
        if (!db.objectStoreNames.contains(this.stores.syncQueue)) {
          db.createObjectStore(this.stores.syncQueue, { 
            keyPath: 'timestamp'
          });
        }

        // Vessels store
        if (!db.objectStoreNames.contains(this.stores.vessels)) {
          db.createObjectStore(this.stores.vessels, { 
            keyPath: ['vessel_id', 'vessel_name']
          });
        }
      };
    });
  }

  async storeData(storeName, data) {
    try {
      const db = await this.initDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      // Ensure data has required keys based on store
      const processData = (item) => {
        switch (storeName) {
          case this.stores.defects:
            return {
              ...item,
              id: item.id || `local-${Date.now()}-${Math.random()}`,
              lastModified: new Date().toISOString()
            };
          case this.stores.vessels:
            return {
              vessel_id: item.vessel_id,
              vessel_name: item.vessel_name || item.vessels?.vessel_name || 'Unknown'
            };
          case this.stores.syncQueue:
            return {
              ...item,
              timestamp: item.timestamp || new Date().toISOString()
            };
          default:
            return item;
        }
      };

      // Process and store the data
      if (Array.isArray(data)) {
        await Promise.all(data.map(item => 
          store.put(processData(item))
        ));
      } else {
        await store.put(processData(data));
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      return data;
    } catch (error) {
      console.error('Error storing data:', error);
      throw error;
    }
  }

  async getDefects() {
    try {
      const db = await this.initDB();
      const tx = db.transaction(this.stores.defects, 'readonly');
      const store = tx.objectStore(this.stores.defects);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting defects:', error);
      return [];
    }
  }

  async getVessels() {
    try {
      const db = await this.initDB();
      const tx = db.transaction(this.stores.vessels, 'readonly');
      const store = tx.objectStore(this.stores.vessels);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting vessels:', error);
      return [];
    }
  }

  async saveDefect(defect) {
    try {
      const timestamp = new Date().toISOString();
      const defectWithMeta = {
        ...defect,
        id: defect.id || `local-${Date.now()}-${Math.random()}`,
        lastModified: timestamp,
        _syncStatus: navigator.onLine ? 'synced' : 'pending'
      };

      if (navigator.onLine) {
        // If online, save to server
        const { data, error } = await supabase
          .from('defects register')
          .upsert([defectWithMeta])
          .select()
          .single();

        if (error) throw error;
        
        // Save to local DB for offline access
        await this.storeData(this.stores.defects, data);
        return data;
      }

      // If offline, save locally and queue for sync
      await this.storeData(this.stores.defects, defectWithMeta);
      await this.storeData(this.stores.syncQueue, {
        type: 'upsert',
        data: defectWithMeta,
        timestamp
      });

      return defectWithMeta;
    } catch (error) {
      console.error('Error saving defect:', error);
      throw error;
    }
  }

  // Rest of the methods remain the same
  async syncWithServer() {
    if (!navigator.onLine) return;

    try {
      const queue = await this.getData(this.stores.syncQueue);
      
      for (const item of queue) {
        try {
          const { error } = await supabase
            .from('defects register')
            .upsert([item.data]);

          if (error) throw error;

          // Remove from queue after successful sync
          await this.deleteFromStore(this.stores.syncQueue, item.timestamp);
        } catch (error) {
          console.error('Error syncing item:', error);
        }
      }
    } catch (error) {
      console.error('Error in sync process:', error);
      throw error;
    }
  }

  async getPendingSyncCount() {
    try {
      const db = await this.initDB();
      const tx = db.transaction(this.stores.syncQueue, 'readonly');
      const store = tx.objectStore(this.stores.syncQueue);

      return new Promise((resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting pending sync count:', error);
      return 0;
    }
  }

  async deleteFromStore(storeName, key) {
    const db = await this.initDB();
    const tx = db.transaction(storeName, 'readwrite');
    await tx.objectStore(storeName).delete(key);
  }

  async clearAll() {
    try {
      const db = await this.initDB();
      const tx = db.transaction(Object.values(this.stores), 'readwrite');
      
      await Promise.all(
        Object.values(this.stores).map(storeName => 
          tx.objectStore(storeName).clear()
        )
      );
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }
}

export default OfflineSync;
