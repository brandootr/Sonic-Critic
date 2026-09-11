import { openDB, DBSchema } from 'idb';
import { Session } from '../types';

interface SonicCritiqueDB extends DBSchema {
  sessions: {
    key: string;
    value: Session;
  };
  settings: {
    key: string;
    value: any;
  }
}

const DB_NAME = 'SonicCritiqueDB';
const DB_VERSION = 1;

export const getDB = async () => {
  return openDB<SonicCritiqueDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });
};

export const saveSessionToDB = async (session: Session) => {
  const db = await getDB();
  await db.put('sessions', session);
};

export const loadSessionsFromDB = async (): Promise<Session[]> => {
  const db = await getDB();
  const sessions = await db.getAll('sessions');
  return sessions.sort((a, b) => b.lastModified - a.lastModified);
};

export const deleteSessionFromDB = async (id: string) => {
  const db = await getDB();
  await db.delete('sessions', id);
};

export const migrateFromLocalStorage = async () => {
  const saved = localStorage.getItem('sonic_critique_sessions');
  if (saved) {
    try {
      const sessions: Session[] = JSON.parse(saved);
      const db = await getDB();
      const tx = db.transaction('sessions', 'readwrite');
      for (const s of sessions) {
        await tx.store.put(s);
      }
      await tx.done;
      localStorage.removeItem('sonic_critique_sessions');
      console.log('Migrated sessions from localStorage to IndexedDB');
    } catch (e) {
      console.error('Migration failed', e);
    }
  }
};
