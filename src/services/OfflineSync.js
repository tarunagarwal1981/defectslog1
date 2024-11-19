import { supabase } from '../supabaseClient';

class OfflineSync {
  constructor() {
    this.dbName = 'defect-manager-db';
    this.dbVersion = 1;
    this.stores = {
      defects: 'defects',
      syncQueue: 'syncQueue',
      settings: 'settings'
    };
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Defects store
        if (!db.objectStoreNames.contains(this.stores.defects)) {
          const defectStore = db.createObjectStore(this.stores.defects, { keyPath: 'id' });
          defectStore.createIndex('vessel_id', 'vessel_id', { unique: false });
          defectStore.createIndex('dateReported', 'Date Reported', { unique: false });
        }
        
        // Sync queue store
        if (!db.objectStoreNames.contains(this.stores.syncQueue)) {
          db.createObjectStore(this.stores.syncQueue, { 
            keyPath: 'timestamp',
            autoIncrement: true 
          });
        }

        // Settings store
        if (!db.objectStoreNames.contains(this.stores.settings)) {
          db.createObjectStore(this.stores.settings, { keyPath: 'key' });
        }
      };
    });
  }

  async saveDefect(defect) {
    try {
      const timestamp = new Date().toISOString();
      const defectWithMeta = {
        ...defect,
        lastModified: timestamp,
        _syncStatus: navigator.onLine ? 'synced' : 'pending'
      };

      // Save to IndexedDB
      const db = await this.initDB();
      const tx = db.transaction([this.stores.defects, this.stores.syncQueue], 'readwrite');
      
      // Save defect
      await tx.objectStore(this.stores.defects).put(defectWithMeta);

      // If offline, add to sync queue
      if (!navigator.onLine) {
        await tx.objectStore(this.stores.syncQueue).add({
          type: 'upsert',
          data: defectWithMeta,
          timestamp
        });
      } else {
        // If online, save to server
        const { data, error } = await supabase
          .from('defects register')
          .upsert([defectWithMeta])
          .select('*')
          .single();

        if (error) throw error;
      }

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
      const queue = await tx.objectStore(this.stores.syncQueue).getAll();

      for (const item of queue) {
        try {
          const { error } = await supabase
            .from('defects register')
            .upsert([item.data]);

          if (error) throw error;

          // Remove from queue after successful sync
          const deleteTx = db.transaction(this.stores.syncQueue, 'readwrite');
          await deleteTx.objectStore(this.stores.syncQueue).delete(item.timestamp);

          // Update defect sync status
          const defectTx = db.transaction(this.stores.defects, 'readwrite');
          const defect = await defectTx.objectStore(this.stores.defects).get(item.data.id);
          if (defect) {
            defect._syncStatus = 'synced';
            await defectTx.objectStore(this.stores.defects).put(defect);
          }
        } catch (error) {
          console.error('Error syncing item:', error);
          continue;
        }
      }
    } catch (error) {
      console.error('Error in sync process:', error);
      throw error;
    }
  }

  async getDefects() {
    const db = await this.initDB();
    const tx = db.transaction(this.stores.defects, 'readonly');
    return tx.objectStore(this.stores.defects).getAll();
  }

  async getPendingSyncCount() {
    const db = await this.initDB();
    const tx = db.transaction(this.stores.syncQueue, 'readonly');
    const count = await tx.objectStore(this.stores.syncQueue).count();
    return count;
  }

  async clearAll() {
    const db = await this.initDB();
    const tx = db.transaction(
      [this.stores.defects, this.stores.syncQueue, this.stores.settings],
      'readwrite'
    );
    
    await Promise.all([
      tx.objectStore(this.stores.defects).clear(),
      tx.objectStore(this.stores.syncQueue).clear(),
      tx.objectStore(this.stores.settings).clear()
    ]);
  }
}

export default OfflineSync;
