// src/offline.ts
type QueueItem = {
  id: string;                // uuid
  url: string;
  method: 'POST'|'PUT'|'PATCH'|'DELETE';
  headers?: Record<string, string>;
  body?: any;
  createdAt: number;
  attempts: number;
  reason?: string;
};

const DB_NAME = 'pos-offline';
const DB_VERSION = 1;
const KV_STORE = 'kv';
const QUEUE_STORE = 'queue';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) db.createObjectStore(KV_STORE);
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
  });
}

// ---- KV helpers (cache for GET responses) ----
export async function kvSet<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(KV_STORE).put(value as any, key);
  });
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(KV_STORE, 'readonly');
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(KV_STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ---- Queue helpers ----
export async function queueAdd(item: Omit<QueueItem, 'id'|'createdAt'|'attempts'>): Promise<QueueItem> {
  const db = await openDB();
  const withMeta: QueueItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(QUEUE_STORE).add(withMeta);
  });
  return withMeta;
}

export async function queueAll(): Promise<QueueItem[]> {
  const db = await openDB();
  return await new Promise<QueueItem[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueueItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function queueUpdate(item: QueueItem): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(QUEUE_STORE).put(item);
  });
}

export async function queueRemove(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(QUEUE_STORE).delete(id);
  });
}

// ---- fetchWithCache (GET) ----
export async function fetchWithCache<T>(key: string, url: string, init?: RequestInit): Promise<{ data: T | null; fromCache: boolean; error?: any; }> {
  const online = navigator.onLine;
  if (!online) {
    const cached = await kvGet<T>(key);
    return { data: cached, fromCache: true };
  }
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    await kvSet(key, json);
    return { data: json, fromCache: false };
  } catch (err) {
    const cached = await kvGet<T>(key);
    return { data: cached, fromCache: true, error: err };
  }
}

// ---- pushWhenOnline (POST-like) ----
export async function enqueueRequest(url: string, method: QueueItem['method'], body: any, headers?: Record<string,string>) {
  return queueAdd({ url, method, body, headers });
}

// ---- flush queue ----
export async function flushQueue(onProgress?: (ev: { id: string; done: boolean; error?: any }) => void) {
  const items = await queueAll();
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: { 'Content-Type': 'application/json', ...(item.headers || {}) },
        body: item.body != null ? JSON.stringify(item.body) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await queueRemove(item.id);
      onProgress?.({ id: item.id, done: true });
    } catch (e) {
      item.attempts += 1;
      item.reason = (e as Error)?.message;
      await queueUpdate(item);
      onProgress?.({ id: item.id, done: false, error: e });
      // keep the item in queue; we'll retry next time we’re online
    }
  }
}
