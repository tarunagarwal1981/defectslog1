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
        
        // Single store for all defects
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

  async storeDefects(defects) {
    try {
      const db = await this.initDB();
      const tx = db.transaction('defects', 'readwrite');
      const store = tx.objectStore('defects');

      // Ensure each defect has a localId
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
      console.error('Error storing defects:', error);
      return Array.isArray(defects) ? defects : [defects];
    }
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
        // Try to save to server
        const { data, error } = await supabase
          .from('defects register')
          .upsert([defect])
          .select()
          .single();

        if (error) throw error;
        
        // Store server response locally
        await this.storeDefects(data);
        return data;
      }

      // Store locally if offline
      await this.storeDefects(defectWithId);
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
          const { error } = await supabase
            .from('defects register')
            .upsert([defect]);

          if (error) throw error;

          // Update local status
          await this.storeDefects({
            ...defect,
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
