import { supabase } from '../supabaseClient';

class OfflineSync {
  constructor() {
    this.dbName = 'defect-manager-db';
    this.dbVersion = 1;
  }

  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('defects')) {
          db.createObjectStore('defects', { 
            keyPath: 'localId' 
          });
        }
      };
    });
  }

  generateLocalId() {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async storeData(defects) {  // Keep this method for compatibility
    try {
      const db = await this.initDB();
      const tx = db.transaction('defects', 'readwrite');
      const store = tx.objectStore('defects');

      const defectsWithIds = Array.isArray(defects) ? defects : [defects];
      
      for (const defect of defectsWithIds) {
        const defectWithId = {
          ...defect,
          localId: defect.localId || this.generateLocalId(),
          lastModified: new Date().toISOString()
        };
        await store.put(defectWithId);
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve(defectsWithIds);
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Error storing data:', error);
      return Array.isArray(defects) ? defects : [defects];
    }
  }

  async getData(storeName) {  // Keep this method for compatibility
    return this.getDefects();
  }

  async getDefects() {
    try {
      const db = await this.initDB();
      const tx = db.transaction('defects', 'readonly');
      const store = tx.objectStore('defects');

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Error getting defects:', error);
      return [];
    }
  }

  async saveDefect(defect) {
    try {
      const defectWithId = {
        ...defect,
        localId: defect.localId || this.generateLocalId(),
        lastModified: new Date().toISOString(),
        _syncStatus: navigator.onLine ? 'synced' : 'pending'
      };

      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('defects register')
          .upsert([defect])
          .select()
          .single();

        if (error) throw error;
        
        await this.storeData({
          ...data,
          localId: defectWithId.localId
        });
        return data;
      }

      await this.storeData(defectWithId);
      return defectWithId;
    } catch (error) {
      console.error('Error saving defect:', error);
      return defect;
    }
  }

  async syncWithServer() {
    if (!navigator.onLine) return;

    try {
      const defects = await this.getDefects();
      const pendingDefects = defects.filter(d => d._syncStatus === 'pending');

      for (const defect of pendingDefects) {
        try {
          const { data, error } = await supabase
            .from('defects register')
            .upsert([defect])
            .select()
            .single();

          if (error) throw error;

          await this.storeData({
            ...data,
            localId: defect.localId,
            _syncStatus: 'synced'
          });
        } catch (error) {
          console.error('Error syncing defect:', error);
        }
      }
    } catch (error) {
      console.error('Error in sync process:', error);
    }
  }

  async getPendingSyncCount() {
    try {
      const defects = await this.getDefects();
      return defects.filter(d => d._syncStatus === 'pending').length;
    } catch (error) {
      console.error('Error getting pending sync count:', error);
      return 0;
    }
  }

  async clearAll() {
    try {
      const db = await this.initDB();
      const tx = db.transaction('defects', 'readwrite');
      await tx.objectStore('defects').clear();
      return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }
}

export default OfflineSync;
