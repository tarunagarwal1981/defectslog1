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
        
        if (!db.objectStoreNames.contains(this.stores.defects)) {
          db.createObjectStore(this.stores.defects, { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains(this.stores.syncQueue)) {
          db.createObjectStore(this.stores.syncQueue, { 
            keyPath: 'timestamp',
            autoIncrement: true 
          });
        }

        if (!db.objectStoreNames.contains(this.stores.vessels)) {
          db.createObjectStore(this.stores.vessels, { keyPath: 'vessel_id' });
        }
      };
    });
  }

  async storeData(storeName, data) {
    try {
      const db = await this.initDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);

      if (Array.isArray(data)) {
        await Promise.all(data.map(item => store.put(item)));
      } else {
        await store.put(data);
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
      throw error;
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
      throw error;
    }
  }

  async saveDefect(defect) {
    try {
      const timestamp = new Date().toISOString();
      const defectWithMeta = {
        ...defect,
        lastModified: timestamp,
        _syncStatus: navigator.onLine ? 'synced' : 'pending'
      };

      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('defects register')
          .upsert([defectWithMeta])
          .select()
          .single();

        if (error) throw error;
        
        await this.storeData(this.stores.defects, data);
        return data;
      }

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

  async syncWithServer() {
    if (!navigator.onLine) return;

    try {
      const db = await this.initDB();
      const tx = db.transaction(this.stores.syncQueue, 'readonly');
      const store = tx.objectStore(this.stores.syncQueue);
      
      const queue = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      for (const item of queue) {
        try {
          const { error } = await supabase
            .from('defects register')
            .upsert([item.data]);

          if (error) throw error;

          const deleteTx = db.transaction(this.stores.syncQueue, 'readwrite');
          await deleteTx.objectStore(this.stores.syncQueue).delete(item.timestamp);
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
