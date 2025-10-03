// src/offline.ts

/**
 * Offline toolkit:
 * - KV cache for GETs (IndexedDB)
 * - Durable outbox queue for POST/PUT/PATCH/DELETE
 * - Multipart (file) uploads supported via a blob store
 *
 * Public API (same names you already used):
 *   kvSet, kvGet
 *   fetchWithCache<T>(key, url, init?)
 *   enqueueRequest(url, method, body, headers?)
 *   enqueueMultipart(url, method, files[], fields?, headers?, fileFieldName?)
 *   flushQueue(onProgress?)
 */

export type QueueItem = {
  id: string; // uuid
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any; // JSON body
  // NEW: multipart (file) support. When present, this item is sent as FormData.
  form?: {
    fields?: Record<string, string>; // appended as text fields
    blobKeys?: string[];             // keys of blobs stored in IDB
    fileFieldName?: string;          // field name for file inputs (default 'file')
    fileNames?: string[];            // optional filenames for each blob
  };
  createdAt: number;
  attempts: number;
  reason?: string;
};

const DB_NAME = 'pos-offline';
const DB_VERSION = 2;      // bumped to create blob store
const KV_STORE = 'kv';
const QUEUE_STORE = 'queue';
const BLOB_STORE = 'blobs'; // NEW: stores File/Blob data for multipart

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE); // key-value store for blobs
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/* ----------------------- KV (GET cache) ----------------------- */

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

/**
 * GET with offline cache:
 * - If offline: returns cached (fromCache=true)
 * - If online: fetches, caches, returns (fromCache=false)
 * - If online fetch fails: returns cached (fromCache=true, error)
 */
export async function fetchWithCache<T>(
  key: string,
  url: string,
  init?: RequestInit
): Promise<{ data: T | null; fromCache: boolean; error?: any }> {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!online) {
    const cached = await kvGet<T>(key);
    return { data: cached, fromCache: true };
  }
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as T;
    await kvSet(key, json);
    return { data: json, fromCache: false };
  } catch (err) {
    const cached = await kvGet<T>(key);
    return { data: cached, fromCache: true, error: err };
  }
}

/* ----------------------- Blob store (for files) ----------------------- */

export async function blobSet(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(BLOB_STORE).put(blob, key);
  });
}

export async function blobGet(key: string): Promise<Blob | null> {
  const db = await openDB();
  return await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readonly');
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(BLOB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/* ----------------------- Queue (outbox) ----------------------- */

async function queueAddInternal(item: QueueItem): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(QUEUE_STORE).add(item);
  });
}

export async function queueAdd(
  item: Omit<QueueItem, 'id' | 'createdAt' | 'attempts'>
): Promise<QueueItem> {
  const withMeta: QueueItem = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    attempts: 0,
  };
  await queueAddInternal(withMeta);
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

/* ----------------------- Enqueue helpers ----------------------- */

/**
 * Queue a JSON request for later.
 */
export async function enqueueRequest(
  url: string,
  method: QueueItem['method'],
  body: any,
  headers?: Record<string, string>
) {
  return queueAdd({ url, method, body, headers });
}

/**
 * Queue a multipart/form-data request for later.
 * - Files are persisted into IDB first (via blobSet)
 * - When flushing, we build a FormData with fields + files
 */
export async function enqueueMultipart(
  url: string,
  method: QueueItem['method'],
  files: { key: string; blob: Blob; fileName?: string }[],
  fields?: Record<string, string>,
  headers?: Record<string, string>, // do NOT include Content-Type here
  fileFieldName = 'file'
) {
  for (const f of files) {
    await blobSet(f.key, f.blob);
  }
  return queueAdd({
    url,
    method,
    headers,
    form: {
      fields,
      blobKeys: files.map((f) => f.key),
      fileNames: files.map((f) => f.fileName || 'upload.bin'),
      fileFieldName,
    },
  });
}

/* ----------------------- Flush queue ----------------------- */

/**
 * Flushes all queued requests (JSON or multipart).
 * - For JSON: sends JSON body with appropriate headers.
 * - For multipart: builds FormData; DO NOT set Content-Type (browser sets boundary).
 * - Items remain in queue if request fails; attempts/reason are updated.
 */
export async function flushQueue(
  onProgress?: (ev: { id: string; done: boolean; error?: any }) => void
) {
  const items = await queueAll();

  for (const item of items) {
    try {
      let init: RequestInit;

      if (item.form) {
        // Multipart/form-data
        const fd = new FormData();
        if (item.form.fields) {
          for (const [k, v] of Object.entries(item.form.fields)) {
            fd.append(k, v);
          }
        }
        const fieldName = item.form.fileFieldName || 'file';
        const keys = item.form.blobKeys || [];
        const names = item.form.fileNames || [];

        for (let i = 0; i < keys.length; i++) {
          const blobKey = keys[i];
          const blob = await blobGet(blobKey);
          if (blob) {
            fd.append(fieldName, blob, names[i] || 'upload.bin');
          }
        }

        init = {
          method: item.method,
          headers: { ...(item.headers || {}) }, // do NOT set Content-Type manually
          body: fd,
        };
      } else {
        // JSON
        init = {
          method: item.method,
          headers: { 'Content-Type': 'application/json', ...(item.headers || {}) },
          body: item.body != null ? JSON.stringify(item.body) : undefined,
        };
      }

      const res = await fetch(item.url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      await queueRemove(item.id);
      onProgress?.({ id: item.id, done: true });
    } catch (e) {
      item.attempts += 1;
      item.reason = (e as Error)?.message;
      await queueUpdate(item);
      onProgress?.({ id: item.id, done: false, error: e });
      // keep in queue for future retry
    }
  }
}
