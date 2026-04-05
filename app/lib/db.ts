import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export interface TranslationMemoryEntry {
  id: string;
  source: string;
  sourceNormalized: string;
  sourceTokens: string[];
  target: string;
  langPair: string;
  createdAt: number;
}

export interface FileRecord {
  id: string;
  name: string;
  type: string;
  data: Uint8Array;
  createdAt: number;
}

interface OfflineCatDB extends DBSchema {
  translationMemory: {
    key: string;
    value: TranslationMemoryEntry;
    indexes: {
      langPair: string;
    };
  };
  files: {
    key: string;
    value: FileRecord;
  };
}

let dbInstance: IDBPDatabase<OfflineCatDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<OfflineCatDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<OfflineCatDB>("offline-cat", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("translationMemory")) {
        const store = db.createObjectStore("translationMemory", {
          keyPath: "id",
        });
        store.createIndex("langPair", "langPair");
      }
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    },
  });

  return dbInstance;
}
